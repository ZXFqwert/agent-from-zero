import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduceGame, defaultBlueprint, chooseNextCall, validateScenario, validateGameState } from '../src/engine/index';
import type { AgentBlueprint, GameAction, GameState, ScenarioDefinition } from '../src/engine/types';
import { scenarios } from '../src/content/scenarios';

const lighthouse: ScenarioDefinition = {
  id: 'test-lighthouse', title: '灯塔', subtitle: '闭环', brief: '点亮灯塔', npc: '米娅',
  chapter: 1, location: 'lighthouse', kind: 'guided',
  initialWorld: { power: false, lit: false, secret: 'undiscovered' },
  observations: [{ id: 'look', target: 'lamp', label: '观察', facts: ['lit'], text: '灯塔没有亮。' }],
  operations: [
    { id: 'ignite', target: 'lamp', label: '点亮', requires: { power: true }, effects: { lit: true }, successText: '灯亮了。', failureText: '备用电源未连接。' },
    { id: 'connect', target: 'power', label: '接通电源', effects: { power: true }, successText: '电源已接通。', failureText: '无法连接。' },
  ],
  goals: [{ fact: 'lit', equals: true, label: '灯塔亮起', operationId: 'ignite' }],
  concepts: ['world-state', 'feedback', 'verification'],
};

const full: AgentBlueprint = { tools: ['observe', 'operate', 'verify'], feedback: true, verification: true, budget: 12, permissions: ['*'] };

function configured(scenario = lighthouse, blueprint = full): GameState {
  return reduceGame(scenario, createGame(scenario, 42), { id: 'configure', type: 'configure', blueprint });
}

function dispatch(scenario: ScenarioDefinition, state: GameState): GameState {
  return reduceGame(scenario, state, { id: `dispatch-${state.events.length}`, type: 'dispatch' });
}

function play(scenario: ScenarioDefinition, state = configured(scenario)): GameState {
  let current = dispatch(scenario, state);
  for (let step = 0; current.status === 'running' && step < 65; step++) {
    current = reduceGame(scenario, current, { id: `step-${current.events.length}`, type: 'step' });
  }
  return current;
}

test('a completion claim with no tools cannot change the world or win', () => {
  const state = play(lighthouse, createGame(lighthouse));
  assert.equal(state.world.lit, false);
  assert.equal(state.status, 'stalled');
  assert.equal(state.events.at(-1)?.type, 'claim');
  assert.deepEqual(state.verifiedGoals, []);
  assert.ok(state.learningEvidence.every(item => item.level === 'seen'));
});

test('reference solution discovers failed precondition, repairs, executes and verifies', () => {
  const state = play(lighthouse);
  assert.equal(state.status, 'won');
  assert.equal(state.world.lit, true);
  assert.equal(state.world.power, true);
  assert.deepEqual(state.events.filter(event => event.type === 'request').map(event => event.operationId ?? event.tool), ['observe', 'ignite', 'connect', 'ignite', 'verify']);
  assert.ok(state.events.some(event => event.type === 'result' && event.success === false));
  assert.equal(state.budgetRemaining, 7);
  assert.ok(state.learningEvidence.every(item => item.level === 'guided'));
});

test('without feedback the error exists in the trace but is absent from agent context', () => {
  const state = play(lighthouse, configured(lighthouse, { ...full, feedback: false }));
  assert.equal(state.status, 'stalled');
  assert.equal(state.world.power, false);
  assert.equal(state.observed.power, undefined);
  const result = state.events.find(event => event.type === 'result');
  assert.deepEqual(result?.facts, { power: false });
  assert.equal(result?.delivered, false);
});

test('a failed run can recover after enabling feedback without pretending it already won', () => {
  const failed = play(lighthouse, configured(lighthouse, { ...full, feedback: false }));
  const repaired = reduceGame(lighthouse, failed, { id: 'repair', type: 'configure', blueprint: full });
  assert.equal(repaired.status, 'ready');
  assert.equal(repaired.world.lit, false);
  const result = play(lighthouse, repaired);
  assert.equal(result.status, 'won');
  assert.equal(result.attempt, 2);
});

test('successful action is insufficient without an actual verification request', () => {
  const state = play(lighthouse, configured(lighthouse, { ...full, verification: false }));
  assert.equal(state.world.lit, true);
  assert.equal(state.status, 'stalled');
  assert.deepEqual(state.verifiedGoals, []);
  assert.equal(state.events.some(event => event.type === 'victory'), false);
});

test('policy cannot consult undiscovered world facts', () => {
  let state = dispatch(lighthouse, configured());
  state = reduceGame(lighthouse, state, { id: 'observe', type: 'step' });
  assert.deepEqual(Object.keys(state.observed), ['lit']);
  const differentWorld = structuredClone(state);
  differentWorld.world.power = true;
  differentWorld.world.secret = 'different';
  assert.deepEqual(chooseNextCall(lighthouse, state), chooseNextCall(lighthouse, differentWorld));
  assert.deepEqual(chooseNextCall(lighthouse, state), { tool: 'operate', operationId: 'ignite' });
});

test('receipts contain relevant facts only and do not leak unrelated facts', () => {
  const state = play(lighthouse);
  assert.equal(state.observed.secret, undefined);
  assert.ok(state.events.every(event => event.facts?.secret === undefined));
});

test('same version, seed and action sequence yields identical replay state', () => {
  const left = play(lighthouse);
  const right = play(lighthouse);
  assert.deepEqual(left, right);
  assert.equal(JSON.stringify(left), JSON.stringify(right));
});

test('budget exhaustion halts execution and cannot be bypassed by further steps', () => {
  const state = play(lighthouse, configured(lighthouse, { ...full, budget: 2 }));
  assert.equal(state.status, 'exhausted');
  assert.equal(state.budgetRemaining, 0);
  assert.equal(state.world.lit, false);
  assert.strictEqual(reduceGame(lighthouse, state, { id: 'late-step', type: 'step' }), state);
});

test('victory on the last budget unit is accepted, with no extra call', () => {
  const state = play(lighthouse, configured(lighthouse, { ...full, budget: 5 }));
  assert.equal(state.status, 'won');
  assert.equal(state.budgetRemaining, 0);
  assert.equal(state.events.filter(event => event.type === 'request').length, 5);
});

test('duplicate action IDs are idempotent, even when replayed after serialization', () => {
  const initial = dispatch(lighthouse, configured());
  const action: GameAction = { id: 'unique-observe', type: 'step' };
  const state = reduceGame(lighthouse, initial, action);
  assert.strictEqual(reduceGame(lighthouse, state, action), state);
  const restored: GameState = JSON.parse(JSON.stringify(state));
  assert.strictEqual(reduceGame(lighthouse, restored, action), restored);
});

test('pause prevents steps; resume continues from the same committed state', () => {
  let state = dispatch(lighthouse, configured());
  state = reduceGame(lighthouse, state, { id: 'pause', type: 'pause' });
  assert.equal(state.status, 'paused');
  assert.strictEqual(reduceGame(lighthouse, state, { id: 'paused-step', type: 'step' }), state);
  const resumed = reduceGame(lighthouse, state, { id: 'resume', type: 'resume' });
  assert.equal(resumed.status, 'running');
  assert.deepEqual(resumed.world, state.world);
  assert.equal(resumed.budgetRemaining, state.budgetRemaining);
});

test('invalid arguments, unavailable tools and forged calls have zero side effects', () => {
  const state = dispatch(lighthouse, configured());
  const actions = [
    { id: 'bad1', type: 'tool', call: { tool: 'operate', operationId: 'unknown' } },
    { id: 'bad2', type: 'tool', call: { tool: 'verify', fact: 'secret' } },
    { id: 'bad3', type: 'tool', call: { tool: 'operate', operationId: 'connect', overridePermission: true } },
    { id: 'bad4', type: 'tool', call: { tool: 'execute_shell', command: 'anything' } },
  ] as unknown as GameAction[];
  for (const action of actions) assert.strictEqual(reduceGame(lighthouse, state, action), state);
  const noTools = dispatch(lighthouse, createGame(lighthouse));
  assert.strictEqual(reduceGame(lighthouse, noTools, { id: 'unavailable', type: 'tool', call: { tool: 'observe', observationId: 'look' } }), noTools);
});

test('invalid configuration leaves the prior object and budget untouched', () => {
  const state = configured();
  for (const budget of [0, -1, 65, 2.5, Number.NaN]) {
    assert.strictEqual(reduceGame(lighthouse, state, { id: 'bad-budget', type: 'configure', blueprint: { ...full, budget } }), state);
  }
  assert.strictEqual(reduceGame(lighthouse, state, { id: 'duplicate-tool', type: 'configure', blueprint: { ...full, tools: ['observe', 'observe'] } }), state);
});

test('denied manual actions are rejected unchanged; simulated requests log a denial with no world mutation', () => {
  const state = dispatch(lighthouse, configured(lighthouse, { ...full, permissions: ['lamp'] }));
  assert.strictEqual(reduceGame(lighthouse, state, { id: 'denied', type: 'tool', call: { tool: 'operate', operationId: 'connect' } }), state);
  let current = state;
  for (let i = 0; current.status === 'running'; i++) current = reduceGame(lighthouse, current, { id: `limited-${i}`, type: 'step' });
  assert.equal(current.status, 'stalled');
  assert.equal(current.world.power, false);
  assert.equal(current.world.lit, false);
  assert.equal(current.events.at(-1)?.type, 'blocked');
});

test('manual verification of an unfulfilled condition cannot award victory', () => {
  const state = dispatch(lighthouse, configured());
  const result = reduceGame(lighthouse, state, { id: 'early-check', type: 'tool', call: { tool: 'verify', fact: 'lit' } });
  assert.deepEqual(result.verifiedGoals, []);
  assert.equal(result.status, 'running');
  assert.equal(result.events.at(-1)?.success, false);
});

test('generic transfer scenario solves different names and values, recording independent use', () => {
  const warehouse: ScenarioDefinition = {
    ...lighthouse, id: 'test-warehouse', location: 'warehouse', kind: 'transfer',
    initialWorld: { seal: 'locked', door: 'closed' },
    observations: [{ id: 'inspectDoor', target: 'door', label: '看门', facts: ['door'], text: '仓门仍然关闭。' }],
    operations: [
      { id: 'openDoor', target: 'door', label: '开门', requires: { seal: 'unlocked' }, effects: { door: 'open' }, successText: '门开了。', failureText: '门封未解。' },
      { id: 'unlockSeal', target: 'seal', label: '解封', effects: { seal: 'unlocked' }, successText: '封印已解。', failureText: '未解。' },
    ],
    goals: [{ fact: 'door', equals: 'open', label: '仓库门打开', operationId: 'openDoor' }],
  };
  const result = play(warehouse);
  assert.equal(result.status, 'won');
  assert.ok(result.learningEvidence.every(item => item.level === 'independent-transfer'));
  const hinted = reduceGame(warehouse, configured(warehouse), { id: 'hint', type: 'hint' });
  assert.ok(play(warehouse, hinted).learningEvidence.every(item => item.level === 'guided'));
});

test('reset does not erase hint evidence or reuse already processed action IDs', () => {
  const hint = reduceGame(lighthouse, configured(), { id: 'hint', type: 'hint' });
  const reset = reduceGame(lighthouse, hint, { id: 'reset', type: 'reset' });
  assert.equal(reset.hintUsed, true);
  assert.deepEqual(reset.blueprint, full);
  assert.deepEqual(reset.world, lighthouse.initialWorld);
  assert.strictEqual(reduceGame(lighthouse, reset, { id: 'reset', type: 'reset' }), reset);
  const freshBuild = reduceGame(lighthouse, reset, { id: 'reset-build', type: 'reset', preserveBlueprint: false });
  assert.deepEqual(freshBuild.blueprint, defaultBlueprint);
});

test('boss victory requires separate evidence for both objectives', () => {
  const boss: ScenarioDefinition = {
    ...lighthouse, id: 'test-boss', location: 'boss', kind: 'boss',
    initialWorld: { eastPower: false, westPower: false, eastLit: false, westLit: false },
    observations: [
      { id: 'eastView', target: 'east', label: '东塔', facts: ['eastLit'], text: '东塔熄灭。' },
      { id: 'westView', target: 'west', label: '西塔', facts: ['westLit'], text: '西塔熄灭。' },
    ],
    operations: [
      { id: 'igniteEast', target: 'east', label: '启动东塔', requires: { eastPower: true }, effects: { eastLit: true }, successText: '东塔亮起。', failureText: '东塔缺少能源。' },
      { id: 'igniteWest', target: 'west', label: '启动西塔', requires: { westPower: true }, effects: { westLit: true }, successText: '西塔亮起。', failureText: '西塔缺少能源。' },
      { id: 'powerEast', target: 'east', label: '连接东塔', effects: { eastPower: true }, successText: '东侧接通。', failureText: '失败。' },
      { id: 'powerWest', target: 'west', label: '连接西塔', effects: { westPower: true }, successText: '西侧接通。', failureText: '失败。' },
    ],
    goals: [
      { fact: 'eastLit', equals: true, label: '东塔亮起', operationId: 'igniteEast' },
      { fact: 'westLit', equals: true, label: '西塔亮起', operationId: 'igniteWest' },
    ],
  };
  const result = play(boss);
  assert.equal(result.status, 'won');
  assert.deepEqual(result.verifiedGoals, ['eastLit', 'westLit']);
  assert.equal(result.events.filter(event => event.type === 'verified' && event.success).length, 2);
});

test('reducers never mutate their input snapshot or authored scenario', () => {
  const state = dispatch(lighthouse, configured());
  const stateBefore = JSON.stringify(state);
  const scenarioBefore = JSON.stringify(lighthouse);
  reduceGame(lighthouse, state, { id: 'immutable', type: 'step' });
  assert.equal(JSON.stringify(state), stateBefore);
  assert.equal(JSON.stringify(lighthouse), scenarioBefore);
});

test('invalid authored goals and unknown facts are rejected before play', () => {
  assert.deepEqual(validateScenario(lighthouse), []);
  assert.throws(() => createGame({ ...lighthouse, goals: [{ ...lighthouse.goals[0], operationId: 'nonexistent' }] }), /目标操作/);
  assert.throws(() => createGame({ ...lighthouse, observations: [{ ...lighthouse.observations[0], facts: ['missing'] }] }), /未知事实/);
  assert.throws(() => createGame(lighthouse, Number.NaN), /种子/);
});

test('all three authored adventures have reference, error and recovery paths', () => {
  for (const scenario of scenarios) {
    assert.deepEqual(validateScenario(scenario), [], scenario.id);
    const noTools = play(scenario, createGame(scenario));
    assert.equal(noTools.status, 'stalled', `${scenario.id}: claim cannot win`);
    const noFeedback = play(scenario, configured(scenario, { ...full, feedback: false }));
    assert.equal(noFeedback.status, 'stalled', `${scenario.id}: disconnected feedback stalls`);
    const restored = reduceGame(scenario, noFeedback, { id: 'enable-feedback', type: 'configure', blueprint: full });
    const won = play(scenario, restored);
    assert.equal(won.status, 'won', `${scenario.id}: reference solution recovers`);
    assert.equal(won.verifiedGoals.length, scenario.goals.length);
    assert.equal(validateGameState(scenario, won), true, `${scenario.id}: win save validates`);
  }
});

test('every committed reference state survives strict save validation', () => {
  for (const scenario of scenarios) {
    let state = createGame(scenario);
    assert.equal(validateGameState(scenario, state), true);
    state = reduceGame(scenario, state, { id: 'configure', type: 'configure', blueprint: full });
    assert.equal(validateGameState(scenario, state), true);
    state = dispatch(scenario, state);
    assert.equal(validateGameState(scenario, state), true);
    for (let step = 0; state.status === 'running'; step++) {
      state = reduceGame(scenario, state, { id: `step-${step}`, type: 'step' });
      assert.equal(validateGameState(scenario, JSON.parse(JSON.stringify(state))), true, `${scenario.id}/step-${step}`);
    }
  }
});

test('save validation rejects forged world, context, result evidence and incompatible versions', () => {
  const original = play(lighthouse);
  const changes: Array<(state: GameState) => void> = [
    state => { state.world.secret = 'forged'; },
    state => { state.world.extra = true; },
    state => { state.observed.secret = { value: 'undiscovered', source: 'observation', eventId: state.events[0].id }; },
    state => { state.events.find(event => event.type === 'verified')!.facts = { lit: false }; },
    state => { state.events.find(event => event.type === 'result')!.success = true; },
    state => { state.budgetRemaining = 900; },
    state => { state.scenarioVersion = 999; },
    state => { state.processedActionIds.push(state.processedActionIds[0]); },
    state => { state.learningEvidence[0].level = 'independent-transfer'; },
    state => { state.verifiedGoals = []; },
  ];
  for (const change of changes) {
    const altered = structuredClone(original);
    change(altered);
    assert.equal(validateGameState(lighthouse, altered), false);
  }
  for (const malformed of [null, {}, [], 'save', { ...original, blueprint: null }, { ...original, events: [null] }]) {
    assert.equal(validateGameState(lighthouse, malformed), false);
  }
});

test('strict save validation also accepts feedback failures, resets, pauses and exhausted states', () => {
  const failures = [
    play(lighthouse, createGame(lighthouse)),
    play(lighthouse, configured(lighthouse, { ...full, feedback: false })),
    play(lighthouse, configured(lighthouse, { ...full, budget: 2 })),
    play(lighthouse, configured(lighthouse, { ...full, permissions: ['lamp'] })),
  ];
  for (const state of failures) assert.equal(validateGameState(lighthouse, state), true);
  const paused = reduceGame(lighthouse, dispatch(lighthouse, configured()), { id: 'pause', type: 'pause' });
  assert.equal(validateGameState(lighthouse, paused), true);
  const reset = reduceGame(lighthouse, failures[1], { id: 'reset', type: 'reset' });
  assert.equal(validateGameState(lighthouse, reset), true);
});
