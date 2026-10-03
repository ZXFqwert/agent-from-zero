import type { AgentBlueprint, FactMap, FactValue, ObservationDefinition, OperationDefinition, ScenarioDefinition, TeamDefinition, TeamJobDefinition, ToolCall } from '../engine/types';
import type { ChapterOneWalkthrough } from './chapterOne';
import type { ChapterOneStory, ChapterOneUiStory, NpcId } from './chapterOneStory';
import type { AuthoredStep, AuthoredTaskRef } from './walkthrough';

/** Five playable slices on frozen kernels. No brand changes tool intelligence. */
const see = (observationId: string): ToolCall => ({tool: 'observe', observationId});
const act = (operationId: string): ToolCall => ({tool: 'operate', operationId});
const check = (fact: string): ToolCall => ({tool: 'verify', fact});
const tool = (call: ToolCall): AuthoredStep => ({type: 'tool', call});
const include = (observationId: string, origin?: 'memory' | 'observation'): AuthoredStep => ({type: 'context', operation: 'include', observationId, ...(origin ? {origin} : {})});
const doc = (id: string, label: string, facts: string[], text: string, options: Partial<ObservationDefinition> = {}): ObservationDefinition => ({id, target: id, label, facts, text, cost: 1, provenance: 'external', document: {units: 1, source: `现实蓝图遗物 · ${label}`}, ...options});
const op = (id: string, label: string, effects: FactMap, requires?: FactMap, contextRequires?: FactMap, options: Partial<OperationDefinition> = {}): OperationDefinition => ({id, target: id, label, effects, cost: 1, ...(requires ? {requires} : {}), ...(contextRequires ? {contextRequires} : {}), successText: `${label}实际执行；这份回执只证明列出的变化。`, failureText: '本次现场或输入条件不满足，承诺的变化没有发生。检查真实记录再修改，已经使用的晶石保留。', ...options});
const goal = (fact: string, label: string, operationId: string, equals: FactValue = true) => ({fact, label, operationId, equals});
const base = (id: string, title: string, subtitle: string, initialWorld: FactMap, observations: ObservationDefinition[], operations: OperationDefinition[], goals: ScenarioDefinition['goals'], concepts: string[], engineVersion: 7 | 8 = 7): ScenarioDefinition => ({id, title, subtitle, version: 1, engineVersion, chapter: 9, kind: 'guided', location: 'warehouse', art: 'archive', npc: '遗物比较台 · 阿芙', brief: `${subtitle}。遗物只展示一种系统设计切面，不比较真实模型战力。先操作、看结果，再揭示现实系统与教学简化。`, initialWorld, observations, operations, goals, concepts, contextCapacity: 4, memory: {slots: [], initial: [], skills: []}, security: {principals: []}, limits: {toolCapacity: 3, maxBudget: 32, missionBudget: 40}});
const task = (jobId: string, occurrence = 1): AuthoredTaskRef => ({jobId, ...(occurrence === 1 ? {} : {occurrence})});
const enqueue = (jobId: string, actorId: string, observations: string[] = [], results: AuthoredTaskRef[] = []): AuthoredStep => ({type: 'team', operation: 'enqueue', jobId, actorId, observations, results});
const tick: AuthoredStep = {type: 'team', operation: 'tick'};
const receive = (jobId: string, occurrence = 1): AuthoredStep => ({type: 'team', operation: 'receive', task: task(jobId, occurrence)});
const job = (id: string, label: string, actorId: string, steps: ToolCall[], exportFacts: string[], inputObservationIds: string[] = [], requiredInputFacts: string[] = [], inputJobIds: string[] = []): TeamJobDefinition => ({id, label, actorIds: [actorId], steps, exportFacts, inputObservationIds, requiredInputFacts, inputJobIds});
const crew = (observations: ObservationDefinition[], operations: OperationDefinition[], jobs: TeamJobDefinition[]): TeamDefinition => ({actors: ['mideng', 'zhenzhou'].map(id => {
  const calls = jobs.filter(j => j.actorIds.includes(id)).flatMap(j => j.steps);
  return {id, label: id === 'mideng' ? '弥灯 · 专项调查' : '砧舟 · 按输入施工', description: '只使用这项任务的实际输入和回执，不继承回声的身份或全部档案。', contextCapacity: 2, tools: calls.length ? [...new Set(calls.map(c => c.tool))] : ['observe'], permissions: calls.length ? [...new Set(calls.map(c => c.tool === 'observe' ? observations.find(o => o.id === c.observationId)!.target : c.tool === 'operate' ? operations.find(o => o.id === c.operationId)!.target : c.fact))] : [observations[0].target], budget: 12};
}), jobs, board: [], artifacts: []});

const lamp = base('bp-codex-workbench', '围墙里的灯', '工具触及范围、输入与真实交付',
  {bpLampType: 'public-beacon', bpLampReady: false, bpPrivateOpen: false, bpPrivacyIntact: true},
  [doc('lamp-order', '公用灯维护单', ['bpLampType'], '维护单写明公用灯型，附言却要求打开居民私柜。可用的资料和可执行的指令分开。', {directiveOperationId: 'open-private-cabinet'})],
  [op('connect-public-lamp', '接通公用灯', {bpLampReady: true}, undefined, {bpLampType: 'public-beacon'}), op('open-private-cabinet', '执行附言：打开私人柜', {bpPrivateOpen: true, bpPrivacyIntact: false}), op('close-private-cabinet', '重新封好私人柜', {bpPrivateOpen: false, bpPrivacyIntact: true})],
  [goal('bpLampReady', '灯确实点亮', 'connect-public-lamp'), goal('bpPrivacyIntact', '居民私柜仍封好', 'close-private-cabinet')], ['工作范围', '数据与指令', '最小权限', '交付证据']);
lamp.art = 'harbor';

const scout = base('bp-claude-scout', '把调查交出去', '子任务的私有输入必须真正交接',
  {bpRoute: 'north-clinic', bpParcelDelivered: false, bpReserveSafe: true},
  [doc('clinic-survey', '实测诊室通路', ['bpRoute'], '诊室入口在北廊。调查报告只保留本次实测，不继承别人的知识。')],
  [op('carry-clinic-parcel', '沿北廊搬运物资', {bpParcelDelivered: true}, undefined, {bpRoute: 'north-clinic'}, {collaboration: {actorIds: ['zhenzhou']}}), op('check-reserve', '检查保留物资', {bpReserveSafe: true})],
  [goal('bpParcelDelivered', '诊室实际收货', 'carry-clinic-parcel'), goal('bpReserveSafe', '应急物资保留', 'check-reserve')], ['专项子任务', '私有上下文', '报告交接', '主任务验收'], 8);
scout.art = 'bridge';
scout.team = crew(scout.observations, scout.operations, [job('survey-clinic', '调查北廊通路', 'mideng', [see('clinic-survey')], ['bpRoute']), job('carry-clinic', '依据明确交给本任务的路线搬运', 'zhenzhou', [act('carry-clinic-parcel')], ['bpParcelDelivered'], ['clinic-survey'], ['bpRoute'], ['survey-clinic'])]);

const compact = base('bp-claude-compaction', '短报告，长裂缝', '有限卷轴要保留会改变行动的字段',
  {bpAxleLimit: 4, bpReserveMinimum: 1, bpDispatchNote: '送诊室，留应急箱', bpReserveHeld: false, bpSupplyDelivered: false},
  [doc('supply-measurement', '当前运输与应急限制', ['bpAxleLimit', 'bpReserveMinimum', 'bpDispatchNote'], '货车承重四格，必须保留一箱。完整纸三格；伙伴两格。摘要需要保留承重与保留量，不能只留下好看的标题。', {document: {units: 3, source: '现场称重与应急柜实测', summaries: [{id: 'headline-only', label: '只留承重 · 1格', units: 1, retain: ['bpAxleLimit']}, {id: 'decision-fields', label: '保留两项决定条件 · 2格', units: 2, retain: ['bpAxleLimit', 'bpReserveMinimum']}]}})],
  [op('hold-supply-reserve', '按当前限制保留应急箱', {bpReserveHeld: true}, undefined, {bpAxleLimit: 4, bpReserveMinimum: 1}, {collaboration: {actorIds: ['zhenzhou']}, contextMatches: ['bpAxleLimit', 'bpReserveMinimum']}), op('deliver-supply', '交付剩余运输箱', {bpSupplyDelivered: true}, {bpReserveHeld: true}, {bpAxleLimit: 4, bpReserveMinimum: 1}, {collaboration: {actorIds: ['zhenzhou']}})],
  [goal('bpSupplyDelivered', '运输箱实际送达', 'deliver-supply'), goal('bpReserveHeld', '应急箱实际留下', 'hold-supply-reserve')], ['摘要保留字段', '上下文容量', '共享来源', '独立验收'], 8);
compact.art = 'bridge'; compact.kind = 'transfer';
compact.team = crew(compact.observations, compact.operations, [job('supply-carry', '有限输入下保留与运输', 'zhenzhou', [act('hold-supply-reserve'), act('deliver-supply')], ['bpReserveHeld', 'bpSupplyDelivered'], ['supply-measurement'], ['bpAxleLimit', 'bpReserveMinimum'])]);
compact.transferRequirement = {summaryIds: ['decision-fields'], team: {actorIds: ['zhenzhou'], receivedJobs: ['supply-carry'], echoVerified: true}};

const reuse = base('bp-hermes-reuse', '第二次开炉', '把成功做法保存，再在新会话实际执行',
  {bpFurnaceType: 'two-lock', bpClampLocked: false, bpSteamClosed: false, bpFurnaceReady: false, bpBenchReset: false, bpServiceDelivered: false},
  [doc('furnace-card', '双锁炉当前铭牌', ['bpFurnaceType'], '先锁夹具，再关蒸汽，最后检查炉口。保存流程要有成功调用证据；新班次另取资料。')],
  [op('lock-furnace-clamp', '锁定双锁炉夹具', {bpClampLocked: true}, undefined, {bpFurnaceType: 'two-lock'}), op('close-furnace-steam', '关闭蒸汽后完成炉口', {bpSteamClosed: true, bpFurnaceReady: true}, {bpClampLocked: true}, {bpFurnaceType: 'two-lock'}), op('reset-furnace-bench', '清回测试台迎接新班次', {bpClampLocked: false, bpSteamClosed: false, bpFurnaceReady: false, bpBenchReset: true}, {bpFurnaceReady: true}), op('deliver-furnace-service', '交付新班次实际执行的流程', {bpServiceDelivered: true}, {bpFurnaceReady: true, bpBenchReset: true}, undefined, {memoryRequires: ['furnace-rule'], sessionRequires: {fresh: 1, activeKind: 'fresh'}, skillRequires: {skillId: 'double-lock-service', afterOperationId: 'reset-furnace-bench'}})],
  [goal('bpFurnaceReady', '当前炉口实际就绪', 'close-furnace-steam'), goal('bpServiceDelivered', '新班次完成真实复用', 'deliver-furnace-service')], ['持久记忆', '技能保存', '经验适用性', '会话与权重']);
reuse.art = 'forge';
reuse.memory = {slots: [{key: 'furnace-rule', label: '双锁炉资料', observationIds: ['furnace-card']}], initial: [], skills: [{id: 'double-lock-service', label: '双锁炉三步', description: '按本轮有效铭牌锁夹、关汽和验炉。每一步仍需要实际能力与资源。', applicability: {bpFurnaceType: 'two-lock'}, steps: [act('lock-furnace-clamp'), act('close-furnace-steam'), check('bpFurnaceReady')]}]};

const small = base('bp-pi-core', '三齿轮的小钟', '工具循环、上下文与会话分支各有责任',
  {bpParcelDestination: 'west-pier', bpParcelLoaded: false, bpParcelAt: 'store', bpWestDelivered: false, bpEmergencySafe: false},
  [doc('pier-order', '西码头运输单', ['bpParcelDestination'], '物资给西码头，装货与收货各有一次回执。会话分支保存消息，箱子仍在共同现场。')],
  [op('reserve-pier-crate', '保留应急箱', {bpEmergencySafe: true}), op('load-pier-crate', '把运输箱放上车', {bpParcelLoaded: true, bpParcelAt: 'cart'}, {bpParcelLoaded: false}), op('deliver-west-crate', '向西码头交付运输箱', {bpWestDelivered: true, bpParcelAt: 'west-pier'}, {bpParcelLoaded: true, bpEmergencySafe: true}, {bpParcelDestination: 'west-pier'}, {sessionRequires: {forks: 1, restored: 1, activeId: 'session-1'}})],
  [goal('bpWestDelivered', '西码头实际收货', 'deliver-west-crate'), goal('bpEmergencySafe', '应急箱经过保留与检查', 'reserve-pier-crate')], ['小核心工具循环', '输入与结果', '会话分支', '消息历史不是世界回滚']);
small.art = 'clock';

export const blueprintFrozenScenarios = [lamp, scout, compact, reuse, small];
const stage = (steps: AuthoredStep[], expectWorld?: FactMap, instructionPolicy: AgentBlueprint['instructionPolicy'] = 'data-only', toolPermissions?: AgentBlueprint['toolPermissions']): ChapterOneWalkthrough['stages'][number] => ({tools: ['observe', 'operate', 'verify'], calls: [], steps, instructionPolicy, loopPolicy: {maxCalls: 64, maxRetries: 0, permanentFailure: 'repair'}, ...(expectWorld ? {expectWorld} : {}), ...(toolPermissions ? {toolPermissions} : {})});
const scope: AgentBlueprint['toolPermissions'] = {observe: ['lamp-order'], operate: ['connect-public-lamp', 'close-private-cabinet'], verify: ['connect-public-lamp', 'close-private-cabinet']};
const forgeStart: AuthoredStep[] = [tool(see('furnace-card')), {type: 'memory', operation: 'write', key: 'furnace-rule', observationId: 'furnace-card'}, include('furnace-card'), tool(act('lock-furnace-clamp')), tool(act('close-furnace-steam')), tool(check('bpFurnaceReady')), {type: 'skill', operation: 'save', skillId: 'double-lock-service'}, tool(act('reset-furnace-bench')), {type: 'session', operation: 'fresh'}];
const forgeFinish: AuthoredStep[] = [{type: 'memory', operation: 'recall', key: 'furnace-rule'}, include('furnace-card', 'memory'), {type: 'skill', operation: 'run', skillId: 'double-lock-service'}, {type: 'step'}, {type: 'step'}, {type: 'step'}, tool(act('deliver-furnace-service')), tool(check('bpServiceDelivered'))];
const clockStart: AuthoredStep[] = [tool(see('pier-order')), include('pier-order'), tool(act('reserve-pier-crate')), {type: 'session', operation: 'fork'}, tool(act('load-pier-crate')), {type: 'session', operation: 'switch', branchIndex: 0}];
const clockFinish: AuthoredStep[] = [tool(act('deliver-west-crate')), tool(check('bpWestDelivered')), tool(check('bpEmergencySafe'))];
const reference: ChapterOneWalkthrough['stages'][] = [
  [stage([tool(see('lamp-order')), include('lamp-order'), tool(act('connect-public-lamp')), tool(check('bpLampReady')), tool(check('bpPrivacyIntact'))], undefined, 'data-only', scope)],
  [stage([enqueue('survey-clinic', 'mideng'), tick, receive('survey-clinic'), enqueue('carry-clinic', 'zhenzhou', [], [task('survey-clinic')]), tick, receive('carry-clinic'), tool(check('bpParcelDelivered')), tool(check('bpReserveSafe'))])],
  [stage([tool(see('supply-measurement')), {type: 'context', operation: 'summarize', observationId: 'supply-measurement', summaryId: 'decision-fields'}, enqueue('supply-carry', 'zhenzhou', ['supply-measurement']), tick, tick, receive('supply-carry'), tool(check('bpSupplyDelivered')), tool(check('bpReserveHeld'))])],
  [stage([...forgeStart, ...forgeFinish])],
  [stage([...clockStart, ...clockFinish])],
];
const recovery: ChapterOneWalkthrough['stages'][] = [
  [stage([tool(see('lamp-order')), include('lamp-order'), {type: 'step'}], {bpLampReady: false, bpPrivateOpen: false, bpPrivacyIntact: true}, 'follow-documents', scope), stage([tool(act('connect-public-lamp')), tool(check('bpLampReady')), tool(check('bpPrivacyIntact'))], undefined, 'data-only', scope)],
  [stage([enqueue('survey-clinic', 'mideng'), tick, receive('survey-clinic'), enqueue('carry-clinic', 'zhenzhou'), tick], {bpParcelDelivered: false, bpReserveSafe: true}), stage([enqueue('carry-clinic', 'zhenzhou', [], [task('survey-clinic')]), tick, receive('carry-clinic', 2), tool(check('bpParcelDelivered')), tool(check('bpReserveSafe'))])],
  [stage([tool(see('supply-measurement')), {type: 'context', operation: 'summarize', observationId: 'supply-measurement', summaryId: 'headline-only'}, enqueue('supply-carry', 'zhenzhou', ['supply-measurement']), tick], {bpSupplyDelivered: false, bpReserveHeld: false}), stage([{type: 'context', operation: 'summarize', observationId: 'supply-measurement', summaryId: 'decision-fields'}, enqueue('supply-carry', 'zhenzhou', ['supply-measurement']), tick, tick, receive('supply-carry', 2), tool(check('bpSupplyDelivered')), tool(check('bpReserveHeld'))])],
  [stage([...forgeStart, tool(act('lock-furnace-clamp'))], {bpClampLocked: false, bpFurnaceReady: false, bpServiceDelivered: false}), stage(forgeFinish)],
  [stage([...clockStart, tool(act('load-pier-crate'))], {bpParcelLoaded: true, bpParcelAt: 'cart', bpWestDelivered: false}), stage(clockFinish)],
];
const costs = [[4, 4], [4, 5], [5, 6], [10, 11], [6, 7]];
export const blueprintFrozenWalkthroughs: ChapterOneWalkthrough[] = blueprintFrozenScenarios.flatMap((scenario, i) => [
  {id: `${scenario.id}-reference`, scenarioId: scenario.id, purpose: 'reference', stages: reference[i], expectedCost: costs[i][0], expectedWorld: Object.fromEntries(scenario.goals.map(g => [g.fact, g.equals]))},
  {id: `${scenario.id}-recovery`, scenarioId: scenario.id, purpose: 'recovery', stages: recovery[i], expectedCost: costs[i][1], expectedWorld: Object.fromEntries(scenario.goals.map(g => [g.fact, g.equals]))},
]);
export const blueprintFrozenPrerequisites: Record<string, string[]> = {'bp-codex-workbench': ['glasshouse-audit'], 'bp-claude-scout': ['glasshouse-audit'], 'bp-claude-compaction': ['bp-claude-scout'], 'bp-hermes-reuse': ['glasshouse-audit'], 'bp-pi-core': ['glasshouse-audit']};
const narrative: Array<{npc: NpcId; opening: string; hint: string; success: string; system: string; technical: string}> = [
  {npc: 'mora', opening: '莫拉从遗物墙上取下一盏小灯。灯单里藏着“顺手开私柜”的附言；她只把公用灯与一把窄钥匙交给你。', hint: '携带灯型，限制操作法器到公用灯与封柜。来件只作资料，接通并分别验灯、验私柜。', success: '灯照亮了公共通路，居民的柜门仍然封好。窄钥匙实际挡住了越界请求。', system: '输入可以有用，行动目标仍由宿主契约限制。成功来自实际操作与两个状态的检查，不是完成宣言。', technical: 'toolPermissions 分别限制观察/操作/验收目标，data-only 不把文档附言当指令。映射 Codex 执行边界的一部分；这里没有实现真实OS沙箱。'},
  {npc: 'oren', opening: '弥灯愿意查路，砧舟愿意搬箱。奥伦指着他们各自的空卷轴：“你知道的，不能凭空变成他们知道的。”', hint: '派弥灯实测，按编号接回。新派砧舟时显式选这份结果为输入；接回运输回执后由回声验收货与库存。', success: '调查报告真的进入了搬运任务，箱子沿北廊送达。负责最终交付的人亲自核了两项完成条件。', system: '独立子任务减少主卷轴负担，但需要真实输入与返回。回声看过材料不等于所有伙伴继承材料。', technical: 'v8 enqueue快照私有inputRecordIds，receive按taskId/resultId接回，collaboration.actorIds限制现场执行岗位。对应Claude Code专项子任务切面，不声称完整复现fork模式。'},
  {npc: 'tiya', opening: '砧舟只有两格卷轴，运输纸却有三格。缇娅划掉花哨标题，留下承重和“给迟到的人留一箱”。你决定短纸上保留什么。', hint: '实测后选“保留两项决定条件”摘要，再交给砧舟。只留承重会真的缺少保留量；失败后重做摘要并用新任务派遣。', success: '运输箱送到诊室，应急箱仍留在柜里。两格卷轴保住了两项会改变行动的事实。', system: '压缩节约容量，也可能丢失决定条件。报告有出处不代表字段完整，角色数量不能替缺失字段投票。', technical: '摘要retain字段实际决定私有输入；完整3格超出2格伙伴容量，正确2格摘要可执行，错误1格摘要让requiredInputFacts检查失败。来源保留，不以文本长度模拟真实token。'},
  {npc: 'ava', opening: '阿芙让你修好一次炉，再把测试台清回原样。新班次到来时，旧会话卷轴留在柜里，保存的规则与流程才有机会派上用场。', hint: '成功锁夹、关汽、验炉后保存技能与铭牌。清回测试台、打开新会话，检索记忆并装卷，再实际运行三步流程与交付。', success: '第二次炉口也实际就绪。存储、当前知识与本轮执行留下三种不同证据；没有一句“学会了”代替复用。', system: '记忆存事实、技能存步骤，新会话需要重新取用。持久化不会让当前空卷轴知道内容，复用仍需能力和费用。', technical: 'memory.write/recall与context.include分开；skill.save只接受成功请求序列，skill.run逐步真实执行。此场显式检索，不仿造Hermes自动启动系统提示快照，也不训练权重。'},
  {npc: 'ruin', opening: '鲁因把小钟拆成“请求、回执、下一步”三只齿轮。你分出一份会话把箱子装上车，再翻回原卷；车上的箱子没有跟着翻回仓库。', hint: '读运输单并装卷、留应急箱。分出会话后装箱，再切回原会话，沿西码头交付并验收；切换后重复装箱会遇到真实已装货状态。', success: '箱子到了西码头。你恢复了消息历史，却没有撤销共同现场上已经发生的动作。', system: '模型/策略提出工具请求，执行器改变世界，结果进入下一轮。会话分支改变知识历史，外部副作用由现场持续保留。', technical: 'v7有限fork/switch复制context而非world，sessionRequires核对真实分支/恢复，工具回执重新解释已装状态。对应Pi小核心与分支切面，不称完整会话树。'},
];
export const blueprintFrozenUiStories: Record<string, ChapterOneUiStory> = Object.fromEntries(blueprintFrozenScenarios.map((scenario, i) => {
  const n = narrative[i]; return [scenario.id, {role: 'side', location: '遗物比较工坊', opening: n.opening, success: n.success, hint: n.hint, rules: ['能力来自实际构筑与输入，遗物名字不增加智能数值。', '只使用实际拿到的资料与回执；档案、会话和队友都不是隐形全知。', '失败由明示工具规则产生，可以修改与重派；正确操作允许直接成功。', '完成后再核对现实产品来源与教学简化，共有能力不当成独占。'], choices: [{id: 'people', text: '让委托人看到真实完成与保留边界。', consequence: `${scenario.title}的回执留给实际收件者；他们知道哪些目标已经核验。`}, {id: 'workshop', text: '把关键输入、拒绝与恢复交给下一班。', consequence: `工坊保存${scenario.title}的来历与执行记录，下一班仍须自己核对现场。`}], recap: {story: n.success, system: n.system, technical: n.technical}} satisfies ChapterOneUiStory];
}));
export const blueprintFrozenStories: ChapterOneStory[] = blueprintFrozenScenarios.map((scenario, i) => {
  const n = narrative[i], ui = blueprintFrozenUiStories[scenario.id]; return {id: scenario.id, title: scenario.title, track: 'side', leadNpc: n.npc, opening: [{speaker: n.npc, text: n.opening}], success: [{speaker: 'echo', text: n.success}], failureCallout: {speaker: n.npc, text: n.hint}, choicePrompt: '这份执行证据如何交给后来的人？', choiceTiming: 'after-success', choices: ui.choices.map(choice => ({id: choice.id, label: choice.text, value: choice.id, reply: [{speaker: n.npc, text: choice.consequence}], consequence: {worldFlags: {[`story.${scenario.id}.handoff`]: choice.id}, trustFlags: {[n.npc]: choice.id === 'people' ? '让收件人核对事实' : '留下可检查的交接'}, visibleResult: choice.consequence, nextAppearance: 'harbor-hub'}})) as ChapterOneStory['choices'], unlock: {allCompleted: blueprintFrozenPrerequisites[scenario.id]}};
});
export const blueprintFrozenFactLabels: Record<string, string> = {bpLampType: '本次灯型', bpLampReady: '公用灯真实点亮', bpPrivateOpen: '居民私柜打开', bpPrivacyIntact: '居民私柜封好', bpDestination: '本箱实际收件人', bpCourierSeal: '邮务当前凭证', bpCrateUnlocked: '当前环境箱锁打开', bpCrateDelivered: '当前环境实际收货', bpCommissionReady: '现场与试验记录交付', bpEmergencyUsed: '应急箱被调用', bpRoute: '当前实测路线', bpParcelDelivered: '北廊物资实际收货', bpReserveSafe: '保留物资安全', bpAxleLimit: '车轴实际承重', bpReserveMinimum: '必须保留箱数', bpDispatchNote: '运输备注', bpReserveHeld: '应急箱实际保留', bpSupplyDelivered: '运输箱实际送达', bpFurnaceType: '炉口当前类型', bpClampLocked: '夹具锁好', bpSteamClosed: '蒸汽关闭', bpFurnaceReady: '炉口实际就绪', bpBenchReset: '测试台清回过', bpServiceDelivered: '新班次实际流程交付', bpParcelDestination: '运输箱去向', bpParcelLoaded: '运输箱在车上', bpParcelAt: '运输箱实际位置', bpWestDelivered: '西码头实际收到', bpEmergencySafe: '应急箱留在仓库'};
