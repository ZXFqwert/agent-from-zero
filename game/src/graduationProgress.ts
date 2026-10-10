import {GRADUATION_CHECK_IDS, GRADUATION_PROJECT, GRADUATION_STAGES, type GraduationStageId} from './graduation/project';

export interface PersonalBrief {purpose: string; acceptance: string; toolBoundaries: string;}
export interface LocalExecutionReport {
  schema: 1; kind: 'local-execution-report'; projectId: string; projectVersion: string;
  createdAt: string; stageId: GraduationStageId;
  summary: {passed: number; failed: number; total: number};
  checks: Array<{id: string; status: 'passed' | 'failed'; message: string}>;
  scope: {provider: 'scripted-local'; realModelCalled: false; learnerImplementationSha256: string; briefSha256: string | null};
  limitations: string[];
}
export interface GraduationProgress {
  version: 1; projectVersion: string; brief: PersonalBrief;
  activeStage: GraduationStageId; reports: Partial<Record<GraduationStageId, LocalExecutionReport>>;
}
export const GRADUATION_PROGRESS_KEY = 'echo-graduation-workshop-v1';
export const MAX_REPORT_BYTES = 262_144;
export const MAX_PROGRESS_BYTES = 2_500_000;
const stageIds = new Set<string>(GRADUATION_STAGES.map(stage => stage.id));
const hash = /^[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const boundedString = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;

export const emptyGraduationProgress = (): GraduationProgress => ({version: 1, projectVersion: GRADUATION_PROJECT.version, brief: {purpose: '', acceptance: '', toolBoundaries: ''}, activeStage: 'context', reports: {}});

export function validatePersonalBrief(value: unknown): PersonalBrief {
  if (!object(value) || !exactKeys(value, ['purpose', 'acceptance', 'toolBoundaries']) || !['purpose', 'acceptance', 'toolBoundaries'].every(key => boundedString(value[key], 2000))) throw new Error('个人委托须包含用途、验收和工具边界，每项不超过2000字。');
  return {...value} as unknown as PersonalBrief;
}

export function validateLocalExecutionReport(value: unknown): LocalExecutionReport {
  if (!object(value) || !exactKeys(value, ['schema', 'kind', 'projectId', 'projectVersion', 'createdAt', 'stageId', 'summary', 'checks', 'scope', 'limitations'])) throw new Error('本机检查报告的字段不完整或包含未知字段。');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_REPORT_BYTES || value.schema !== 1 || value.kind !== 'local-execution-report' || value.projectId !== GRADUATION_PROJECT.id || value.projectVersion !== GRADUATION_PROJECT.version || typeof value.stageId !== 'string' || !stageIds.has(value.stageId)) throw new Error('这份报告不是当前毕业项目的兼容检查记录。');
  if (typeof value.createdAt !== 'string' || value.createdAt.length > 40 || !Number.isFinite(Date.parse(value.createdAt)) || !value.createdAt.endsWith('Z')) throw new Error('报告日期无效。');
  if (!object(value.summary) || !exactKeys(value.summary, ['passed', 'failed', 'total']) || ![value.summary.passed, value.summary.failed, value.summary.total].every(item => Number.isSafeInteger(item) && Number(item) >= 0) || !Array.isArray(value.checks) || value.checks.length < 1 || value.checks.length > 100 || value.summary.total !== value.checks.length) throw new Error('报告检查数量不一致。');
  const ids = new Set<string>();
  let passed = 0;
  for (const check of value.checks) {
    if (!object(check) || !exactKeys(check, ['id', 'status', 'message']) || typeof check.id !== 'string' || !GRADUATION_CHECK_IDS[value.stageId as GraduationStageId].includes(check.id) || ids.has(check.id) || !['passed', 'failed'].includes(String(check.status)) || !boundedString(check.message, 500)) throw new Error('报告中有无效、重复或未知的检查条目。');
    ids.add(check.id);
    if (check.status === 'passed') passed++;
  }
  if (ids.size !== GRADUATION_CHECK_IDS[value.stageId as GraduationStageId].length) throw new Error('报告没有包含本阶段的完整检查清单。');
  if (value.summary.passed !== passed || value.summary.failed !== value.checks.length - passed) throw new Error('报告摘要与实际条目不一致。');
  if (!object(value.scope) || !exactKeys(value.scope, ['provider', 'realModelCalled', 'learnerImplementationSha256', 'briefSha256']) || value.scope.provider !== 'scripted-local' || value.scope.realModelCalled !== false || typeof value.scope.learnerImplementationSha256 !== 'string' || !hash.test(value.scope.learnerImplementationSha256) || value.scope.briefSha256 !== null && (typeof value.scope.briefSha256 !== 'string' || !hash.test(value.scope.briefSha256))) throw new Error('报告来源或文件指纹不兼容。');
  if (!Array.isArray(value.limitations) || value.limitations.length < 1 || value.limitations.length > 6 || !value.limitations.every(item => boundedString(item, 500))) throw new Error('报告缺少来源说明。');
  return structuredClone(value) as unknown as LocalExecutionReport;
}

export function validateGraduationProgress(value: unknown): GraduationProgress {
  if (!object(value) || !exactKeys(value, ['version', 'projectVersion', 'brief', 'activeStage', 'reports']) || value.version !== 1 || value.projectVersion !== GRADUATION_PROJECT.version || typeof value.activeStage !== 'string' || !stageIds.has(value.activeStage) || !object(value.reports) || new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_PROGRESS_BYTES) throw new Error('学习工坊备份版本或内容不兼容。');
  const brief = validatePersonalBrief(value.brief), reports: GraduationProgress['reports'] = {};
  for (const [id, report] of Object.entries(value.reports)) {
    const checked = validateLocalExecutionReport(report);
    if (!stageIds.has(id) || checked.stageId !== id) throw new Error('检查报告没有放在对应阶段。');
    reports[id as GraduationStageId] = checked;
  }
  return {version: 1, projectVersion: GRADUATION_PROJECT.version, brief, activeStage: value.activeStage as GraduationStageId, reports};
}

/** Canonical brief bytes match the Python checker's sorted compact UTF-8 JSON. */
export function personalBriefJson(brief: PersonalBrief): string {
  const checked = validatePersonalBrief(brief);
  return JSON.stringify({acceptance: checked.acceptance, purpose: checked.purpose, toolBoundaries: checked.toolBoundaries});
}

export async function personalBriefFingerprint(brief: PersonalBrief): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(personalBriefJson(brief)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readGraduationProgress(): GraduationProgress {
  const raw = localStorage.getItem(GRADUATION_PROGRESS_KEY);
  return raw === null ? emptyGraduationProgress() : validateGraduationProgress(JSON.parse(raw));
}

export function writeGraduationProgress(progress: GraduationProgress): void {
  localStorage.setItem(GRADUATION_PROGRESS_KEY, JSON.stringify(validateGraduationProgress(progress)));
}
