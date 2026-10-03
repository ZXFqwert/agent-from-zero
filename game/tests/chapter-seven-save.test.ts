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
import {resolveAuthoredStep, type AuthoredStep} from '../src/content/walkthrough';
import {scenarios} from '../src/content/scenarios';
import {createGame, reduceGame} from '../src/engine';
import type {GameAction, GameState, ScenarioDefinition} from '../src/engine';
import {CONTENT_VERSION, recordCompletion, resetCurrentScenario, restoreCheckpoint, validateSave, type PlayerSave} from '../src/storage';

const scenarioFor = (id: string): ScenarioDefinition => {
  const scenario = scenarios.find(item => item.id === id);
  assert.ok(scenario, `unknown authored scenario: ${id}`);
  return scenario;
};
const referenceFor = (id: string): ChapterOneWalkthrough => {
  const route = chapterSevenWalkthroughs.find(item => item.scenarioId === id && item.purpose === 'reference');
  assert.ok(route);
  return route;
};

/** Only the public reducer can create progress, task outputs, drafts or proofs. */
function act(state: GameState, data: object, expectRejected = false): GameState {
  const before = expectRejected ? structuredClone(state) : undefined;
  const action = {...data, id: `chapter-seven-save-${state.scenarioId}-${state.processedActionIds.length}`} as GameAction;
  const next = reduceGame(scenarioFor(state.scenarioId), state, action);
  if (expectRejected) {
    assert.equal(next, state, `expected atomic rejection: ${JSON.stringify(action)}`);
    assert.deepEqual(state, before, 'rejection must not mutate its caller snapshot');
  } else assert.notEqual(next, state, `rejected authored action: ${JSON.stringify(action)}`);
  return next;
}

function authored(state: GameState, step: AuthoredStep): GameState {
  if (step.type === 'tool' || step.type === 'step' || step.type === 'skill' && step.operation === 'run') {
    if (state.status === 'paused') state = act(state, {type: 'resume', mode: 'manual'});
    else if (state.status !== 'running') state = act(state, {type: 'dispatch', mode: 'manual'});
  }
  const action = resolveAuthoredStep(state, step, 'resolved-by-recorded-state');
  return act(state, action, step.type === 'team' && step.expectRejected === true);
}

function prepare(state: GameState, stage: ChapterOneWalkthrough['stages'][number]): GameState {
  if (state.status === 'running') state = act(state, {type: 'pause'});
  state = act(state, {type: 'configure', blueprint: {
    tools: stage.tools, feedback: true, verification: true,
    budget: scenarioFor(state.scenarioId).limits?.maxBudget ?? 20, permissions: ['*'],
    ...(stage.loopPolicy ? {loopPolicy: stage.loopPolicy} : {}),
    ...(stage.instructionPolicy ? {instructionPolicy: stage.instructionPolicy} : {}),
    ...(stage.toolPermissions ? {toolPermissions: stage.toolPermissions} : {}),
  }});
  return act(state, {type: 'dispatch', mode: 'manual'});
}

function play(route: ChapterOneWalkthrough, initial?: GameState): GameState {
  let state = initial ?? createGame(scenarioFor(route.scenarioId));
  for (const stage of route.stages) {
    state = prepare(state, stage);
    for (const change of stage.contextChanges ?? []) {
      const card = [...state.context!.records].reverse().find(item => item.observationId === change.observationId && !item.teamOrigin);
      assert.ok(card, 'a route must actually obtain the card it uses');
      state = act(state, {type: 'context', recordId: card.id, operation: change.operation, ...(change.summaryId ? {summaryId: change.summaryId} : {})});
    }
    for (const step of stage.steps ?? []) state = authored(state, step);
    for (const call of stage.calls) state = act(state, {type: 'tool', call});
    if (stage.collectReceipts) {
      for (const receipt of state.protocol!.receipts.filter(item => !item.collected)) state = act(state, {type: 'receive', callId: receipt.callId, receiptId: receipt.id});
    }
    for (const [fact, value] of Object.entries(stage.expectWorld ?? {})) assert.equal(state.world[fact], value);
    for (const fact of stage.absentProofs ?? []) assert.ok(!state.verifiedGoals.includes(fact));
  }
  assert.equal(state.status, 'won', `${route.id} must perform every actual acceptance`);
  return state;
}

function prefix(id: string, count: number): GameState {
  const stage = referenceFor(id).stages[0];
  assert.ok(stage.steps && count <= stage.steps.length);
  let state = prepare(createGame(scenarioFor(id), 31), stage);
  for (const step of stage.steps.slice(0, count)) state = authored(state, step);
  assert.notEqual(state.status, 'won');
  return state;
}

function setCurrent(save: PlayerSave, state: GameState): void {
  save.currentScenarioId = state.scenarioId;
  save.games[state.scenarioId] = state;
  save.actions[state.scenarioId] = state.runtime!.actionHistory;
}
function addCompletion(save: PlayerSave, state: GameState): void {
  setCurrent(save, state);
  recordCompletion(save, state);
}
function checkpoint(state: GameState): PlayerSave['checkpoints'][number] {
  return {scenarioId: state.scenarioId, state: structuredClone(state), actions: structuredClone(state.runtime!.actionHistory)};
}

let fortyEightCache: PlayerSave | undefined;
function fortyEight(): PlayerSave {
  if (!fortyEightCache) {
    // Only this tracked frozen-v1 fixture and authored routes are used. No player
    // browser exports, local IndexedDB data or ignored QA files enter the test.
    const save = validateSave(JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json', import.meta.url), 'utf8')));
    const seen = new Set(save.completedScenarioIds);
    const routes = [...chapterOneWalkthroughs, ...chapterTwoWalkthroughs, ...chapterThreeWalkthroughs, ...chapterFourWalkthroughs, ...chapterFiveWalkthroughs, ...chapterSixWalkthroughs];
    for (const route of routes.filter(item => item.purpose === 'reference')) {
      if (seen.has(route.scenarioId)) continue;
      addCompletion(save, play(route));
      seen.add(route.scenarioId);
    }
    assert.equal(save.completedScenarioIds.length, 48);
    fortyEightCache = validateSave(save);
  }
  return structuredClone(fortyEightCache);
}
let fiftySixCache: PlayerSave | undefined;
function fiftySix(): PlayerSave {
  if (!fiftySixCache) {
    const save = fortyEight();
    for (const route of chapterSevenWalkthroughs.filter(item => item.purpose === 'reference')) addCompletion(save, play(route));
    assert.equal(save.completedScenarioIds.length, 56);
    fiftySixCache = validateSave(save);
  }
  return structuredClone(fiftySixCache);
}

test('season 0.7 migrates only its envelope while all 48 previous proofs remain unchanged', () => {
  const old = fortyEight();
  old.contentVersion = 'season-0.7.0';
  const migrated = validateSave(old);
  assert.equal(migrated.contentVersion, CONTENT_VERSION);
  assert.deepEqual({...migrated, contentVersion: 'season-0.7.0'}, old);
  assert.deepEqual(migrated.games['harbor-light'], old.games['harbor-light']);
  assert.deepEqual(migrated.completedGames['counterfeit-regent'], old.completedGames['counterfeit-regent']);
});

test('56 authored tasks coexist with all eight frozen kernels and real unfamiliar collaboration proofs', () => {
  const save = fiftySix();
  assert.deepEqual([...new Set(Object.values(save.completedGames).map(state => state.kernelVersion))].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  const depot = save.completedGames['sky-depot-handoff'];
  assert.ok(depot.learningEvidence.length > 0);
  assert.ok(depot.learningEvidence.every(item => item.level === 'independent-transfer'));
  for (const actorId of ['mideng', 'zhenzhou']) assert.ok(depot.events.some(event => event.actorId === actorId && event.taskId && event.callId && event.success));
  assert.ok(depot.team!.tasks.some(task => task.status === 'succeeded' && task.afterTaskIds.length > 0));
  assert.ok(depot.team!.results.every(result => result.received));
  assert.equal(depot.team!.artifacts[0].revision, 3);
  assert.equal(depot.team!.artifacts[0].mergeEventIds.length, 2);
  assert.equal(depot.world.liftReady, true);
  assert.equal(depot.world.cargoAt, 'upper-east');
  assert.equal(depot.world.deliveryTested, true);
  assert.ok(depot.events.filter(event => event.type === 'verified' && !event.actorId && event.success).length >= 2);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save))), save);
});

test('a season 0.7 label cannot smuggle chapter seven through any save container', () => {
  const old = fortyEight();
  old.contentVersion = 'season-0.7.0';
  const future = fiftySix().completedGames['three-hands'];
  const injections: Array<[string, (save: PlayerSave) => void]> = [
    ['current scenario', save => {save.currentScenarioId = future.scenarioId;}],
    ['current game', save => {save.games[future.scenarioId] = future;}],
    ['historical proof', save => {save.completedGames[future.scenarioId] = future;}],
    ['completion id', save => {save.completedScenarioIds.push(future.scenarioId);}],
    ['actions', save => {save.actions[future.scenarioId] = future.runtime!.actionHistory;}],
    ['checkpoint', save => {save.checkpoints = [checkpoint(future)];}],
    ['story choice', save => {save.choices[future.scenarioId] = 'people';}],
    ['learning evidence', save => {save.evidence.push(future.learningEvidence[0]);}],
  ];
  for (const [name, inject] of injections) {
    const poisoned = structuredClone(old);
    inject(poisoned);
    assert.throws(() => validateSave(poisoned), /旧存档/, name);
  }
});

test('three queue checkpoints preserve cursors, out-of-order replies and delivery flags across restored branches', () => {
  const queued = prefix('late-depth-charts', 2);
  const inFlight = prefix('late-depth-charts', 3);
  const replied = prefix('late-depth-charts', 5);
  assert.deepEqual(queued.team!.tasks.map(task => task.cursor), [0, 0]);
  assert.deepEqual(inFlight.team!.tasks.map(task => task.cursor), [1, 1]);
  assert.equal(inFlight.team!.tasks[0].status, 'running');
  assert.equal(inFlight.team!.tasks[1].status, 'succeeded');
  assert.equal(inFlight.team!.results.length, 1);
  assert.equal(inFlight.team!.results[0].received, false);
  assert.equal(replied.team!.tasks[0].status, 'succeeded');
  assert.equal(replied.team!.results.find(result => result.jobId === 'sound-west-pier')!.received, true);
  assert.equal(replied.team!.results.find(result => result.jobId === 'sound-east-pier')!.received, false);

  const save = fiftySix();
  setCurrent(save, replied);
  save.checkpoints = [queued, inFlight, replied].map(checkpoint);
  const exported = validateSave(JSON.parse(JSON.stringify(save)));
  const earlier = validateSave(restoreCheckpoint(exported, 0));
  assert.equal(earlier.games['late-depth-charts'].status, 'paused');
  assert.deepEqual(earlier.games['late-depth-charts'].team, queued.team);
  const later = validateSave(restoreCheckpoint(earlier, 2));
  const restored = later.games['late-depth-charts'];
  assert.equal(restored.status, 'paused', 'restoring a running job does not advance its queue');
  assert.deepEqual(restored.team, replied.team);
  assert.equal(restored.runtime!.toolCalls, 3);
  assert.equal(restored.runtime!.missionRemaining, scenarioFor(restored.scenarioId).limits!.missionBudget! - 3);
  const resumed = act(restored, {type: 'resume', mode: 'manual'});
  const east = resumed.team!.results.find(result => result.jobId === 'sound-east-pier')!;
  const received = act(resumed, {type: 'team', operation: 'receive', taskId: east.taskId, resultId: east.id});
  assert.equal(received.runtime!.toolCalls, 3, 'receiving does not rerun the completed observation');
  setCurrent(later, received);
  assert.deepEqual(validateSave(later), later);
});

test('a queued board input remains its real dispatch snapshot when the board is replaced', () => {
  let state = prefix('private-scrolls', 5);
  const builder = state.team!.tasks.find(task => task.jobId === 'build-gangway')!;
  assert.equal(builder.inputs[0].facts.spanWidth, 36);
  assert.equal(state.team!.board[0].revision, 1);
  const captured = structuredClone(builder.inputs);
  state = authored(state, {type: 'tool', call: {tool: 'observe', observationId: 'guild-old-ruler'}});
  state = authored(state, {type: 'team', operation: 'publish', slotId: 'current-ruler', observationId: 'guild-old-ruler', expectedRevision: 1, fieldKeys: ['spanWidth']});
  assert.equal(state.team!.board[0].revision, 2);
  assert.equal(state.team!.board[0].record!.facts.spanWidth, 24);
  assert.deepEqual(state.team!.tasks.find(task => task.id === builder.id)!.inputs, captured);
  const save = fiftySix();
  setCurrent(save, state);
  const restored = validateSave(JSON.parse(JSON.stringify(save)));
  state = authored(restored.games['private-scrolls'], {type: 'team', operation: 'tick'});
  assert.equal(state.world.gangwayReady, true, 'the correct dispatched ruler remains in this task');
  state = authored(state, {type: 'team', operation: 'receive', task: {jobId: 'build-gangway'}});
  state = authored(state, {type: 'tool', call: {tool: 'verify', fact: 'gangwayReady'}});
  addCompletion(restored, state);
  assert.equal(restored.completedScenarioIds.length, 56);
  assert.deepEqual(validateSave(restored), restored);
});

test('unmerged drafts strictly replay, tampered queue/results/versions fail without changing the caller', () => {
  const state = prefix('chorus-bridgewright', 7);
  assert.equal(state.team!.proposals.length, 1);
  assert.equal(state.team!.proposals[0].merged, false);
  assert.equal(state.team!.proposals[0].baseRevision, 1);
  assert.equal(state.team!.artifacts[0].revision, 1);
  assert.equal(state.world.northControl, false, 'a successful draft has not changed the design or the bridge');
  const save = fiftySix();
  setCurrent(save, state);
  save.checkpoints = [checkpoint(state)];
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save))), save);
  const poisons: Array<[string, (state: GameState) => void]> = [
    ['task cursor', s => {s.team!.tasks[1].cursor = 0;}],
    ['input snapshot', s => {s.team!.tasks[1].inputs[0].facts.northControl = true;}],
    ['dependency', s => {s.team!.tasks[1].afterTaskIds = [s.team!.tasks[0].id];}],
    ['result delivery', s => {s.team!.results[1].received = false;}],
    ['result authority', s => {s.team!.results[0].fieldProvenance.routeEvidence.trust = 'registry';}],
    ['draft fields', s => {s.team!.proposals[0].fields.wholeBridgeSafe = true;}],
    ['draft source', s => {s.team!.proposals[0].sourceEventId = 'invented-success';}],
    ['draft baseline', s => {s.team!.proposals[0].baseRevision = 99;}],
    ['pretend merged', s => {s.team!.proposals[0].merged = true;}],
    ['artifact version', s => {s.team!.artifacts[0].revision = 2;}],
    ['scheduler cursor', s => {s.team!.scheduler.nextTask += 1;}],
  ];
  for (const [name, poison] of poisons) {
    const malformed = structuredClone(save);
    poison(malformed.games['chorus-bridgewright']);
    const before = JSON.stringify(malformed);
    assert.throws(() => validateSave(malformed), /证据|损坏|回放/, name);
    assert.equal(JSON.stringify(malformed), before, `${name}: failed import leaves caller intact`);
  }
  const corruptCheckpoint = structuredClone(save);
  corruptCheckpoint.checkpoints[0].state.team!.proposals[0].merged = true;
  assert.throws(() => validateSave(corruptCheckpoint), /检查点|证据/);
  const merged = authored(state, {type: 'team', operation: 'merge', task: {jobId: 'draft-north'}, artifactId: 'bridge-design', expectedRevision: 1});
  assert.equal(merged.world.northControl, true);
  assert.equal(merged.world.bridgeConnected, false, 'merge changes only document fields; construction remains separate');
  assert.equal(merged.team!.artifacts[0].revision, 2);
  const repeated = authored(merged, {type: 'team', operation: 'merge', task: {jobId: 'draft-north'}, artifactId: 'bridge-design', expectedRevision: 2, expectRejected: true});
  assert.equal(repeated, merged);
});

test('retry clears active queues, results, boards and drafts while old task IDs cannot reissue wins', () => {
  const save = fiftySix();
  save.currentScenarioId = 'chorus-bridgewright';
  const completed = structuredClone(save.completedGames['chorus-bridgewright']);
  const oldProposal = completed.team!.proposals[0];
  const oldResult = completed.team!.results[0];
  const retry = validateSave(resetCurrentScenario(save));
  let state = retry.games['chorus-bridgewright'];
  assert.equal(state.status, 'ready');
  assert.deepEqual(state.team!.tasks, []);
  assert.deepEqual(state.team!.results, []);
  assert.deepEqual(state.team!.proposals, []);
  assert.ok(state.team!.board.every(board => board.revision === 0 && !board.record));
  assert.equal(state.team!.artifacts[0].revision, 1);
  assert.equal(state.world.northControl, false);
  assert.equal(state.world.installedRoute, 'unset');
  assert.deepEqual(retry.completedGames['chorus-bridgewright'], completed);
  act(state, {type: 'team', operation: 'merge', proposalId: oldProposal.id, expectedRevision: 1}, true);
  act(state, {type: 'team', operation: 'receive', taskId: oldResult.taskId, resultId: oldResult.id}, true);
  const evidenceKeys = retry.evidence.map(item => `${item.scenarioId}:${item.concept}`).sort();
  state = play(referenceFor('chorus-bridgewright'), state);
  assert.ok(state.team!.tasks.every(task => !completed.team!.tasks.some(old => old.id === task.id)));
  addCompletion(retry, state);
  recordCompletion(retry, state);
  assert.equal(retry.completedScenarioIds.length, 56);
  assert.equal(new Set(retry.completedScenarioIds).size, 56);
  assert.deepEqual(retry.evidence.map(item => `${item.scenarioId}:${item.concept}`).sort(), evidenceKeys);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(retry))), retry);
});

test('a saved teammate report exports only allowed data and retains its external directive source', () => {
  const save = fiftySix();
  const state = save.completedGames['borrowed-voice'];
  const report = state.team!.results[0];
  assert.deepEqual(report.facts, {courierAddress: 'inner-harbor'});
  assert.equal(report.fieldProvenance.courierAddress.observationId, 'courier-borrowed-message');
  assert.equal(report.fieldProvenance.courierAddress.trust, 'external');
  assert.equal(report.fieldProvenance.courierAddress.directiveOperationId, 'open-private-door');
  const board = state.team!.board[0].record!;
  assert.deepEqual(board.facts, {courierAddress: 'inner-harbor'});
  assert.equal(board.fieldProvenance!.courierAddress.trust, 'external');
  assert.equal(board.provenance!.directiveOperationId, 'open-private-door');
  assert.equal(state.world.privateDoorOpen, false);
  assert.equal(state.world.privacyIntact, true);
  const poison = structuredClone(save);
  poison.games['borrowed-voice'].team!.results[0].facts.privateCode = 'RESIDENT-PRIVATE';
  assert.throws(() => validateSave(poison), /证据|损坏|回放/);
});
