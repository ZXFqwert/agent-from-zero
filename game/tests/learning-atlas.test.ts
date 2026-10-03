import test, {after, before} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer, type ViteDevServer} from 'vite';
import {contentBundle} from '../scripts/validate-content';
import {scenarios} from '../src/content/scenarios';
import {createGame, reduceGame, validateGameState} from '../src/engine';
import type {GameState} from '../src/engine/types';
import {replayChallengeRoute} from '../src/challenges/generator';
import type {ChallengeInstance} from '../src/challenges/types';
import {deriveLearningAtlas} from '../src/learningAtlas';
import type {LearningAtlasProps} from '../src/components/LearningAtlas';

const source = (id: string) => contentBundle.scenarios.find(scenario => scenario.id === id)!;
/** Execute the author's calls with the real reducer; no manufactured completion or evidence. */
function play(id: string, hint = false, seed = 33): GameState {
  const scenario = source(id), route = contentBundle.walkthroughs.find(item => item.scenarioId === id && item.purpose === 'reference')!;
  assert.ok(scenario && route);
  const proof = replayChallengeRoute({scenario, spec: {seed}} as ChallengeInstance, route);
  if (!hint) return proof.state;
  let game = reduceGame(scenario, createGame(scenario, seed), {id: 'atlas-test-hint', type: 'hint'});
  for (const action of proof.actions) {
    const next = reduceGame(scenario, game, action);
    assert.notEqual(next, game);
    game = next;
  }
  assert.equal(game.status, 'won');
  assert.equal(validateGameState(scenario, game), true);
  return game;
}

test('empty atlas groups every author concept into eight chapters without a chapter mastery grade', () => {
  const atlas = deriveLearningAtlas([]);
  assert.equal(atlas.chapters.length, 8);
  assert.equal(atlas.completedSourceCount, 0);
  assert.equal(atlas.validSourceCount, 0);
  assert.deepEqual(atlas.unlockedTemplateIds, []);
  assert.deepEqual(atlas.revisits, []);
  assert.ok(atlas.capabilities.every(capability => !capability.available));
  for (const chapter of atlas.chapters) {
    assert.equal(chapter.counts.unseen, chapter.counts.total);
    assert.equal(chapter.counts.total, chapter.concepts.length);
    assert.equal(Object.hasOwn(chapter, 'level'), false);
    assert.ok(chapter.concepts.every(concept => concept.level === 'unseen' && concept.proofs.length === 0));
  }
});

test('actual dispatch records seen, while one transfer covers only its own chapter concepts', () => {
  const scenario = source('field-hospital');
  const seen = reduceGame(scenario, createGame(scenario), {id: 'atlas-dispatch', type: 'dispatch', mode: 'manual'});
  assert.equal(validateGameState(scenario, seen), true);
  const before = deriveLearningAtlas([seen]);
  assert.equal(before.chapters[3].counts.seen, scenario.concepts.length);
  assert.equal(before.completedSourceCount, 0);
  assert.equal(before.capabilities.find(capability => capability.id === 'context')!.available, false);
  const completed = deriveLearningAtlas([play('field-hospital')]);
  const chapter = completed.chapters[3];
  assert.equal(chapter.counts.independentTransfer, scenario.concepts.length);
  assert.ok(chapter.counts.unseen > 0);
  assert.equal(Object.hasOwn(chapter, 'level'), false);
  assert.ok(completed.chapters.filter(item => item.chapter !== 4).every(item => item.counts.unseen === item.counts.total));
});

test('hinted actual success remains guided and source proofs retain hints and exact known event IDs', () => {
  const game = play('field-hospital', true), before = JSON.stringify(game);
  assert.ok(game.learningEvidence.every(item => item.level === 'guided'));
  const atlas = deriveLearningAtlas([game]);
  const proof = atlas.chapters[3].concepts.find(concept => concept.concept === game.learningEvidence[0].concept)!.proofs[0];
  assert.equal(proof.level, 'guided');
  assert.equal(proof.hintUsed, true);
  assert.equal(proof.scenarioId, game.scenarioId);
  assert.deepEqual(proof.eventIds, game.learningEvidence[0].eventIds);
  for (const event of proof.events) {
    assert.ok(game.events.some(original => original.id === event.id && original.sequence === event.sequence));
    assert.equal(Object.hasOwn(event, 'facts'), false);
    assert.equal(Object.hasOwn(event, 'reportedFacts'), false);
  }
  assert.equal(JSON.stringify(game), before);
  assert.equal(atlas.chapters[3].counts.independentTransfer, 0);
});

test('actual legacy warehouse completion preserves its saved grade without claiming a new independent transfer', () => {
  const scenario = scenarios.find(scenario => scenario.id === 'warehouse-gate')!;
  let game = createGame(scenario, 33);
  game = reduceGame(scenario, game, {id: 'legacy-atlas-configure', type: 'configure', blueprint: {
    tools: ['observe', 'operate', 'verify'], feedback: true, verification: true, budget: 12, permissions: ['*'],
  }});
  game = reduceGame(scenario, game, {id: 'legacy-atlas-dispatch', type: 'dispatch'});
  for (let step = 0; game.status === 'running' && step < 64; step++) game = reduceGame(scenario, game, {id: `legacy-atlas-step-${step}`, type: 'step'});
  assert.equal(game.status, 'won');
  assert.equal(validateGameState(scenario, game), true);
  const original = JSON.stringify(game);
  assert.equal(game.kernelVersion, 1);
  assert.ok(game.learningEvidence.some(evidence => evidence.level === 'independent-transfer'));
  const atlas = deriveLearningAtlas([game]);
  for (const evidence of game.learningEvidence) {
    const proof = atlas.chapters.flatMap(chapter => chapter.concepts).flatMap(concept => concept.proofs)
      .find(proof => proof.scenarioId === game.scenarioId && proof.originalLevel === evidence.level)!;
    assert.ok(proof);
    assert.equal(proof.legacyCompletion, true);
    assert.equal(proof.level, evidence.level === 'independent-transfer' ? 'guided' : evidence.level);
    assert.equal(proof.originalLevel, evidence.level);
  }
  assert.equal(atlas.chapters.reduce((n, chapter) => n + chapter.counts.independentTransfer, 0), 0);
  const output = markup({games: [game]});
  assert.match(output, /旧版情境记录没有新版的独立迁移验收/);
  assert.match(output, /原存档标记「独立迁移」保留不变/);
  assert.equal(JSON.stringify(game), original);
});

test('distinct valid attempts preserve evidence, duplicates and new seeds never manufacture a new concept', () => {
  const hinted = play('field-hospital', true, 1), independent = play('field-hospital', false, 2);
  const atlas = deriveLearningAtlas([hinted, independent, structuredClone(independent)]);
  const concept = atlas.chapters[3].concepts.find(item => item.concept === independent.learningEvidence[0].concept)!;
  assert.equal(concept.level, 'independent-transfer');
  assert.equal(concept.proofs.length, 2);
  assert.ok(concept.proofs.some(proof => proof.hintUsed && proof.level === 'guided'));
  assert.ok(concept.proofs.some(proof => !proof.hintUsed && proof.level === 'independent-transfer'));
  assert.equal(atlas.chapters[3].counts.independentTransfer, independent.learningEvidence.length);
  assert.equal(atlas.completedSourceCount, 1);
  assert.equal(atlas.validSourceCount, 1);
});

test('fabricated IDs, inner world, grade, hints and proof references are rejected against official sources', () => {
  const real = play('field-hospital', true);
  const bad: GameState[] = [];
  for (const mutate of [
    (game: GameState) => {game.scenarioId = 'invented-source';},
    (game: GameState) => {game.scenarioId = 'folded-map';},
    (game: GameState) => {game.world['ATLAS_PRIVATE_SENTINEL'] = 'DO_NOT_RENDER_FAKE_WORLD';},
    (game: GameState) => {game.learningEvidence[0].level = 'independent-transfer';},
    (game: GameState) => {game.hintUsed = false;},
    (game: GameState) => {game.learningEvidence[0].eventIds = ['invented-proof'];},
  ]) {const game = structuredClone(real); mutate(game); bad.push(game);}
  const atlas = deriveLearningAtlas(bad);
  assert.equal(atlas.ignoredRecordCount, bad.length);
  assert.equal(atlas.completedSourceCount, 0);
  assert.equal(atlas.validSourceCount, 0);
  assert.deepEqual(atlas.unlockedTemplateIds, []);
  assert.deepEqual(atlas.revisits, []);
  assert.ok(atlas.chapters.every(chapter => chapter.counts.unseen === chapter.counts.total));
  assert.doesNotMatch(JSON.stringify(atlas), /ATLAS_PRIVATE_SENTINEL|DO_NOT_RENDER_FAKE_WORLD|invented-proof/);
});

test('real source structures determine available mechanisms; v10 modules do not imply team or evaluation', () => {
  const dsh = deriveLearningAtlas([play('bp-dsh-lifecycle')]);
  assert.equal(dsh.capabilities.find(capability => capability.id === 'blueprint')!.available, true);
  assert.ok(dsh.capabilities.find(capability => capability.id === 'blueprint')!.mechanisms.includes('持久提交与恢复'));
  assert.equal(dsh.capabilities.find(capability => capability.id === 'evaluation')!.available, false);
  assert.equal(dsh.capabilities.find(capability => capability.id === 'team')!.available, false);
  const team = deriveLearningAtlas([play('wet-foundation')]);
  assert.equal(team.capabilities.find(capability => capability.id === 'team')!.available, true);
  assert.equal(team.capabilities.find(capability => capability.id === 'evaluation')!.available, false);
  const evaluated = deriveLearningAtlas([play('sunny-day-ledger')]);
  assert.equal(evaluated.capabilities.find(capability => capability.id === 'evaluation')!.available, true);
  assert.equal(evaluated.capabilities.find(capability => capability.id === 'team')!.available, false);
  const schema = deriveLearningAtlas([play('etched-door')]);
  assert.deepEqual(schema.unlockedTemplateIds, ['typed-schema']);
  assert.equal(schema.capabilities.find(capability => capability.id === 'schema')!.available, true);
  assert.ok(schema.capabilities.find(capability => capability.id === 'schema')!.mechanisms.includes('带类型和约束的参数'));
  for (const capability of schema.capabilities) for (const templateId of capability.practiceTemplateIds) assert.ok(schema.unlockedTemplateIds.includes(templateId));
});

test('blueprint grouping is a reading aid and retains the real author source', () => {
  const game = play('bp-codex-approval');
  const atlas = deriveLearningAtlas([game]);
  const proof = atlas.chapters[5].concepts.find(concept => concept.concept === game.learningEvidence[0].concept)!.proofs[0];
  assert.equal(source(proof.scenarioId).chapter, 9);
  assert.equal(proof.scenarioId, 'bp-codex-approval');
  assert.equal(proof.scenarioTitle, source(game.scenarioId).title);
  assert.equal(proof.level, game.learningEvidence[0].level);
});

test('revisit requires an unlocked source followed by two different first real main victories', () => {
  const schema = play('etched-door'), furnace = play('cooling-furnace'), valves = play('paired-valves');
  const one = deriveLearningAtlas([schema, furnace, structuredClone(furnace)]);
  assert.equal(one.revisits.some(revisit => revisit.templateId === 'typed-schema'), false);
  const ready = createGame(source('paired-valves'));
  const forged = structuredClone(valves); forged.world.northValve = false;
  assert.equal(deriveLearningAtlas([schema, furnace, ready, forged]).revisits.some(revisit => revisit.templateId === 'typed-schema'), false);
  const enough = deriveLearningAtlas([schema, furnace, valves]);
  const revisit = enough.revisits.find(item => item.templateId === 'typed-schema')!;
  assert.ok(revisit);
  assert.deepEqual(revisit.interveningMainWins.map(win => win.scenarioId), ['cooling-furnace', 'paired-valves']);
  assert.equal(deriveLearningAtlas([furnace, valves, schema]).revisits.some(item => item.templateId === 'typed-schema'), false);
  assert.equal(deriveLearningAtlas([schema, play('fog-bell'), play('medicine-detour')]).revisits.some(item => item.templateId === 'typed-schema'), false);
  assert.deepEqual(enough.chapters, deriveLearningAtlas([valves, furnace, schema]).chapters, 'record order must not be a grade');
});

test('recommendations have a fixed catalog order, at most three entries and never locked templates', () => {
  const games = ['fog-bell', 'last-ferry', 'after-tide', 'etched-door', 'cooling-furnace', 'paired-valves'].map(id => play(id));
  const atlas = deriveLearningAtlas(games);
  assert.deepEqual(atlas.revisits.map(revisit => revisit.templateId), ['feedback-chain', 'physical-order', 'proof-expiry']);
  assert.ok(atlas.revisits.every(revisit => atlas.unlockedTemplateIds.includes(revisit.templateId)));
  assert.deepEqual(deriveLearningAtlas(games), atlas);
});

test('projection never exposes unobserved live values, action histories or author answers', () => {
  const game = createGame(source('bp-hermes-stale'));
  assert.notEqual(game.observed.bpKilnRoute.value, game.world.bpKilnRoute, 'old startup memory is known; the current live route is not');
  const json = JSON.stringify(deriveLearningAtlas([game]));
  assert.doesNotMatch(json, /south-kiln|"world"|"facts"|"observed"|"actionHistory"|"routes"|"expectedWorld"|"referenceCost"/);
});

let server: ViteDevServer, ui: typeof import('../src/components/LearningAtlas');
before(async () => {
  server = await createServer({root: process.cwd(), configFile: false, envDir: false, server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', logLevel: 'error'});
  ui = await server.ssrLoadModule('/src/components/LearningAtlas.tsx');
});
after(async () => {await server?.close();});
const markup = (props: LearningAtlasProps) => renderToStaticMarkup(createElement(ui.default, props));

test('manual groups the journey into eight closed chapters instead of a flat concept list', () => {
  const output = markup({games: []});
  assert.equal((output.match(/class="atlas-chapter"/g) ?? []).length, 8);
  assert.doesNotMatch(output, /class="atlas-chapter" open/);
  assert.match(output, /只看已经留痕的概念/);
  assert.match(output, /阅读分组/);
  assert.match(output, /每个概念各自留档/);
  assert.doesNotMatch(output, /已掌握整章|经验值|战力/);
});

test('manual shows the real hint state and proof IDs without world or reference answers', () => {
  const game = play('field-hospital', true), before = JSON.stringify(game), output = markup({games: [game]});
  assert.match(output, /使用过游戏提示/);
  assert.match(output, /引导实操/);
  assert.ok(output.includes(game.learningEvidence[0].eventIds[0]));
  assert.doesNotMatch(output, /actionHistory|referenceCost|expectedWorld|原始JSON/);
  assert.equal(JSON.stringify(game), before);
});

test('only eligible recommendations offer a hall callback, with busy starts disabled', () => {
  const games = ['etched-door', 'cooling-furnace', 'paired-valves'].map(id => play(id));
  const active = markup({games, onPractice: () => {}}), busy = markup({games, onPractice: () => {}, busy: true});
  assert.equal((active.match(/在挑战厅查看/g) ?? []).length, 1);
  assert.match(active, /记录排列只用于建议/);
  assert.match(busy, /disabled=""[^>]*>[^]*?在挑战厅查看/);
  assert.doesNotMatch(markup({games: []}), /在挑战厅查看/);
});
