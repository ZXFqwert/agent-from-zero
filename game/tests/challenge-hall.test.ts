import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import { challengeTemplates } from '../src/challenges/catalog';
import { createExpedition } from '../src/challenges/expedition';
import { generateChallenge, replayChallengeRoute } from '../src/challenges/generator';
import { createGame } from '../src/engine';
import type { ChallengeHallProps } from '../src/components/ChallengeHall';

let server: ViteDevServer;
let ui: typeof import('../src/components/ChallengeHall');
before(async () => {
  server = await createServer({ root: process.cwd(), configFile: false, envDir: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error' });
  ui = await server.ssrLoadModule('/src/components/ChallengeHall.tsx');
});
after(async () => { await server?.close(); });
const noop = async () => {};
const props = (): ChallengeHallProps => ({ growth: [], unlockedTemplateIds: [], expeditionUnlocked: false, onStartChallenge: noop, onStartExpedition: noop, onContinue: noop, onExpeditionAction: noop });
const markup = (value: ChallengeHallProps) => renderToStaticMarkup(createElement(ui.default, value));

test('24 authored mechanisms are visible but no locked start is offered', () => {
  const output = markup(props());
  for (const template of challengeTemplates) assert.ok(output.includes(template.label));
  assert.equal((output.match(/class="challenge-commission tier-/g) ?? []).length, 24);
  assert.doesNotMatch(output, /接受委托/);
  assert.match(output, /先完成对应的主线实操/);
  assert.match(output, /disabled=""[^>]*><svg[^]*?开始一场三层远征/);
});

test('only validated unlock IDs supplied by the owner make a mission start available', () => {
  const value = props(); value.unlockedTemplateIds = ['feedback-chain', 'typed-schema', 'made-up'];
  value.growth = [{mechanism: 'complete-loop', level: 'guided', freshWins: 0, practiceWins: 4, variantKeys: []}];
  const output = markup(value);
  assert.equal((output.match(/接受委托/g) ?? []).length, 2);
  assert.match(output, /保留胜利证明 4 份/);
  assert.match(output, /实操通过/);
  assert.doesNotMatch(output, /已记录独立迁移/);
  assert.match(output, /重复原关或只换编号，不会自动增加/);
});

test('active mission displays its earned status and crystals, never hidden world, source steps or a free answer', () => {
  const instance = generateChallenge({factoryVersion: 1, templateId: 'feedback-chain', seed: 7});
  const game = createGame(instance.scenario, 7);
  game.world.UI_PRIVATE_SENTINEL = 'NEVER_SHOW_INITIAL_WORLD';
  const value = props(); value.activeChallenge = {spec: instance.spec, game, firstEncounter: true}; value.unlockedTemplateIds = ['feedback-chain'];
  const before = JSON.stringify(game), output = markup(value);
  assert.match(output, /返回这场委托/);
  assert.match(output, /当前委托剩余/);
  assert.doesNotMatch(output, /NEVER_SHOW_INITIAL_WORLD|UI_PRIVATE_SENTINEL/);
  assert.doesNotMatch(output, /原始JSON|referenceCost|expectedWorld|reference route/);
  assert.equal(JSON.stringify(game), before);
  assert.match(output, /换成这张委托/);
});

test('real reference victory is shown as completed without upgrading learning from firstEncounter', () => {
  const instance = generateChallenge({factoryVersion: 1, templateId: 'feedback-chain', seed: 7});
  const route = instance.routes.find(route => route.purpose === 'reference')!;
  const won = replayChallengeRoute(instance, route).state;
  const value = props(); value.activeChallenge = {spec: instance.spec, game: won, firstEncounter: true};
  const output = markup(value);
  assert.match(output, /实际验收通过/);
  assert.match(output, /查看真实复盘/);
  assert.doesNotMatch(output, /已记录独立迁移/);
});

test('three floors share actual remaining resources and only reached floor reveals its chosen mission', () => {
  const expedition = createExpedition({factoryVersion: 1, seed: 17});
  expedition.game.world.UI_PRIVATE_SENTINEL = 'NEVER_SHOW_EXPEDITION_WORLD';
  const value = props(); value.activeExpedition = expedition; value.expeditionUnlocked = true;
  const before = JSON.stringify(expedition), output = markup(value);
  const floors = output.slice(output.indexOf('<ol class="challenge-floor-list">'), output.indexOf('</ol>') + 5);
  assert.equal((floors.match(/下一片未知城区/g) ?? []).length, 2);
  assert.match(output, /三层共用一袋晶石/);
  assert.ok(output.includes(String(expedition.remaining)));
  assert.match(output, /重试本层，消耗不退回/);
  assert.doesNotMatch(output, /NEVER_SHOW_EXPEDITION_WORLD|UI_PRIVATE_SENTINEL/);
  assert.equal(JSON.stringify(expedition), before);
});

test('busy protects all callbacks and independent evidence label must come from the supplied growth', () => {
  const value = props(); value.busy = true; value.unlockedTemplateIds = ['feedback-chain']; value.expeditionUnlocked = true;
  value.growth = [{mechanism: 'complete-loop', level: 'independent-transfer', freshWins: 0, practiceWins: 0, variantKeys: []}];
  const output = markup(value);
  assert.match(output, /已记录独立迁移/);
  const start = output.slice(output.indexOf('接受委托') - 210, output.indexOf('接受委托'));
  assert.ok(start.includes('disabled=""'));
});

test('variant code accepts exactly finite uint32 seeds and round trips boundary values', () => {
  for (const seed of [0, 1, 17, 2147483648, 0xffffffff]) assert.equal(ui.parseChallengeSeed(ui.challengeSeedCode(seed)), seed);
  assert.equal(ui.parseChallengeSeed('  z  '), 35);
  for (const code of ['', '-1', '1.2', '1e+2', 'ZZZZZZZ', '12345678', '😀', '{"seed":1}']) assert.equal(ui.parseChallengeSeed(code), undefined);
});
