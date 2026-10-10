import test, {after, before} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer, type ViteDevServer} from 'vite';
import {contentBundle} from '../scripts/validate-content';
import {createGame, reduceGame, validateGameState} from '../src/engine';
import {replayChallengeRoute} from '../src/challenges/generator';
import type {ChallengeInstance} from '../src/challenges/types';
import {appendCurriculumHistory, curriculumAttemptId, MAX_HISTORY_RECORDS, mergeCurriculumGames, validateCurriculumHistory} from '../src/curriculumHistory';
import {GRADUATION_CHECK_IDS, GRADUATION_PROJECT, type GraduationStageId} from '../src/graduation/project';
import {emptyGraduationProgress, personalBriefFingerprint, personalBriefJson, validateGraduationProgress, validateLocalExecutionReport, type LocalExecutionReport} from '../src/graduationProgress';

function play(prefix = 'first') {
  const scenario = contentBundle.scenarios.find(item => item.id === 'etched-door')!;
  const route = contentBundle.walkthroughs.find(item => item.scenarioId === scenario.id && item.purpose === 'reference')!;
  const replay = replayChallengeRoute({scenario, spec: {seed: 33}} as ChallengeInstance, route);
  let game = createGame(scenario, 33);
  for (const action of replay.actions) game = reduceGame(scenario, game, {...action, id: `${prefix}-${action.id}`});
  assert.equal(game.status, 'won'); assert.equal(validateGameState(scenario, game), true);
  return game;
}

function report(stageId: GraduationStageId = 'context'): LocalExecutionReport {
  const checks = GRADUATION_CHECK_IDS[stageId].map(id => ({id, status: 'passed' as const, message: '真实本机检查回执'}));
  return {schema: 1, kind: 'local-execution-report', projectId: GRADUATION_PROJECT.id, projectVersion: GRADUATION_PROJECT.version, createdAt: '2026-10-10T10:00:00Z', stageId, summary: {passed: checks.length, failed: 0, total: checks.length}, checks, scope: {provider: 'scripted-local', realModelCalled: false, learnerImplementationSha256: 'a'.repeat(64), briefSha256: null}, limitations: ['本机报告可编辑，不代表掌握。']};
}

test('separate history keeps real author wins, deduplicates action traces and does not mutate old state', () => {
  const game = play(), serialized = JSON.stringify(game), history = appendCurriculumHistory({version: 1, records: []}, game);
  assert.equal(history.records.length, 1);
  assert.equal(JSON.stringify(game), serialized);
  assert.notEqual(history.records[0], game);
  const duplicate = appendCurriculumHistory(history, structuredClone(game));
  assert.equal(duplicate.records.length, 1);
  const copiedSeed = structuredClone(game); copiedSeed.seed++;
  assert.equal(curriculumAttemptId(copiedSeed), curriculumAttemptId(game));
  assert.equal(appendCurriculumHistory(history, play('second')).records.length, 2);
});

test('history refuses forged worlds, unfinished tasks, generated identities and duplicate imports', () => {
  const game = play(), scenario = contentBundle.scenarios.find(item => item.id === game.scenarioId)!;
  assert.throws(() => appendCurriculumHistory({version: 1, records: []}, createGame(scenario)), /尚不能/);
  const forged = structuredClone(game); forged.world = {};
  assert.throws(() => validateCurriculumHistory({version: 1, records: [forged]}));
  const generated = structuredClone(game); generated.scenarioId = 'challenge-seed-33';
  assert.throws(() => validateCurriculumHistory({version: 1, records: [generated]}));
  assert.throws(() => validateCurriculumHistory({version: 1, records: [game, game]}), /重复/);
  assert.throws(() => validateCurriculumHistory({version: 1, records: [], unexpected: true}));
});

test('history bounds retained attempts and preserves their actual order', () => {
  let history = {version: 1 as const, records: [] as ReturnType<typeof play>[]};
  const first = play('bounded-0'); history = appendCurriculumHistory(history, first);
  for (let index = 1; index <= MAX_HISTORY_RECORDS; index++) history = appendCurriculumHistory(history, play(`bounded-${index}`));
  assert.equal(history.records.length, MAX_HISTORY_RECORDS);
  assert.notEqual(curriculumAttemptId(history.records[0]), curriculumAttemptId(first));
  assert.ok(history.records.at(-1)?.processedActionIds[0].startsWith(`bounded-${MAX_HISTORY_RECORDS}-`));
  assert.throws(() => validateCurriculumHistory({version: 1, records: [...history.records, first]}), /容量/);
});

test('combining old proofs with new history deduplicates without rewriting the old save', () => {
  const first = play(), second = play('second'), oldGames = [first], before = JSON.stringify(oldGames);
  const merged = mergeCurriculumGames(oldGames, {version: 1, records: [first, second]});
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map(curriculumAttemptId), [first, second].map(curriculumAttemptId));
  assert.equal(JSON.stringify(oldGames), before);
});

test('reports require every trusted stage check, not one cherry-picked passing result', () => {
  for (const stage of Object.keys(GRADUATION_CHECK_IDS) as GraduationStageId[]) assert.deepEqual(validateLocalExecutionReport(report(stage)), report(stage));
  const partial = report(); partial.checks.pop(); partial.summary = {passed: 2, failed: 0, total: 2};
  assert.throws(() => validateLocalExecutionReport(partial), /完整检查/);
  const unknown = report(); unknown.checks[0].id = 'context.mastered_everything';
  assert.throws(() => validateLocalExecutionReport(unknown), /未知/);
  const duplicate = report(); duplicate.checks[1].id = duplicate.checks[0].id;
  assert.throws(() => validateLocalExecutionReport(duplicate), /重复/);
});

test('reports keep failures honest and reject mismatched summaries and claims of live execution', () => {
  const failed = report(); failed.checks[0].status = 'failed'; failed.summary = {passed: 2, failed: 1, total: 3};
  assert.equal(validateLocalExecutionReport(failed).summary.failed, 1);
  const inconsistent = report(); inconsistent.summary.failed = 1;
  assert.throws(() => validateLocalExecutionReport(inconsistent), /摘要/);
  const live = {...report(), scope: {...report().scope, realModelCalled: true}};
  assert.throws(() => validateLocalExecutionReport(live), /来源/);
  assert.throws(() => validateLocalExecutionReport({...report(), providerKey: 'untrusted'}), /未知字段/);
  assert.throws(() => validateLocalExecutionReport({...report(), projectVersion: '99.0'}), /兼容/);
});

test('graduation backup preserves only its own versioned plan and corresponding local reports', () => {
  const progress = emptyGraduationProgress(); progress.brief = {purpose: '整理我的学习笔记', acceptance: '真实读取清单并核验结果', toolBoundaries: '只读取专用练习目录'}; progress.reports.context = report();
  assert.deepEqual(validateGraduationProgress(JSON.parse(JSON.stringify(progress))), progress);
  assert.throws(() => validateGraduationProgress({...progress, games: {}}));
  assert.throws(() => validateGraduationProgress({...progress, reports: {schema: report('context')}}), /对应/);
  assert.throws(() => validateGraduationProgress({...progress, brief: {...progress.brief, apiKey: 'never'}}));
  assert.throws(() => validateGraduationProgress({...progress, activeStage: 'automatic-graduation'}));
});

test('personal brief canonical UTF-8 bytes match the Python sorted compact JSON fingerprint', async () => {
  const brief = {purpose: '整理自己的笔记，🧭', acceptance: '读取实际文件后检查结果', toolBoundaries: '不能访问专用目录之外'};
  const json = personalBriefJson(brief);
  assert.equal(json, '{"acceptance":"读取实际文件后检查结果","purpose":"整理自己的笔记，🧭","toolBoundaries":"不能访问专用目录之外"}');
  assert.equal(await personalBriefFingerprint(brief), createHash('sha256').update(json, 'utf8').digest('hex'));
  assert.notEqual(await personalBriefFingerprint({...brief, purpose: '另一份用途'}), await personalBriefFingerprint(brief));
});

let server: ViteDevServer, core: typeof import('../src/components/CoreCurriculum'), graduation: typeof import('../src/components/GraduationWorkshop');
before(async () => {
  server = await createServer({root: process.cwd(), configFile: false, envDir: false, server: {middlewareMode: true, hmr: false, ws: false, watch: null}, appType: 'custom', logLevel: 'error'});
  core = await server.ssrLoadModule('/src/components/CoreCurriculum.tsx');
  graduation = await server.ssrLoadModule('/src/components/GraduationWorkshop.tsx');
});
after(async () => {await server?.close();});

test('core UI presents stable chains with real trace IDs and no hidden world or complete answers', () => {
  const game = play(), output = renderToStaticMarkup(createElement(core.default, {games: [game], completedScenarioIds: [game.scenarioId], onScenario: async () => {}}));
  assert.match(output, /你的 Agent 核心学习链/);
  assert.match(output, /间隔重遇实操/);
  assert.match(output, /旧存档仍用于前三阶段/);
  assert.ok(game.events.some(event => output.includes(event.id)));
  assert.doesNotMatch(output, /"world"|expectedWorld|referenceCost|已经完全掌握/);
});

test('graduation begins with a concrete personal brief and separates local reports from live evidence', () => {
  const output = renderToStaticMarkup(createElement(graduation.default, {onCurriculum: () => {}, history: {version: 1, records: []}, onHistoryImport: async () => {}, architectureTrial: createElement('p', null, '独立无名蓝图试炼')}));
  assert.match(output, /你希望它每天替你做什么/);
  assert.equal((output.match(/<textarea/g) ?? []).length, 3);
  assert.match(output, /签订我的委托/);
  assert.match(output, /七匠盲试/);
  assert.match(output, /主线存档仍在行囊中导出/);
  assert.doesNotMatch(output, /邀请码|保证掌握|免费无限真实模型/);
});
