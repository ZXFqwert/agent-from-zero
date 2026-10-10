/** A separate authored transfer encounter. No model, operating-system tool or main-season reward runs here. */
export const COURIER_VERSION = 'courier-v1' as const;
export const COURIER_SCENARIO_ID = 'courier-storm-transfer' as const;
export const COURIER_TITLE = '暴雨签收站';
export const COURIER_SCENARIOS = [
  {id: COURIER_SCENARIO_ID, title: COURIER_TITLE, businessKey: 'HOSP-RAIN-17', destination: 'hospital', quantity: 1, brief: '山坡医院急需一箱止血药。雨中的信差可能失去回信；为整份委托签订能经受重试和重启的契约。', fault: 'storm', faultText: '暴雨场景中，第一趟未封缄的回信会被雷雨截断；药箱交接与回信是两件事。封缄回信可保全回执。', lostText: '药箱已经上船交接，未封缄的回信被雷雨截断。回声没有收到成功或失败回执。'},
  {id: 'courier-night-transfer', title: '断电夜市', businessKey: 'MARKET-NIGHT-23', destination: 'market', quantity: 2, brief: '夜市药棚需要两箱外伤药，医院已有自己的库存。这次登记站将在首趟交接时断电，要让业务在恢复与重试后仍保持正确。', fault: 'blackout', faultText: '夜市登记站第一趟交接后会短暂停电，未封缄的电子回信丢失；现场交接已经完成。封缄回信使用独立电源。', lostText: '两岸已经交接药箱，登记站停电截断了未封缄回信。回声没有收到成功或失败回执。'},
] as const;
export type CourierScenarioId = typeof COURIER_SCENARIOS[number]['id'];
export const COURIER_MAX_SAVE_BYTES = 128 * 1024;
export const COURIER_MAX_ACTIONS = 64;
export const COURIER_ACTION_COSTS = {configure: 1, observe: 1, submit: 2, restart: 1, recover: 1, verify: 1, hint: 1} as const;

export type CourierDestination = 'hospital' | 'market';
export interface CourierConfig {dedupe: 'call-id' | 'business-key'; ledger: 'volatile' | 'persistent'; receipt: 'exposed' | 'sealed'}
export interface CourierCommission {businessKey: string; destination: CourierDestination; quantity: 1 | 2; title: string}
export interface CourierRequest {callId: string; businessKey: string; destination: CourierDestination; quantity: 1 | 2}
export interface CourierReceipt extends CourierRequest {deliveryId: string; revision: number; source: 'new' | 'ledger'; originalCallId: string}
export type CourierAction =
  | {id: string; type: 'configure'; dedupe: CourierConfig['dedupe']; ledger: CourierConfig['ledger']; receipt: CourierConfig['receipt']}
  | {id: string; type: 'observe'; target: 'commission' | 'weather' | 'hospital' | 'market' | 'ledger'}
  | ({id: string; type: 'submit'} & CourierRequest)
  | {id: string; type: 'restart' | 'recover' | 'verify' | 'hint'};
export type CourierEventType = 'configured' | 'observed' | 'submitted' | 'receipt-lost' | 'receipt' | 'deduplicated' | 'conflict-rejected' | 'restarted' | 'recovered' | 'verified' | 'hint' | 'budget-stopped';
export interface CourierEvent {
  id: string; actionId: string; type: CourierEventType; text: string; technical: string;
  detail: Record<string, string | number | boolean>;
}
export interface CourierLedgerEntry {
  key: string; businessKey: string; callId: string; destination: CourierDestination; quantity: 1 | 2;
  deliveryId: string; revision: number; committedActionId: string;
}
export interface CourierCallRecord extends CourierRequest {outcome: 'committed' | 'cached' | 'conflict'; deliveryId: string | null; revision: number}
export interface CourierState {
  version: typeof COURIER_VERSION; scenarioId: CourierScenarioId; attemptId: string; seed: number;
  status: 'active' | 'won' | 'exhausted'; hintUsed: boolean; config: CourierConfig;
  budget: {total: number; remaining: number};
  /** The stage may display these facts. They never enter the partner's input without an observation/result. */
  world: {hospitalBoxes: number; marketBoxes: number; revision: number; transmissions: number; receiptLost: boolean};
  known: {
    commission: CourierCommission | null;
    weather: {storm: boolean; fault: 'storm' | 'blackout'; rule: string} | null;
    hospital: {boxes: number; revision: number} | null;
    market: {boxes: number; revision: number} | null;
    ledger: {entries: {businessKey: string; callId: string; destination: CourierDestination; quantity: number; deliveryId: string}[]; persistent: boolean} | null;
    lastReceipt: CourierReceipt | null;
  };
  runtime: {ledger: CourierLedgerEntry[]; calls: CourierCallRecord[]; needsRecovery: boolean};
  durable: {ledger: CourierLedgerEntry[]; calls: CourierCallRecord[]};
  actions: CourierAction[]; events: CourierEvent[];
}
export type CourierSave = CourierState;
export interface CourierReduction {state: CourierState; accepted: boolean; reason?: string}
export interface CourierProof {
  scenarioId: CourierScenarioId; title: string; eventIds: string[]; hintUsed: false;
  checks: {receiptLost: true; newCallSameBusiness: true; persistentRecovery: true; conflictRejected: true; freshVerification: true};
}

const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value);
const ownObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = <T>(value: T): T => structuredClone(value);
const scenarioFor = (scenarioId: CourierScenarioId) => COURIER_SCENARIOS.find(item => item.id === scenarioId)!;
const commissionFor = (scenarioId: CourierScenarioId): CourierCommission => {const definition = scenarioFor(scenarioId);return {businessKey: definition.businessKey, destination: definition.destination, quantity: definition.quantity, title: definition.brief};};
const weatherFor = (scenarioId: CourierScenarioId) => {const definition = scenarioFor(scenarioId);return {storm: definition.fault === 'storm', fault: definition.fault, rule: definition.faultText};};

export function createCourier(seed = 17, attemptId = 'courier-attempt', scenarioId: CourierScenarioId = COURIER_SCENARIO_ID): CourierState {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 1_000_000 || !identifier(attemptId) || !COURIER_SCENARIOS.some(item => item.id === scenarioId)) throw new Error('Invalid courier encounter identity');
  return {version: COURIER_VERSION, scenarioId, attemptId, seed, status: 'active', hintUsed: false,
    config: {dedupe: 'call-id', ledger: 'volatile', receipt: 'exposed'}, budget: {total: 24, remaining: 24},
    world: {hospitalBoxes: 0, marketBoxes: 0, revision: 0, transmissions: 0, receiptLost: false},
    known: {commission: null, weather: null, hospital: null, market: null, ledger: null, lastReceipt: null},
    runtime: {ledger: [], calls: [], needsRecovery: false}, durable: {ledger: [], calls: []}, actions: [], events: []};
}

/** The commission is public to the player; it is not automatically appended to the partner's context. */
export function courierView(state: CourierState) {
  return {title: scenarioFor(state.scenarioId).title, publicCommission: commissionFor(state.scenarioId), status: state.status, config: clone(state.config), budget: {...state.budget},
    stage: {...state.world}, known: clone(state.known), needsRecovery: state.runtime.needsRecovery, hintUsed: state.hintUsed, events: clone(state.events)};
}

export function isCourierAction(input: unknown): input is CourierAction {
  if (!ownObject(input) || !identifier(input.id) || typeof input.type !== 'string') return false;
  switch (input.type) {
    case 'configure': return exactKeys(input, ['id', 'type', 'dedupe', 'ledger', 'receipt']) && (input.dedupe === 'call-id' || input.dedupe === 'business-key') && (input.ledger === 'volatile' || input.ledger === 'persistent') && (input.receipt === 'exposed' || input.receipt === 'sealed');
    case 'observe': return exactKeys(input, ['id', 'type', 'target']) && ['commission', 'weather', 'hospital', 'market', 'ledger'].includes(input.target as string);
    case 'submit': return exactKeys(input, ['id', 'type', 'callId', 'businessKey', 'destination', 'quantity']) && identifier(input.callId) && identifier(input.businessKey) && (input.destination === 'hospital' || input.destination === 'market') && (input.quantity === 1 || input.quantity === 2);
    case 'restart': case 'recover': case 'verify': case 'hint': return exactKeys(input, ['id', 'type']);
    default: return false;
  }
}

const sameRequest = (left: Pick<CourierRequest, 'businessKey' | 'destination' | 'quantity'>, right: Pick<CourierRequest, 'businessKey' | 'destination' | 'quantity'>) => left.businessKey === right.businessKey && left.destination === right.destination && left.quantity === right.quantity;
function syncDurable(state: CourierState) {if (state.config.ledger === 'persistent') state.durable = clone({ledger: state.runtime.ledger, calls: state.runtime.calls});}
function entryReceipt(entry: CourierLedgerEntry, request: CourierRequest, source: CourierReceipt['source']): CourierReceipt {
  return {...request, deliveryId: entry.deliveryId, revision: entry.revision, source, originalCallId: entry.callId};
}

/** Invalid/admission-rejected actions return the exact original state, including budget and logs. */
export function reduceCourier(previous: CourierState, input: unknown): CourierReduction {
  const reject = (reason: string): CourierReduction => ({state: previous, accepted: false, reason});
  if (!isCourierAction(input)) return reject('动作不符合接口；没有执行，也没有扣预算。');
  if (previous.actions.some(action => action.id === input.id)) return reject('这条动作已经提交；重发不会重复执行。');
  if (previous.status !== 'active') return reject('这次委托已经结束；从起航检查点开始新的尝试。');
  if (previous.actions.length >= COURIER_MAX_ACTIONS) return reject('动作记录已达上限，未执行。');
  if (input.type === 'configure' && previous.world.transmissions > 0) return reject('首趟派遣后不能补写过去的账本；从检查点重新装配。');
  if (input.type === 'recover' && previous.config.ledger !== 'persistent') return reject('当前没有持久账本；内存里的记录无法在重启后找回。');
  if (input.type === 'submit' && previous.runtime.needsRecovery) return reject('宿主知道有未恢复的持久记录；先恢复账本，再决定是否发送。');
  const cost = COURIER_ACTION_COSTS[input.type];
  if (previous.budget.remaining < cost) return reject('剩余预算不足；这条动作没有执行。');
  const state = clone(previous), action = clone(input);
  state.actions.push(action);state.budget.remaining -= cost;
  const event = (type: CourierEventType, text: string, technical: string, detail: CourierEvent['detail'] = {}) => {
    state.events.push({id: `${state.attemptId}:${action.id}:${state.events.length + 1}`, actionId: action.id, type, text, technical, detail});
  };
  switch (action.type) {
    case 'configure':
      state.config = {dedupe: action.dedupe, ledger: action.ledger, receipt: action.receipt};
      event('configured', `法器按${action.dedupe === 'business-key' ? '同一份业务' : '每次调用编号'}查重；账本${action.ledger === 'persistent' ? '落盘' : '只在内存'}；回信${action.receipt === 'sealed' ? '封缄' : '直接传送'}。`, 'Configuration applies before any transmission; existing events are never rewritten.', {...state.config});
      break;
    case 'observe':
      if (action.target === 'commission') {
        state.known.commission = commissionFor(state.scenarioId);
        event('observed', `回声读到委托原件：${state.known.commission.businessKey}，${state.known.commission.destination === 'hospital' ? '医院' : '夜市药棚'}，${state.known.commission.quantity} 箱。`, 'Only this explicitly selected commission enters the partner context.', {target: action.target, businessKey: state.known.commission.businessKey});
      } else if (action.target === 'weather') {
        state.known.weather = weatherFor(state.scenarioId);
        event('observed', `通信告示：${state.known.weather.rule}`, 'The author definition publishes the fault; seed changes cannot manufacture a new encounter.', {target: action.target, fault: state.known.weather.fault});
      } else if (action.target === 'hospital') {
        state.known.hospital = {boxes: state.world.hospitalBoxes, revision: state.world.revision};
        event('observed', `现场点数：医院有 ${state.world.hospitalBoxes} 箱，登记版本 ${state.world.revision}。`, 'Observation copies this hospital snapshot, not the full world, into known.', {target: action.target, boxes: state.world.hospitalBoxes, revision: state.world.revision});
      } else if (action.target === 'market') {
        state.known.market = {boxes: state.world.marketBoxes, revision: state.world.revision};
        event('observed', `现场点数：夜市药棚有 ${state.world.marketBoxes} 箱，登记版本 ${state.world.revision}。`, 'Observation copies this market snapshot, not the hospital or full world, into known.', {target: action.target, boxes: state.world.marketBoxes, revision: state.world.revision});
      } else {
        state.known.ledger = {entries: state.runtime.ledger.map(({businessKey, callId, destination, quantity, deliveryId}) => ({businessKey, callId, destination, quantity, deliveryId})), persistent: state.config.ledger === 'persistent'};
        event('observed', `回声查看当前账本：${state.runtime.ledger.length} 份已提交业务。${state.runtime.needsRecovery ? '持久页尚未恢复，当前空白不代表没有发货。' : ''}`, 'Only the currently loaded ledger enters known; durable storage is not silently consulted.', {target: action.target, entries: state.runtime.ledger.length, needsRecovery: state.runtime.needsRecovery});
      }
      break;
    case 'submit': {
      const request: CourierRequest = {callId: action.callId, businessKey: action.businessKey, destination: action.destination, quantity: action.quantity};
      event('submitted', `发送 ${request.callId}：业务 ${request.businessKey}，${request.destination === 'hospital' ? '医院' : '市集'}，${request.quantity} 箱。`, 'callId pairs a request with its result; businessKey names the intended business operation.', {...request});
      const oldCall = state.runtime.calls.find(item => item.callId === request.callId);
      const key = state.config.dedupe === 'business-key' ? request.businessKey : request.callId;
      const oldEntry = state.runtime.ledger.find(item => item.key === key);
      const rejectConflict = (reason: string, conflictKind: 'call-id' | 'business-key' | 'cached-error') => {
        state.known.lastReceipt = null;
        event('conflict-rejected', reason, 'The operation rejected conflicting parameters before changing world state.', {...request, conflictKind, revision: state.world.revision, worldDelta: 0});
        if (!oldCall) state.runtime.calls.push({...request, outcome: 'conflict', deliveryId: null, revision: state.world.revision});
        syncDurable(state);
      };
      if (oldCall && !sameRequest(oldCall, request)) {rejectConflict('同一个调用编号被用于另一组参数；宿主拒绝复用，药箱没有变化。', 'call-id');break;}
      if (oldEntry && !sameRequest(oldEntry, request)) {rejectConflict('同一业务键的目标或数量变了；账本拒绝冲突，药箱没有变化。', 'business-key');break;}
      if (oldCall?.outcome === 'conflict') {rejectConflict('这个调用已经得到冲突错误；再次发送不会变成新业务。', 'cached-error');break;}
      if (oldEntry) {
        state.world.transmissions++;
        state.known.lastReceipt = entryReceipt(oldEntry, request, 'ledger');
        if (!oldCall) state.runtime.calls.push({...request, outcome: 'cached', deliveryId: oldEntry.deliveryId, revision: oldEntry.revision});
        syncDurable(state);
        event('deduplicated', `账本找到 ${oldEntry.deliveryId}，给新调用 ${request.callId} 回传原交接结果；没有再次发货。`, 'Same ledger identity and same parameters return the committed result with the current callId.', {...request, originalCallId: oldEntry.callId, committedActionId: oldEntry.committedActionId, deliveryId: oldEntry.deliveryId, revision: state.world.revision, worldDelta: 0});
        event('receipt', `回执配对 ${request.callId}：${oldEntry.deliveryId}，${oldEntry.quantity} 箱已交接。`, 'A paired cached receipt is evidence of the business operation, not an independent final count.', {...state.known.lastReceipt});
        break;
      }
      state.world.revision++;
      if (request.destination === 'hospital') state.world.hospitalBoxes += request.quantity;
      else state.world.marketBoxes += request.quantity;
      const entry: CourierLedgerEntry = {key, ...request, deliveryId: `delivery-${state.seed}-${state.world.revision}`, revision: state.world.revision, committedActionId: action.id};
      state.runtime.ledger.push(entry);state.runtime.calls.push({...request, outcome: 'committed', deliveryId: entry.deliveryId, revision: entry.revision});syncDurable(state);
      const loseReceipt = state.world.transmissions === 0 && state.config.receipt === 'exposed';
      state.world.transmissions++;
      if (loseReceipt) {
        state.world.receiptLost = true;state.known.lastReceipt = null;
        event('receipt-lost', scenarioFor(state.scenarioId).lostText, 'The world committed the effect and ledger before the transport lost this receipt. Missing result does not imply missing effect.', {...request, deliveryId: entry.deliveryId, revision: entry.revision, committedActionId: action.id});
      } else {
        state.known.lastReceipt = entryReceipt(entry, request, 'new');
        event('receipt', `回执配对 ${request.callId}：${entry.deliveryId}，${entry.quantity} 箱已交接。`, 'Only the explicit tool result enters known; the hospital total is not copied.', {...state.known.lastReceipt});
      }
      break;
    }
    case 'restart':
      state.runtime = {ledger: [], calls: [], needsRecovery: state.durable.ledger.length > 0};
      state.known = {commission: null, weather: null, hospital: null, market: null, ledger: null, lastReceipt: null};
      event('restarted', '宿主重启：当前会话与内存账本清空，现场药箱和已经落盘的记录保持原样。', 'Restart clears volatile context and runtime caches, not world effects, budget, hint exposure or durable storage.', {revision: state.world.revision, persistentEntries: state.durable.ledger.length});
      break;
    case 'recover':
      state.runtime = {...clone(state.durable), needsRecovery: false};
      state.known.ledger = {entries: state.runtime.ledger.map(({businessKey, callId, destination, quantity, deliveryId}) => ({businessKey, callId, destination, quantity, deliveryId})), persistent: true};
      event('recovered', `从持久页恢复 ${state.runtime.ledger.length} 份已交接记录；原请求与结果接回，目标委托仍须读原件。`, 'A recovery loads the saved operation fingerprints and committed results, without re-executing them.', {entries: state.runtime.ledger.length, revision: state.world.revision, deliveryIds: state.runtime.ledger.map(item => item.deliveryId).join(',')});
      break;
    case 'verify': {
      const commission = state.known.commission;
      const okay = Boolean(commission && (commission.destination === 'hospital' ? state.world.hospitalBoxes === commission.quantity && state.world.marketBoxes === 0 : state.world.marketBoxes === commission.quantity && state.world.hospitalBoxes === 0));
      state.known.hospital = {boxes: state.world.hospitalBoxes, revision: state.world.revision};
      state.known.market = {boxes: state.world.marketBoxes, revision: state.world.revision};
      event('verified', okay ? `独立点数通过：${commission!.destination === 'hospital' ? '医院' : '夜市药棚'}恰好收到 ${commission!.quantity} 箱，另一地点没有误送。委托可以交付。` : !commission ? '现场点数完成，但回声还没有当前委托原件，不能自定验收目标。' : `独立点数未通过：医院 ${state.world.hospitalBoxes} 箱，夜市 ${state.world.marketBoxes} 箱；原件要求${commission.destination === 'hospital' ? '医院' : '夜市'}恰好 ${commission.quantity} 箱。`, 'Acceptance performs a new world read at the current revision; an old receipt or claim cannot decide victory.', {okay, hospitalBoxes: state.world.hospitalBoxes, marketBoxes: state.world.marketBoxes, revision: state.world.revision});
      if (okay) state.status = 'won';
      break;
    }
    case 'hint':
      state.hintUsed = true;
      event('hint', '提示：调用编号识别一次请求；业务键识别一份委托。重启会忘掉内存，落盘的业务账本才能核对旧结果和参数。最终仍要亲自点数。', 'Hint use is replayed and sticky in this attempt; the host must also preserve exposure across retries.', {hintUsed: true});
      break;
  }
  if (state.status === 'active' && state.budget.remaining === 0) {state.status = 'exhausted';event('budget-stopped', '本次预算用完，法器停止；现场状态没有被撤回。可以从起航检查点再试。', 'No subsequent world action is admitted after exhaustion.');}
  return {state, accepted: true};
}

/** Canonical JSON rejects non-JSON values and excessive nesting instead of trusting stored labels/counters. */
function canonical(value: unknown, depth = 0): string | null {
  if (depth > 20) return null;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0) ? JSON.stringify(value) : null;
  if (Array.isArray(value)) {
    if (value.length > 512) return null;
    const items = value.map(item => canonical(item, depth + 1));return items.some(item => item === null) ? null : `[${items.join(',')}]`;
  }
  if (!ownObject(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length > 64 || keys.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) return null;
  const entries = keys.map(key => {const item = canonical(value[key], depth + 1);return item === null ? null : `${JSON.stringify(key)}:${item}`;});
  return entries.some(item => item === null) ? null : `{${entries.join(',')}}`;
}

export function validateCourierSave(input: unknown): CourierState | null {
  try {
    if (!ownObject(input) || input.version !== COURIER_VERSION || !COURIER_SCENARIOS.some(item => item.id === input.scenarioId) || !identifier(input.attemptId) || !Number.isSafeInteger(input.seed) || (input.seed as number) < 0 || (input.seed as number) > 1_000_000 || !Array.isArray(input.actions) || input.actions.length > COURIER_MAX_ACTIONS) return null;
    const encoded = canonical(input);if (encoded === null || new TextEncoder().encode(encoded).byteLength > COURIER_MAX_SAVE_BYTES) return null;
    let replay = createCourier(input.seed as number, input.attemptId, input.scenarioId as CourierScenarioId);
    for (const action of input.actions) {const result = reduceCourier(replay, action);if (!result.accepted) return null;replay = result.state;}
    return encoded === canonical(replay) ? replay : null;
  } catch {return null;}
}

/** This encounter's proof is independent of the old 84 mission save and never awards their rewards. */
export function deriveCourierProof(input: unknown): CourierProof | null {
  const state = validateCourierSave(input);
  if (!state || state.hintUsed || state.status !== 'won' || state.config.dedupe !== 'business-key' || state.config.ledger !== 'persistent') return null;
  const mission = commissionFor(state.scenarioId);
  const lost = state.events.find(item => item.type === 'receipt-lost' && item.detail.businessKey === mission.businessKey && item.detail.destination === mission.destination && item.detail.quantity === mission.quantity);
  if (!lost) return null;
  const after = (event: CourierEvent) => state.events.indexOf(event);
  const restart = state.events.find(item => item.type === 'restarted' && after(item) > after(lost));
  const recovery = restart && state.events.find(item => item.type === 'recovered' && after(item) > after(restart) && (item.detail.deliveryIds as string).split(',').includes(lost.detail.deliveryId as string));
  const retry = recovery && state.events.find(item => item.type === 'deduplicated' && after(item) > after(recovery) && item.detail.deliveryId === lost.detail.deliveryId && item.detail.originalCallId === lost.detail.callId && item.detail.callId !== lost.detail.callId && item.detail.businessKey === mission.businessKey && item.detail.destination === mission.destination && item.detail.quantity === mission.quantity && item.detail.worldDelta === 0);
  const paired = retry && state.events.find(item => item.type === 'receipt' && after(item) > after(retry) && item.actionId === retry.actionId && item.detail.callId === retry.detail.callId && item.detail.deliveryId === retry.detail.deliveryId);
  const conflict = paired && state.events.find(item => item.type === 'conflict-rejected' && after(item) > after(paired) && item.detail.conflictKind === 'business-key' && item.detail.businessKey === mission.businessKey && item.detail.callId !== retry!.detail.callId && item.detail.callId !== lost.detail.callId && (item.detail.quantity !== mission.quantity || item.detail.destination !== mission.destination) && item.detail.worldDelta === 0);
  const verification = conflict && state.events.find(item => item.type === 'verified' && after(item) > after(conflict) && item.detail.okay === true && item.detail.revision === state.world.revision && (mission.destination === 'hospital' ? item.detail.hospitalBoxes === mission.quantity && item.detail.marketBoxes === 0 : item.detail.marketBoxes === mission.quantity && item.detail.hospitalBoxes === 0));
  if (!restart || !recovery || !retry || !paired || !conflict || !verification) return null;
  return {scenarioId: state.scenarioId, title: scenarioFor(state.scenarioId).title, eventIds: [lost, restart, recovery, retry, paired, conflict, verification].map(item => item.id), hintUsed: false,
    checks: {receiptLost: true, newCallSameBusiness: true, persistentRecovery: true, conflictRejected: true, freshVerification: true}};
}
