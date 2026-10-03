import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import type { Run, Status, Pending } from '../src/components/Lab';

let server: ViteDevServer;
let ui: typeof import('../src/components/Lab');
before(async () => {
  server = await createServer({ root: process.cwd(), configFile: false, envDir: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error' });
  ui = await server.ssrLoadModule('/src/components/Lab.tsx');
});
after(async () => { await server?.close(); });

const world = () => ({ scenario_id: 'signal-rescue', observed: [], connections: [], active: ['source'], verified: false });
const actor = (id = 'solo') => ({ id, label: id === 'solo' ? '回声' : id === 'scout' ? '调查伙伴' : id === 'builder' ? '施工伙伴' : '验收伙伴', tools: id === 'solo' ? ['observe', 'connect', 'activate', 'verify'] : id === 'scout' ? ['observe'] : id === 'builder' ? ['connect', 'activate'] : ['verify'], known_targets: [] as string[] });
function receipt() {
  return { id: 'run-actual-0001', status: 'active', steps_used: 0, max_steps: 8, world: world(), events: [], final_text: '', expires_at: '2099-10-03T12:00:00Z', step_in_progress: false,
    experiment: { version: 1, type: 'solo-team', current_arm: 0, arm_budget: 4, arms: [
      { id: 'left', label: '单伙伴', model_id: 'primary', blueprint_id: 'solo', status: 'pending', steps_used: 0, world: world(), events: [] as object[], actors: [actor()], tool_calls: 0, denied_calls: 0, handoffs: 0 },
      { id: 'right', label: '三岗位协作', model_id: 'primary', blueprint_id: 'team', status: 'pending', steps_used: 0, world: world(), events: [] as object[], actors: [actor('scout'), actor('builder'), actor('auditor')], tool_calls: 0, denied_calls: 0, handoffs: 0 },
    ] } };
}
function status() {
  return { enabled: true, busy: false, scenario_ids: ['signal-rescue'], remaining_runs: 10, active_run: null, limits: { daily_runs: 10, max_steps: 8, run_seconds: 120, max_output_tokens: 512, global_concurrency: 1, quota_timezone: 'UTC' }, experiments: [
    { id: 'same-model-blueprints', label: '同模型，不同反馈构筑', enabled: true, reason: null, arms: ['反馈完整', '反馈隐藏'], arm_budget: 4 },
    { id: 'same-blueprint-models', label: '同构筑，不同模型', enabled: false, reason: 'alternate_model_unconfigured', arms: ['模型 A', '模型 B'], arm_budget: 4 },
    { id: 'solo-team', label: '单伙伴与协作伙伴', enabled: true, reason: null, arms: ['单伙伴', '三岗位协作'], arm_budget: 4 },
  ] };
}

test('normalizes real comparison and legacy receipts without inventing an arm', () => {
  const value = receipt();
  assert.deepEqual(ui.checkedRun(value).experiment?.arms.map(arm => arm.status), ['pending', 'pending']);
  const { experiment: _, ...legacy } = value;
  assert.equal(ui.checkedRun(legacy).experiment, undefined);
  const markup = renderToStaticMarkup(createElement(ui.RunReport, { run: ui.checkedRun(legacy) }));
  assert.match(markup, /旧版单组信号台实验/);
  assert.doesNotMatch(markup, /构筑 A/);
});

test('catalog distinguishes missing B, equal models and old server without allowing a fabricated comparison', () => {
  const value = status();
  assert.equal(ui.checkedStatus(value).experiments?.[1].reason, 'alternate_model_unconfigured');
  value.experiments[1].reason = 'alternate_model_matches_primary';
  assert.equal(ui.checkedStatus(value).experiments?.[1].enabled, false);
  const { experiments: _, ...legacy } = value;
  assert.equal(ui.checkedStatus(legacy).experiments, undefined);
  const malformed = structuredClone(value);
  malformed.experiments[2].id = 'same-model-blueprints';
  assert.throws(() => ui.checkedStatus(malformed), /无法识别/);
});

test('public receipt whitelist discards credentials, private histories and unknown world fields before cache or render', () => {
  const value: any = receipt();
  const forbidden = 'DO_NOT_RENDER_PRIVATE_PROVIDER';
  Object.assign(value, { api_key: forbidden, messages: [forbidden], base_url: forbidden });
  Object.assign(value.world, { hidden_answer: forbidden });
  Object.assign(value.experiment.arms[1], { model_name: forbidden, key: forbidden });
  value.experiment.arms[1].actors[0].messages = [{ content: forbidden }];
  value.experiment.arms[1].events = [{ kind: 'tool', tool: 'observe', call_id: 'real-call', arguments: '{"target":"source"}', result: { ok: true, target: 'source', active: true, private_blob: forbidden }, messages: forbidden }];
  const checked = ui.checkedRun(value);
  assert.ok(!JSON.stringify(checked).includes(forbidden));
  assert.ok(!renderToStaticMarkup(createElement(ui.RunReport, { run: checked })).includes(forbidden));
  assert.equal((checked.experiment!.arms[1].events[0].result as object).hasOwnProperty('private_blob'), false);
  const catalog: any = status(); catalog.secret = forbidden; catalog.limits.api_key = forbidden;
  assert.ok(!JSON.stringify(ui.checkedStatus(catalog)).includes(forbidden));
});

test('invalid totals, unknown contract versions, oversized worlds and actor references are rejected', () => {
  const variations: Array<(value: any) => void> = [
    value => { value.experiment.version = 2; },
    value => { value.experiment.type = 'arbitrary-prompt'; },
    value => { value.steps_used = 1; },
    value => { value.experiment.arms[0].steps_used = 5; value.steps_used = 5; },
    value => { value.experiment.arms[1].current_actor = 'not-a-real-actor'; },
    value => { value.experiment.arms[1].actors[1].id = 'scout'; },
    value => { value.world.observed = ['source', 'relay', 'beacon', 'secret']; },
    value => { value.world.connections = [['source']]; },
    value => { value.expires_at = 'not-a-date'; },
  ];
  for (const mutate of variations) { const value = receipt(); mutate(value); assert.throws(() => ui.checkedRun(value), /无法识别/); }
});

test('completed requires both actual verification facts, regardless of assistant claims', () => {
  const value = receipt(); value.status = 'completed'; value.final_text = '全部完成';
  value.world.verified = true;
  assert.throws(() => ui.checkedRun(value));
  for (const arm of value.experiment.arms) { arm.status = 'completed'; arm.world.verified = true; }
  assert.equal(ui.checkedRun(value).status, 'completed');
  value.experiment.arms[1].world.verified = false;
  assert.throws(() => ui.checkedRun(value));
});

test('UI distinguishes successful tool execution from an unsuccessful verification', () => {
  const value = receipt();
  value.experiment.arms[0].events.push({ kind: 'assistant', text: '<img src=x onerror="globalThis.bad=true">已完成' }, { kind: 'tool', tool: 'verify', call_id: 'verify-0001', arguments: '{}', result: { ok: true, verified: false } });
  const markup = renderToStaticMarkup(createElement(ui.RunReport, { run: ui.checkedRun(value) }));
  assert.match(markup, /实际验收未通过/);
  assert.match(markup, /verify-0001/);
  assert.match(markup, /&lt;img/);
  assert.doesNotMatch(markup, /<img src=x/);
  assert.doesNotMatch(markup, /两组均工具验收通过/);
});

test('world observations are not silently copied into each private actor input', () => {
  const value: any = receipt();
  value.experiment.arms[1].world.observed = ['source', 'relay', 'beacon'];
  value.experiment.arms[1].actors[0].known_targets = ['source'];
  const checked = ui.checkedRun(value);
  assert.deepEqual(checked.experiment?.arms[1].actors[1].known_targets, []);
  const markup = renderToStaticMarkup(createElement(ui.RunReport, { run: checked }));
  assert.match(markup, /已取得观察：能源核心/);
  assert.match(markup, /已取得观察：尚无/);
  assert.match(markup, /共享世界的观察不自动成为每个伙伴的输入/);
});

test('handoff shows only recorded result packets and original actor pair', () => {
  const value = receipt();
  value.experiment.arms[1].events.push({ kind: 'handoff', arm_id: 'right', actor_id: 'scout', from_actor: 'scout', to_actor: 'builder', results: [{ call_id: 'observe-source-actual', tool: 'observe', result: { ok: true, target: 'source', active: true } }] });
  const markup = renderToStaticMarkup(createElement(ui.RunReport, { run: ui.checkedRun(value) }));
  assert.match(markup, /实际交接：调查伙伴 → 施工伙伴/);
  assert.match(markup, /observe-source-actual/);
  assert.match(markup, /资料不会增加收件岗位的权限/);
  const invalid: any = receipt(); invalid.experiment.arms[1].events.push({ kind: 'handoff', from_actor: 'scout', to_actor: 'builder', results: [{ call_id: 'made-up', tool: 'observe' }] });
  assert.throws(() => ui.checkedRun(invalid));
});

test('a delayed active step cannot resurrect a confirmed cancelled run', () => {
  const previous = ui.checkedRun(receipt()); previous.status = 'cancelled'; previous.steps_used = 1;
  const late = structuredClone(previous); late.status = 'active'; late.steps_used = 2; late.step_in_progress = true;
  assert.equal(ui.preferRun(previous, late), previous);
  const conflicting = structuredClone(late); conflicting.status = 'incomplete';
  assert.equal(ui.preferRun(previous, conflicting), previous);
  const sameTerminal = structuredClone(previous); sameTerminal.step_in_progress = true;
  assert.equal(ui.preferRun(previous, sameTerminal).step_in_progress, false);
  const different = structuredClone(late); different.id = 'different-run';
  assert.equal(ui.preferRun(previous, different), different);
});

test('retry body preserves the exact original comparison and request ID without client connection configuration', () => {
  for (const experimentType of ['same-model-blueprints', 'same-blueprint-models', 'solo-team'] as const) {
    const pending: Pending = { kind: 'create', requestId: 'original-request-001', experimentType };
    const body = ui.mutationBody(pending);
    assert.deepEqual(body, { request_id: pending.requestId, scenario_id: 'signal-rescue', experiment_type: experimentType });
    assert.deepEqual(ui.mutationBody(pending), body);
  }
  assert.deepEqual(ui.mutationBody({ kind: 'create', requestId: 'old-request-001' }), { request_id: 'old-request-001', scenario_id: 'signal-rescue' });
  for (const kind of ['step', 'cancel'] as const) assert.deepEqual(ui.mutationBody({ kind, requestId: 'same-stop-001', runId: 'run-actual-0001' }), { request_id: 'same-stop-001' });
});

test('offline cached public record remains readable when the real experiment feature is closed', () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stored = JSON.stringify({ version: 1, receivedAt: '2026-10-03T12:00:00Z', run: receipt() });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => key === 'echo-lab-last-record-v1' ? stored : null } });
  try {
    const markup = renderToStaticMarkup(createElement(ui.default));
    assert.match(markup, /当前离线，只读已取得记录/);
    assert.match(markup, /run-actual-0001/);
    assert.match(markup, /本阶段尚未启用/);
    assert.match(markup, /同构筑，换模型/);
    assert.match(markup, /离线副本，当前服务端状态未知/);
    assert.doesNotMatch(markup, /创建两组对照/);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else Reflect.deleteProperty(globalThis, 'navigator');
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('invalid or oversized local copies do not render a claimed result', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  for (const stored of ['{invalid-json', JSON.stringify({ version: 1, receivedAt: 'not-date', run: receipt() }), ' '.repeat(1024 * 1024 + 1)]) {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => key === 'echo-lab-last-record-v1' ? stored : null } });
    const markup = renderToStaticMarkup(createElement(ui.default));
    assert.doesNotMatch(markup, /run-actual-0001/);
  }
  if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage');
});
