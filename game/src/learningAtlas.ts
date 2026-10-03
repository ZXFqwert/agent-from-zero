import {validateGameState} from './engine';
import type {GameEvent, GameState, LearningEvidence, ScenarioDefinition} from './engine/types';
import {chapters, scenarios} from './content/scenarios';
import {mainScenarioIds} from './content/progression';
import {challengeTemplates} from './challenges/catalog';

export type AtlasLevel = 'unseen' | LearningEvidence['level'];
export type AtlasCapabilityId = 'tools' | 'schema' | 'loop' | 'context' | 'memory' | 'security' | 'team' | 'evaluation' | 'blueprint';
export interface AtlasEventSummary {
  id: string;
  sequence: number;
  type: GameEvent['type'];
  text: string;
  success?: boolean;
  delivered?: boolean;
  realm?: GameEvent['realm'];
  callId?: string;
  cost?: number;
}
export interface AtlasProof {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  sourceVersion: number;
  kernelVersion: GameState['kernelVersion'];
  sourceKind: ScenarioDefinition['kind'];
  level: LearningEvidence['level'];
  /** Saved evidence is preserved; legacy completion cannot claim a newer transfer contract. */
  originalLevel: LearningEvidence['level'];
  legacyCompletion: boolean;
  hintUsed: boolean;
  attempt: number;
  eventIds: string[];
  events: AtlasEventSummary[];
}
export interface AtlasConcept {
  concept: string;
  level: AtlasLevel;
  proofs: AtlasProof[];
}
export interface AtlasCounts {
  total: number;
  unseen: number;
  seen: number;
  guided: number;
  independentTransfer: number;
}
export interface AtlasChapter {
  chapter: number;
  title: string;
  description: string;
  concepts: AtlasConcept[];
  counts: AtlasCounts;
}
export interface AtlasCapabilitySource {
  scenarioId: string;
  title: string;
  hintUsed: boolean;
  victoryEventIds: string[];
  mechanisms: string[];
}
export interface AtlasCapability {
  id: AtlasCapabilityId;
  label: string;
  description: string;
  available: boolean;
  mechanisms: string[];
  sources: AtlasCapabilitySource[];
  practiceTemplateIds: string[];
}
export interface AtlasRevisit {
  templateId: string;
  label: string;
  decision: string;
  sourceScenarioId: string;
  sourceTitle: string;
  interveningMainWins: Array<{scenarioId: string; title: string}>;
}
export interface LearningAtlasData {
  chapters: AtlasChapter[];
  capabilities: AtlasCapability[];
  unlockedTemplateIds: string[];
  revisits: AtlasRevisit[];
  validSourceCount: number;
  completedSourceCount: number;
  ignoredRecordCount: number;
}

const levelOrder: Record<AtlasLevel, number> = {unseen: 0, seen: 1, guided: 2, 'independent-transfer': 3};
const sourceById = new Map(scenarios.map(source => [source.id, source]));
const mainIds = new Set(mainScenarioIds);
/** Reading groups only: these products share mechanisms and are not confined to one chapter. */
const blueprintReadingGroups: Readonly<Record<string, number>> = {
  'bp-codex-workbench': 6, 'bp-codex-approval': 6,
  'bp-claude-scout': 7, 'bp-claude-compaction': 4,
  'bp-openclaw-routing': 7, 'bp-openclaw-queue': 7,
  'bp-hermes-reuse': 5, 'bp-hermes-stale': 5,
  'bp-opencode-separation': 8, 'bp-opencode-migration': 8,
  'bp-pi-core': 3, 'bp-pi-extension': 6,
  'bp-dsh-composition': 8, 'bp-dsh-lifecycle': 8,
};
const readingGroup = (source: ScenarioDefinition): number | undefined => source.chapter >= 1 && source.chapter <= 8 ? source.chapter : blueprintReadingGroups[source.id];
interface ValidRecord {source: ScenarioDefinition; game: GameState; index: number;}

/** Every record is checked against the actual official source, never a caller's definition. */
function authorRecords(games: readonly GameState[]): {records: ValidRecord[]; ignored: number} {
  const records: ValidRecord[] = [];
  let ignored = 0;
  for (const [index, game] of games.entries()) {
    try {
      const source = sourceById.get(game.scenarioId);
      if (!source || !validateGameState(source, game)) {ignored++; continue;}
      records.push({source, game, index});
    } catch {ignored++;}
  }
  return {records, ignored};
}

/** This projection deliberately has no world, facts, hidden values, routes or model data. */
function summarizeEvent(event: GameEvent): AtlasEventSummary {
  return {
    id: event.id, sequence: event.sequence, type: event.type, text: [...event.text].slice(0, 180).join(''),
    ...(event.success === undefined ? {} : {success: event.success}),
    ...(event.delivered === undefined ? {} : {delivered: event.delivered}),
    ...(event.realm === undefined ? {} : {realm: event.realm}),
    ...(event.callId === undefined ? {} : {callId: event.callId}),
    ...(event.cost === undefined ? {} : {cost: event.cost}),
  };
}

function proofFor(record: ValidRecord, evidence: LearningEvidence): AtlasProof {
  const ids = new Set(evidence.eventIds);
  return {
    id: JSON.stringify([record.source.id, record.game.seed, record.game.attempt, evidence.level, record.game.hintUsed, evidence.eventIds]),
    scenarioId: record.source.id, scenarioTitle: record.source.title,
    sourceVersion: record.game.scenarioVersion, kernelVersion: record.game.kernelVersion, sourceKind: record.source.kind,
    level: record.game.kernelVersion === 1 && evidence.level === 'independent-transfer' ? 'guided' : evidence.level,
    originalLevel: evidence.level, legacyCompletion: record.game.kernelVersion === 1,
    hintUsed: record.game.hintUsed, attempt: record.game.attempt,
    eventIds: [...evidence.eventIds], events: record.game.events.filter(event => ids.has(event.id)).map(summarizeEvent),
  };
}

function chapterRows(records: readonly ValidRecord[]): AtlasChapter[] {
  return chapters.slice(0, 8).map(([title, description], index) => {
    const chapter = index + 1;
    const chapterSources = scenarios.filter(source => readingGroup(source) === chapter);
    const concepts = [...new Set(chapterSources.flatMap(source => source.concepts))].map(concept => {
      const proofs: AtlasProof[] = [], unique = new Set<string>();
      for (const record of records) {
        if (readingGroup(record.source) !== chapter) continue;
        const evidence = record.game.learningEvidence.find(item => item.concept === concept && item.scenarioId === record.source.id);
        if (!evidence) continue;
        const proof = proofFor(record, evidence);
        if (!unique.has(proof.id)) {unique.add(proof.id); proofs.push(proof);}
      }
      proofs.sort((left, right) => levelOrder[right.level] - levelOrder[left.level] || Number(left.hintUsed) - Number(right.hintUsed) || left.scenarioId.localeCompare(right.scenarioId, 'en'));
      return {concept, level: proofs[0]?.level ?? 'unseen', proofs} satisfies AtlasConcept;
    });
    const counts: AtlasCounts = {total: concepts.length, unseen: 0, seen: 0, guided: 0, independentTransfer: 0};
    for (const concept of concepts) {
      if (concept.level === 'independent-transfer') counts.independentTransfer++;
      else counts[concept.level]++;
    }
    // There is intentionally no chapter-level mastery grade.
    return {chapter, title, description, concepts, counts};
  });
}

/** Capabilities describe executable authored contracts, not rewards or knowledge grades. */
function mechanismsFor(source: ScenarioDefinition): Record<AtlasCapabilityId, string[]> {
  const result: Record<AtlasCapabilityId, string[]> = {tools: [], schema: [], loop: [], context: [], memory: [], security: [], team: [], evaluation: [], blueprint: []};
  if (source.observations.length) result.tools.push('观察工具');
  if (source.operations.length) result.tools.push('执行工具');
  if (source.goals.length) result.tools.push('状态复查');
  if (source.operations.some(operation => operation.protocol?.parameters.length)) result.schema.push('带类型和约束的参数');
  if (source.operations.some(operation => operation.protocol)) result.schema.push('请求与结果编号配对');
  if (source.operations.some(operation => operation.protocol?.delivery === 'deferred' || operation.protocol?.delivery === 'lost-once')) result.schema.push('延迟或丢失回执');
  if (source.operations.some(operation => operation.protocol?.delivery === 'lost-once')) result.schema.push('业务键与重复副作用');
  if (source.limits?.missionBudget !== undefined) result.loop.push('整趟有限预算');
  if (source.operations.some(operation => operation.retryWindow)) result.loop.push('有界重试窗口');
  if (source.hooks?.length) result.loop.push('行动之后的环境反馈');
  if (source.contextCapacity !== undefined && source.observations.some(observation => observation.document)) result.context.push('有限携带与显式装卷');
  if (source.observations.some(observation => observation.document?.summaries?.length)) result.context.push('摘要保留字段');
  if (source.operations.some(operation => operation.contextRequires || operation.contextMatches)) result.context.push('当前输入与执行前提');
  if (source.memory?.slots.length) result.memory.push('持久写入、修订与检索');
  if (source.memory?.skills.length) result.memory.push('保存流程与适用条件');
  if (source.operations.some(operation => operation.sessionRequires)) result.memory.push('会话快照与分支');
  if (source.blueprintLab?.memorySnapshot) result.memory.push('存储版本与启动快照');
  if (source.security?.principals.length) result.security.push('可信原件与岗位身份');
  if (source.operations.some(operation => operation.security?.approval)) result.security.push('单次请求审批');
  if (source.security?.sandbox) result.security.push('隔离域与现场');
  if (source.observations.some(observation => observation.directiveOperationId)) result.security.push('资料中的指令边界');
  if (source.blueprintLab?.roles?.some(role => role.rules.some(rule => rule.decision === 'ask'))) result.security.push('精确请求的三值权限');
  if (source.blueprintLab?.workspaceTargets?.length) result.security.push('工作区与授权分开');
  if (source.team) {
    result.team.push('伙伴岗位与私有输入', '有限任务队列与结果接回');
    if (source.team.jobs.some(job => job.inputJobIds?.length)) result.team.push('任务依赖');
    if (source.team.board.length) result.team.push('显式共享板');
    if (source.team.artifacts.length) result.team.push('版本草稿与冲突合并');
  }
  if (source.evaluation) result.evaluation.push('隔离案例与量测', '三态验收与覆盖', '封存版本与证书');
  if (source.blueprintLab) {
    if (source.blueprintLab.providers?.length) result.blueprint.push('提供方与接口适配');
    if (source.blueprintLab.roles?.length) result.blueprint.push('工作角色与有序规则');
    if (source.blueprintLab.messages?.length) result.blueprint.push('原始入口、会话路由与队列');
    if (source.blueprintLab.memorySnapshot) result.blueprint.push('启动快照的独立时点');
    if (source.blueprintLab.modules?.length) result.blueprint.push('模块依赖与接口版本');
    if (source.blueprintLab.modules?.some(module => module.kind === 'extension')) result.blueprint.push('扩展自身执行域与挂载');
    if (source.blueprintLab.modules?.some(module => module.kind === 'storage')) result.blueprint.push('持久提交与恢复');
  }
  return result;
}

const capabilityDescriptions: ReadonlyArray<{id: AtlasCapabilityId; label: string; description: string}> = [
  {id: 'tools', label: '观察、执行、复查', description: '用工具接触世界，再用实际状态检查交付。'},
  {id: 'schema', label: '法器参数与回执', description: '参数、调用编号和业务键有各自的作用。'},
  {id: 'loop', label: '反馈与有限回路', description: '让反馈改变下一步，为一趟行动保留有限资源。'},
  {id: 'context', label: '本轮携带的卷轴', description: '读取、检索、装卷和压缩是不同动作。'},
  {id: 'memory', label: '档案、流程与会话', description: '经验需要保存、检索，并重新核对适用条件。'},
  {id: 'security', label: '身份、契约与边界', description: '宿主授权、资料来源和执行域分别检查。'},
  {id: 'team', label: '伙伴协作', description: '伙伴依靠明确的岗位、输入、交接和版本工作。'},
  {id: 'evaluation', label: '试验与交付证据', description: '执行隔离案例，量测结果，再检查实际现场。'},
  {id: 'blueprint', label: '现实蓝图的宿主配置', description: '亲手比较接口、角色、路由、模块与存储的取舍。'},
];

/** Ordered records support a revisit suggestion only; order is never a learning grade. */
export function deriveLearningAtlas(games: readonly GameState[]): LearningAtlasData {
  const {records, ignored} = authorRecords(games);
  const firstWins = new Map<string, ValidRecord>();
  for (const record of records) if (record.game.status === 'won' && !firstWins.has(record.source.id)) firstWins.set(record.source.id, record);
  const unlockedTemplateIds = challengeTemplates.filter(template => firstWins.has(template.sourceScenarioId)).map(template => template.id);
  const unlocked = new Set(unlockedTemplateIds);
  const capabilities = capabilityDescriptions.map(description => {
    const sources: AtlasCapabilitySource[] = [];
    for (const source of scenarios) {
      const record = firstWins.get(source.id), mechanisms = mechanismsFor(source)[description.id];
      if (!record || !mechanisms.length) continue;
      sources.push({scenarioId: source.id, title: source.title, hintUsed: record.game.hintUsed, victoryEventIds: record.game.events.filter(event => event.type === 'victory').map(event => event.id), mechanisms});
    }
    return {
      ...description, available: sources.length > 0,
      mechanisms: [...new Set(sources.flatMap(source => source.mechanisms))], sources,
      practiceTemplateIds: challengeTemplates.filter(template => unlocked.has(template.id) && mechanismsFor(sourceById.get(template.sourceScenarioId)!)[description.id].length > 0).map(template => template.id),
    };
  });
  const revisits = challengeTemplates.flatMap(template => {
    const source = firstWins.get(template.sourceScenarioId);
    if (!source) return [];
    const later = [...firstWins.values()].filter(record => record.index > source.index && mainIds.has(record.source.id) && record.source.id !== source.source.id);
    if (later.length < 2) return [];
    return [{templateId: template.id, label: template.label, decision: template.decision, sourceScenarioId: source.source.id, sourceTitle: source.source.title, interveningMainWins: later.slice(0, 2).map(record => ({scenarioId: record.source.id, title: record.source.title}))}];
  }).slice(0, 3);
  return {
    chapters: chapterRows(records), capabilities, unlockedTemplateIds, revisits,
    validSourceCount: new Set(records.map(record => record.source.id)).size,
    completedSourceCount: firstWins.size, ignoredRecordCount: ignored,
  };
}
