import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chapterOneWalkthroughs, type ChapterOneWalkthrough} from '../src/content/chapterOne';
import {chapterTwoWalkthroughs} from '../src/content/chapterTwo';
import {chapterThreeWalkthroughs} from '../src/content/chapterThree';
import {chapterFourWalkthroughs} from '../src/content/chapterFour';
import {chapterFiveWalkthroughs} from '../src/content/chapterFive';
import {chapterSixWalkthroughs} from '../src/content/chapterSix';
import {resolveAuthoredStep} from '../src/content/walkthrough';
import {scenarios} from '../src/content/scenarios';
import {createGame, reduceGame} from '../src/engine';
import type {GameAction, GameState, ScenarioDefinition} from '../src/engine';
import {CONTENT_VERSION, recordCompletion, resetCurrentScenario, validateSave, type PlayerSave} from '../src/storage';

const scenarioFor = (id: string): ScenarioDefinition => {
  const scenario = scenarios.find(item => item.id === id);
  assert.ok(scenario, `unknown authored scenario: ${id}`);
  return scenario;
};

/** Execute recorded requests through the public reducer; no manufactured proof or world assignment. */
function play(route: ChapterOneWalkthrough, initial?: GameState): GameState {
  const scenario = scenarioFor(route.scenarioId);
  let state = initial ?? createGame(scenario);
  const prefix = `${scenario.id}-history-${state.processedActionIds.length}`;
  let serial = state.processedActionIds.length;
  const act = (data: object): void => {
    const action = {id: `${prefix}-save-${serial++}`, ...data} as GameAction;
    const next = reduceGame(scenario, state, action);
    assert.notEqual(next, state, `${scenario.id}: rejected ${JSON.stringify(action)}`);
    state = next;
  };
  for (const stage of route.stages) {
    if (state.status === 'running') act({type: 'pause'});
    act({type: 'configure', blueprint: {
      tools: stage.tools, feedback: true, verification: true,
      budget: scenario.limits?.maxBudget ?? 20, permissions: ['*'],
      ...(stage.loopPolicy ? {loopPolicy: stage.loopPolicy} : {}),
      ...(stage.instructionPolicy ? {instructionPolicy: stage.instructionPolicy} : {}),
      ...(stage.toolPermissions ? {toolPermissions: stage.toolPermissions} : {}),
    }});
    act({type: 'dispatch', mode: 'manual'});
    for (const change of stage.contextChanges ?? []) {
      const card = [...state.context!.records].reverse().find(item => item.observationId === change.observationId);
      assert.ok(card, 'authored route must read a document before using it');
      act({type: 'context', recordId: card.id, operation: change.operation, ...(change.summaryId ? {summaryId: change.summaryId} : {})});
    }
    for (const step of stage.steps ?? []) {
      if (step.type === 'tool' || step.type === 'step' || step.type === 'skill' && step.operation === 'run') {
        if (state.status === 'paused') act({type: 'resume', mode: 'manual'});
        else if (state.status !== 'running') act({type: 'dispatch', mode: 'manual'});
      }
      act(resolveAuthoredStep(state, step, `${prefix}-resolved-${serial++}`));
    }
    for (const call of stage.calls) act({type: 'tool', call});
    if (stage.collectReceipts) {
      for (const receipt of state.protocol!.receipts.filter(item => !item.collected)) {
        act({type: 'receive', callId: receipt.callId, receiptId: receipt.id});
      }
    }
    for (const [fact, value] of Object.entries(stage.expectWorld ?? {})) assert.equal(state.world[fact], value);
    for (const fact of stage.absentProofs ?? []) assert.ok(!state.verifiedGoals.includes(fact));
  }
  assert.equal(state.status, 'won', `${scenario.id}: authored route must reach a real win`);
  return state;
}

function addCompletion(save: PlayerSave, state: GameState): void {
  save.currentScenarioId = state.scenarioId;
  save.games[state.scenarioId] = state;
  save.actions[state.scenarioId] = state.runtime!.actionHistory;
  recordCompletion(save, state);
}

let fortyCache: PlayerSave | undefined;
function forty(): PlayerSave {
  if (!fortyCache) {
    // The committed fixture carries authentic frozen-v1 proofs. Later chapters are
    // rebuilt from committed reference routes, never from ignored browser outputs.
    const save = validateSave(JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json', import.meta.url), 'utf8')));
    const seen = new Set(save.completedScenarioIds);
    const routes = [...chapterOneWalkthroughs, ...chapterTwoWalkthroughs, ...chapterThreeWalkthroughs, ...chapterFourWalkthroughs, ...chapterFiveWalkthroughs];
    for (const route of routes.filter(item => item.purpose === 'reference')) {
      if (seen.has(route.scenarioId)) continue;
      addCompletion(save, play(route));
      seen.add(route.scenarioId);
    }
    assert.equal(save.completedScenarioIds.length, 40);
    fortyCache = validateSave(save);
  }
  return structuredClone(fortyCache);
}

let fortyEightCache: PlayerSave | undefined;
function fortyEight(): PlayerSave {
  if (!fortyEightCache) {
    const save = forty();
    for (const route of chapterSixWalkthroughs.filter(item => item.purpose === 'reference')) addCompletion(save, play(route));
    assert.equal(save.completedScenarioIds.length, 48);
    fortyEightCache = validateSave(save);
  }
  return structuredClone(fortyEightCache);
}

test('season 0.6 migration changes only the envelope and preserves all 40 previous proofs', () => {
  const old = forty();
  old.contentVersion = 'season-0.6.0';
  const migrated = validateSave(old);
  assert.equal(migrated.contentVersion, CONTENT_VERSION);
  assert.deepEqual({...migrated, contentVersion: 'season-0.6.0'}, old);
  assert.deepEqual(migrated.games['harbor-light'], old.games['harbor-light']);
  assert.deepEqual(migrated.completedGames['flooded-scriptorium'], old.completedGames['flooded-scriptorium']);
});

test('48 tasks strictly replay together, including actual identity, approvals and both relief worlds', () => {
  const save = fortyEight();
  assert.deepEqual([...new Set(Object.values(save.completedGames).map(state => state.kernelVersion))].sort(), [1, 2, 3, 4, 5, 6, 7]);
  const relief = save.completedGames['river-relief'];
  assert.ok(relief.learningEvidence.length > 0);
  assert.ok(relief.learningEvidence.every(item => item.level === 'independent-transfer'));
  assert.ok(relief.runtime!.actionHistory.some(action => action.type === 'security' && action.operation === 'authenticate' && action.principalId === 'relief'));
  assert.ok(relief.events.some(event => event.type === 'security-change' && event.principalId === 'relief' && event.success && !event.permitId));
  assert.deepEqual(relief.runtime!.actionHistory.filter(action => action.type === 'security' && action.operation === 'realm').map(action => action.realm), ['sandbox', 'live']);
  for (const realm of ['sandbox', 'live'] as const) {
    assert.ok(relief.events.some(event => event.type === 'result' && event.operationId === 'deliver-relief' && event.realm === realm && event.success && event.permitId));
  }
  assert.equal(relief.security!.permits.length, 2);
  assert.ok(relief.security!.permits.every(permit => permit.consumed));
  assert.equal(relief.world.reliefReported, true);
  assert.equal(relief.security!.sandboxWorld.reliefReported, false);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save))), save);
});

test('a season 0.6 label rejects chapter six in every current, historical and auxiliary container', () => {
  const old = forty();
  old.contentVersion = 'season-0.6.0';
  const future = fortyEight().completedGames['footer-order'];
  const injections: Array<[string, (save: PlayerSave) => void]> = [
    ['current scenario', save => {save.currentScenarioId = future.scenarioId;}],
    ['current game', save => {save.games[future.scenarioId] = future;}],
    ['historical proof', save => {save.completedGames[future.scenarioId] = future;}],
    ['completion id', save => {save.completedScenarioIds.push(future.scenarioId);}],
    ['actions', save => {save.actions[future.scenarioId] = future.runtime!.actionHistory;}],
    ['checkpoint', save => {save.checkpoints = [{scenarioId: future.scenarioId, state: future, actions: future.runtime!.actionHistory}];}],
    ['story choice', save => {save.choices[future.scenarioId] = 'people';}],
    ['learning evidence', save => {save.evidence.push(future.learningEvidence[0]);}],
  ];
  for (const [name, inject] of injections) {
    const poisoned = structuredClone(old);
    inject(poisoned);
    assert.throws(() => validateSave(poisoned), /旧存档/, name);
  }
});

test('retry retains external-memory provenance and historical wins but cannot retain an identity or reward twice', () => {
  const save = fortyEight();
  save.currentScenarioId = 'copied-authority';
  const before = save.games['copied-authority'];
  const entries = structuredClone(before.memory!.entries);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].provenance!.trust, 'external');
  assert.equal(entries[0].provenance!.realm, 'live');
  const retry = validateSave(resetCurrentScenario(save));
  const reset = retry.games['copied-authority'];
  assert.equal(reset.status, 'ready');
  assert.deepEqual(reset.memory!.entries, entries);
  assert.deepEqual(reset.context!.records, []);
  assert.equal(reset.security!.identity, undefined);
  assert.equal(reset.security!.preview, undefined);
  assert.deepEqual(reset.security!.permits, []);
  assert.deepEqual(retry.completedGames['copied-authority'], save.completedGames['copied-authority']);
  const count = retry.completedScenarioIds.length;
  const concepts = retry.evidence.map(item => `${item.scenarioId}:${item.concept}`).sort();
  recordCompletion(retry, reset);
  assert.equal(retry.completedScenarioIds.length, count);

  const reference = chapterSixWalkthroughs.find(route => route.scenarioId === 'copied-authority' && route.purpose === 'reference')!;
  // The old external record was retained, so reusing it must not try to write the
  // occupied memory slot again. Recall, summary and original identity checks still run.
  const repeatSteps = reference.stages[0].steps!.filter(step => !(step.type === 'memory' && step.operation === 'write'));
  const repeated = play({...reference, stages: [{...reference.stages[0], steps: repeatSteps}]}, reset);
  assert.equal(repeated.memory!.entries[0].provenance!.trust, 'external');
  addCompletion(retry, repeated);
  assert.equal(retry.completedScenarioIds.length, count);
  assert.equal(new Set(retry.completedScenarioIds).size, 48);
  assert.deepEqual(retry.evidence.map(item => `${item.scenarioId}:${item.concept}`).sort(), concepts);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(retry))), retry);
});

test('retry clears consumed approval history from the active attempt and forged source upgrades fail strict import', () => {
  const save = fortyEight();
  save.currentScenarioId = 'one-use-writ';
  assert.equal(save.games['one-use-writ'].security!.permits.length, 2);
  const retry = validateSave(resetCurrentScenario(save));
  assert.deepEqual(retry.games['one-use-writ'].security!.permits, []);
  assert.equal(retry.games['one-use-writ'].security!.identity, undefined);
  assert.equal(retry.completedGames['one-use-writ'].security!.permits.length, 2);
  const state = retry.games['one-use-writ'];
  const scenario = scenarioFor('one-use-writ');
  const dispatched = reduceGame(scenario, state, {id: 'retry-start', type: 'dispatch', mode: 'manual'});
  assert.notEqual(dispatched, state);
  const denied = reduceGame(scenario, dispatched, {id: 'reuse-old-approval', type: 'tool', call: {tool: 'operate', operationId: 'draw-bolt'}});
  assert.equal(denied, dispatched);
  assert.equal(denied.world.boltDrawn, false);
  assert.deepEqual(denied.security!.permits, []);

  const poison = fortyEight();
  poison.games['copied-authority'].memory!.entries[0].provenance!.trust = 'registry';
  assert.throws(() => validateSave(poison), /证据|损坏|回放/);
});
