import test from 'node:test';
import assert from 'node:assert/strict';
import {contentBundle} from '../scripts/validate-content';
import {createGame, reduceGame, validateGameState} from '../src/engine';
import type {GameState} from '../src/engine/types';
import {replayChallengeRoute} from '../src/challenges/generator';
import type {ChallengeInstance} from '../src/challenges/types';
import {CORE_CONCEPTS, deriveCoreCurriculum, type CoreStageId} from '../src/curriculum';

const source = (id: string) => contentBundle.scenarios.find(item => item.id === id)!;
function play(id: string, options: {hint?: boolean; prefix?: string; seed?: number} = {}): GameState {
  const scenario = source(id), seed = options.seed ?? 33;
  const route = contentBundle.walkthroughs.find(item => item.scenarioId === id && item.purpose === 'reference')!;
  const reference = replayChallengeRoute({scenario, spec: {seed}} as ChallengeInstance, route);
  if (!options.hint && !options.prefix) return reference.state;
  let game = createGame(scenario, seed);
  if (options.hint) game = reduceGame(scenario, game, {id: `${options.prefix ?? 'core'}-hint`, type: 'hint'});
  for (const [index, action] of reference.actions.entries()) {
    const next = reduceGame(scenario, game, {...action, id: `${options.prefix ?? 'core'}-${index}`});
    assert.notEqual(next, game); game = next;
  }
  assert.equal(game.status, 'won'); assert.equal(validateGameState(scenario, game), true);
  return game;
}
const stageFor = (games: GameState[], id: string, stage: CoreStageId) => deriveCoreCurriculum(games).concepts.find(item => item.id === id)!.stages.find(item => item.id === stage)!;

test('twenty stable IDs describe four stages, with explicit prerequisites and real official routes', () => {
  const empty = deriveCoreCurriculum([]);
  assert.equal(CORE_CONCEPTS.length, 20);
  assert.equal(new Set(CORE_CONCEPTS.map(item => item.id)).size, 20);
  assert.deepEqual(empty.counts, {concepts: 20, totalStages: 80, evidencedStages: 0, pendingStages: 80, transferConcepts: 0, revisitedConcepts: 0});
  const prior = new Set<string>();
  for (const item of CORE_CONCEPTS) {
    assert.ok(item.prerequisites.every(id => prior.has(id)), `${item.id} has an unknown or cyclic prerequisite`);
    prior.add(item.id);
    assert.equal(item.routes.guided.length > 0, true);
    assert.equal(item.routes.independent.length > 0, true);
    assert.equal(item.routes.revisit.length > 0, true);
    for (const ids of Object.values(item.routes)) for (const id of ids) assert.ok(source(id), id);
    for (const id of item.routes.transfer) assert.equal(source(id).kind, 'transfer', id);
    if (!item.routes.transfer.length) assert.ok(item.transferGap?.length, 'A supplemental route needs an explicit evidence boundary.');
  }
  assert.ok(empty.concepts.every(item => item.stages.every(stage => stage.status === 'pending' && stage.proofs.length === 0)));
});

test('official reference actions demonstrate every promised route family without creating old chronological evidence', () => {
  const games = contentBundle.scenarios.filter(item => item.engineVersion !== undefined).map(item => play(item.id));
  const before = JSON.stringify(games), curriculum = deriveCoreCurriculum(games, {revisitStartIndex: games.length});
  assert.equal(curriculum.ignoredRecordCount, 0);
  assert.equal(curriculum.counts.transferConcepts, 19);
  assert.equal(curriculum.counts.revisitedConcepts, 0);
  assert.equal(curriculum.counts.evidencedStages, 58);
  for (const concept of curriculum.concepts) {
    assert.equal(concept.stages.find(stage => stage.id === 'guided')!.status, 'evidenced', concept.id);
    assert.equal(concept.stages.find(stage => stage.id === 'independent')!.status, concept.id === 'artifact-integration' ? 'pending' : 'evidenced', concept.id);
    for (const stage of concept.stages) for (const proof of stage.proofs) {
      const game = games.find(item => item.scenarioId === proof.scenarioId)!;
      assert.ok(proof.eventIds.length > 1);
      assert.ok(proof.eventIds.every(id => game.events.some(event => event.id === id)));
      assert.ok(proof.eventIds.some(id => game.events.some(event => event.id === id && event.type === 'victory')));
    }
  }
  assert.equal(JSON.stringify(games), before);
});

test('different wording joins the schema mechanism while unrelated concepts receive no evidence', () => {
  const first = play('etched-door'), second = play('backyard-address'), transfer = play('courier-lock');
  assert.ok(!first.learningEvidence.some(item => second.learningEvidence.some(other => other.concept === item.concept)));
  const data = deriveCoreCurriculum([first, second, transfer]);
  const schema = data.concepts.find(item => item.id === 'tool-schema')!;
  assert.deepEqual(schema.stages.slice(0, 3).map(item => item.status), ['evidenced', 'evidenced', 'evidenced']);
  assert.equal(data.concepts.find(item => item.id === 'memory-validity')!.stages.every(item => item.status === 'pending'), true);
});

test('hinted wins count only their designated guided routes and never become independent or transferred', () => {
  const games = ['etched-door', 'backyard-address', 'courier-lock'].map(id => play(id, {hint: true}));
  assert.equal(stageFor(games, 'tool-schema', 'guided').status, 'evidenced');
  assert.equal(stageFor(games, 'tool-schema', 'independent').status, 'pending');
  assert.equal(stageFor(games, 'tool-schema', 'transfer').status, 'pending');
  assert.equal(stageFor(games, 'tool-schema', 'guided').proofs[0].hintUsed, true);
});

test('an overlapping boss route needs a different real attempt for the independent encounter', () => {
  const first = play('chorus-bridgewright', {prefix: 'one-boss-encounter'});
  const once = deriveCoreCurriculum([first]).concepts.find(item => item.id === 'artifact-integration')!;
  assert.equal(once.stages.find(stage => stage.id === 'guided')!.status, 'evidenced');
  assert.equal(once.stages.find(stage => stage.id === 'independent')!.status, 'pending');
  assert.equal(once.nextScenarioId, 'chorus-bridgewright');
  assert.equal(once.nextNeedsReplay, true);
  assert.equal(stageFor([first, structuredClone(first)], 'artifact-integration', 'independent').status, 'pending');
  const second = play('chorus-bridgewright', {prefix: 'another-boss-encounter'});
  const twice = deriveCoreCurriculum([first, second]).concepts.find(item => item.id === 'artifact-integration')!;
  assert.equal(twice.stages.find(stage => stage.id === 'guided')!.proofs.length, 1);
  assert.equal(twice.stages.find(stage => stage.id === 'independent')!.proofs.length, 1);
  assert.equal(twice.stages.find(stage => stage.id === 'independent')!.status, 'evidenced');
});

test('modular and approval shared routes cannot count a single trace as both encounters', () => {
  assert.equal(stageFor([play('bp-dsh-composition')], 'modular-host', 'independent').status, 'pending');
  assert.equal(stageFor([play('bp-dsh-composition'), play('bp-opencode-separation')], 'modular-host', 'independent').status, 'evidenced');
  assert.equal(stageFor([play('glass-court')], 'approval-isolation', 'independent').status, 'pending');
  assert.equal(stageFor([play('glass-court'), play('glass-court', {prefix: 'retry-glass-court'})], 'approval-isolation', 'independent').status, 'evidenced');
  assert.equal(stageFor([play('one-use-writ'), play('glass-court')], 'approval-isolation', 'independent').status, 'evidenced');
});

test('looking at a mission and ordinary victory alone do not supply a different mechanism checkpoint', () => {
  const ready = createGame(source('courier-lock'));
  const seen = reduceGame(source('courier-lock'), ready, {id: 'only-dispatch', type: 'dispatch', mode: 'manual'});
  assert.equal(deriveCoreCurriculum([ready, seen]).counts.evidencedStages, 0);
  const paired = play('courier-lock');
  assert.equal(stageFor([paired], 'call-correlation', 'transfer').status, 'evidenced');
  assert.equal(stageFor([paired], 'idempotent-effects', 'transfer').status, 'pending');
  assert.match(stageFor([paired], 'idempotent-effects', 'transfer').gap!, /业务键冲突/);
});

test('duplicate records and new seeds with identical action IDs cannot manufacture new evidence', () => {
  const game = play('courier-lock'), cloned = structuredClone(game), newSeed = play('courier-lock', {seed: 79});
  assert.deepEqual(newSeed.processedActionIds, game.processedActionIds);
  const one = deriveCoreCurriculum([game]), many = deriveCoreCurriculum([game, cloned, newSeed]);
  assert.deepEqual(many, one);
  assert.equal(stageFor([game, cloned, newSeed], 'tool-schema', 'transfer').proofs.length, 1);
});

test('legacy generic transfer flags never count as independent operation or transfer', () => {
  const scenario = source('warehouse-gate');
  let game = createGame(scenario, 33);
  game = reduceGame(scenario, game, {id: 'core-legacy-config', type: 'configure', blueprint: {tools: ['observe', 'operate', 'verify'], feedback: true, verification: true, budget: 16, permissions: ['*']}});
  game = reduceGame(scenario, game, {id: 'core-legacy-dispatch', type: 'dispatch'});
  for (let index = 0; game.status === 'running' && index < 64; index++) game = reduceGame(scenario, game, {id: `core-legacy-${index}`, type: 'step'});
  assert.equal(game.status, 'won'); assert.equal(validateGameState(scenario, game), true);
  assert.ok(game.learningEvidence.some(item => item.level === 'independent-transfer'));
  const before = JSON.stringify(game), data = deriveCoreCurriculum([game]);
  assert.ok(data.concepts.every(item => item.stages.filter(stage => stage.id !== 'guided').every(stage => stage.status === 'pending')));
  assert.equal(JSON.stringify(game), before);
});

test('forged world, hints, grades and evidence IDs are rejected against the official source', () => {
  const real = play('field-hospital', {hint: true}), bad: GameState[] = [];
  for (const mutate of [
    (game: GameState) => {game.scenarioId = 'unknown-core-id';},
    (game: GameState) => {game.world['PRIVATE_CORE_SENTINEL'] = 'SECRET_NOT_DISPLAYED';},
    (game: GameState) => {game.hintUsed = false;},
    (game: GameState) => {game.learningEvidence[0].level = 'independent-transfer';},
    (game: GameState) => {game.learningEvidence[0].eventIds = ['invented-core-proof'];},
  ]) {const game = structuredClone(real); mutate(game); bad.push(game);}
  const data = deriveCoreCurriculum(bad);
  assert.equal(data.ignoredRecordCount, bad.length);
  assert.equal(data.counts.evidencedStages, 0);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE_CORE_SENTINEL|SECRET_NOT_DISPLAYED|invented-core-proof/);
});

test('interval revisit requires two distinct intervening main wins and a fresh action record', () => {
  const initial = play('chorus-bridgewright', {prefix: 'initial'});
  const first = play('stamps-and-supplies', {prefix: 'first'}), second = play('three-lamps-one-boundary', {prefix: 'second'});
  const replay = play('chorus-bridgewright', {prefix: 'fresh'});
  assert.equal(stageFor([initial, first, structuredClone(first), replay], 'artifact-integration', 'revisit').status, 'pending');
  assert.equal(stageFor([initial, first, second, structuredClone(initial)], 'artifact-integration', 'revisit').status, 'pending');
  const result = stageFor([initial, first, second, replay], 'artifact-integration', 'revisit');
  assert.equal(result.status, 'evidenced');
  assert.deepEqual(result.proofs.map(item => item.scenarioId), ['chorus-bridgewright']);
  assert.match(result.explanation, /进度间隔，不是日历或记忆测量/);
  assert.equal(stageFor([initial, first, second, play('chorus-bridgewright', {prefix: 'hinted', hint: true})], 'artifact-integration', 'revisit').status, 'pending');
});

test('old unordered imports remain usable for operation evidence but cannot fabricate interval replay', () => {
  const old = [play('chorus-bridgewright'), play('stamps-and-supplies'), play('three-lamps-one-boundary')];
  const fresh = play('chorus-bridgewright', {prefix: 'new-history'});
  const blocked = deriveCoreCurriculum([...old, fresh], {revisitStartIndex: old.length});
  assert.equal(blocked.concepts.find(item => item.id === 'artifact-integration')!.stages.find(item => item.id === 'revisit')!.status, 'pending');
  const chronological = [...old, fresh, play('stamps-and-supplies', {prefix: 'new-first'}), play('three-lamps-one-boundary', {prefix: 'new-second'}), play('chorus-bridgewright', {prefix: 'new-repeat'})];
  const allowed = deriveCoreCurriculum(chronological, {revisitStartIndex: old.length});
  assert.equal(allowed.concepts.find(item => item.id === 'artifact-integration')!.stages.find(item => item.id === 'revisit')!.status, 'evidenced');
});

test('an exact current-profile completion can serve as its first attested history entry without duplicate awards', () => {
  const initial = play('chorus-bridgewright', {prefix: 'profile-also-history'});
  const later = play('chorus-bridgewright', {prefix: 'later-real-replay'});
  const all = [initial, structuredClone(initial), play('stamps-and-supplies', {prefix: 'history-one'}), play('three-lamps-one-boundary', {prefix: 'history-two'}), later];
  const data = deriveCoreCurriculum(all, {revisitStartIndex: 1});
  const integration = data.concepts.find(item => item.id === 'artifact-integration')!;
  assert.equal(integration.stages.find(item => item.id === 'revisit')!.status, 'evidenced');
  assert.equal(integration.stages.find(item => item.id === 'guided')!.proofs.length, 1);
});

test('curriculum projections contain no sealed facts, reference actions or raw model inputs', () => {
  const before = createGame(source('bp-hermes-stale'));
  const after = play('bp-hermes-stale');
  const json = JSON.stringify(deriveCoreCurriculum([before, after]));
  assert.doesNotMatch(json, /south-kiln|"world"|"facts"|"observed"|"actionHistory"|"arguments"|"expectedWorld"|"referenceCost"|"processedActionIds"/);
});
