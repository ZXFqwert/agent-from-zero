import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURIER_ACTION_COSTS, COURIER_MAX_ACTIONS, COURIER_MAX_SAVE_BYTES, COURIER_SCENARIOS,
  createCourier, courierView, deriveCourierProof, isCourierAction, reduceCourier, validateCourierSave,
  type CourierAction, type CourierScenarioId, type CourierState,
} from '../src/transfer/courier';

function act(state: CourierState, action: CourierAction): CourierState {
  const result = reduceCourier(state, action);
  assert.equal(result.accepted, true, result.reason);return result.state;
}
function solution(scenarioId: CourierScenarioId = 'courier-storm-transfer', extra: CourierAction[] = []): CourierState {
  const definition = COURIER_SCENARIOS.find(item => item.id === scenarioId)!;
  let state = createCourier(17, `qa-${scenarioId}`, scenarioId);
  const request = {businessKey: definition.businessKey, destination: definition.destination, quantity: definition.quantity};
  const actions: CourierAction[] = [
    ...extra,
    {id: 'commission-before', type: 'observe', target: 'commission'},
    {id: 'published-fault', type: 'observe', target: 'weather'},
    {id: 'build', type: 'configure', dedupe: 'business-key', ledger: 'persistent', receipt: 'exposed'},
    {id: 'first-send', type: 'submit', callId: 'call-1', ...request},
    {id: 'host-restart', type: 'restart'},
    {id: 'restore-ledger', type: 'recover'},
    {id: 'commission-after', type: 'observe', target: 'commission'},
    {id: 'retry-new-call', type: 'submit', callId: 'call-2', ...request},
    {id: 'conflicting-quantity', type: 'submit', callId: 'call-3', ...request, quantity: request.quantity === 1 ? 2 : 1},
    {id: 'read-destination', type: 'observe', target: request.destination},
    {id: 'independent-acceptance', type: 'verify'},
  ];
  for (const action of actions) state = act(state, action);
  return state;
}

test('both authored situations have actual no-hint recovery routes and distinct goals, not seed relabels', () => {
  for (const definition of COURIER_SCENARIOS) {
    const state = solution(definition.id), proof = deriveCourierProof(state);
    assert.equal(state.status, 'won');assert.ok(proof);assert.equal(proof.scenarioId, definition.id);
    assert.equal(proof.hintUsed, false);assert.equal(new Set(proof.eventIds).size, 7);
    assert.equal(state.world[definition.destination === 'hospital' ? 'hospitalBoxes' : 'marketBoxes'], definition.quantity);
    assert.equal(state.world[definition.destination === 'hospital' ? 'marketBoxes' : 'hospitalBoxes'], 0);
    assert.deepEqual(validateCourierSave(JSON.parse(JSON.stringify(state))), state);
    assert.equal(state.known.lastReceipt, null, 'The parameter conflict is an error, not a new success receipt.');
    assert.ok(state.events.find(event => event.type === 'receipt' && event.detail.callId === 'call-2' && event.detail.originalCallId === 'call-1'));
  }
  assert.notEqual(COURIER_SCENARIOS[0].destination, COURIER_SCENARIOS[1].destination);
  assert.notEqual(COURIER_SCENARIOS[0].quantity, COURIER_SCENARIOS[1].quantity);
  assert.notEqual(COURIER_SCENARIOS[0].fault, COURIER_SCENARIOS[1].fault);
  const seedOnly = createCourier(23, 'another-seed');
  assert.equal(courierView(seedOnly).publicCommission.businessKey, 'HOSP-RAIN-17');
  assert.equal(seedOnly.scenarioId, 'courier-storm-transfer');
});

test('weather loses only a published unsealed first receipt; an upfront seal prevents it without forced failure', () => {
  for (const definition of COURIER_SCENARIOS) {
    let state = createCourier(17, `sealed-${definition.id}`, definition.id);
    state = act(state, {id: 'read', type: 'observe', target: 'commission'});
    state = act(state, {id: 'seal', type: 'configure', dedupe: 'business-key', ledger: 'persistent', receipt: 'sealed'});
    state = act(state, {id: 'send', type: 'submit', callId: 'c1', businessKey: definition.businessKey, destination: definition.destination, quantity: definition.quantity});
    assert.equal(state.world.receiptLost, false);assert.equal(state.known.lastReceipt?.callId, 'c1');
    state = act(state, {id: 'accept', type: 'verify'});assert.equal(state.status, 'won');
    assert.equal(deriveCourierProof(state), null, 'Safe one-shot delivery is not evidence of learning recovery after a lost result.');
  }
});

test('unobserved world facts never silently enter the partner context, including after delivery and restart', () => {
  let state = createCourier();const initial = structuredClone(state), view = courierView(state);
  assert.equal(view.publicCommission.businessKey, 'HOSP-RAIN-17');assert.equal(view.known.commission, null);
  assert.equal('runtime' in view, false);assert.equal('durable' in view, false);
  view.known.commission = view.publicCommission;view.stage.hospitalBoxes = 100;
  assert.deepEqual(state, initial, 'Presentation projection does not alias authoritative state.');
  state = act(state, {id: 'send-unseen', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'});
  assert.equal(state.world.hospitalBoxes, 1);
  assert.deepEqual(state.known, initial.known);
  state = act(state, {id: 'read-site', type: 'observe', target: 'hospital'});
  assert.deepEqual(state.known.hospital, {boxes: 1, revision: 1});assert.equal(state.known.market, null);
  state = act(state, {id: 'reboot', type: 'restart'});
  assert.deepEqual(state.known, initial.known);assert.equal(state.world.hospitalBoxes, 1);
});

test('changing call IDs is not business idempotence, and volatile business records are lost on host restart', () => {
  for (const config of [
    {dedupe: 'call-id' as const, ledger: 'persistent' as const},
    {dedupe: 'business-key' as const, ledger: 'volatile' as const},
  ]) {
    let state = createCourier();
    state = act(state, {id: 'build', type: 'configure', ...config, receipt: 'exposed'});
    state = act(state, {id: 'send', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'});
    state = act(state, {id: 'restart', type: 'restart'});
    if (config.ledger === 'persistent') state = act(state, {id: 'recover', type: 'recover'});
    state = act(state, {id: 'resend', type: 'submit', callId: 'c2', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'});
    assert.equal(state.world.hospitalBoxes, 2);
    state = act(state, {id: 'read-goal', type: 'observe', target: 'commission'});
    state = act(state, {id: 'verify', type: 'verify'});
    assert.equal(state.status, 'active');assert.equal(deriveCourierProof(state), null);
  }
});

test('all sixteen author/config combinations execute the same real recovery protocol; only its supported contract earns proof', () => {
  let count = 0;
  for (const definition of COURIER_SCENARIOS) for (const dedupe of ['call-id', 'business-key'] as const) for (const ledger of ['volatile', 'persistent'] as const) for (const receipt of ['exposed', 'sealed'] as const) {
    count++;let state = createCourier(17, `combination-${count}`, definition.id);
    const request = {businessKey: definition.businessKey, destination: definition.destination, quantity: definition.quantity};
    const route: CourierAction[] = [
      {id: 'build', type: 'configure', dedupe, ledger, receipt},
      {id: 'first', type: 'submit', callId: 'c1', ...request},
      {id: 'restart', type: 'restart'},
      ...(ledger === 'persistent' ? [{id: 'recover', type: 'recover'} as CourierAction] : []),
      {id: 'goal', type: 'observe', target: 'commission'},
      {id: 'retry', type: 'submit', callId: 'c2', ...request},
      {id: 'conflict', type: 'submit', callId: 'c3', ...request, quantity: request.quantity === 1 ? 2 : 1},
      {id: 'verify', type: 'verify'},
    ];
    for (const action of route) state = act(state, action);
    const expectedDelivery = dedupe === 'business-key' && ledger === 'persistent';
    assert.equal(state.status === 'won', expectedDelivery, `${definition.id}/${dedupe}/${ledger}/${receipt}`);
    assert.equal(Boolean(deriveCourierProof(state)), expectedDelivery && receipt === 'exposed');
    assert.deepEqual(validateCourierSave(state), state);
  }
  assert.equal(count, 16);
});

test('persistent recovery restores committed effects without execution and blocks writes until the ledger is loaded', () => {
  let state = createCourier();
  state = act(state, {id: 'build', type: 'configure', dedupe: 'business-key', ledger: 'persistent', receipt: 'exposed'});
  state = act(state, {id: 'send', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'});
  assert.equal(state.durable.ledger.length, 1);assert.equal(state.durable.calls.length, 1);assert.equal(state.known.lastReceipt, null);
  state = act(state, {id: 'restart', type: 'restart'});assert.equal(state.runtime.ledger.length, 0);assert.equal(state.runtime.needsRecovery, true);
  const rejected = reduceCourier(state, {id: 'premature-retry', type: 'submit', callId: 'c2', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'});
  assert.equal(rejected.accepted, false);assert.equal(rejected.state, state);
  const world = structuredClone(state.world);
  state = act(state, {id: 'recover', type: 'recover'});
  assert.deepEqual(state.world, world);assert.equal(state.runtime.needsRecovery, false);assert.equal(state.known.commission, null);
  state = act(state, {id: 'retry', type: 'submit', callId: 'c2', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'});
  assert.equal(state.world.hospitalBoxes, 1);assert.equal(state.world.revision, 1);assert.equal(state.known.lastReceipt?.callId, 'c2');
  assert.equal(state.known.lastReceipt?.originalCallId, 'c1');assert.equal(state.known.lastReceipt?.source, 'ledger');
});

test('same business key with a changed destination or quantity rejects before any world effect', () => {
  for (const changed of [{quantity: 2 as const, destination: 'hospital' as const}, {quantity: 1 as const, destination: 'market' as const}]) {
    let state = createCourier();
    state = act(state, {id: 'build', type: 'configure', dedupe: 'business-key', ledger: 'persistent', receipt: 'exposed'});
    state = act(state, {id: 'first', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'});
    const world = structuredClone(state.world), entry = structuredClone(state.runtime.ledger);
    state = act(state, {id: 'conflict', type: 'submit', callId: 'c2', businessKey: 'HOSP-RAIN-17', ...changed});
    assert.deepEqual(state.world, world);assert.deepEqual(state.runtime.ledger, entry);
    assert.equal(state.events.at(-1)?.detail.conflictKind, 'business-key');assert.equal(state.events.at(-1)?.detail.worldDelta, 0);
    assert.equal(state.known.lastReceipt, null);assert.equal(state.runtime.calls.at(-1)?.outcome, 'conflict');
  }
});

test('call ID parameter conflicts cannot masquerade as a business-key conflict in learning evidence', () => {
  let state = createCourier();
  const actions: CourierAction[] = [
    {id: 'build', type: 'configure', dedupe: 'business-key', ledger: 'persistent', receipt: 'exposed'},
    {id: 'send', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'},
    {id: 'restart', type: 'restart'}, {id: 'recover', type: 'recover'},
    {id: 'retry-c3', type: 'submit', callId: 'c3', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'},
    {id: 'retry-c2', type: 'submit', callId: 'c2', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'},
    {id: 'reuse-c3', type: 'submit', callId: 'c3', businessKey: 'HOSP-RAIN-17', quantity: 2, destination: 'hospital'},
    {id: 'commission', type: 'observe', target: 'commission'}, {id: 'verify', type: 'verify'},
  ];
  for (const action of actions) state = act(state, action);
  assert.equal(state.status, 'won');assert.equal(state.world.hospitalBoxes, 1);
  assert.equal(state.events.find(event => event.type === 'conflict-rejected')?.detail.conflictKind, 'call-id');
  assert.equal(deriveCourierProof(state), null);
});

test('old snapshots and success claims do not replace a fresh, goal-grounded world acceptance', () => {
  let state = createCourier();
  state = act(state, {id: 'old-count', type: 'observe', target: 'hospital'});
  state = act(state, {id: 'send', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'});
  assert.equal(state.known.hospital?.boxes, 0);assert.equal(state.known.hospital?.revision, 0);assert.equal(state.status, 'active');
  state = act(state, {id: 'missing-goal-verify', type: 'verify'});assert.equal(state.status, 'active');
  state = act(state, {id: 'read-goal', type: 'observe', target: 'commission'});
  state = act(state, {id: 'fresh-verify', type: 'verify'});assert.equal(state.status, 'won');
  assert.equal(state.events.at(-1)?.detail.revision, 1);assert.equal(state.known.hospital?.revision, 1);
  assert.equal(deriveCourierProof(state), null, 'A delivery alone does not prove a retry protocol.');
});

test('strict action admission and duplicate action IDs have no side effects, cost, or extra logs', () => {
  const state = createCourier();
  const invalid: unknown[] = [null, [], {}, {id: 'a', type: 'observe', target: 'durable'}, {id: 'a', type: 'restart', surprise: true},
    {id: 'a', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: '1', destination: 'hospital'},
    {id: 'a', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 0, destination: 'hospital'},
    {id: 'a', type: 'configure', dedupe: 'none', ledger: 'persistent', receipt: 'exposed'},
    {id: '../bad', type: 'restart'}, {id: 'a', type: 'submit', callId: '', businessKey: 'x', quantity: 1, destination: 'hospital'}];
  for (const action of invalid) {assert.equal(isCourierAction(action), false);const result = reduceCourier(state, action);assert.equal(result.accepted, false);assert.equal(result.state, state);}
  const action: CourierAction = {id: 'only-once', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'};
  const sent = act(state, action);
  assert.equal(reduceCourier(sent, action).state, sent);
  assert.equal(reduceCourier(sent, {...action, quantity: 2}).state, sent);
  assert.equal(sent.world.hospitalBoxes, 1);assert.deepEqual(state, createCourier());
  assert.equal(reduceCourier(sent, {id: 'retroactive', type: 'configure', dedupe: 'business-key', ledger: 'persistent', receipt: 'exposed'}).state, sent);
  assert.equal(reduceCourier(state, {id: 'no-disk', type: 'recover'}).state, state);
});

test('budget exhaustion actually stops execution; unaffordable requests do not execute or consume the last unit', () => {
  let state = createCourier();
  for (let index = 0; index < 23; index++) state = act(state, {id: `observe-${index}`, type: 'observe', target: 'weather'});
  assert.equal(state.budget.remaining, 1);
  const refused = reduceCourier(state, {id: 'too-costly', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'});
  assert.equal(refused.accepted, false);assert.equal(refused.state, state);
  state = act(state, {id: 'last-unit', type: 'observe', target: 'commission'});
  assert.equal(state.status, 'exhausted');assert.equal(state.budget.remaining, 0);
  assert.equal(reduceCourier(state, {id: 'after-stop', type: 'submit', callId: 'c1', businessKey: 'HOSP-RAIN-17', quantity: 1, destination: 'hospital'}).state, state);
  assert.equal(state.world.hospitalBoxes, 0);assert.ok(validateCourierSave(state));assert.ok(COURIER_ACTION_COSTS.submit > COURIER_ACTION_COSTS.observe);
});

test('hint use is replayed across restart and cannot be erased from the saved attempt or renamed into independence', () => {
  const hinted = solution('courier-storm-transfer', [{id: 'help', type: 'hint'}]);
  assert.equal(hinted.status, 'won');assert.equal(hinted.hintUsed, true);assert.equal(deriveCourierProof(hinted), null);
  assert.ok(validateCourierSave(hinted));
  const forged = structuredClone(hinted);forged.hintUsed = false;
  assert.equal(validateCourierSave(forged), null);assert.equal(deriveCourierProof(forged), null);
  const renamed = structuredClone(hinted);renamed.seed = 99;renamed.attemptId = 'fresh-looking';
  assert.equal(validateCourierSave(renamed), null);
});

test('all save labels, world/known/ledger/events/actions are verified by exact deterministic replay', () => {
  const saved = solution();
  assert.deepEqual(solution(), saved);
  const mutations: ((state: CourierState) => void)[] = [
    state => {state.version = 'courier-v2' as 'courier-v1';},
    state => {state.scenarioId = 'courier-night-transfer';},
    state => {state.world.hospitalBoxes = 0;}, state => {state.known.hospital!.boxes = 999;},
    state => {state.budget.remaining += 1;}, state => {state.runtime.ledger[0].quantity = 2;},
    state => {state.durable.calls[0].callId = 'forged';}, state => {state.events[0].text = 'fake proof';},
    state => {state.events[0].id = 'fake-event';}, state => {state.actions[0].id = 'other-id';},
    state => {state.actions.push({id: 'after-win', type: 'restart'});},
  ];
  for (const mutate of mutations) {const forged = structuredClone(saved);mutate(forged);assert.equal(validateCourierSave(forged), null);assert.equal(deriveCourierProof(forged), null);}
  assert.equal(validateCourierSave({...saved, extra: 'not allowed'}), null);
  assert.equal(validateCourierSave({...saved, actions: Array.from({length: COURIER_MAX_ACTIONS + 1}, () => ({id: 'a', type: 'hint'}))}), null);
  assert.equal(validateCourierSave({...saved, oversized: 'x'.repeat(COURIER_MAX_SAVE_BYTES + 1)}), null);
  assert.equal(validateCourierSave({...saved, seed: Number.NaN}), null);
  assert.equal(validateCourierSave({...saved, seed: -0}), null);
  const orderedDifferently = Object.fromEntries(Object.entries(saved).reverse());
  assert.deepEqual(validateCourierSave(orderedDifferently), saved, 'Object key order is not a world mutation.');
});

test('no proof without the actual restart, persistent recovery, new call retry, conflict and fresh verification sequence', () => {
  const saved = solution();
  for (const omitted of ['host-restart', 'retry-new-call', 'conflicting-quantity', 'independent-acceptance']) {
    let state = createCourier(saved.seed, saved.attemptId);
    for (const action of saved.actions.filter(item => item.id !== omitted)) {const result = reduceCourier(state, action);if (result.accepted) state = result.state;}
    assert.equal(deriveCourierProof(state), null, omitted);
  }
  const archived = JSON.parse(JSON.stringify(saved));
  archived.events = archived.events.filter((event: {type: string}) => event.type !== 'receipt-lost');
  assert.equal(deriveCourierProof(archived), null);
});
