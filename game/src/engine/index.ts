import type {
  AgentBlueprint, FactMap, FactValue, GameAction, GameEvent, GameState,
  OperationDefinition, ScenarioDefinition, ToolCall, ToolName,
} from './types';

export type * from './types';

export const defaultBlueprint: AgentBlueprint = {
  tools: [], feedback: false, verification: false, budget: 12, permissions: ['*'],
};

const toolNames: ToolName[] = ['observe', 'operate', 'verify'];
const factIdPattern = /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/;
const own = (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key);
const isFactValue = (value: unknown): value is FactValue =>
  typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.length <= 1000);

function validBlueprint(value: AgentBlueprint): boolean {
  return !!value && Array.isArray(value.tools) && value.tools.length <= 3 &&
    value.tools.every(tool => toolNames.includes(tool)) && new Set(value.tools).size === value.tools.length &&
    typeof value.feedback === 'boolean' && typeof value.verification === 'boolean' &&
    Number.isInteger(value.budget) && value.budget >= 1 && value.budget <= 64 &&
    Array.isArray(value.permissions) && value.permissions.length <= 100 &&
    value.permissions.every(target => typeof target === 'string' && (target === '*' || factIdPattern.test(target)));
}

/** Reject malformed content before it can enter the simulation. No content contains executable code. */
export function validateScenario(scenario: ScenarioDefinition): string[] {
  const errors: string[] = [];
  if (!scenario || typeof scenario !== 'object') return ['关卡必须是一个对象'];
  if (!factIdPattern.test(scenario.id)) errors.push('关卡 ID 无效');
  if (scenario.version !== undefined && (!Number.isInteger(scenario.version) || scenario.version < 1)) errors.push('关卡版本无效');
  if (!scenario.initialWorld || typeof scenario.initialWorld !== 'object' || Array.isArray(scenario.initialWorld)) return [...errors, '缺少世界初始状态'];
  for (const [fact, value] of Object.entries(scenario.initialWorld)) {
    if (!factIdPattern.test(fact) || !isFactValue(value)) errors.push(`世界事实无效：${fact}`);
  }
  if (!Array.isArray(scenario.operations) || !Array.isArray(scenario.observations) || !Array.isArray(scenario.goals)) {
    return [...errors, '关卡的观察、操作和目标必须为数组'];
  }
  if (!scenario.goals.length) errors.push('关卡至少需要一个目标');
  const ids = new Set<string>();
  for (const operation of scenario.operations) {
    if (!factIdPattern.test(operation.id) || ids.has(operation.id)) errors.push(`操作 ID 无效或重复：${operation.id}`);
    ids.add(operation.id);
    if (!factIdPattern.test(operation.target)) errors.push(`操作目标无效：${operation.id}`);
    if (!operation.effects || !Object.keys(operation.effects).length) errors.push(`操作没有效果：${operation.id}`);
    for (const [fact, value] of Object.entries({ ...operation.requires, ...operation.effects })) {
      if (!own(scenario.initialWorld, fact) || !isFactValue(value)) errors.push(`操作引用未知事实：${operation.id}/${fact}`);
    }
  }
  const observationIds = new Set<string>();
  for (const observation of scenario.observations) {
    if (!factIdPattern.test(observation.id) || observationIds.has(observation.id)) errors.push(`观察 ID 无效或重复：${observation.id}`);
    observationIds.add(observation.id);
    if (!factIdPattern.test(observation.target) || !Array.isArray(observation.facts) || !observation.facts.length) errors.push(`观察定义无效：${observation.id}`);
    else for (const fact of observation.facts) if (!own(scenario.initialWorld, fact)) errors.push(`观察引用未知事实：${fact}`);
  }
  const goalFacts = new Set<string>();
  for (const goal of scenario.goals) {
    if (!own(scenario.initialWorld, goal.fact) || !isFactValue(goal.equals) || goalFacts.has(goal.fact)) errors.push(`目标事实无效或重复：${goal.fact}`);
    goalFacts.add(goal.fact);
    const operation = scenario.operations.find(item => item.id === goal.operationId);
    if (!operation || operation.effects[goal.fact] !== goal.equals) errors.push(`目标操作无法产生目标值：${goal.fact}`);
  }
  return errors;
}

export function createGame(scenario: ScenarioDefinition, seed = 1): GameState {
  const errors = validateScenario(scenario);
  if (errors.length) throw new Error(errors.join('；'));
  if (!Number.isSafeInteger(seed)) throw new Error('种子必须是安全整数');
  return {
    kernelVersion: 1, scenarioId: scenario.id, scenarioVersion: scenario.version ?? 1,
    seed, world: { ...scenario.initialWorld }, observed: {}, blueprint: structuredClone(defaultBlueprint),
    status: 'ready', budgetRemaining: defaultBlueprint.budget, attempt: 0, events: [],
    verifiedGoals: [], processedActionIds: [], learningEvidence: [], hintUsed: false,
  };
}

/** Import validation checks both shape and recorded world transitions. A save is a
 * local player document, not a trusted source of new tool definitions or facts. */
export function validateGameState(scenario: ScenarioDefinition, value: unknown): value is GameState {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const state = value as GameState;
    if (state.kernelVersion !== 1 || state.scenarioId !== scenario.id || state.scenarioVersion !== (scenario.version ?? 1) ||
      !Number.isSafeInteger(state.seed) || !Number.isSafeInteger(state.attempt) || state.attempt < 0 ||
      !validBlueprint(state.blueprint) || !Number.isInteger(state.budgetRemaining) || state.budgetRemaining < 0 ||
      state.budgetRemaining > state.blueprint.budget || typeof state.hintUsed !== 'boolean' ||
      !['ready', 'running', 'paused', 'stalled', 'exhausted', 'won'].includes(state.status)) return false;
    if ((state.status === 'running' || state.status === 'paused') && state.budgetRemaining === 0) return false;
    if (state.status === 'exhausted' && state.budgetRemaining !== 0) return false;
    if (!state.world || !state.observed || Array.isArray(state.world) || Array.isArray(state.observed) ||
      !Array.isArray(state.events) || state.events.length > 10000 || !Array.isArray(state.processedActionIds) ||
      state.processedActionIds.length > 10000 || new Set(state.processedActionIds).size !== state.processedActionIds.length ||
      !state.processedActionIds.every(id => typeof id === 'string' && id.trim().length > 0 && id.length <= 200) ||
      !Array.isArray(state.verifiedGoals) || !Array.isArray(state.learningEvidence)) return false;
    const sameFacts = (left: FactMap, right: FactMap) => Object.keys(left).length === Object.keys(right).length &&
      Object.entries(left).every(([fact, factValue]) => own(right, fact) && right[fact] === factValue);
    const replayedWorld = { ...scenario.initialWorld };
    const replayedObserved: GameState['observed'] = {};
    let replayedVerified: string[] = [];
    const eventIds = new Set<string>();
    const requests = new Map<string, GameEvent>();
    const results = new Set<string>();
    const eventTypes: GameEvent['type'][] = ['configured', 'dispatched', 'request', 'observation', 'result', 'claim', 'verified', 'victory', 'paused', 'resumed', 'exhausted', 'blocked', 'reset'];
    for (const [index, event] of state.events.entries()) {
      if (!event || event.sequence !== index + 1 || event.id !== `${scenario.id}:event:${index + 1}` ||
        !eventTypes.includes(event.type) || typeof event.text !== 'string' || event.text.length > 5000 ||
        !Number.isSafeInteger(event.attempt) || event.attempt < 0 || event.attempt > state.attempt || eventIds.has(event.id)) return false;
      eventIds.add(event.id);
      if (event.facts && (typeof event.facts !== 'object' || Array.isArray(event.facts) ||
        !Object.entries(event.facts).every(([fact, factValue]) => own(replayedWorld, fact) && isFactValue(factValue)))) return false;
      if (event.type === 'request') {
        if (!event.callId || requests.has(event.callId) || !event.tool || !toolNames.includes(event.tool) || !event.target) return false;
        requests.set(event.callId, event);
      }
      if (['observation', 'result', 'verified', 'blocked'].includes(event.type)) {
        if (!event.callId || results.has(event.callId)) return false;
        const request = requests.get(event.callId);
        if (!request || event.tool !== request.tool || event.target !== request.target || typeof event.success !== 'boolean' || typeof event.delivered !== 'boolean') return false;
        results.add(event.callId);
      }
      if (event.type === 'observation') {
        const observation = scenario.observations.find(item => item.target === event.target && sameFacts(Object.fromEntries(item.facts.map(fact => [fact, replayedWorld[fact]])), event.facts ?? {}));
        if (!observation || event.tool !== 'observe' || event.success !== true || event.delivered !== true) return false;
      } else if (event.type === 'result') {
        const operation = scenario.operations.find(item => item.id === event.operationId && item.target === event.target);
        if (!operation || event.tool !== 'operate') return false;
        const missing = Object.entries(operation.requires ?? {}).filter(([fact, expected]) => replayedWorld[fact] !== expected);
        if (event.success !== (missing.length === 0)) return false;
        const expectedFacts = event.success ? operation.effects : Object.fromEntries(missing.map(([fact]) => [fact, replayedWorld[fact]]));
        if (!sameFacts(expectedFacts, event.facts ?? {})) return false;
        if (event.success) {
          Object.assign(replayedWorld, operation.effects);
          replayedVerified = replayedVerified.filter(fact => !own(operation.effects, fact));
        }
      } else if (event.type === 'verified') {
        const goal = scenario.goals.find(item => own(event.facts ?? {}, item.fact));
        if (!goal || event.tool !== 'verify' || event.delivered !== true ||
          !sameFacts({ [goal.fact]: replayedWorld[goal.fact] }, event.facts ?? {}) || event.success !== (replayedWorld[goal.fact] === goal.equals)) return false;
        if (event.success && !replayedVerified.includes(goal.fact)) replayedVerified.push(goal.fact);
        else if (!event.success) replayedVerified = replayedVerified.filter(fact => fact !== goal.fact);
      } else if (event.type === 'victory' && !scenario.goals.every(goal => replayedVerified.includes(goal.fact) && replayedWorld[goal.fact] === goal.equals)) return false;
      if (event.delivered && event.facts && ['observation', 'result', 'verified'].includes(event.type)) {
        const source = event.type === 'observation' ? 'observation' : event.type === 'verified' ? 'verification' : 'receipt';
        for (const [fact, factValue] of Object.entries(event.facts)) replayedObserved[fact] = { value: factValue, source, eventId: event.id };
      }
    }
    if (requests.size !== results.size || !sameFacts(replayedWorld, state.world) ||
      JSON.stringify(replayedVerified) !== JSON.stringify(state.verifiedGoals) ||
      Object.keys(replayedObserved).length !== Object.keys(state.observed).length) return false;
    for (const [fact, observed] of Object.entries(state.observed)) {
      const expected = replayedObserved[fact];
      if (!observed || !expected || observed.value !== expected.value || observed.source !== expected.source || observed.eventId !== expected.eventId) return false;
    }
    if (state.status === 'won' && (state.events.at(-1)?.type !== 'victory' || !scenario.goals.every(goal => replayedVerified.includes(goal.fact)))) return false;
    if (state.status !== 'won' && state.events.at(-1)?.type === 'victory') return false;
    if (state.learningEvidence.length > scenario.concepts.length || new Set(state.learningEvidence.map(item => item.concept)).size !== state.learningEvidence.length) return false;
    for (const evidence of state.learningEvidence) {
      if (!evidence || evidence.scenarioId !== scenario.id || !scenario.concepts.includes(evidence.concept) ||
        !['seen', 'guided', 'independent-transfer'].includes(evidence.level) || !Array.isArray(evidence.eventIds) ||
        !evidence.eventIds.every(id => eventIds.has(id))) return false;
      if (evidence.level !== 'seen' && state.status !== 'won') return false;
      if (evidence.level === 'independent-transfer' && (scenario.kind !== 'transfer' || state.hintUsed)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function addEvent(state: GameState, event: Omit<GameEvent, 'id' | 'sequence' | 'attempt'>): GameEvent {
  const sequence = state.events.length + 1;
  const full = { ...event, id: `${state.scenarioId}:event:${sequence}`, sequence, attempt: state.attempt };
  state.events.push(full);
  return full;
}

function supply(state: GameState, facts: FactMap, source: 'observation' | 'receipt' | 'verification', eventId: string): void {
  for (const [fact, value] of Object.entries(facts)) state.observed[fact] = { value, source, eventId };
}

function known(state: Pick<GameState, 'observed'>, fact: string): FactValue | undefined {
  return own(state.observed, fact) ? state.observed[fact].value : undefined;
}

function allowed(state: GameState, target: string): boolean {
  return state.blueprint.permissions.includes('*') || state.blueprint.permissions.includes(target);
}

function targetOf(scenario: ScenarioDefinition, call: ToolCall): string | undefined {
  if (call.tool === 'observe') return scenario.observations.find(item => item.id === call.observationId)?.target;
  if (call.tool === 'operate') return scenario.operations.find(item => item.id === call.operationId)?.target;
  if (call.tool === 'verify') {
    const goal = scenario.goals.find(item => item.fact === call.fact);
    return scenario.operations.find(item => item.id === goal?.operationId)?.target;
  }
  return undefined;
}

/** Policy follows only authored tool metadata, received evidence, and verified goals.
 * It never inspects world facts. This is an explicit teaching strategy, not an LLM. */
export function chooseNextCall(scenario: ScenarioDefinition, state: GameState): ToolCall | null {
  const context = { observed: state.observed, blueprint: state.blueprint, verifiedGoals: state.verifiedGoals };
  const goal = scenario.goals.find(item => !context.verifiedGoals.includes(item.fact));
  if (!goal) return null;
  if (known(context, goal.fact) === goal.equals) {
    return context.blueprint.verification && context.blueprint.tools.includes('verify')
      ? { tool: 'verify', fact: goal.fact } : null;
  }
  if (known(context, goal.fact) === undefined && context.blueprint.tools.includes('observe')) {
    const observation = scenario.observations.find(item => item.facts.includes(goal.fact));
    if (observation) return { tool: 'observe', observationId: observation.id };
  }
  if (!context.blueprint.tools.includes('operate')) return null;
  const goalOperation = scenario.operations.find(item => item.id === goal.operationId);
  if (!goalOperation) return null;
  const resolveKnownBlocker = (operation: OperationDefinition, visited: Set<string>): OperationDefinition | null => {
    if (visited.has(operation.id)) return null;
    visited.add(operation.id);
    for (const [fact, expected] of Object.entries(operation.requires ?? {})) {
      const received = known(context, fact);
      // Unknown preconditions must be discovered by observing or trying the operation.
      if (received !== undefined && received !== expected) {
        const repair = scenario.operations.find(item => item.effects[fact] === expected);
        return repair ? resolveKnownBlocker(repair, visited) : null;
      }
    }
    return operation;
  };
  const next = resolveKnownBlocker(goalOperation, new Set());
  return next ? { tool: 'operate', operationId: next.id } : null;
}

function stopIfSpent(state: GameState): void {
  if (state.budgetRemaining <= 0 && state.status === 'running') {
    state.status = 'exhausted';
    addEvent(state, { type: 'exhausted', text: '本次行动预算已经用尽。回声停止了，世界与已收到的回执保留。可以回工坊调整后重新派遣。' });
  }
}

function markVictory(scenario: ScenarioDefinition, state: GameState): void {
  if (!scenario.goals.every(goal => state.verifiedGoals.includes(goal.fact) && state.world[goal.fact] === goal.equals)) return;
  state.status = 'won';
  const event = addEvent(state, { type: 'victory', text: '每一项完成条件都有实际的状态证据。契约履行了。', success: true });
  state.learningEvidence = scenario.concepts.map(concept => ({
    concept, scenarioId: scenario.id,
    level: scenario.kind === 'transfer' && !state.hintUsed ? 'independent-transfer' : 'guided',
    eventIds: [...state.events.filter(item => item.type === 'verified').map(item => item.id), event.id],
  }));
}

function execute(scenario: ScenarioDefinition, state: GameState, call: ToolCall): void {
  const target = targetOf(scenario, call)!;
  const callId = `${state.scenarioId}:call:${state.events.length + 1}`;
  state.budgetRemaining -= 1;
  addEvent(state, {
    type: 'request', text: call.tool === 'observe' ? '回声请求观察环境。' : call.tool === 'verify' ? '回声请求检查完成条件。' : '回声提出法器操作请求。',
    tool: call.tool, target, callId,
    ...(call.tool === 'operate' ? { operationId: call.operationId } : {}),
  });
  if (!allowed(state, target)) {
    addEvent(state, { type: 'blocked', text: '访问契约拒绝了这个目标。没有执行操作，世界未改变。', tool: call.tool, target, callId, success: false, delivered: state.blueprint.feedback });
    state.status = 'stalled';
    return;
  }
  if (call.tool === 'observe') {
    const definition = scenario.observations.find(item => item.id === call.observationId)!;
    const facts = Object.fromEntries(definition.facts.map(fact => [fact, state.world[fact]]));
    const event = addEvent(state, { type: 'observation', text: definition.text, tool: 'observe', target, callId, facts, success: true, delivered: true });
    supply(state, facts, 'observation', event.id);
  } else if (call.tool === 'operate') {
    const operation = scenario.operations.find(item => item.id === call.operationId)!;
    const missing = Object.entries(operation.requires ?? {}).filter(([fact, expected]) => state.world[fact] !== expected);
    const success = missing.length === 0;
    const facts = success ? { ...operation.effects } : Object.fromEntries(missing.map(([fact]) => [fact, state.world[fact]]));
    if (success) {
      Object.assign(state.world, operation.effects);
      state.verifiedGoals = state.verifiedGoals.filter(fact => !own(operation.effects, fact));
    }
    const event = addEvent(state, { type: 'result', text: success ? operation.successText : operation.failureText,
      tool: 'operate', target, operationId: operation.id, callId, facts, success, delivered: state.blueprint.feedback });
    if (state.blueprint.feedback) supply(state, facts, 'receipt', event.id);
    else {
      addEvent(state, { type: 'claim', text: success ? '法器已经动作，但回声没有收到回执。它无法据此决定下一步，也没有完成验收。' : '法器返回了失败回执，但反馈回路尚未接通，回声无法利用这条新信息。', success: false });
      state.status = 'stalled';
    }
  } else {
    const goal = scenario.goals.find(item => item.fact === call.fact)!;
    const facts = { [goal.fact]: state.world[goal.fact] };
    const success = state.world[goal.fact] === goal.equals;
    const event = addEvent(state, { type: 'verified', text: success ? `状态检查通过：${goal.label}。` : `状态检查未通过：${goal.label}还没有实现。`,
      tool: 'verify', target, callId, facts, success, delivered: true });
    supply(state, facts, 'verification', event.id);
    if (success && !state.verifiedGoals.includes(goal.fact)) state.verifiedGoals.push(goal.fact);
    else if (!success) state.verifiedGoals = state.verifiedGoals.filter(fact => fact !== goal.fact);
    markVictory(scenario, state);
  }
  stopIfSpent(state);
}

function validCall(scenario: ScenarioDefinition, state: GameState, call: ToolCall): boolean {
  if (!call || typeof call !== 'object' || !toolNames.includes(call.tool) || !state.blueprint.tools.includes(call.tool)) return false;
  const expectedKeys = call.tool === 'observe' ? ['tool', 'observationId'] : call.tool === 'operate' ? ['tool', 'operationId'] : ['tool', 'fact'];
  if (Object.keys(call).some(key => !expectedKeys.includes(key))) return false;
  return targetOf(scenario, call) !== undefined;
}

/** Pure, immutable state transition. Rejected and duplicated player actions return the SAME object. */
export function reduceGame(scenario: ScenarioDefinition, previous: GameState, action: GameAction): GameState {
  if (!action || typeof action.id !== 'string' || !action.id.trim() || action.id.length > 200 ||
      previous.scenarioId !== scenario.id || previous.scenarioVersion !== (scenario.version ?? 1) ||
      previous.processedActionIds.includes(action.id)) return previous;
  const mutableStatuses = ['ready', 'paused', 'stalled', 'exhausted'];
  switch (action.type) {
    case 'configure': if (!mutableStatuses.includes(previous.status) || !validBlueprint(action.blueprint)) return previous; break;
    case 'dispatch': if (!['ready', 'stalled', 'exhausted'].includes(previous.status)) return previous; break;
    case 'step': if (previous.status !== 'running' || previous.budgetRemaining <= 0) return previous; break;
    case 'pause': if (previous.status !== 'running') return previous; break;
    case 'resume': if (previous.status !== 'paused' || previous.budgetRemaining <= 0) return previous; break;
    case 'tool':
      if (previous.status !== 'running' || previous.budgetRemaining <= 0 || !validCall(scenario, previous, action.call) || !allowed(previous, targetOf(scenario, action.call)!)) return previous;
      break;
    case 'hint': if (previous.status === 'won' || previous.hintUsed) return previous; break;
    case 'reset': break;
    default: return previous;
  }
  if (action.type === 'reset') {
    const state = createGame(scenario, previous.seed);
    state.processedActionIds = [...previous.processedActionIds, action.id];
    state.hintUsed = previous.hintUsed;
    if (action.preserveBlueprint !== false) state.blueprint = structuredClone(previous.blueprint);
    state.budgetRemaining = state.blueprint.budget;
    addEvent(state, { type: 'reset', text: '回到本次委托的起点。已看过的提示记录保留，避免把跟随提示的重试误记为独立迁移。' });
    return state;
  }
  const state = structuredClone(previous);
  state.processedActionIds.push(action.id);
  if (action.type === 'configure') {
    state.blueprint = structuredClone(action.blueprint);
    state.budgetRemaining = action.blueprint.budget;
    state.status = 'ready';
    addEvent(state, { type: 'configured', text: '新的法器与契约已装配。世界状态和已收集的证据保留。' });
  } else if (action.type === 'dispatch') {
    state.attempt += 1;
    state.status = 'running';
    state.budgetRemaining = state.blueprint.budget;
    addEvent(state, { type: 'dispatched', text: '回声开始行动。当前使用确定规则的教学策略模拟。' });
    if (!state.learningEvidence.length) state.learningEvidence = scenario.concepts.map(concept => ({ concept, scenarioId: scenario.id, level: 'seen', eventIds: [] }));
  } else if (action.type === 'step') {
    const call = chooseNextCall(scenario, state);
    if (call) execute(scenario, state, call);
    else {
      state.budgetRemaining -= 1;
      addEvent(state, { type: 'claim', text: !state.blueprint.tools.includes('operate')
        ? '“我已经完成了。”——这只是一句回复。没有执行法器操作，世界不会因这句话而改变。'
        : scenario.goals.every(goal => known(state, goal.fact) === goal.equals)
          ? '“应该完成了。”——行动回执尚未经过独立状态检查。请配置验收，再确认真实结果。'
          : '回声无法从已有信息找到下一步。请检查法器、反馈、权限与完成条件。', success: false });
      state.status = 'stalled';
    }
  } else if (action.type === 'tool') execute(scenario, state, action.call);
  else if (action.type === 'pause') {
    state.status = 'paused';
    addEvent(state, { type: 'paused', text: '行动已暂停。当前没有继续执行工具。' });
  } else if (action.type === 'resume') {
    state.status = 'running';
    addEvent(state, { type: 'resumed', text: '从已提交的状态继续行动。' });
  } else if (action.type === 'hint') state.hintUsed = true;
  return state;
}
