import test, {after, before} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer, type ViteDevServer} from 'vite';
import {contentBundle} from '../scripts/validate-content';
import {scenarios} from '../src/content/scenarios';
import {createGame, reduceGame, validateGameState, validateScenario} from '../src/engine';
import type {AgentBlueprint, GameAction, GameState, ScenarioDefinition} from '../src/engine/types';
import {generateChallenge, generateExpedition, replayChallengeRoute, scenarioForExpedition,
  type ChallengeInstance} from '../src/challenges';
import {emptyPostSeason, reducePostSeason, validatePostSeason, type PostSeasonAction, type PostSeasonState} from '../src/postSeason';
import {deriveReusableBuilds, MAX_REUSE_SOURCES, previewReusableBuild, type BuildReuseInput} from '../src/buildReuse';
import type {BuildReusePickerProps} from '../src/components/BuildReusePicker';

const source = (id: string) => scenarios.find(scenario => scenario.id === id)!;
const winCache = new Map<string, GameState>();
function play(id: string, changes?: Partial<AgentBlueprint>, hint = false): GameState {
  const scenario = source(id);
  if (!changes && !hint && winCache.has(id)) return structuredClone(winCache.get(id)!);
  const route = contentBundle.walkthroughs.find(route => route.scenarioId === id && route.purpose === 'reference')!;
  const played = replayChallengeRoute({scenario, spec: {seed: 70}} as ChallengeInstance, route);
  let game = played.state;
  if (changes || hint) {
    game = createGame(scenario, 70);
    if (hint) game = reduceGame(scenario, game, {id: 'reuse-test-actual-hint', type: 'hint'});
    for (const original of played.actions) {
      const action = original.type === 'configure' ? {...original, blueprint: {...original.blueprint, ...structuredClone(changes)}} : original;
      const next = reduceGame(scenario, game, action);
      assert.notEqual(next, game);
      game = next;
    }
  }
  assert.equal(game.status, 'won');
  assert.equal(validateGameState(scenario, game), true);
  if (!changes && !hint) winCache.set(id, structuredClone(game));
  return game;
}
function ordinary(templateId = 'typed-schema', seed = 70): {mainGames: GameState[]; postSeason: PostSeasonState} {
  const instance = generateChallenge({factoryVersion: 1, templateId, seed});
  const mainGames = [play(instance.template.sourceScenarioId)];
  const played = replayChallengeRoute(instance, instance.routes.find(route => route.purpose === 'reference')!);
  let post = reducePostSeason(emptyPostSeason(), {type: 'start-challenge', spec: instance.spec}, mainGames);
  for (const action of played.actions) {
    const next = reducePostSeason(post, {type: 'challenge', action}, mainGames);
    assert.notEqual(next, post); post = next;
  }
  assert.equal(post.currentChallenge!.game.status, 'won');
  assert.deepEqual(validatePostSeason(post, mainGames), post);
  return {mainGames, postSeason: post};
}
function expedition(): {mainGames: GameState[]; postSeason: PostSeasonState} {
  const spec = {factoryVersion: 1 as const, seed: 77};
  const definition = generateExpedition(spec);
  const mainGames = definition.floors.map(floor => play(generateChallenge(floor).template.sourceScenarioId));
  let post = reducePostSeason(emptyPostSeason(), {type: 'start-expedition', spec}, mainGames);
  const apply = (action: PostSeasonAction) => {
    const next = reducePostSeason(post, action, mainGames);
    assert.notEqual(next, post); post = next;
  };
  for (let floor = 0; floor < 3; floor++) {
    const current = post.activeExpedition!, instance = generateChallenge(current.definition.floors[current.floor]);
    instance.scenario = scenarioForExpedition(current);
    const route = instance.routes.filter(route => route.purpose !== 'recovery').sort((a, b) => a.expectedCost - b.expectedCost)[0];
    const played = replayChallengeRoute(instance, route);
    for (const action of played.actions) apply({type: 'expedition', action: {type: 'game', action}});
    apply({type: 'expedition', action: {type: 'advance'}});
  }
  assert.equal(post.activeExpedition!.status, 'cleared');
  assert.deepEqual(validatePostSeason(post, mainGames), post);
  return {mainGames, postSeason: post};
}

test('only exact official won records provide named delivery-time source provenance', () => {
  const game = play('etched-door'), input = {mainGames: [game, game, createGame(source('fog-bell'))]}, before = JSON.stringify(input);
  const catalogue = deriveReusableBuilds(input);
  assert.equal(catalogue.sources.length, 1);
  const record = catalogue.sources[0];
  assert.equal(record.scope, 'author'); assert.equal(record.scenarioId, game.scenarioId);
  assert.equal(record.sourceVersion, game.scenarioVersion); assert.equal(record.kernelVersion, game.kernelVersion);
  assert.equal(record.hintUsed, game.hintUsed);
  assert.ok(record.victoryEventIds.every(id => game.events.some(event => event.id === id && event.type === 'victory')));
  assert.equal(record.configureEventId, game.events.filter(event => event.type === 'configured').at(-1)!.id);
  assert.equal(JSON.stringify(input), before);
});

test('unknown IDs, copied challenge victories, changed world, grade, event and source version cannot become sources', () => {
  const game = play('etched-door'), wrong = [structuredClone(game), structuredClone(game), structuredClone(game), structuredClone(game), structuredClone(game)];
  wrong[0].scenarioId = 'fake-task';
  wrong[1].world[Object.keys(wrong[1].world)[0]] = 'fabricated';
  wrong[2].learningEvidence[0].level = 'independent-transfer';
  wrong[3].events.at(-1)!.text += 'altered';
  wrong[4].scenarioVersion++;
  const generated = ordinary().postSeason.currentChallenge!.game;
  const catalogue = deriveReusableBuilds({mainGames: [...wrong, generated]});
  assert.deepEqual(catalogue.sources, []);
  assert.equal(catalogue.ignoredRecordCount, 6);
});

test('actual hinted and unhinted runs preserve distinct provenance and cannot wash a persisted hint', () => {
  const hinted = play('etched-door', undefined, true), unhinted = play('etched-door');
  const catalogue = deriveReusableBuilds({mainGames: [hinted, unhinted]});
  assert.equal(catalogue.sources.length, 2);
  assert.deepEqual(catalogue.sources.map(record => record.hintUsed), [true, false]);
  assert.notEqual(catalogue.sources[0].id, catalogue.sources[1].id);
  const washed = structuredClone(hinted); washed.hintUsed = false;
  assert.deepEqual(deriveReusableBuilds({mainGames: [washed]}).sources, []);
});

test('a full finite catalogue retains the newly delivered real configuration instead of only the oldest records', () => {
  const scenario = source('etched-door'), actions = play(scenario.id).runtime!.actionHistory;
  const mainGames = Array.from({length: MAX_REUSE_SOURCES + 1}, (_, index) => {
    let game = createGame(scenario, index + 500);
    for (const action of actions) game = reduceGame(scenario, game, action);
    assert.equal(game.status, 'won');
    return game;
  });
  const catalogue = deriveReusableBuilds({mainGames});
  assert.equal(catalogue.sources.length, MAX_REUSE_SOURCES);
  assert.equal(catalogue.omittedSourceCount, 1);
  assert.equal(catalogue.sources.at(-1)!.seed, mainGames.at(-1)!.seed);
  assert.equal(catalogue.sources.some(source => source.seed === mainGames[0].seed), false);
  assert.ok(previewReusableBuild({mainGames}, catalogue.sources.at(-1)!.id, scenario));
});

test('ordinary wins require the full validated parent, actual actions and their actual source unlock', () => {
  const input = ordinary(), catalogue = deriveReusableBuilds(input);
  const records = catalogue.sources.filter(record => record.scope === 'challenge');
  assert.equal(records.length, 1, 'current and saved duplicate proof deduplicate');
  assert.equal(records[0].templateId, 'typed-schema');
  for (const badInput of [
    {mainGames: [], postSeason: input.postSeason},
    {mainGames: input.mainGames, postSeason: input.postSeason.currentChallenge},
    {mainGames: input.mainGames, postSeason: {...input.postSeason, wonProofs: [{...input.postSeason.wonProofs[0], actions: []}]}},
  ]) {
    const result = deriveReusableBuilds(badInput);
    assert.equal(result.postSeasonRejected, true);
    assert.ok(result.sources.every(record => record.scope === 'author'));
  }
});

test('all actual expedition floors preserve parent budget provenance; loose, refilled or altered parent history is rejected', () => {
  const input = expedition(), original = JSON.stringify(input), catalogue = deriveReusableBuilds(input);
  const records = catalogue.sources.filter(record => record.scope === 'expedition');
  assert.equal(records.length, 3, 'active/cleared/current duplicates do not create extra sources');
  assert.deepEqual(records.map(record => record.floor), [1, 2, 3]);
  assert.ok(records.every(record => record.expeditionId === input.postSeason.activeExpedition!.definition.id));
  assert.deepEqual(records.map(record => record.floorStartBudget), input.postSeason.activeExpedition!.finished.map(attempt => attempt.initialBudget));
  for (const mutate of [
    (bad: PostSeasonState) => {bad.activeExpedition!.finished[0].initialBudget++;},
    (bad: PostSeasonState) => {bad.activeExpedition!.remaining++;},
    (bad: PostSeasonState) => {bad.activeExpedition!.history.pop();},
  ]) {
    const bad = structuredClone(input.postSeason); mutate(bad);
    const result = deriveReusableBuilds({mainGames: input.mainGames, postSeason: bad});
    assert.equal(result.postSeasonRejected, true);
    assert.ok(result.sources.every(record => record.scope === 'author'));
  }
  assert.equal(deriveReusableBuilds({mainGames: input.mainGames, postSeason: input.postSeason.activeExpedition!.finished[0]}).postSeasonRejected, true);
  assert.equal(JSON.stringify(input), original);
});

test('every draft strips wildcard and same-target permissions, parameters and goal order before copying structural knobs', () => {
  const scenario = source('etched-door'), operation = scenario.operations.find(operation => operation.protocol)!;
  const game = play(scenario.id, {permissions: ['*'], toolPermissions: {observe: ['*'], operate: ['*'], verify: ['*']},
    goalOrder: scenario.goals.map(goal => goal.fact), toolArguments: {[operation.id]: operation.protocol!.defaults}, stableRequestKeys: true});
  const input = {mainGames: [game]}, original = JSON.stringify(input), record = deriveReusableBuilds(input).sources[0];
  const preview = previewReusableBuild(input, record.id, scenario)!;
  assert.ok(preview); assert.deepEqual(preview.draft.permissions, []);
  for (const key of ['toolPermissions', 'toolArguments', 'goalOrder', 'context', 'world', 'runtime', 'security', 'team', 'lab', 'memory', 'modules']) {
    assert.equal(Object.hasOwn(preview.draft, key), false);
    assert.equal(Object.hasOwn(record.knobs, key), false);
  }
  assert.deepEqual(preview.draft.tools, game.blueprint.tools);
  assert.equal(preview.draft.stableRequestKeys, true);
  assert.equal(preview.requiresPermissionSign, true);
  const explicit = play('etched-door', {permissions: [...new Set([...scenario.observations, ...scenario.operations].map(item => item.target))]});
  const explicitInput = {mainGames: [explicit]}, explicitId = deriveReusableBuilds(explicitInput).sources[0].id;
  assert.deepEqual(previewReusableBuild(explicitInput, explicitId, scenario)!.draft.permissions, []);
  assert.equal(JSON.stringify(input), original);
});

test('preview rechecks source proof, ignores modified catalogue knobs, and rejects an invalid destination', () => {
  const input = {mainGames: [play('etched-door')]}, record = deriveReusableBuilds(input).sources[0];
  record.knobs.budget = 64; record.knobs.tools = [];
  const target = source('etched-door'), preview = previewReusableBuild(input, record.id, target)!;
  assert.equal(preview.draft.budget, input.mainGames[0].blueprint.budget);
  assert.deepEqual(preview.draft.tools, input.mainGames[0].blueprint.tools);
  assert.equal(previewReusableBuild(input, `${record.id}-forged`, target), null);
  const fake = structuredClone(input); fake.mainGames[0].world[Object.keys(fake.mainGames[0].world)[0]] = 'changed';
  assert.equal(previewReusableBuild(fake, record.id, target), null);
  const badTarget = structuredClone(target); badTarget.operations[0].target = 'invalid target';
  assert.ok(validateScenario(badTarget).length);
  assert.equal(previewReusableBuild(input, record.id, badTarget), null);
});

test('downgrade drops unsupported optional strategies with warnings; capacity conflict does not silently drop tools', () => {
  const input = {mainGames: [play('bp-hermes-stale', {stableRequestKeys: true})]}, record = deriveReusableBuilds(input).sources[0];
  const supported = previewReusableBuild(input, record.id, source('bp-codex-approval'))!;
  assert.deepEqual(supported.draft.loopPolicy, input.mainGames[0].blueprint.loopPolicy);
  assert.equal(supported.draft.instructionPolicy, 'data-only');
  const legacy = previewReusableBuild(input, record.id, source('warehouse-gate'))!;
  for (const key of ['stableRequestKeys', 'loopPolicy', 'instructionPolicy']) assert.equal(Object.hasOwn(legacy.draft, key), false);
  assert.ok(legacy.warnings.some(warning => warning.includes('不支持稳定请求键')));
  assert.ok(legacy.warnings.some(warning => warning.includes('不支持有限回路')));
  const small = previewReusableBuild(input, record.id, source('fog-bell'))!;
  assert.equal(small.draft.tools.length, 3);
  assert.ok(small.blueprintErrors.some(error => error.includes('2')));
  assert.ok(small.warnings.some(warning => warning.includes('没有替你删掉任何法器')));
  assert.equal(small.draft.budget, 7);
});

test('an explicitly unsafe source policy remains visible and warned instead of being silently corrected', () => {
  const input = {mainGames: [play('bp-hermes-stale', {instructionPolicy: 'follow-documents'})]};
  const preview = previewReusableBuild(input, deriveReusableBuilds(input).sources[0].id, source('bp-codex-approval'))!;
  assert.equal(preview.draft.instructionPolicy, 'follow-documents');
  assert.ok(preview.warnings.some(warning => warning.includes('遵从资料附带的指令')));
});

test('preview is action-free and applying its blank-permission draft cannot refill the current consumed mission pool', () => {
  const scenario = source('etched-door'), input = {mainGames: [play('bp-hermes-stale')]};
  let game = createGame(scenario, 91);
  const apply = (action: GameAction) => {const next = reduceGame(scenario, game, action); assert.notEqual(next, game); game = next;};
  apply({id: 'reuse-test-existing-build', type: 'configure', blueprint: {tools: ['observe', 'operate', 'verify'], feedback: true, verification: true, budget: 20, permissions: ['*']}});
  apply({id: 'reuse-test-dispatch', type: 'dispatch', mode: 'manual'});
  apply({id: 'reuse-test-observe', type: 'tool', call: {tool: 'observe', observationId: scenario.observations[0].id}});
  apply({id: 'reuse-test-pause', type: 'pause'});
  const before = JSON.stringify(game), remaining = game.runtime!.missionRemaining;
  const preview = previewReusableBuild(input, deriveReusableBuilds(input).sources[0].id, scenario)!;
  assert.equal(JSON.stringify(game), before);
  apply({id: 'reuse-test-player-apply', type: 'configure', blueprint: preview.draft});
  assert.equal(game.runtime!.missionRemaining, remaining);
  assert.ok(game.budgetRemaining <= remaining);
  assert.deepEqual(game.blueprint.permissions, []);
  assert.deepEqual(game.world, JSON.parse(before).world);
});

test('catalogue and preview expose no world, private inputs, material payloads, approvals, route answers or source permission targets', () => {
  const input = {mainGames: [play('bp-hermes-stale'), play('bp-codex-approval')]};
  const catalogue = deriveReusableBuilds(input), preview = previewReusableBuild(input, catalogue.sources[0].id, source('bp-codex-approval'))!;
  const json = JSON.stringify({catalogue, preview});
  assert.doesNotMatch(json, /"world"|"observed"|"facts"|"reportedFacts"|"activeIds"|"actionHistory"|"privateInput"|"permits"|"routes"|"referenceCost"|"toolArguments"|"toolPermissions"|south-kiln|north-kiln/);
});

let server: ViteDevServer, ui: typeof import('../src/components/BuildReusePicker');
before(async () => {
  server = await createServer({root: process.cwd(), configFile: false, envDir: false,
    server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', logLevel: 'error'});
  ui = await server.ssrLoadModule('/src/components/BuildReusePicker.tsx');
});
after(async () => {await server?.close();});
const markup = (props: BuildReusePickerProps) => renderToStaticMarkup(createElement(ui.default, props));

test('compact picker starts closed and unselected, groups real sources and never calls onDraft during rendering', () => {
  const input = ordinary(); let calls = 0;
  const output = markup({records: input, scenario: source('fog-bell'), onDraft: () => {calls++;}});
  assert.match(output, /从已交付构筑起草/); assert.match(output, /先选来源/);
  assert.match(output, /optgroup label="剧情委托"/); assert.match(output, /optgroup label="自由委托"/);
  assert.doesNotMatch(output, /class="build-reuse" open/);
  assert.doesNotMatch(output, /构筑草稿预览|放入工坊草稿|已掌握|经验值/);
  assert.equal(calls, 0);
  assert.match(markup({records: input, scenario: source('fog-bell'), onDraft: () => {calls++;}, busy: true}), /select[^>]*disabled/);
});

test('empty or invalid proof sources are presented honestly without material or answer payloads', () => {
  const output = markup({records: {mainGames: [], postSeason: {fake: 'private-provider-key'}}, scenario: source('fog-bell'), onDraft: () => {}});
  assert.match(output, /完成一件委托后/); assert.match(output, /未通过复核/);
  assert.doesNotMatch(output, /private-provider-key|world|actionHistory|expectedWorld/);
});
