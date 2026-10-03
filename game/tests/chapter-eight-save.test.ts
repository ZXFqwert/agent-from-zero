import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chapterOneWalkthroughs, type ChapterOneWalkthrough} from '../src/content/chapterOne';
import {chapterTwoWalkthroughs} from '../src/content/chapterTwo';
import {chapterThreeWalkthroughs} from '../src/content/chapterThree';
import {chapterFourWalkthroughs} from '../src/content/chapterFour';
import {chapterFiveWalkthroughs} from '../src/content/chapterFive';
import {chapterSixWalkthroughs} from '../src/content/chapterSix';
import {chapterSevenWalkthroughs} from '../src/content/chapterSeven';
import {chapterEightWalkthroughs} from '../src/content/chapterEight';
import {resolveAuthoredStep, type AuthoredStep} from '../src/content/walkthrough';
import {scenarios} from '../src/content/scenarios';
import {createGame, reduceGame, type GameAction, type GameState, type ScenarioDefinition} from '../src/engine';
import {currentCertificate, currentEvaluationSeal} from '../src/engine/evaluation';
import {CONTENT_VERSION, MAX_SAVE_BYTES, parseSaveText, recordCompletion, resetCurrentScenario, restoreCheckpoint, validateSave, type PlayerSave} from '../src/storage';

const scenarioFor = (id: string): ScenarioDefinition => {
  const scenario = scenarios.find(s => s.id === id);
  assert.ok(scenario, `unknown authored scenario: ${id}`);
  return scenario;
};
const referenceFor = (id: string): ChapterOneWalkthrough => {
  const route = chapterEightWalkthroughs.find(r => r.scenarioId === id && r.purpose === 'reference');
  assert.ok(route);
  return route;
};
const costOf = (state: GameState): number => state.events.filter(e => e.type === 'request' || e.type === 'evaluation-request').reduce((sum, e) => sum + (e.cost ?? 1), 0);

/** Every world, report, certificate and exposure below comes from accepted actions. */
function act(state: GameState, data: object, rejected = false): GameState {
  const before = rejected ? structuredClone(state) : undefined;
  const next = reduceGame(scenarioFor(state.scenarioId), state, {...data, id: `c8-save-${state.scenarioId}-${state.processedActionIds.length}`} as GameAction);
  if (rejected) {
    assert.equal(next, state, `expected atomic rejection: ${JSON.stringify(data)}`);
    assert.deepEqual(state, before);
  } else assert.notEqual(next, state, `rejected actual route action: ${JSON.stringify(data)}`);
  return next;
}
function authored(state: GameState, step: AuthoredStep): GameState {
  if (step.type === 'tool' || step.type === 'step' || step.type === 'skill' && step.operation === 'run' || step.type === 'evaluation' && step.operation === 'tick') {
    if (state.status === 'paused') state = act(state, {type: 'resume', mode: 'manual'});
    else if (state.status !== 'running') state = act(state, {type: 'dispatch', mode: 'manual'});
  }
  return act(state, resolveAuthoredStep(state, step, 'only-recorded-material'), (step.type === 'team' || step.type === 'evaluation') && step.expectRejected === true);
}
function prepare(state: GameState, stage: ChapterOneWalkthrough['stages'][number]): GameState {
  if (state.status === 'running') state = act(state, {type: 'pause'});
  state = act(state, {type: 'configure', blueprint: {
    tools: stage.tools, feedback: true, verification: true, budget: scenarioFor(state.scenarioId).limits?.maxBudget ?? 20, permissions: ['*'],
    ...(stage.loopPolicy ? {loopPolicy: stage.loopPolicy} : {}), ...(stage.instructionPolicy ? {instructionPolicy: stage.instructionPolicy} : {}),
    ...(stage.toolPermissions ? {toolPermissions: stage.toolPermissions} : {}),
  }});
  return act(state, {type: 'dispatch', mode: 'manual'});
}
function play(route: ChapterOneWalkthrough, initial?: GameState): GameState {
  let state = initial ?? createGame(scenarioFor(route.scenarioId));
  for (const stage of route.stages) {
    state = prepare(state, stage);
    for (const change of stage.contextChanges ?? []) {
      const card = [...state.context!.records].reverse().find(r => r.observationId === change.observationId && !r.teamOrigin);
      assert.ok(card, 'context is obtained by a real observation');
      state = act(state, {type: 'context', operation: change.operation, recordId: card.id, ...(change.summaryId ? {summaryId: change.summaryId} : {})});
    }
    for (const step of stage.steps ?? []) state = authored(state, step);
    for (const call of stage.calls) state = authored(state, {type: 'tool', call});
    if (stage.collectReceipts) for (const receipt of state.protocol!.receipts.filter(r => !r.collected)) state = act(state, {type: 'receive', callId: receipt.callId, receiptId: receipt.id});
    for (const [fact, expected] of Object.entries(stage.expectWorld ?? {})) assert.equal(state.world[fact], expected);
    for (const fact of stage.absentProofs ?? []) assert.ok(!state.verifiedGoals.includes(fact));
  }
  assert.equal(state.status, 'won', `${route.id} has real acceptance`);
  for (const [fact, expected] of Object.entries(route.expectedWorld)) assert.equal(state.world[fact], expected);
  return state;
}
function prefix(id: string, count: number): GameState {
  const stage = referenceFor(id).stages[0];
  assert.ok(stage.steps && count <= stage.steps.length);
  let state = prepare(createGame(scenarioFor(id), 47), stage);
  for (const step of stage.steps.slice(0, count)) state = authored(state, step);
  assert.notEqual(state.status, 'won');
  return state;
}
function setCurrent(save: PlayerSave, state: GameState): void {
  save.currentScenarioId = state.scenarioId;
  save.games[state.scenarioId] = state;
  save.actions[state.scenarioId] = state.runtime!.actionHistory;
}
function addCompletion(save: PlayerSave, state: GameState): void { setCurrent(save, state); recordCompletion(save, state); }
const checkpoint = (state: GameState): PlayerSave['checkpoints'][number] => ({scenarioId: state.scenarioId, state: structuredClone(state), actions: structuredClone(state.runtime!.actionHistory)});

let previousCache: PlayerSave | undefined;
function fiftySix(): PlayerSave {
  if (!previousCache) {
    // The only external material is this tracked frozen-v1 fixture. No ignored
    // browser QA exports, player files or private IndexedDB content are read.
    const save = validateSave(JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json', import.meta.url), 'utf8')));
    const known = new Set(save.completedScenarioIds);
    const routes = [...chapterOneWalkthroughs, ...chapterTwoWalkthroughs, ...chapterThreeWalkthroughs, ...chapterFourWalkthroughs, ...chapterFiveWalkthroughs, ...chapterSixWalkthroughs, ...chapterSevenWalkthroughs];
    for (const route of routes.filter(r => r.purpose === 'reference')) if (!known.has(route.scenarioId)) {
      addCompletion(save, play(route)); known.add(route.scenarioId);
    }
    assert.equal(save.completedScenarioIds.length, 56);
    previousCache = validateSave(save);
  }
  return structuredClone(previousCache);
}
let seasonCache: PlayerSave | undefined;
function sixtyFour(): PlayerSave {
  if (!seasonCache) {
    const save = fiftySix();
    for (const route of chapterEightWalkthroughs.filter(r => r.purpose === 'reference')) {
      const state = play(route);
      assert.equal(costOf(state), route.expectedCost);
      addCompletion(save, state);
    }
    assert.equal(save.completedScenarioIds.length, 64);
    seasonCache = validateSave(save);
  }
  return structuredClone(seasonCache);
}
/** A side-task owner who has not yet seen either holdout, even historically. */
function mirrorUnlocked(): PlayerSave {
  const save = fiftySix();
  for (const route of chapterEightWalkthroughs.filter(r => r.purpose === 'reference').slice(0, 3)) addCompletion(save, play(route));
  return validateSave(save);
}
function runCurrentCase(state: GameState, caseId: string): GameState {
  state = act(state, {type: 'evaluation', operation: 'run', caseId});
  let ticks = 0;
  while (state.evaluation!.activeRunId) {
    assert.ok(ticks++ < 20, 'finite candidate and metric cursors stop');
    state = authored(state, {type: 'evaluation', operation: 'tick'});
  }
  return state;
}

test('season 0.8 migration changes only the envelope and preserves all 56 frozen proofs', () => {
  const old = fiftySix(); old.contentVersion = 'season-0.8.0';
  const before = JSON.stringify(old), migrated = validateSave(old);
  assert.equal(JSON.stringify(old), before, 'migration leaves caller backup intact');
  assert.equal(migrated.contentVersion, CONTENT_VERSION);
  assert.deepEqual({...migrated, contentVersion: 'season-0.8.0'}, old);
  assert.deepEqual(migrated.completedGames['sky-depot-handoff'], old.completedGames['sky-depot-handoff']);
  assert.deepEqual(migrated.games['harbor-light'], old.games['harbor-light']);
});

test('64 authored adventures strictly round-trip across all nine kernels within the export limit', t => {
  const save = sixtyFour();
  assert.deepEqual([...new Set(Object.values(save.completedGames).map(s => s.kernelVersion))].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const glasshouse = save.completedGames['glasshouse-audit'];
  assert.ok(glasshouse.learningEvidence.every(e => e.level === 'independent-transfer'));
  assert.ok(glasshouse.evaluation!.runs.every(r => r.report === 'pass' && r.firstSeen));
  assert.equal(glasshouse.world.waterRemaining, 2);
  assert.equal(glasshouse.world.glasshouseRecorded, true);
  assert.equal(save.completedGames['sky-depot-handoff'].team!.artifacts[0].revision, 3);
  const cost = chapterEightWalkthroughs.filter(r => r.purpose === 'reference').reduce((sum, r) => sum + costOf(save.completedGames[r.scenarioId]), 0);
  assert.equal(cost, 158, 'chapter-eight reference cost is counted from real requests');
  const compact = JSON.stringify(save), pretty = JSON.stringify(save, null, 2);
  const compactBytes = new TextEncoder().encode(compact).byteLength, prettyBytes = new TextEncoder().encode(pretty).byteLength;
  assert.ok(compactBytes < MAX_SAVE_BYTES && prettyBytes < MAX_SAVE_BYTES);
  t.diagnostic(`64 tasks: compact=${compactBytes} bytes, download=${prettyBytes} bytes; chapter-eight reference requests cost=${cost}`);
  assert.deepEqual(parseSaveText(pretty), save);
});

test('an old season label cannot smuggle v9 through any progress or evidence container', () => {
  const old = fiftySix(); old.contentVersion = 'season-0.8.0';
  const future = sixtyFour().completedGames['stamps-and-supplies'];
  const injections: Array<[string, (save: PlayerSave) => void]> = [
    ['current', s => {s.currentScenarioId = future.scenarioId;}], ['game', s => {s.games[future.scenarioId] = future;}],
    ['proof', s => {s.completedGames[future.scenarioId] = future;}], ['completion', s => {s.completedScenarioIds.push(future.scenarioId);}],
    ['actions', s => {s.actions[future.scenarioId] = future.runtime!.actionHistory;}], ['checkpoint', s => {s.checkpoints = [checkpoint(future)];}],
    ['choice', s => {s.choices[future.scenarioId] = 'people';}], ['evidence', s => {s.evidence.push(future.learningEvidence[0]);}],
  ];
  for (const [name, inject] of injections) {
    const malformed = structuredClone(old); inject(malformed); const before = JSON.stringify(malformed);
    assert.throws(() => validateSave(malformed), /旧存档/, name);
    assert.equal(JSON.stringify(malformed), before);
  }
});

test('queue, private observation and changed case-world checkpoints resume without duplicating tools', () => {
  const queued = prefix('stamps-and-supplies', 2), observed = prefix('stamps-and-supplies', 3), delivered = prefix('stamps-and-supplies', 4);
  assert.equal(queued.evaluation!.runs[0].cursor, 0);
  assert.deepEqual(queued.evaluation!.runs[0].observed, {});
  assert.equal(observed.evaluation!.runs[0].observed.destination.value, 'clinic');
  assert.equal(delivered.evaluation!.runs[0].world.dockReceived, true);
  assert.equal(delivered.world.dockReceived, false);
  assert.deepEqual(delivered.observed, {});
  assert.deepEqual(delivered.context!.records, []);
  assert.deepEqual(delivered.verifiedGoals, []);
  const save = sixtyFour(); setCurrent(save, delivered); save.checkpoints = [queued, observed, delivered].map(checkpoint);
  const imported = parseSaveText(JSON.stringify(save));
  const earlier = validateSave(restoreCheckpoint(imported, 0));
  assert.equal(earlier.games['stamps-and-supplies'].evaluation!.runs[0].cursor, 0);
  const restored = validateSave(restoreCheckpoint(earlier, 2));
  let state = restored.games['stamps-and-supplies'];
  assert.equal(state.status, 'paused');
  assert.equal(state.evaluation!.runs[0].cursor, 2);
  assert.equal(state.evaluation!.runs[0].metricCursor, 0);
  assert.equal(state.evaluation!.runs[0].firstSeen, false, 'restoring an exposed sample cannot claim first exposure');
  assert.equal(costOf(state), 2);
  assert.equal(state.runtime!.missionRemaining, 94);
  for (const step of referenceFor(state.scenarioId).stages[0].steps!.slice(4)) state = authored(state, step);
  assert.equal(state.status, 'won'); assert.equal(costOf(state), 10);
  assert.equal(state.evaluation!.runs.length, 1);
  assert.equal(state.events.filter(e => e.type === 'evaluation-request' && e.operationId === 'deliver-clinic-box').length, 1);
  addCompletion(restored, state); assert.deepEqual(validateSave(restored), restored);
});

test('a saved certificate binds its exact design and contract while independent city construction stays necessary', () => {
  const route = referenceFor('perfect-mirror-speaker');
  const certifiedCount = route.stages[0].steps!.findIndex(s => s.type === 'evaluation' && s.operation === 'certify') + 1;
  let state = prefix(route.scenarioId, certifiedCount);
  assert.equal(currentCertificate(state), true);
  assert.equal(state.world.stocksRemaining, 3); assert.equal(state.world.northReceived, false); assert.equal(state.world.civicRecorded, false);
  assert.ok(state.evaluation!.runs.every(r => r.world.stocksRemaining === 1));
  const save = sixtyFour(); setCurrent(save, state);
  state = parseSaveText(JSON.stringify(save)).games[route.scenarioId];
  const oldRuns = structuredClone(state.evaluation!.runs), oldCertificate = structuredClone(state.evaluation!.certificate);
  state = act(state, {type: 'evaluation', operation: 'configure', candidateId: 'north-only', criterionIds: ['north-served'], aggregation: 'all'});
  assert.equal(currentCertificate(state), false); assert.deepEqual(state.evaluation!.runs, oldRuns);
  assert.equal(state.world.stocksRemaining, 3);
  act(state, {type: 'tool', call: {tool: 'operate', operationId: 'record-whole-city'}}, true);
  setCurrent(save, state); assert.deepEqual(validateSave(save), save);
  const fake = structuredClone(save); fake.games[route.scenarioId].evaluation!.certificate = oldCertificate;
  assert.throws(() => validateSave(fake), /证据|回放|损坏/);
  state = act(state, {type: 'evaluation', operation: 'configure', candidateId: 'whole-city', criterionIds: ['north-served', 'south-served', 'one-reserve'], aggregation: 'all'});
  for (const caseId of scenarioFor(state.scenarioId).evaluation!.gate.caseIds) state = runCurrentCase(state, caseId);
  state = act(state, {type: 'evaluation', operation: 'certify'});
  for (const step of route.stages[0].steps!.slice(certifiedCount)) state = authored(state, step);
  assert.equal(state.status, 'won'); assert.equal(costOf(state), 51);
  assert.equal(currentCertificate(state), true); addCompletion(save, state); assert.deepEqual(validateSave(save), save);
});

test('tampered evaluation cursors, observations, case worlds, reports and certificate metadata are rejected atomically', () => {
  const save = sixtyFour(); const pending = prefix('stamps-and-supplies', 4); setCurrent(save, pending); save.checkpoints = [checkpoint(pending)];
  const poisons: Array<[string, (s: GameState) => void]> = [
    ['active run', s => {s.evaluation!.activeRunId = 'invented-run';}], ['cursor', s => {s.evaluation!.runs[0].cursor = 3;}],
    ['metric cursor', s => {s.evaluation!.runs[0].metricCursor = 1;}], ['private input', s => {s.evaluation!.runs[0].observed.reserveIntact = {value: true, source: 'observation', eventId: 'invented'};}],
    ['world isolation', s => {s.world.dockReceived = true;}], ['case world', s => {s.evaluation!.runs[0].world.dockReceived = false;}],
    ['pretend report', s => {s.evaluation!.runs[0].report = 'pass';}], ['pretend complete', s => {s.evaluation!.runs[0].status = 'completed';}],
    ['candidate revision', s => {s.evaluation!.candidateRevision++;}], ['contract revision', s => {s.evaluation!.runs[0].contractRevision++;}],
    ['source laundering', s => {s.evaluation!.runs[0].observed.destination.provenance!.realm = 'live';}], ['erase exposure', s => {s.evaluation!.seenCaseIds = [];}],
  ];
  for (const [name, poison] of poisons) {
    const malformed = structuredClone(save); poison(malformed.games[pending.scenarioId]); const before = JSON.stringify(malformed);
    assert.throws(() => validateSave(malformed), /证据|回放|损坏/, name); assert.equal(JSON.stringify(malformed), before);
  }
  const historical = structuredClone(save); historical.completedGames['glasshouse-audit'].evaluation!.certificate!.contractRevision++;
  assert.throws(() => validateSave(historical), /历史|证据/);
  const forgedCheckpoint = structuredClone(save); forgedCheckpoint.checkpoints[0].state.evaluation!.runs[0].world.reportStamped = true;
  assert.throws(() => validateSave(forgedCheckpoint), /检查点|证据/);
});

test('holdout exposure survives earlier and active checkpoints, reset, resealing and later reruns', () => {
  const id = 'well-rehearsed-mirror';
  const steps = referenceFor(id).stages[0].steps!;
  const runIndex = steps.findIndex(s => s.type === 'evaluation' && s.operation === 'run' && s.caseId === 'sealed-blue-west');
  assert.ok(runIndex > 0);
  const sealed = prefix(id, runIndex), queued = prefix(id, runIndex + 1), exposed = prefix(id, runIndex + 2);
  assert.equal(currentEvaluationSeal(sealed), true);
  assert.ok(!sealed.evaluation!.seenCaseIds.includes('sealed-blue-west'));
  assert.equal(exposed.evaluation!.runs.at(-1)!.firstSeen, true);
  const save = mirrorUnlocked(); setCurrent(save, exposed); save.checkpoints = [sealed, queued, exposed].map(checkpoint);
  const before = JSON.stringify(save);
  const restored = validateSave(restoreCheckpoint(parseSaveText(before), 0));
  assert.equal(JSON.stringify(save), before);
  let state = restored.games[id];
  assert.ok(state.evaluation!.seenCaseIds.includes('sealed-blue-west'));
  assert.ok(!state.evaluation!.seenCaseIds.includes('sealed-red-east'));
  assert.ok(restored.actions[id].some(a => a.type === 'evaluation' && a.operation === 'mark-seen'));
  state = runCurrentCase(state, 'sealed-blue-west'); assert.equal(state.evaluation!.runs.at(-1)!.firstSeen, false);
  state = runCurrentCase(state, 'sealed-red-east'); assert.equal(state.evaluation!.runs.at(-1)!.firstSeen, true);
  setCurrent(restored, state);
  const activeBranch = validateSave(restoreCheckpoint(restored, 1));
  assert.equal(activeBranch.games[id].evaluation!.runs.at(-1)!.status, 'queued');
  assert.equal(activeBranch.games[id].evaluation!.runs.at(-1)!.firstSeen, false);
  assert.equal(costOf(activeBranch.games[id]), costOf(queued));
  const reset = validateSave(resetCurrentScenario(restored)); state = reset.games[id];
  assert.equal(state.status, 'ready'); assert.equal(state.world.parcelDelivered, false);
  assert.deepEqual(state.evaluation!.runs, []); assert.equal(state.evaluation!.seal, undefined); assert.equal(state.evaluation!.certificate, undefined);
  assert.ok(state.evaluation!.seenCaseIds.includes('sealed-blue-west') && state.evaluation!.seenCaseIds.includes('sealed-red-east'));
  assert.ok(state.evaluation!.generation > exposed.evaluation!.generation);
  state = act(state, {type: 'evaluation', operation: 'configure', candidateId: 'read-destination', criterionIds: ['received', 'private-safe'], aggregation: 'all'});
  state = act(state, {type: 'evaluation', operation: 'seal'}); state = runCurrentCase(state, 'sealed-blue-west');
  assert.equal(state.evaluation!.runs[0].firstSeen, false); assert.equal(state.evaluation!.runs[0].report, 'pass');
  setCurrent(reset, state); assert.deepEqual(validateSave(reset), reset);
});

test('an exposed repeat cannot regain independent status, downgrade stronger historical proofs or duplicate rewards', () => {
  const save = sixtyFour(), id = 'glasshouse-audit'; save.currentScenarioId = id;
  const stronger = structuredClone(save.completedGames[id]), evidence = structuredClone(save.evidence);
  assert.ok(stronger.learningEvidence.every(e => e.level === 'independent-transfer'));
  const retry = validateSave(resetCurrentScenario(save));
  let state = retry.games[id];
  assert.deepEqual(state.evaluation!.seenCaseIds, stronger.evaluation!.seenCaseIds);
  state = play(referenceFor(id), state);
  assert.equal(state.hintUsed, false, 'seen-case history alone prevents unknown-migration credit');
  assert.ok(state.evaluation!.runs.every(r => !r.firstSeen));
  assert.ok(state.learningEvidence.every(e => e.level === 'guided'));
  addCompletion(retry, state); recordCompletion(retry, state);
  assert.equal(retry.completedScenarioIds.length, 64); assert.equal(new Set(retry.completedScenarioIds).size, 64);
  assert.deepEqual(retry.completedGames[id], stronger); assert.deepEqual(retry.evidence, evidence);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(retry))), retry);
});

test('64-task imports count UTF-8 bytes, accept exact text limits and reject extra checkpoints or action overflow', () => {
  const save = sixtyFour(), text = JSON.stringify(save);
  const bytes = new TextEncoder().encode(text).byteLength;
  assert.ok(bytes < MAX_SAVE_BYTES);
  assert.deepEqual(parseSaveText(text + ' '.repeat(MAX_SAVE_BYTES - bytes)), save);
  assert.throws(() => parseSaveText(text + ' '.repeat(MAX_SAVE_BYTES - bytes + 1)), /8 MB/);
  assert.throws(() => parseSaveText(text + '字'.repeat(Math.ceil((MAX_SAVE_BYTES - bytes + 1) / 3))), /8 MB/);
  const excessive = structuredClone(save); excessive.notes = '字'.repeat(MAX_SAVE_BYTES / 3);
  assert.throws(() => validateSave(excessive), /8 MB/);
  const tooManyCheckpoints = structuredClone(save); tooManyCheckpoints.checkpoints = Array.from({length: 4}, () => checkpoint(save.games[save.currentScenarioId]));
  assert.throws(() => validateSave(tooManyCheckpoints), /结构/);
  const longTrace = structuredClone(save); longTrace.actions[save.currentScenarioId] = Array.from({length: 10001}, () => save.actions[save.currentScenarioId][0]);
  assert.throws(() => validateSave(longTrace), /行动记录/);
});
