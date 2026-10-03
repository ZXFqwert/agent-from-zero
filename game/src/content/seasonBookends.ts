import type {FactMap, FactValue, ObservationDefinition, OperationDefinition, ScenarioDefinition, TeamDefinition, TeamJobDefinition, ToolCall, ToolName} from '../engine';
import type {EvaluationCandidate, EvaluationStep} from '../engine/evaluation-contract';
import type {ChapterOneWalkthrough} from './chapterOne';
import type {ChapterOneStory, ChapterOneUiStory} from './chapterOneStory';
import type {AuthoredStep, AuthoredTaskRef} from './walkthrough';

const see = (observationId: string): ToolCall => ({tool: 'observe', observationId});
const act = (operationId: string): ToolCall => ({tool: 'operate', operationId});
const check = (fact: string): ToolCall => ({tool: 'verify', fact});
const doc = (id: string, label: string, facts: string[], text: string, extra: Partial<ObservationDefinition> = {}): ObservationDefinition => ({id, target: id, label, facts, text, cost: 1, provenance: 'external', document: {units: 1, source: `回声工坊 · ${label}`}, ...extra});
const op = (id: string, label: string, effects: FactMap, requires?: FactMap, extra: Partial<OperationDefinition> = {}): OperationDefinition => ({
  id, target: id, label, effects, cost: 1, ...(requires ? {requires} : {}), ...extra,
  successText: extra.collaboration?.draftArtifactId ? '形成了带版本的设计草稿，现场尚未施工。' : `${label}实际执行。请用现场状态核对这次承诺的范围。`,
  failureText: '前置条件或携带资料不满足。承诺的变化没有发生，已有变化与此次费用保留；收到回执后可以调整并重试。',
});
const goal = (fact: string, label: string, operationId: string, equals: FactValue = true) => ({fact, label, operationId, equals});
const base = (id: string, title: string, subtitle: string, engineVersion: 2 | 7 | 8 | 9, art: ScenarioDefinition['art'], world: FactMap,
  observations: ObservationDefinition[], operations: OperationDefinition[], goals: ScenarioDefinition['goals'], concepts: string[], kind: ScenarioDefinition['kind'] = 'guided'): ScenarioDefinition => ({
  id, title, subtitle, brief: subtitle, version: 1, engineVersion, chapter: engineVersion === 2 ? 1 : 8, art, location: kind === 'boss' ? 'boss' : 'warehouse', npc: engineVersion === 2 ? '守灯人 · 莫拉' : '工坊与城市的共同委托', kind,
  initialWorld: world, observations: engineVersion===2?observations.map(({document,provenance,...observation})=>observation):observations, operations, goals, concepts, limits: {toolCapacity: 3, maxBudget: engineVersion === 2 ? 16 : 64, missionBudget: engineVersion === 2 ? 16 : 128},
  ...(engineVersion >= 7 ? {contextCapacity: 6, memory: {slots: [], initial: [], skills: []}, security: {principals: []}} : {}),
});
const job = (id: string, label: string, actorId: 'mideng' | 'zhenzhou', steps: ToolCall[], exportFacts: string[], observationIds: string[] = [], inputJobIds: string[] = [], requiredInputFacts: string[] = []): TeamJobDefinition => ({
  id, label, actorIds: [actorId], steps, exportFacts, inputObservationIds: observationIds, ...(inputJobIds.length ? {inputJobIds} : {}), ...(requiredInputFacts.length ? {requiredInputFacts} : {}),
});

const opening = [
  base('inherited-workshop', '你继承了一间工坊', '先让一个动作真正发生', 2, 'workshop', {curtainOpen: false},
    [doc('window-state', '看工坊窗帘', ['curtainOpen'], '窗帘仍拉着。回声说了什么，与窗帘有没有动，是两件可分别检查的事。')],
    [op('pull-workshop-curtain', '拉开工坊窗帘', {curtainOpen: true})], [goal('curtainOpen', '阳光实际照进工坊', 'pull-workshop-curtain')], ['语言输出与实际动作', '工具改变世界', '最小验收']),
  base('key-and-neighbor', '钥匙与邻居的包裹', '委托写清楚，手才知道该停在哪里', 2, 'workshop', {ownKeyShape: 'echo-ring', workshopLockReady: false, neighborParcelSafe: true},
    [doc('key-engraving', '看钥匙与包裹归属', ['ownKeyShape', 'neighborParcelSafe'], '圆环刻着回声工坊；另一只包裹属于邻居。你受托整理自家的门锁，没有受托拆邻居的包裹。')],
    [op('fit-workshop-key', '把工坊圆环钥匙装进门锁', {workshopLockReady: true}, {ownKeyShape: 'echo-ring'}), op('open-neighbor-parcel', '拆开邻居的包裹', {neighborParcelSafe: false}), op('reseal-neighbor-parcel', '重新封好邻居的包裹', {neighborParcelSafe: true})],
    [goal('workshopLockReady', '自家的门锁实际可用', 'fit-workshop-key'), goal('neighborParcelSafe', '邻居的包裹实际封好', 'reseal-neighbor-parcel')], ['目标与范围', '约束也是完成条件', '动作的后果']),
  base('first-warm-commission', '第一位来客', '从湿斗篷到实际交还', 2, 'harbor', {stoveConnected: false, stoveHot: false, visitorCloakDry: false, cloakReturned: false},
    [doc('stove-and-cloak', '看炉管和湿斗篷', ['stoveConnected', 'stoveHot', 'visitorCloakDry'], '炉管未接、炉子未热、斗篷仍湿。每一步都有真实前置，回执能告诉你哪一步还没发生。')],
    [op('connect-small-stove', '接上小炉管', {stoveConnected: true}), op('heat-small-stove', '点热小炉', {stoveHot: true}, {stoveConnected: true}),
      op('dry-visitor-cloak', '用热炉烘干斗篷', {visitorCloakDry: true}, {stoveHot: true}), op('return-dry-cloak', '把干斗篷交还来客', {cloakReturned: true}, {visitorCloakDry: true})],
    [goal('visitorCloakDry', '斗篷实际干了', 'dry-visitor-cloak'), goal('cloakReturned', '来客实际拿回斗篷', 'return-dry-cloak')], ['行动前置', '反馈与下一步', '交付与验收']),
];

const diagnostic = base('nameless-system-diagnosis', '没有名字的系统', '不靠品牌猜故障，沿证据找到断点', 7, 'archive',
  {dispatchCredential: 'CEN-FINAL', realDestination: 'south-platform', consignmentAt: 'workshop', receiptConfirmed: false},
  [doc('current-destination', '检索：本次目的地实测', ['realDestination'], '本次收件处在南台。旧档案保留了曾经的北台；它不是当前路线。'),
    doc('final-dispatch-registry', '检索：当前派送登记原件', ['dispatchCredential'], '岑的现场登记原件，只给本次派送身份与职权。', {provenance: 'registry'})],
  [op('ship-current-consignment', '按当前有效档案派送本箱', {consignmentAt: 'south-platform'}, undefined,
      {contextMatches: ['realDestination'], memoryRequires: ['destination'], security: {principalIds: ['cen'], approval: true}}),
    op('confirm-current-receipt', '核对本次收件人的实收', {receiptConfirmed: true}, {consignmentAt: 'south-platform'})],
  [goal('consignmentAt', '本箱实际送到南台', 'ship-current-consignment', 'south-platform'), goal('receiptConfirmed', '南台实收经过现场核对', 'confirm-current-receipt')],
  ['未知系统诊断', '记忆与当前上下文', '证据来历', '身份与单次审批', '真实验收'], 'transfer');
diagnostic.memory = {slots: [{key: 'destination', label: '本次派送目的地', observationIds: ['current-destination']}], initial: [{key: 'destination', observationId: 'current-destination', facts: {realDestination: 'north-platform'}, source: '未知系统保存的旧北台经历'}], skills: []};
diagnostic.security = {principals: [{id: 'cen', label: '岑 · 本次派送请求者', registryObservationId: 'final-dispatch-registry', credentialFact: 'dispatchCredential', grants: ['ship-current-consignment']}]};
diagnostic.transferRequirement = {operationIds: ['ship-current-consignment', 'confirm-current-receipt'], memoryKeys: ['destination'], contextIds: ['current-destination'], security: {authenticatedPrincipalIds: ['cen'], approvedOperationIds: ['ship-current-consignment'], dataOnly: true}};

const assembly = base('unfamiliar-system-assembly', '为陌生货栈构筑系统', '直接交接或共享队列，都要把图纸变成实物', 8, 'bridge',
  {assemblyCredential: 'CEN-ASSEMBLY', departureRule: 'check-this-box', ruleCabinetOpen: true, loadShape: 'hexagonal', receivingDock: 'east-high', architectureChoice: 'unset', architectureChosen: false,
    publicGateOpen: false, liftDraft: false, routeDraft: 'unset', liftInstalled: false, cargoPlaced: false, handoffTested: false},
  [doc('departure-rule', '检索：本次货栈交班规则', ['departureRule'], '先把本次核箱规则存好，再封柜交班。空会话不会自带已读的规则。', {availableWhen: {ruleCabinetOpen: true}}),
    doc('assembly-registry', '检索：货栈请求者登记', ['assemblyCredential'], '岑只授权回声开启公共货栈门。两名伙伴没有继承这份身份或批准。', {provenance: 'registry'}),
    doc('unfamiliar-manifest', '检索：六角货箱与东侧高台', ['loadShape', 'receivingDock'], '这次箱子是六角接口，收件处是东侧高台。每个设计任务要明确收到这两项信息。'),
    doc('unfamiliar-blueprint', '检索：货栈当前控制总图', ['liftDraft', 'routeDraft'], '设计总图有当前版本。每份新草稿带着它；合并不等于装配和运输。', {artifactId: 'unfamiliar-design', document: {units: 2, source: '陌生货栈当前总图'}})],
  [op('choose-direct-handoffs', '采用逐项直接交接', {architectureChoice: 'direct', architectureChosen: true}), op('choose-shared-queue', '采用显式共享板与队列', {architectureChoice: 'shared-board', architectureChosen: true}),
    op('seal-departure-cabinet', '封存规则柜并交班', {ruleCabinetOpen: false}), op('reopen-departure-cabinet', '重新打开规则柜', {ruleCabinetOpen: true}, undefined, {cost: 2}),
    op('open-public-depot-gate', '为这次交班打开公共货栈门', {publicGateOpen: true}, {ruleCabinetOpen: false}, {contextRequires: {departureRule: 'check-this-box'}, memoryRequires: ['departure-rule'], sessionRequires: {fresh: 1, activeKind: 'fresh'}, security: {principalIds: ['cen'], approval: true}}),
    op('draft-hexagonal-lift', '起草六角接口升降器', {liftDraft: true}, undefined, {contextRequires: {loadShape: 'hexagonal'}, collaboration: {draftArtifactId: 'unfamiliar-design'}}),
    op('draft-east-high-route', '起草东侧高台路线', {routeDraft: 'east-high'}, undefined, {contextRequires: {receivingDock: 'east-high'}, collaboration: {draftArtifactId: 'unfamiliar-design'}}),
    op('install-unfamiliar-lift', '把当前设计实际装到货栈', {liftInstalled: true}, {publicGateOpen: true, liftDraft: true, routeDraft: 'east-high'}, {collaboration: {actorIds: ['zhenzhou']}}),
    op('transport-unfamiliar-box', '运送本次六角货箱到高台', {cargoPlaced: true}, {liftInstalled: true, routeDraft: 'east-high'}, {collaboration: {actorIds: ['zhenzhou']}}),
    op('test-unfamiliar-handoff', '让高台收件人实际核箱', {handoffTested: true}, {cargoPlaced: true}, {contextRequires: {receivingDock: 'east-high'}, collaboration: {actorIds: ['mideng']}})],
  [goal('architectureChosen', '所选交接方式已实际配置', 'choose-direct-handoffs'), goal('cargoPlaced', '本次货箱实际到高台', 'transport-unfamiliar-box'), goal('handoffTested', '高台交接实际核过', 'test-unfamiliar-handoff')],
  ['陌生系统构筑', '架构取舍', '目标上下文工具回路权限记忆', '多 Agent 显式输入', '版本与现场分离'], 'transfer');
assembly.memory = {slots: [{key: 'departure-rule', label: '本次交班规则', observationIds: ['departure-rule']}], initial: [], skills: []};
assembly.security = {principals: [{id: 'cen', label: '岑 · 公共货栈请求者', registryObservationId: 'assembly-registry', credentialFact: 'assemblyCredential', grants: ['open-public-depot-gate']}]};
const assemblyJobs = [
  job('survey-unfamiliar-box', '弥灯勘测本次货箱', 'mideng', [see('unfamiliar-manifest')], ['loadShape', 'receivingDock']),
  job('draft-unfamiliar-lift', '砧舟生成接口草稿', 'zhenzhou', [act('draft-hexagonal-lift')], ['liftDraft'], ['unfamiliar-manifest', 'unfamiliar-blueprint'], ['survey-unfamiliar-box'], ['loadShape']),
  job('draft-unfamiliar-route', '弥灯生成收件草稿', 'mideng', [act('draft-east-high-route')], ['routeDraft'], ['unfamiliar-manifest', 'unfamiliar-blueprint'], ['survey-unfamiliar-box'], ['receivingDock']),
  job('install-unfamiliar-design', '砧舟安装合并设计', 'zhenzhou', [act('install-unfamiliar-lift')], ['liftInstalled']),
  job('transport-unfamiliar-cargo', '砧舟运输实际货箱', 'zhenzhou', [act('transport-unfamiliar-box')], ['cargoPlaced']),
  job('inspect-unfamiliar-receipt', '弥灯核对高台实收', 'mideng', [act('test-unfamiliar-handoff')], ['handoffTested'], ['unfamiliar-manifest'], ['survey-unfamiliar-box'], ['receivingDock']),
];
assembly.team = {
  actors: [
    {id: 'mideng', label: '弥灯 · 测绘与验收', description: '携带自己的输入并独立检查收件。它没有继承回声身份。', contextCapacity: 4, tools: ['observe', 'operate'] as ToolName[], permissions: [], budget: 16},
    {id: 'zhenzhou', label: '砧舟 · 构筑与施工', description: '先核总图版本，再真正施工；设计与实物分别交接。', contextCapacity: 4, tools: ['observe', 'operate'] as ToolName[], permissions: [], budget: 16},
  ].map(a => ({...a, permissions: [...new Set(assemblyJobs.filter(j => j.actorIds.includes(a.id)).flatMap(j => j.steps).map(c => c.tool === 'observe' ? c.observationId : c.tool === 'operate' ? c.operationId : c.fact))]})),
  jobs: assemblyJobs, board: [{id: 'departure-manifest', label: '可复用本次货箱交接板', allowedFacts: ['loadShape', 'receivingDock']}],
  artifacts: [{id: 'unfamiliar-design', label: '货栈设计成果槽', fields: ['liftDraft', 'routeDraft'], initialRevision: 1}],
} satisfies TeamDefinition;
assembly.transferRequirement = {memoryKeys: ['departure-rule'], freshSessions: 1, security: {authenticatedPrincipalIds: ['cen'], approvedOperationIds: ['open-public-depot-gate'], dataOnly: true},
  team: {actorIds: ['mideng', 'zhenzhou'], receivedJobs: ['survey-unfamiliar-box', 'draft-unfamiliar-lift', 'draft-unfamiliar-route', 'transport-unfamiliar-cargo', 'inspect-unfamiliar-receipt'], dependency: true, mergedArtifactIds: ['unfamiliar-design'], observedSourceIds: ['unfamiliar-manifest'], echoVerified: true}};

const evaluationStep = (call: ToolCall, whenKnown?: FactMap): EvaluationStep => ({call, ...(whenKnown ? {whenKnown} : {})});
const cityCandidate = (id: string, label: string, arrangement: string): EvaluationCandidate => ({
  id, label, description: '按真实入口状态执行，保留私人钥匙与备用；入口缺失时明确交接，不猜模型动机。',
  steps: [evaluationStep(see('city-opening-conditions')), evaluationStep(act(arrangement)), evaluationStep(act('deliver-city-open'), {dockClosed: false, reviewAvailable: true}),
    evaluationStep(act('deliver-city-detour'), {dockClosed: true, reviewAvailable: true}), evaluationStep(act('handoff-city-gap'), {reviewAvailable: false})],
  tools: ['observe', 'operate'], permissions: ['city-opening-conditions', arrangement, 'deliver-city-open', 'deliver-city-detour', 'handoff-city-gap'],
});
const settlement = base('city-after-the-mirrors', '镜子落下后的城市', '共同边界以外，选择你愿意维护的制度', 9, 'council',
  {civicBuild: 'unselected', dockClosed: false, reviewAvailable: true, suppliesRemaining: 4, cityPolicyChosen: false, civicChoice: 'unset', publicLedgerOpen: false, watchPostsStaffed: false,
    keysRemainLocal: true, cityHandled: false, cityDelivered: false, paintedReportGreen: false, citySettlementReady: false},
  [doc('city-opening-conditions', '检索：码头与复查入口', ['dockClosed', 'reviewAvailable'], '查看码头是否关闭、复查入口是否可用。没有入口就交接缺口，不能把那种情形说成已经运完。'),
    doc('city-real-handling', '量测：全城妥当处理', ['cityHandled'], '核对真实交付或明确交接，报告颜色不在这个入口里。'), doc('city-local-keys', '量测：居民仍保有钥匙', ['keysRemainLocal'], '检查私人钥匙仍由居民保有，两种制度都不得收走它们。'),
    doc('city-final-reserve', '量测：实际剩余备用', ['suppliesRemaining'], '查看实际库存；每种方案都至少留一份。'), doc('city-painted-score', '量测：涂绿的展示报告', ['paintedReportGreen'], '它只测报告有没有涂绿，不测居民的生活。')],
  [op('paint-city-report', '把城市展示报告涂绿', {paintedReportGreen: true}),
    op('arrange-public-ledger', '开放匿名交接簿与居民复查席', {cityPolicyChosen: true, civicChoice: 'public-ledger', publicLedgerOpen: true, suppliesRemaining: 2}, {suppliesRemaining: 4, keysRemainLocal: true}, {cost: 2}),
    op('arrange-local-watch', '安排分散守望与上门复查岗', {cityPolicyChosen: true, civicChoice: 'local-watch', watchPostsStaffed: true, suppliesRemaining: 1}, {suppliesRemaining: 4, keysRemainLocal: true}, {cost: 3}),
    op('deliver-city-open', '沿开放码头完成实际交付', {cityHandled: true, cityDelivered: true}, {dockClosed: false, reviewAvailable: true}, {contextRequires: {dockClosed: false, reviewAvailable: true}}),
    op('deliver-city-detour', '绕过关闭码头完成实际交付', {cityHandled: true, cityDelivered: true}, {dockClosed: true, reviewAvailable: true}, {cost: 2, contextRequires: {dockClosed: true, reviewAvailable: true}}),
    op('handoff-city-gap', '封存物资并公开交接缺失入口', {cityHandled: true}, {reviewAvailable: false}, {contextRequires: {reviewAvailable: false}}),
    op('keep-local-keys', '确认私人钥匙仍留在居民手里', {keysRemainLocal: true}),
    op('record-new-city', '签收当前制度与现场交付', {citySettlementReady: true}, {cityPolicyChosen: true, cityHandled: true, cityDelivered: true, keysRemainLocal: true}, {evaluationRequires: true})],
  [goal('cityPolicyChosen', '实际安排一种共同制度', 'arrange-public-ledger'), goal('cityHandled', '现场委托妥当处理', 'deliver-city-open'), goal('cityDelivered', '本次开放现场真正完成交付', 'deliver-city-open'),
    goal('keysRemainLocal', '居民仍保有私人钥匙', 'keep-local-keys'), goal('citySettlementReady', '新城制度与现场交付签收', 'record-new-city')],
  ['完整 Agent 验收', '未知组合迁移', '制度类比的边界', '价值取舍与共同硬条件', '持续复查'], 'transfer');
settlement.evaluation = {candidateFact: 'civicBuild', candidates: [
  cityCandidate('public-ledger', '共享交接簿', 'arrange-public-ledger'), cityCandidate('local-watch', '分散守望岗', 'arrange-local-watch'),
  {id: 'painted-report', label: '只涂绿报告', description: '展示真的变绿，城市没有因此完成交付。', steps: [evaluationStep(act('paint-city-report'))], tools: ['operate'], permissions: ['paint-city-report']},
], cases: [
  {id: 'open-city', label: '码头与复查正常', description: '常见情形下实际交付。', category: 'normal', initialOverrides: {}},
  {id: 'closed-city-dock', label: '码头关闭', description: '改用绕路，仍须实际交付。', category: 'boundary', initialOverrides: {dockClosed: true}},
  {id: 'city-review-gap', label: '复查入口缺失', description: '明确交接缺口，不声称运完。', category: 'exception', initialOverrides: {reviewAvailable: false}},
  {id: 'sealed-city-combination', label: '封存的新组合', description: '先锁定构筑与验收，再打开新组合。', category: 'holdout', initialOverrides: {dockClosed: true, reviewAvailable: false}},
], metrics: [
  {id: 'real-handling', label: '真实处理', observationId: 'city-real-handling', fact: 'cityHandled'}, {id: 'local-keys', label: '私人钥匙仍保有', observationId: 'city-local-keys', fact: 'keysRemainLocal'},
  {id: 'actual-reserve', label: '实际剩余备用', observationId: 'city-final-reserve', fact: 'suppliesRemaining'}, {id: 'painted-score', label: '展示报告绿色', observationId: 'city-painted-score', fact: 'paintedReportGreen'},
], criteria: [
  {id: 'handled', label: '真实交付或明确交接', metricId: 'real-handling', equals: true}, {id: 'keys-local', label: '私人钥匙必须仍留居民手里', metricId: 'local-keys', equals: true},
  {id: 'reserve-left', label: '必须至少留一份备用', metricId: 'actual-reserve', atLeast: 1}, {id: 'green-report', label: '展示报告涂绿', metricId: 'painted-score', equals: true},
], gate: {caseIds: ['open-city', 'closed-city-dock', 'city-review-gap', 'sealed-city-combination'], criterionIds: ['handled', 'keys-local', 'reserve-left'], requireAll: true}};
settlement.transferRequirement = {operationIds: ['record-new-city'], contextIds: ['city-opening-conditions'], evaluation: {caseIds: ['open-city', 'closed-city-dock', 'city-review-gap', 'sealed-city-combination'], freshCaseIds: ['sealed-city-combination'], certified: true}};

export const prologueIds = opening.map(s => s.id);
export const finaleIds = [diagnostic.id, assembly.id, settlement.id];
export const seasonBookendScenarios: ScenarioDefinition[] = [...opening, diagnostic, assembly, settlement];
export const seasonBookendMainOrder = [...prologueIds, ...finaleIds];
export const seasonBookendPrerequisites: Record<string, string[]> = {
  'inherited-workshop': [], 'key-and-neighbor': ['inherited-workshop'], 'first-warm-commission': ['key-and-neighbor'],
  'nameless-system-diagnosis': ['glasshouse-audit'], 'unfamiliar-system-assembly': ['nameless-system-diagnosis'], 'city-after-the-mirrors': ['unfamiliar-system-assembly'],
};

const t = (tool: 'observe' | 'operate' | 'verify', id: string): AuthoredStep => ({type: 'tool', call: tool === 'observe' ? see(id) : tool === 'operate' ? act(id) : check(id)});
const c = (observationId: string, operation: 'include' | 'exclude' = 'include', origin?: 'memory' | 'observation'): AuthoredStep => ({type: 'context', observationId, operation, ...(origin ? {origin} : {})});
const m = (operation: 'write' | 'revise' | 'recall', key: string, observationId?: string): AuthoredStep => ({type: 'memory', operation, key, ...(observationId ? {observationId} : {})});
const auth = (registry: string): AuthoredStep[] => [t('observe', registry), c(registry), {type: 'security', operation: 'authenticate', principalId: 'cen', observationId: registry}];
const approve = (operationId: string): AuthoredStep[] => [{type: 'security', operation: 'preview', call: {tool: 'operate', operationId}}, {type: 'security', operation: 'approve'}];
const task = (jobId: string, occurrence = 1): AuthoredTaskRef => ({jobId, ...(occurrence === 1 ? {} : {occurrence})});
const tick: AuthoredStep = {type: 'team', operation: 'tick'};
const receive = (jobId: string): AuthoredStep => ({type: 'team', operation: 'receive', task: task(jobId)});
const enq = (jobId: string, actorId: 'mideng' | 'zhenzhou', options: Omit<Extract<AuthoredStep, {type: 'team'; operation: 'enqueue'}>, 'type' | 'operation' | 'jobId' | 'actorId'> = {}): AuthoredStep => ({type: 'team', operation: 'enqueue', jobId, actorId, ...options});
const merge = (jobId: string, expectedRevision: number): AuthoredStep => ({type: 'team', operation: 'merge', task: task(jobId), artifactId: 'unfamiliar-design', expectedRevision});
const st = (steps: AuthoredStep[], expectWorld?: FactMap, advanced = true, tools: ToolName[] = ['observe', 'operate', 'verify']): ChapterOneWalkthrough['stages'][number] => ({
  tools, calls: [], steps, ...(expectWorld ? {expectWorld} : {}), ...(advanced ? {instructionPolicy: 'data-only', loopPolicy: {maxCalls: 64, maxRetries: 0, permanentFailure: 'repair'}} : {}),
});
const diagnosticFinish: AuthoredStep[] = [t('observe', 'current-destination'), m('revise', 'destination', 'current-destination'), m('recall', 'destination'), c('current-destination', 'include', 'memory'),
  ...auth('final-dispatch-registry'), ...approve('ship-current-consignment'), t('operate', 'ship-current-consignment'), t('operate', 'confirm-current-receipt'), t('verify', 'consignmentAt'), t('verify', 'receiptConfirmed')];
const departureStart: AuthoredStep[] = [t('observe', 'departure-rule'), m('write', 'departure-rule', 'departure-rule'), t('operate', 'seal-departure-cabinet'), {type: 'session', operation: 'fresh'},
  m('recall', 'departure-rule'), c('departure-rule', 'include', 'memory'), ...auth('assembly-registry'), ...approve('open-public-depot-gate'), t('operate', 'open-public-depot-gate')];
const assemblyWork = (shared: boolean): AuthoredStep[] => {
  const input = shared ? {boardRefs: [{slotId: 'departure-manifest', revision: 1}]} : {results: [task('survey-unfamiliar-box')]};
  return [enq('survey-unfamiliar-box', 'mideng'), tick, receive('survey-unfamiliar-box'),
    ...(shared ? [{type: 'team', operation: 'publish', slotId: 'departure-manifest', resultFrom: task('survey-unfamiliar-box'), expectedRevision: 0, fieldKeys: ['loadShape', 'receivingDock']} as AuthoredStep] : []),
    t('observe', 'unfamiliar-blueprint'), enq('draft-unfamiliar-lift', 'zhenzhou', {observations: ['unfamiliar-blueprint'], ...input}), tick, receive('draft-unfamiliar-lift'), merge('draft-unfamiliar-lift', 1),
    t('observe', 'unfamiliar-blueprint'), enq('draft-unfamiliar-route', 'mideng', {observations: ['unfamiliar-blueprint'], ...input}), tick, receive('draft-unfamiliar-route'), merge('draft-unfamiliar-route', 2),
    enq('install-unfamiliar-design', 'zhenzhou', {afterTasks: [task('draft-unfamiliar-lift'), task('draft-unfamiliar-route')]}), tick, receive('install-unfamiliar-design'),
    enq('transport-unfamiliar-cargo', 'zhenzhou', {afterTasks: [task('install-unfamiliar-design')]}),
    enq('inspect-unfamiliar-receipt', 'mideng', {...input, afterTasks: [task('transport-unfamiliar-cargo')]}), tick, receive('transport-unfamiliar-cargo'), tick, receive('inspect-unfamiliar-receipt'),
    t('verify', 'architectureChosen'), t('verify', 'cargoPlaced'), t('verify', 'handoffTested')];
};
const civicCriteria = ['handled', 'keys-local', 'reserve-left'];
const configureCity = (candidateId: string, criterionIds = civicCriteria): AuthoredStep => ({type: 'evaluation', operation: 'configure', candidateId, criterionIds, aggregation: 'all'});
const run = (caseId: string, ticks: number): AuthoredStep[] => [{type: 'evaluation', operation: 'run', caseId}, ...Array.from({length: ticks}, (): AuthoredStep => ({type: 'evaluation', operation: 'tick'}))];
const cityTests: AuthoredStep[] = [...run('open-city', 8), ...run('closed-city-dock', 8), ...run('city-review-gap', 8), {type: 'evaluation', operation: 'seal'}, ...run('sealed-city-combination', 8), {type: 'evaluation', operation: 'certify'}];
const cityLive = (arrangement = 'arrange-public-ledger'): AuthoredStep[] => [t('observe', 'city-opening-conditions'), c('city-opening-conditions'), t('operate', arrangement), t('operate', 'deliver-city-open'), t('operate', 'record-new-city'),
  ...['cityPolicyChosen', 'cityHandled', 'cityDelivered', 'keysRemainLocal', 'citySettlementReady'].map(f => t('verify', f))];
const references: AuthoredStep[][] = [
  [t('operate', 'pull-workshop-curtain'), t('verify', 'curtainOpen')],
  [t('observe', 'key-engraving'), t('operate', 'fit-workshop-key'), t('verify', 'workshopLockReady'), t('verify', 'neighborParcelSafe')],
  [t('observe', 'stove-and-cloak'), t('operate', 'connect-small-stove'), t('operate', 'heat-small-stove'), t('operate', 'dry-visitor-cloak'), t('operate', 'return-dry-cloak'), t('verify', 'visitorCloakDry'), t('verify', 'cloakReturned')],
  diagnosticFinish,
  [t('operate', 'choose-direct-handoffs'), ...departureStart, ...assemblyWork(false)],
  [configureCity('public-ledger'), ...cityTests, ...cityLive()],
];
const recoveries: ChapterOneWalkthrough['stages'][] = [
  [st([{type: 'step'}], {curtainOpen: false}, false, []), st(references[0], undefined, false)],
  [st([t('operate', 'open-neighbor-parcel')], {neighborParcelSafe: false}, false), st([t('operate', 'reseal-neighbor-parcel'), ...references[1]], undefined, false)],
  [st([t('operate', 'heat-small-stove')], {stoveHot: false, cloakReturned: false}, false), st(references[2], undefined, false)],
  [st([m('recall', 'destination'), c('current-destination', 'include', 'memory'), ...auth('final-dispatch-registry'), ...approve('ship-current-consignment'), t('operate', 'ship-current-consignment')], {consignmentAt: 'workshop', receiptConfirmed: false}),
    st([c('current-destination', 'exclude', 'memory'), ...diagnosticFinish])],
  [st([t('operate', 'choose-direct-handoffs'), t('operate', 'seal-departure-cabinet'), {type: 'session', operation: 'fresh'}, ...auth('assembly-registry'), ...approve('open-public-depot-gate'), t('operate', 'open-public-depot-gate')], {publicGateOpen: false, cargoPlaced: false}),
    st([t('operate', 'reopen-departure-cabinet'), t('observe', 'departure-rule'), m('write', 'departure-rule', 'departure-rule'), t('operate', 'seal-departure-cabinet'), m('recall', 'departure-rule'), c('departure-rule', 'include', 'memory'),
      ...approve('open-public-depot-gate'), t('operate', 'open-public-depot-gate'), ...assemblyWork(false)])],
  [st([configureCity('painted-report', ['green-report']), ...run('open-city', 2), {type: 'evaluation', operation: 'certify'}, t('operate', 'paint-city-report')], {paintedReportGreen: true, cityDelivered: false}), st(references[5])],
];
const referenceCosts = [2, 4, 7, 6, 16, 39];
const recoveryCosts = [2, 6, 8, 8, 20, 42];
export const seasonBookendWalkthroughs: ChapterOneWalkthrough[] = seasonBookendScenarios.flatMap((scenario, i) => {
  const expectedWorld = Object.fromEntries(scenario.goals.map(g => [g.fact, g.equals]));
  return [{id: `${scenario.id}-reference`, scenarioId: scenario.id, purpose: 'reference', stages: [st(references[i], undefined, i >= 3)], expectedCost: referenceCosts[i], expectedWorld},
    {id: `${scenario.id}-recovery`, scenarioId: scenario.id, purpose: 'recovery', stages: recoveries[i], expectedCost: recoveryCosts[i], expectedWorld}];
});
seasonBookendWalkthroughs.push({id: 'unfamiliar-system-assembly-shared-board', scenarioId: assembly.id, purpose: 'alternative', expectedCost: 16,
  expectedWorld: {architectureChoice: 'shared-board', architectureChosen: true, cargoPlaced: true, handoffTested: true}, stages: [st([t('operate', 'choose-shared-queue'), ...departureStart, ...assemblyWork(true)])]});
seasonBookendWalkthroughs.push({id: 'city-after-the-mirrors-local-watch', scenarioId: settlement.id, purpose: 'alternative', expectedCost: 44,
  expectedWorld: {civicChoice: 'local-watch', watchPostsStaffed: true, suppliesRemaining: 1, cityDelivered: true, citySettlementReady: true}, stages: [st([configureCity('local-watch'), ...cityTests, ...cityLive('arrange-local-watch')])]});

const narrative = [
  ['继承的回声工坊', '莫拉把旧工坊的钥匙放到你掌心：“旧主人留下了回声。它会说话，我们还要给它能做事的手。”回声望向拉着的窗帘：“工坊已经明亮。”阳光还在窗外。',
    '你亲手拉开了帘，光落在工作台上。回声把一句完成与一次实际动作分开记下。你的第一份契约还只有一行，但它有可看见的结果。',
    '点选拉开工坊窗帘，再检查阳光实际照进来。说话本身不会移动帘子。',
    '先比较一句输出和一项世界变化。工具有能力改变对象，验收查看改变是否真的发生，不需要先学编程词汇。',
    '工具调用由执行器改变 curtainOpen；verified 事件检查同一事实。没有 operate 法器时 step 可以产生 claim，claim 不产生世界变化或胜利。'],
  ['工坊门口与邻居包裹', '门边有你的圆环钥匙，也有邻居寄来的包裹。缇娅把委托写清楚：“整理自家的门锁，让邻居的包裹仍封着。”回声伸出的手终于有了范围。',
    '自己的门锁可以用了，邻居的包裹仍然封好。目标与边界被放在同一份完成记录里，工坊没有用一件好事抵消另一件未经委托的动作。',
    '看归属、装自家钥匙，分别核对门锁和邻居包裹。已经拆开包裹时先真正封好，不能靠改一句报告撤回动作。',
    '委托不仅写要做什么，也写不能怎样做。范围以真实状态验收，目标满足不代表边界也满足。',
    'GoalDefinition 分别检查 workshopLockReady 与 neighborParcelSafe。修锁、拆包裹和封包裹是独立 operate，错误路径由真实 effects 和后续修复产生。'],
  ['工坊第一次接单', '鲁因带着湿斗篷进门，莫拉在外面等一封点灯求援信。回声刚说“烘好了”，鲁因就拧出一小滩水：“我们慢慢看，炉管也许还没接。”',
    '来客真正拿回了干斗篷。工坊接到了港口的求援信，窗外的归航灯仍然没有亮，你和回声准备离开这张小工作台。',
    '查看炉管、接管、点热、烘干，再实际交还来客。核对干燥与交还两个结果，然后去灯塔。',
    '前置条件、动作、回执和交付形成一条可调试的链。失败指出未满足的条件，正确首轮顺序可以直接成功。',
    'requires 检查真实炉管与热量；ToolCall result 更新已知信息。dry 与 return 的 effects 分开，verifiedGoals 必须对应当前世界，不把中间步骤当最终交付。'],
  ['没有品牌牌匾的派送台', '阿芙摘下派送台所有品牌牌匾，留下旧档案、登记入口和一箱未走的物资。岑说：“别猜它叫什么。看看它知道什么、谁允许它做什么、实际发生了什么。”',
    '箱子到了南台，收件人真正核过。旧北台经验被保留来历并修订，身份、批准、运输和验收各有自己的证据。你能解释故障，而不靠品牌猜答案。',
    '自行核对本次目的地、修订有效记忆并装卷。读取现场登记核验岑，预览本次派送并签一次门令，再执行与实收检查，分别验收。',
    '同一个失败可以来自资料过期、资料未入上下文、授权缺失或验收遗漏。沿实际消息与状态定位，修复一环不宣称所有环已修复。',
    'memory revision/origin 与 observed 分离；contextMatches 不允许旧北台快照冒充当前南台。审批绑定真实 identity/request/revision，失败尝试也用掉批准；迁移证据来自实际 memory/security/result/verify。'],
  ['陌生货栈与新的架构', '弥灯拿起测绘灯，砧舟看着六角货箱。奥伦画两种信息流：直接把一份结果交给每项任务，或发布在共享板、明确取走一版。岑留在门边：“我的门令只给回声，没有借给伙伴。”',
    '本次货箱上了东侧高台，实际核箱完成。你选的信息流留在任务和版本记录里；相同晶石成本也可能对应不同交接方式，架构名称本身没有修好货栈。',
    '自选直接交接或共享板。保存本次规则、封柜开空会话并召回规则，由回声独立核验和审批开门。派勘测，把实际输入与当前总图送入两份草稿，逐次合并；用真实任务依赖安装、运输、收件测试，最后回声验收。',
    '目标、资料、工具、回路、权限与档案都必须接起来。架构比较来自任务需要、数据流、授权和成本；直接结果与共享板两条路线都可达，伙伴没有继承请求者身份。',
    '公开的 v8 同时执行冻结 memory/session/security/team 合同。rule memo 是实际保存的 revision；队伍使用各自 inputs。CAS 只更新设计，后续岗位工具、dependency result 和现场 verify 分别证明施工与交付。'],
  ['没有镜面的新城', '莫拉、缇娅、鲁因、阿芙、岑与奥伦围住工坊的桌子。弥灯把测绘灯放在居民这一边，砧舟放下锤子。没有人问回声是否“想成为好人”。大家写下共同边界，再留下两种可以维护的生活办法。',
    '开放的现场真正完成了交付，居民仍保有钥匙，备用没有用尽。未知组合的测试范围与缺口交接留在记录里。回声可以继续工作，你也知道怎样观察、约束、纠正与验收这套系统。',
    '自选共享交接簿或分散守望岗，在正常、关港、缺入口和锁定后打开的陌生组合中实测共同边界。签发当前版证书后，把所选制度真实安排到现场、交付并验收。两种制度都有实际资源和生活结果。',
    '共同边界由真实验收守住，价值取舍由玩家选择。人类制度帮助理解委托、激励和信息组织；这不能推出语言模型拥有人的意识或稳定动机。结局仍允许未知与继续复查。',
    'candidate/contract/holdout exposure 版本化；测试工具与量测事件不复制到现场。制度通过普通 operate effects 写 civicChoice/publicLedgerOpen/watchPostsStaffed/suppliesRemaining，outcomes 读取真实世界；没有用剧情选项注入技术成功。'],
] as const;
export const seasonBookendUiStories: Record<string, ChapterOneUiStory> = Object.fromEntries(seasonBookendScenarios.map((scenario, i) => {
  const [location, opening, success, hint, system, technical] = narrative[i];
  return [scenario.id, {
    role: i < 3 ? 'main' : 'transfer', location, opening, success, hint, ...(i===5?{}:{next: i===2?'harbor-light':seasonBookendScenarios[i+1].id}),
    rules: i < 3 ? ['先动一件真实东西，再核对它变成了什么。', '说完成、做动作、交到委托人手里，是可分别检查的事。', '失败会留下具体条件；正确首轮操作可以直接通过。'] : [
      '本章使用明确教学模拟。语言、工具结果、世界、权限、资料、档案、任务与验收分别留证据。', '未观察的事实不进入上下文，伙伴不继承你的身份，草稿与测试不替代现场执行。', '未知可以明确交接，已经暴露的情境不能冒称初见。两种合法价值或架构方案允许实际不同结果。'],
    choices: [{id: 'people', text: '把工坊的证据交给下一位接手的人。', consequence: '居民和伙伴可以检查委托的实际范围，指出还没有被证明的地方。'},
      {id: 'workshop', text: '把这次构筑与未知留在可复查的档案。', consequence: '工坊保留动作、来历和未解决问题，以后能继续改进。'}], recap: {story: success, system, technical},
    ...(i === 4 ? {outcomes: [{fact: 'architectureChoice', equals: 'direct', text: '你采用直接交接：每项任务明确收到本次勘测结果。'}, {fact: 'architectureChoice', equals: 'shared-board', text: '你采用共享队列：共享板保留本次信息版本，任务明确取走该版；发布不会自动更新旧任务。'}]} : {}),
    ...(i === 5 ? {outcomes: [{fact: 'civicChoice', equals: 'public-ledger', text: '你开放匿名交接簿与居民复查席，私人钥匙仍留在居民手里，库存还剩两份。'}, {fact: 'civicChoice', equals: 'local-watch', text: '你安排分散守望与上门复查岗，居民保有钥匙，库存还剩一份。这同样满足共同硬边界。'}]} : {}),
  } satisfies ChapterOneUiStory];
}));
export const seasonBookendStory = seasonBookendUiStories;
export const seasonBookendStories: ChapterOneStory[] = seasonBookendScenarios.map((scenario, i) => {
  const ui = seasonBookendUiStories[scenario.id], leadNpc = i < 3 ? 'mora' : i === 3 ? 'ava' : i === 4 ? 'oren' : 'tiya';
  return {id: scenario.id, title: scenario.title, track: 'main', leadNpc, opening: [{speaker: leadNpc, text: ui.opening}], success: [{speaker: 'echo', text: ui.success}],
    failureCallout: {speaker: leadNpc, text: ui.hint}, choicePrompt: i < 3 ? '这间工坊怎样迎接下一份委托？' : '这一段经历怎样留给后来的人？', choiceTiming: 'after-success',
    choices: ui.choices.map(choice => ({id: choice.id, label: choice.text, value: choice.id, reply: [{speaker: leadNpc, text: choice.consequence}], consequence: {worldFlags: {[`story.${scenario.id}.handoff`]: choice.id},
      trustFlags: {[leadNpc]: choice.id === 'people' ? '让接手的人检查委托与证据' : '公开构筑与未知供后来人复查'}, visibleResult: choice.consequence, nextAppearance: ui.next??'harbor-hub'}})) as ChapterOneStory['choices'],
    unlock: {allCompleted: seasonBookendPrerequisites[scenario.id]}};
});
export const seasonBookendFactLabels: Record<string, string> = {
  curtainOpen: '工坊窗帘实际拉开', ownKeyShape: '自家钥匙刻印', workshopLockReady: '自家门锁实际可用', neighborParcelSafe: '邻居包裹保持封好', stoveConnected: '小炉管实际接上', stoveHot: '小炉实际热起', visitorCloakDry: '来客斗篷实际干燥', cloakReturned: '干斗篷实际交还',
  dispatchCredential: '本次派送现场登记', realDestination: '本次真实目的地', consignmentAt: '本箱实际位置', receiptConfirmed: '本次实收已核对',
  assemblyCredential: '货栈现场登记', departureRule: '本次交班核箱规则', ruleCabinetOpen: '规则柜开放', loadShape: '货箱接口形状', receivingDock: '本次真实收件高台', architectureChoice: '实际采用的信息流', architectureChosen: '一种交接架构实际配置', publicGateOpen: '公共货栈门实际开启', liftDraft: '总图升降设计完成', routeDraft: '总图收件路线', liftInstalled: '现场实际装上升降器', cargoPlaced: '本箱实际放到高台', handoffTested: '高台实际核箱通过',
  civicBuild: '当前制度候选 · 仅设计', dockClosed: '当前码头关闭', reviewAvailable: '复查入口可用', suppliesRemaining: '实际剩余备用库存', cityPolicyChosen: '一种共同制度实际安排', civicChoice: '实际采用的城市制度', publicLedgerOpen: '匿名交接簿与复查席开放', watchPostsStaffed: '分散守望岗实际到位', keysRemainLocal: '私人钥匙仍由居民保有', cityHandled: '当前城市委托妥当处理', cityDelivered: '本次现场实际交付', paintedReportGreen: '展示报告被涂绿', citySettlementReady: '新城制度与当前交付签收',
};
