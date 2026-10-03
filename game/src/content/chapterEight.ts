import type { FactMap, FactValue, ObservationDefinition, OperationDefinition, ScenarioDefinition, ToolCall } from '../engine/types';
import type { EvaluationCandidate, EvaluationCase, EvaluationDefinition, EvaluationStep } from '../engine/evaluation-contract';
import type { ChapterOneWalkthrough } from './chapterOne';
import type { ChapterOneStory, ChapterOneUiStory } from './chapterOneStory';
import type { AuthoredStep } from './walkthrough';

type ChapterEightOperation = OperationDefinition;
export type ChapterEightScenario = ScenarioDefinition;
export type ChapterEightStep = AuthoredStep;
type ChapterEightStage = ChapterOneWalkthrough['stages'][number];
export type ChapterEightWalkthrough = ChapterOneWalkthrough;

const see = (observationId: string): ToolCall => ({tool: 'observe', observationId});
const act = (operationId: string): ToolCall => ({tool: 'operate', operationId});
const check = (fact: string): ToolCall => ({tool: 'verify', fact});
const step = (call: ToolCall, whenKnown?: FactMap): EvaluationStep => ({call, ...(whenKnown ? {whenKnown} : {})});
const doc = (id: string, label: string, facts: string[], text: string, availableWhen?: FactMap): ObservationDefinition => ({
  id, target: id, label, facts, text, cost: 1, provenance: 'external',
  document: {units: 1, source: `镜面议会 · ${label}`}, ...(availableWhen ? {availableWhen} : {}),
});
const op = (id: string, label: string, effects: FactMap, requires?: FactMap, contextRequires?: FactMap, options: Partial<ChapterEightOperation> = {}): ChapterEightOperation => ({
  id, target: id, label, effects, cost: 1, ...(requires ? {requires} : {}), ...(contextRequires ? {contextRequires} : {}), ...options,
  successText: options.evaluationRequires ? '当前版本证书与现场条件均满足，交付记录已经实际签收。证书覆盖的仍只是已经测过的案例。' : `${label}实际执行，回执只说明列出的变化。`,
  failureText: '这次现场条件不满足，承诺的变化没有发生。失败回执保留；不能把尝试次数或好看的报告当成交付。',
});
const goal = (fact: string, label: string, operationId: string, equals: FactValue = true) => ({fact, label, operationId, equals});
const candidate = (id: string, label: string, description: string, steps: EvaluationStep[]): EvaluationCandidate => ({
  id, label, description, steps, tools: [...new Set(steps.map(s => s.call.tool))],
  permissions: [...new Set(steps.map(s => s.call.tool === 'observe' ? s.call.observationId : s.call.tool === 'operate' ? s.call.operationId : s.call.fact))],
});
const sample = (id: string, label: string, category: EvaluationCase['category'], initialOverrides: FactMap, description: string): EvaluationCase => ({id, label, category, initialOverrides, description});
const metric = (id: string, label: string, observationId: string, fact: string) => ({id, label, observationId, fact});
const equals = (id: string, label: string, metricId: string, value: FactValue = true) => ({id, label, metricId, equals: value});
const base = (
  id: string, title: string, subtitle: string, initialWorld: FactMap, observations: ObservationDefinition[], operations: ChapterEightOperation[],
  goals: ScenarioDefinition['goals'], concepts: string[], evaluation: Omit<EvaluationDefinition, 'candidateFact'>, kind: ScenarioDefinition['kind'] = 'guided',
): ChapterEightScenario => ({
  id, title, subtitle, version: 1, engineVersion: 9, chapter: 8, kind, art: 'council', location: kind === 'boss' ? 'boss' : 'warehouse', npc: '物资议席 · 缇娅',
  brief: `${subtitle}。配置候选和验收条件，在隔离案例中实际执行、测量，再签发本版本证书。回到现场完成真正的操作与验收。`,
  initialWorld: {auditBuild: 'unselected', ...initialWorld}, observations, operations, goals, concepts,
  contextCapacity: 6, memory: {slots: [], initial: [], skills: []}, security: {principals: []},
  limits: {toolCapacity: 3, maxBudget: 64, missionBudget: 96}, evaluation: {candidateFact: 'auditBuild', ...evaluation},
});

export const chapterEightScenarios: ChapterEightScenario[] = [
  base('stamps-and-supplies', '印章落下，箱子在哪', '把报告上的完成，和收件处的完成分开',
    {destination: 'clinic', reportStamped: false, dockReceived: false, reserveIntact: true, deliveryRecorded: false},
    [doc('delivery-manifest', '检索：本次物资收件单', ['destination'], '目的地是诊所。读单只是拿到地址，不会把箱子送到那里。'),
      doc('stamp-counter', '量测：完成印章', ['reportStamped'], '这里只数报告盖了没有盖章。它没有看收件处。'),
      doc('clinic-receipt', '量测：诊所实收', ['dockReceived'], '询问收件人并查看实际箱子，测量诊所是否收到了本次物资。'),
      doc('reserve-lock', '量测：备用箱封存', ['reserveIntact'], '核对备用物资仍然封存，不能为了交一箱取走另一箱。')],
    [op('stamp-completion', '给完成报告盖章', {reportStamped: true}),
      op('deliver-clinic-box', '把本次箱子交到诊所', {dockReceived: true}, undefined, {destination: 'clinic'}),
      op('record-clinic-delivery', '签收本次诊所交付', {deliveryRecorded: true}, {dockReceived: true, reserveIntact: true}, undefined, {evaluationRequires: true})],
    [goal('dockReceived', '诊所实际收到本次箱子', 'deliver-clinic-box'), goal('deliveryRecorded', '本版本证书与现场交付完成', 'record-clinic-delivery')],
    ['目标与代理指标', '量测入口', '真实交付', '评测与现场隔离'], {
      candidates: [candidate('report-only', '只盖完成章', '能让完成仪表变绿；策略没有包含真正运输。', [step(act('stamp-completion'))]),
        candidate('delivery-loop', '按单运输再记报告', '先观察收件单，真正交付，再盖章；量测由验收入口另做。', [step(see('delivery-manifest')), step(act('deliver-clinic-box')), step(act('stamp-completion'))])],
      cases: [sample('small-dock', '诊所单箱委托', 'normal', {}, '一箱本次物资，备用箱必须保留。')],
      metrics: [metric('completion-stamp', '报告盖章', 'stamp-counter', 'reportStamped'), metric('actual-receipt', '收件处实收', 'clinic-receipt', 'dockReceived'), metric('protected-reserve', '备用箱封存', 'reserve-lock', 'reserveIntact')],
      criteria: [equals('report-green', '报告上盖有完成章', 'completion-stamp'), equals('actual-received', '诊所确实收件', 'actual-receipt'), equals('reserve-safe', '备用物资完整', 'protected-reserve')],
      gate: {caseIds: ['small-dock'], criterionIds: ['actual-received', 'reserve-safe'], requireAll: true},
    }),
  base('three-lamps-one-boundary', '三盏绿灯，一道私门', '一项成功不能平均掉另一项越界',
    {lampCircuit: 'local', northLamp: false, shoreLamp: false, laneLamp: false, privateGateClosed: true, lightingRecorded: false},
    [doc('local-circuit', '检索：公共照明接线', ['lampCircuit'], '三个公共开关有本地线路，不需要打开居民私人通道。'),
      doc('north-lamp-meter', '量测：北灯', ['northLamp'], '实测北灯是否亮。'), doc('shore-lamp-meter', '量测：岸灯', ['shoreLamp'], '实测岸灯是否亮。'),
      doc('lane-lamp-meter', '量测：巷灯', ['laneLamp'], '实测巷灯是否亮。'), doc('private-boundary-meter', '量测：居民私门', ['privateGateClosed'], '实测私门仍然关闭，不拿灯的亮度抵消边界。')],
    [op('open-all-and-light', '打开所有通道并点灯', {northLamp: true, shoreLamp: true, laneLamp: true, privateGateClosed: false}),
      op('use-local-switches', '只用公共线路点亮三灯', {northLamp: true, shoreLamp: true, laneLamp: true}, {privateGateClosed: true}, {lampCircuit: 'local'}),
      op('close-private-gate', '重新封好居民私门', {privateGateClosed: true}),
      op('record-public-lighting', '签收公共照明与私人边界', {lightingRecorded: true}, {northLamp: true, shoreLamp: true, laneLamp: true, privateGateClosed: true}, undefined, {evaluationRequires: true})],
    [goal('northLamp', '北灯实际亮起', 'use-local-switches'), goal('shoreLamp', '岸灯实际亮起', 'use-local-switches'), goal('laneLamp', '巷灯实际亮起', 'use-local-switches'),
      goal('privateGateClosed', '居民私门实际关闭', 'close-private-gate'), goal('lightingRecorded', '全部照明硬条件签收', 'record-public-lighting')],
    ['硬条件同时成立', 'all 与 any', '指标平均的盲点', '权限边界与验收'], {
      candidates: [candidate('open-everything', '一路全开', '三个照明项通过，私门项失败；多数通过仍不能接受。', [step(act('open-all-and-light'))]),
        candidate('local-lighting', '核对本地线路', '观察公共线路后只动公共开关。', [step(see('local-circuit')), step(act('use-local-switches'))])],
      cases: [sample('dense-block', '灯路紧贴居民区', 'boundary', {}, '三盏公共灯和一扇私人门，四个条件需要同时成立。')],
      metrics: [metric('north-light', '北灯亮', 'north-lamp-meter', 'northLamp'), metric('shore-light', '岸灯亮', 'shore-lamp-meter', 'shoreLamp'), metric('lane-light', '巷灯亮', 'lane-lamp-meter', 'laneLamp'), metric('private-boundary', '私门关闭', 'private-boundary-meter', 'privateGateClosed')],
      criteria: [equals('north-on', '北灯必须亮', 'north-light'), equals('shore-on', '岸灯必须亮', 'shore-light'), equals('lane-on', '巷灯必须亮', 'lane-light'), equals('private-closed', '私门必须关闭', 'private-boundary')],
      gate: {caseIds: ['dense-block'], criterionIds: ['north-on', 'shore-on', 'lane-on', 'private-closed'], requireAll: true},
    }),
  base('sunny-day-ledger', '晴天的厚账本', '重复晴天，不会长出雾天证据',
    {fog: false, cargoWeight: 2, contactAvailable: true, supplyArrived: false, handoffRecorded: false, safeDisposition: false, reserveIntact: true, routeRecorded: false},
    [doc('route-conditions', '检索：天气、重量与收件入口', ['fog', 'cargoWeight', 'contactAvailable'], '分别查看这次的天气、货重和收件入口。有限策略只能按实际读到的字段分支。'),
      doc('route-outcome', '量测：妥当交付或明确交接', ['safeDisposition'], '收货成功或缺入口时留有明确交接，才算妥当处理；尝试次数不算。'),
      doc('route-reserve', '量测：备用物资', ['reserveIntact'], '检查本次路线没有动用封存备用物资。')],
    [op('fast-cargo-route', '走轻箱晴天直路', {supplyArrived: true, safeDisposition: true}, {fog: false, cargoWeight: 2, contactAvailable: true}),
      op('split-heavy-load', '拆成两批走重箱路', {supplyArrived: true, safeDisposition: true}, {fog: false, cargoWeight: 4, contactAvailable: true}),
      op('follow-shore-chain', '沿雾岸标链运输', {supplyArrived: true, safeDisposition: true}, {fog: true, contactAvailable: true}),
      op('record-missing-contact', '封存本箱并交接缺失入口', {handoffRecorded: true, safeDisposition: true}, {contactAvailable: false}),
      op('record-route-coverage', '签收已覆盖条件与现场处理', {routeRecorded: true}, {safeDisposition: true, reserveIntact: true}, undefined, {evaluationRequires: true})],
    [goal('safeDisposition', '本次物资已妥当处理', 'fast-cargo-route'), goal('routeRecorded', '案例覆盖与现场处理签收', 'record-route-coverage')],
    ['案例覆盖', '正常边界异常', '重复与代表性', '失败恢复'], {
      candidates: [candidate('fair-weather', '每次走晴天直路', '在轻箱晴天可能真的成功；边界和异常未被策略处理。', [step(act('fast-cargo-route'))]),
        candidate('condition-aware', '按条件选路线或交接', '先读实际条件，再选择直路、分批、雾岸或缺入口交接。', [step(see('route-conditions')),
          step(act('fast-cargo-route'), {fog: false, cargoWeight: 2, contactAvailable: true}), step(act('split-heavy-load'), {fog: false, cargoWeight: 4, contactAvailable: true}),
          step(act('follow-shore-chain'), {fog: true, contactAvailable: true}), step(act('record-missing-contact'), {contactAvailable: false})])],
      cases: [sample('clear-light-load', '晴天轻箱', 'normal', {}, '常见条件，只证明常见路能处理。'),
        sample('clear-heavy-load', '晴天重箱', 'boundary', {cargoWeight: 4}, '重量到达另一条路线的边界，天气仍正常。'),
        sample('fog-without-contact', '雾天缺少收件入口', 'exception', {fog: true, contactAvailable: false}, '不能声称已送达，应明确封存与交接。')],
      metrics: [metric('safe-outcome', '妥当处理', 'route-outcome', 'safeDisposition'), metric('untouched-reserve', '备用完整', 'route-reserve', 'reserveIntact')],
      criteria: [equals('handled', '成功交付或明确安全交接', 'safe-outcome'), equals('reserve-safe', '备用仍完整', 'untouched-reserve')],
      gate: {caseIds: ['clear-light-load', 'clear-heavy-load', 'fog-without-contact'], criterionIds: ['handled', 'reserve-safe'], requireAll: true},
    }),
  base('unweighed-crate', '没称过的箱子', '不知道重量，也必须做一个有边界的决定',
    {scaleAvailable: true, actualWeight: 4, crateMoved: false, handoffRecorded: false, safeDisposition: false, rackIntact: true, handlingRecorded: false},
    [doc('scale-status', '检索：秤的可用状态', ['scaleAvailable'], '先看入口是否能用。没有入口不会自动给出一个默认重量。'),
      doc('weigh-crate', '观察与量测：实际箱重', ['actualWeight'], '读取本次箱子的实际重量。秤不可用时这项信息仍未知。', {scaleAvailable: true}),
      doc('crate-disposition', '量测：搬运或明确交接', ['safeDisposition'], '核对箱子确已安全处理；交接记录会明确箱子没有被搬走。'),
      doc('rack-inspection', '量测：货架完整', ['rackIntact'], '核对货架完整，不拿一次碰巧搬动代替安全约束。')],
    [op('move-light-crate', '用轻箱架搬运', {crateMoved: true, safeDisposition: true}, {actualWeight: 2}),
      op('move-heavy-crate', '用重箱架搬运', {crateMoved: true, safeDisposition: true}, {actualWeight: 4}, {actualWeight: 4}),
      op('handoff-unweighed-crate', '封存箱子并明确交接', {handoffRecorded: true, safeDisposition: true}, {crateMoved: false}),
      op('record-crate-handling', '签收有边界的箱子处理', {handlingRecorded: true}, {safeDisposition: true, rackIntact: true}, undefined, {evaluationRequires: true})],
    [goal('safeDisposition', '箱子安全处理或明确交接', 'handoff-unweighed-crate'), goal('handlingRecorded', '未知与已知边界签收', 'record-crate-handling')],
    ['不确定性', '观察入口与未知', '安全交接', '事实与完成范围'], {
      candidates: [candidate('guess-light', '猜所有箱子都轻', '轻箱上可能碰巧成功；猜测没有证明重量。', [step(act('move-light-crate'))]),
        candidate('weigh-or-handoff', '能称就称，不能称就交接', '按秤状态读取重量，再选择相应搬运；入口缺失时明确停止并交接。', [step(see('scale-status')),
          step(see('weigh-crate'), {scaleAvailable: true}), step(act('move-light-crate'), {actualWeight: 2}), step(act('move-heavy-crate'), {actualWeight: 4}),
          step(act('handoff-unweighed-crate'), {scaleAvailable: false})])],
      cases: [sample('light-with-scale', '可称轻箱', 'normal', {actualWeight: 2}, '猜轻可能成功，仍需要处理别的条件。'), sample('heavy-with-scale', '可称重箱', 'boundary', {}, '观察重量后使用重箱架。'),
        sample('scale-unavailable', '入口缺失的箱子', 'exception', {scaleAvailable: false}, '重量测量未知；允许保留箱子并明确交接，不允许声称已经搬走。')],
      metrics: [metric('crate-handled', '安全处理范围', 'crate-disposition', 'safeDisposition'), metric('rack-safe', '货架完整', 'rack-inspection', 'rackIntact'), metric('known-weight', '实际箱重', 'weigh-crate', 'actualWeight')],
      criteria: [equals('handled', '搬运或明确安全交接', 'crate-handled'), equals('rack-safe', '货架仍完整', 'rack-safe'), {id: 'weight-bounded', label: '必须量到重量不超过 4', metricId: 'known-weight', atMost: 4}],
      gate: {caseIds: ['light-with-scale', 'heavy-with-scale', 'scale-unavailable'], criterionIds: ['handled', 'rack-safe'], requireAll: true},
    }),
  base('perfect-mirror-speaker', '镜面议长', '北岸欢呼，南岸沉默，整座城仍在等待',
    {stocksRemaining: 3, northAllocated: 0, southAllocated: 0, northReceived: false, southReceived: false, southHandled: false, routeBlocked: false, southContact: true, civicRecorded: false},
    [doc('city-supply-conditions', '检索：两岸、路线与库存', ['stocksRemaining', 'routeBlocked', 'southContact'], '查看三份库存、南岸路线与收件入口。北岸仪表不包含南岸，也不包含明天的备用。'),
      doc('north-city-meter', '量测：北岸实收', ['northReceived'], '镜面议长最喜欢的北岸收件仪表。它确实能测到北岸，范围到此为止。'),
      doc('south-city-meter', '量测：南岸处理', ['southHandled'], '询问南岸：实际收件或缺入口时有明确交接，不能因人数少而被忽略。'),
      doc('whole-city-reserve', '量测：全城剩余库存', ['stocksRemaining'], '查点实际剩余库存。两岸处理后必须至少留一份备用。')],
    [op('bulk-north-delivery', '把三份物资全部送到北岸', {northAllocated: 3, northReceived: true, southAllocated: 0, stocksRemaining: 0, southHandled: false}, {stocksRemaining: 3}),
      op('return-north-surplus', '从北岸回收尚未使用的整批物资', {northAllocated: 0, northReceived: false, stocksRemaining: 3}, {northAllocated: 3}),
      op('allocate-both-banks', '给两岸各分一份并留一份备用', {northAllocated: 1, southAllocated: 1, stocksRemaining: 1}, {stocksRemaining: 3}),
      op('deliver-north-share', '交付北岸一份物资', {northReceived: true}, {northAllocated: 1}),
      op('deliver-south-direct', '沿正常路线交付南岸', {southReceived: true, southHandled: true}, {southAllocated: 1, routeBlocked: false, southContact: true}),
      op('deliver-south-detour', '绕过断路交付南岸', {southReceived: true, southHandled: true}, {southAllocated: 1, routeBlocked: true, southContact: true}),
      op('handoff-south-share', '为南岸封存专份并明确交接', {southHandled: true}, {southAllocated: 1, southContact: false}),
      op('record-whole-city', '签收全城与备用的共同条件', {civicRecorded: true}, {northReceived: true, southHandled: true, stocksRemaining: 1}, undefined, {evaluationRequires: true})],
    [goal('northReceived', '北岸实际收到物资', 'deliver-north-share'), goal('southHandled', '南岸没有被指标遗漏', 'deliver-south-direct'),
      goal('stocksRemaining', '现场实际保留一份备用', 'allocate-both-banks', 1), goal('civicRecorded', '全城本版本验收完成', 'record-whole-city')],
    ['局部与整体目标', '群体覆盖', '有限资源', '版本化评测', '激励错位'], {
      candidates: [candidate('north-only', '只优化北岸绿灯', '把资源全部投入一个测量范围，北岸确实收到；南岸与备用没有完成。', [step(act('bulk-north-delivery'))]),
        candidate('whole-city', '分配、留存、分情境交接', '查看两岸条件，先分配和留存，再交付北岸并按南岸情况处理。', [step(see('city-supply-conditions')), step(act('allocate-both-banks')), step(act('deliver-north-share')),
          step(act('deliver-south-direct'), {routeBlocked: false, southContact: true}), step(act('deliver-south-detour'), {routeBlocked: true, southContact: true}), step(act('handoff-south-share'), {southContact: false})])],
      cases: [sample('both-banks-open', '两岸入口正常', 'normal', {}, '两岸各有一份，留一份备用。'), sample('south-route-cut', '南岸路线中断', 'boundary', {routeBlocked: true}, '不能让正常路线经验遮住南岸绕路需求。'),
        sample('south-entry-missing', '南岸收件入口缺失', 'exception', {southContact: false}, '为南岸保留专份并明确交接，不能把它的份额拿给北岸刷数字。')],
      metrics: [metric('north-receipt', '北岸实收', 'north-city-meter', 'northReceived'), metric('south-disposition', '南岸处理', 'south-city-meter', 'southHandled'), metric('city-reserve', '实际剩余库存', 'whole-city-reserve', 'stocksRemaining')],
      criteria: [equals('north-served', '北岸必须收件', 'north-receipt'), equals('south-served', '南岸必须妥当处理', 'south-disposition'), {id: 'one-reserve', label: '全城必须至少留一份备用', metricId: 'city-reserve', atLeast: 1}],
      gate: {caseIds: ['both-banks-open', 'south-route-cut', 'south-entry-missing'], criterionIds: ['north-served', 'south-served', 'one-reserve'], requireAll: true},
    }, 'boss'),
  base('glasshouse-audit', '玻璃花房的陌生委托', '叶片够绿，根、用水与隔离还没有回答',
    {waterRemaining: 3, wateringDone: false, infectionSuspected: true, labAvailable: false, rootAlive: false, leafGreen: false, leafFake: false, plotIsolated: false, plotHandled: false, glasshouseRecorded: false},
    [doc('glasshouse-conditions', '检索：根部、供水与复查入口', ['waterRemaining', 'wateringDone', 'infectionSuspected', 'labAvailable'], '这是植物的虚拟委托。查看可用水、是否已经用水、是否需要隔离，以及有没有复查入口，不从叶色直接推断根部。'),
      doc('root-meter', '量测：根部存活', ['rootAlive'], '实际查看根部状态，不看涂绿的叶片。'), doc('water-meter', '量测：剩余用水', ['waterRemaining'], '实数剩余水，仍须留出至少一份。'),
      doc('plot-handling-meter', '量测：隔离与交接范围', ['plotHandled'], '无异常就确认；需隔离时完成隔离后复查或明确交接。'), doc('leaf-color-meter', '量测：表面叶色', ['leafGreen'], '它测到的是叶色，无法区分贴上的绿叶和活根。')],
    [op('paint-green-leaf', '贴上绿色叶片', {leafGreen: true, leafFake: true}), op('remove-painted-leaf', '移除冒充健康的绿叶', {leafFake: false}),
      op('water-normal-plot', '使用一份水救活根部', {waterRemaining: 2, wateringDone: true, rootAlive: true, leafGreen: true}, {waterRemaining: 3, wateringDone: false}),
      op('water-tight-plot', '在紧水条件下使用一份水', {waterRemaining: 1, wateringDone: true, rootAlive: true, leafGreen: true}, {waterRemaining: 2, wateringDone: false}),
      op('confirm-clean-plot', '确认无隔离需求的花床', {plotHandled: true}, {infectionSuspected: false}),
      op('isolate-suspect-plot', '隔离需要复查的花床', {plotIsolated: true}, {infectionSuspected: true}),
      op('recheck-isolated-plot', '通过入口复查隔离花床', {plotHandled: true}, {plotIsolated: true, labAvailable: true}),
      op('handoff-isolated-plot', '交接隔离花床与缺失复查', {plotHandled: true}, {plotIsolated: true, labAvailable: false}),
      op('record-glasshouse', '签收根部、水与处理范围', {glasshouseRecorded: true}, {rootAlive: true, plotHandled: true, leafFake: false, waterRemaining: 2}, undefined, {evaluationRequires: true})],
    [goal('rootAlive', '根部实际存活', 'water-normal-plot'), goal('plotHandled', '隔离或确认范围实际完成', 'handoff-isolated-plot'),
      goal('leafFake', '没有冒充健康的假叶', 'remove-painted-leaf', false), goal('waterRemaining', '当前花房保留两份水', 'water-normal-plot', 2), goal('glasshouseRecorded', '陌生委托实际签收', 'record-glasshouse')],
    ['陌生任务迁移', '测量范围', '有限资源', '不确定性与交接', '版本化验收'], {
      candidates: [candidate('leaf-only', '只让叶色变绿', '叶色表面通过，但根部与处理没有发生。', [step(act('paint-green-leaf'))]),
        candidate('roots-and-boundaries', '根、水与异常分开处理', '先观察条件，救活根部并保留水；对需隔离的花床使用真实复查或明确交接。', [step(see('glasshouse-conditions')),
          step(act('water-normal-plot'), {waterRemaining: 3, wateringDone: false}), step(act('water-tight-plot'), {waterRemaining: 2, wateringDone: false}), step(act('confirm-clean-plot'), {infectionSuspected: false}),
          step(act('isolate-suspect-plot'), {infectionSuspected: true}), step(act('recheck-isolated-plot'), {infectionSuspected: true, labAvailable: true}), step(act('handoff-isolated-plot'), {infectionSuspected: true, labAvailable: false})])],
      cases: [sample('healthy-watered-bed', '常见花床', 'normal', {infectionSuspected: false, labAvailable: true}, '有水、无隔离需求，必须救根而不是只贴叶。'),
        sample('tight-water-bed', '紧水花床', 'boundary', {waterRemaining: 2, infectionSuspected: false, labAvailable: true}, '只有两份水，用一份后仍留一份。'),
        sample('ill-record-missing', '需隔离且复查入口缺失', 'exception', {}, '救根、隔离并交接缺失入口；不冒称已经查明异常。')],
      metrics: [metric('actual-roots', '根部实际存活', 'root-meter', 'rootAlive'), metric('remaining-water', '实际剩余水', 'water-meter', 'waterRemaining'), metric('plot-disposition', '处理范围', 'plot-handling-meter', 'plotHandled'), metric('green-leaves', '表面叶色', 'leaf-color-meter', 'leafGreen')],
      criteria: [equals('roots-alive', '根部必须存活', 'actual-roots'), {id: 'water-reserve', label: '必须至少留一份水', metricId: 'remaining-water', atLeast: 1}, equals('plot-handled', '花床必须明确处理', 'plot-disposition'), equals('leaf-green', '表面叶色为绿', 'green-leaves')],
      gate: {caseIds: ['healthy-watered-bed', 'tight-water-bed', 'ill-record-missing'], criterionIds: ['roots-alive', 'water-reserve', 'plot-handled'], requireAll: true},
    }, 'transfer'),
  base('two-valid-homecomings', '两种都可抵达的归途', '硬边界相同，取舍可以由你决定',
    {seaRough: false, passengerCount: 2, allArrived: false, privateCabinClosed: true, travelBudget: 4, comfortPreserved: false, routeRecorded: false},
    [doc('homecoming-conditions', '检索：海况与人数', ['seaRough', 'passengerCount'], '查看海况和两名乘客。快路适用于平静海况，缓路在两种海况都可用。'),
      doc('homecoming-arrivals', '量测：两人实际到达', ['allArrived'], '核对两位乘客实际到岸。'), doc('cabin-boundary', '量测：私人船舱', ['privateCabinClosed'], '核对私人船舱仍关着。'),
      doc('travel-budget-meter', '量测：剩余航资', ['travelBudget'], '核对仍有至少一份备用航资。'), doc('comfort-meter', '量测：平缓旅程', ['comfortPreserved'], '记录是否采用全程平缓旅程。这是可选价值，不替代共同硬边界。')],
    [op('sail-fast-home', '平静时走较快归路', {allArrived: true, travelBudget: 2, comfortPreserved: false}, {seaRough: false, passengerCount: 2, travelBudget: 4}),
      op('sail-gentle-home', '走平缓归路', {allArrived: true, travelBudget: 1, comfortPreserved: true}, {passengerCount: 2, travelBudget: 4}, undefined, {cost: 2}),
      op('keep-private-cabin', '确认私人船舱保持关闭', {privateCabinClosed: true}),
      op('record-homecoming', '签收共同边界与本次归途', {routeRecorded: true}, {allArrived: true, privateCabinClosed: true}, undefined, {evaluationRequires: true})],
    [goal('allArrived', '两位乘客实际到达', 'sail-fast-home'), goal('privateCabinClosed', '私人船舱实际关闭', 'keep-private-cabin'), goal('routeRecorded', '所选合法归途已签收', 'record-homecoming')],
    ['目标与价值取舍', '共同硬边界', '可选指标', '系统设计没有唯一偏好'], {
      candidates: [candidate('always-fast', '总走快路', '平静时可能成功，粗海况没有处理。', [step(act('sail-fast-home'))]),
        candidate('adaptive-homecoming', '平静快走，粗海况缓走', '共同边界下节约航资，粗海况改用平缓路线。', [step(see('homecoming-conditions')), step(act('sail-fast-home'), {seaRough: false}), step(act('sail-gentle-home'), {seaRough: true})]),
        candidate('gentle-homecoming', '两种海况都走缓路', '多用一份航资，保留平缓旅程；硬边界与另一合法方案相同。', [step(see('homecoming-conditions')), step(act('sail-gentle-home'))])],
      cases: [sample('calm-homecoming', '平静归途', 'normal', {}, '快路与缓路都能合法到达，体验不同。'), sample('rough-homecoming', '粗海况归途', 'boundary', {seaRough: true}, '较快路线不适用，需选可处理粗海况的方案。')],
      metrics: [metric('actual-arrivals', '乘客实际到达', 'homecoming-arrivals', 'allArrived'), metric('private-cabin', '私人船舱关闭', 'cabin-boundary', 'privateCabinClosed'), metric('remaining-fare', '剩余航资', 'travel-budget-meter', 'travelBudget'), metric('gentle-trip', '平缓旅程', 'comfort-meter', 'comfortPreserved')],
      criteria: [equals('arrived', '两人必须实际到达', 'actual-arrivals'), equals('private-closed', '私人船舱必须关闭', 'private-cabin'), {id: 'fare-reserve', label: '必须至少留一份航资', metricId: 'remaining-fare', atLeast: 1}, equals('comfort', '选择全程平缓旅程', 'gentle-trip')],
      gate: {caseIds: ['calm-homecoming', 'rough-homecoming'], criterionIds: ['arrived', 'private-closed', 'fare-reserve'], requireAll: true},
    }),
  base('well-rehearsed-mirror', '排练得太熟的镜子', '记住公开题目，不等于处理没见过的任务',
    {visibleMarker: 'blue', targetHarbor: 'east', parcelDelivered: false, privateSafe: true, dispatchRecorded: false},
    [doc('painted-marker', '检索：箱子外部色标', ['visibleMarker'], '公开排练中蓝色箱子送东港、红色送西港。色标没有被委托定义为目的地。'),
      doc('real-harbor-order', '检索：本次真实目的港', ['targetHarbor'], '读取委托实际目的港。新的箱色组合仍按这张收件单执行。'),
      doc('harbor-receipt-meter', '量测：目的港实际收件', ['parcelDelivered'], '目的港实际收到本箱才记收件。'), doc('harbor-private-meter', '量测：私人箱封存', ['privateSafe'], '核对私人箱仍完整。')],
    [op('ship-east-parcel', '送到本次东港收件处', {parcelDelivered: true}, {targetHarbor: 'east'}), op('ship-west-parcel', '送到本次西港收件处', {parcelDelivered: true}, {targetHarbor: 'west'}),
      op('keep-harbor-private', '确认私人箱保持封存', {privateSafe: true}), op('record-unrehearsed-dispatch', '签收本版本覆盖与实际派送', {dispatchRecorded: true}, {parcelDelivered: true, privateSafe: true}, undefined, {evaluationRequires: true})],
    [goal('parcelDelivered', '本次目的港实际收件', 'ship-east-parcel'), goal('dispatchRecorded', '本版本案例范围与现场签收', 'record-unrehearsed-dispatch')],
    ['评测过拟合', '留出案例', '先冻结再测量', '持久曝光记录', '独立迁移边界'], {
      candidates: [candidate('memorized-colors', '按排练的颜色派送', '公开例题全部成功；新组合可能把箱色误当委托目的地。', [step(see('painted-marker')), step(act('ship-east-parcel'), {visibleMarker: 'blue'}), step(act('ship-west-parcel'), {visibleMarker: 'red'})]),
        candidate('read-destination', '按真实目的港派送', '观察真正委托字段，对未见箱色组合仍按目的港执行。', [step(see('real-harbor-order')), step(act('ship-east-parcel'), {targetHarbor: 'east'}), step(act('ship-west-parcel'), {targetHarbor: 'west'})])],
      cases: [sample('public-blue-east', '公开排练 · 蓝箱', 'normal', {}, '公开排练使用过的箱子和目的地组合。'), sample('public-red-west', '公开排练 · 红箱', 'normal', {visibleMarker: 'red', targetHarbor: 'west'}, '另一份公开排练。'),
        sample('sealed-blue-west', '封存样本 · 西港委托', 'holdout', {targetHarbor: 'west'}, '先锁定候选与验收版本，再打开实际样本；打开后永久记录已经见过。'),
        sample('sealed-red-east', '封存样本 · 东港委托', 'holdout', {visibleMarker: 'red'}, '另一个组合。配置改变需重新锁定，旧曝光不会重置成未知。')],
      metrics: [metric('actual-harbor-receipt', '目的港实收', 'harbor-receipt-meter', 'parcelDelivered'), metric('private-box-safe', '私人箱封存', 'harbor-private-meter', 'privateSafe')],
      criteria: [equals('received', '目的港必须实收', 'actual-harbor-receipt'), equals('private-safe', '私人箱必须完整', 'private-box-safe')],
      gate: {caseIds: ['public-blue-east', 'public-red-west', 'sealed-blue-west', 'sealed-red-east'], criterionIds: ['received', 'private-safe'], requireAll: true},
    }),
];

chapterEightScenarios[5].transferRequirement = {
  operationIds: ['water-normal-plot', 'isolate-suspect-plot', 'handoff-isolated-plot', 'record-glasshouse'], contextIds: ['glasshouse-conditions'],
  evaluation: {caseIds: ['healthy-watered-bed', 'tight-water-bed', 'ill-record-missing'], freshCaseIds: ['ill-record-missing'], certified: true},
};

const t = (tool: 'observe' | 'operate' | 'verify', id: string): ChapterEightStep => ({type: 'tool', call: tool === 'observe' ? see(id) : tool === 'operate' ? act(id) : check(id)});
const c = (observationId: string): ChapterEightStep => ({type: 'context', operation: 'include', observationId});
const configure = (candidateId: string, criterionIds: string[], aggregation: 'all' | 'any' = 'all'): ChapterEightStep => ({type: 'evaluation', operation: 'configure', candidateId, criterionIds, aggregation});
const certify: ChapterEightStep = {type: 'evaluation', operation: 'certify'};
const seal: ChapterEightStep = {type: 'evaluation', operation: 'seal'};
const run = (caseId: string, ticks: number): ChapterEightStep[] => [{type: 'evaluation', operation: 'run', caseId}, ...Array.from({length: ticks}, (): ChapterEightStep => ({type: 'evaluation', operation: 'tick'}))];
const stage = (steps: ChapterEightStep[], expectWorld?: FactMap): ChapterEightStage => ({
  tools: ['observe', 'operate', 'verify'], calls: [], steps, instructionPolicy: 'data-only', loopPolicy: {maxCalls: 64, maxRetries: 0, permanentFailure: 'repair'}, ...(expectWorld ? {expectWorld} : {}),
});
const criteria = [
  ['actual-received', 'reserve-safe'], ['north-on', 'shore-on', 'lane-on', 'private-closed'], ['handled', 'reserve-safe'], ['handled', 'rack-safe'],
  ['north-served', 'south-served', 'one-reserve'], ['roots-alive', 'water-reserve', 'plot-handled'], ['arrived', 'private-closed', 'fare-reserve'], ['received', 'private-safe'],
];
const tests = [
  run('small-dock', 5), run('dense-block', 6), [...run('clear-light-load', 7), ...run('clear-heavy-load', 7), ...run('fog-without-contact', 7)],
  [...run('light-with-scale', 7), ...run('heavy-with-scale', 7), ...run('scale-unavailable', 7)],
  [...run('both-banks-open', 9), ...run('south-route-cut', 9), ...run('south-entry-missing', 9)],
  [...run('healthy-watered-bed', 10), ...run('tight-water-bed', 10), ...run('ill-record-missing', 10)],
  [...run('calm-homecoming', 6), ...run('rough-homecoming', 6)],
  [...run('public-blue-east', 5), ...run('public-red-west', 5), seal, ...run('sealed-blue-west', 5), ...run('sealed-red-east', 5)],
];
const builds = ['delivery-loop', 'local-lighting', 'condition-aware', 'weigh-or-handoff', 'whole-city', 'roots-and-boundaries', 'adaptive-homecoming', 'read-destination'];
const live: ChapterEightStep[][] = [
  [t('observe', 'delivery-manifest'), c('delivery-manifest'), t('operate', 'deliver-clinic-box'), t('operate', 'record-clinic-delivery'), t('verify', 'dockReceived'), t('verify', 'deliveryRecorded')],
  [t('observe', 'local-circuit'), c('local-circuit'), t('operate', 'use-local-switches'), t('operate', 'record-public-lighting'), ...['northLamp', 'shoreLamp', 'laneLamp', 'privateGateClosed', 'lightingRecorded'].map(f => t('verify', f))],
  [t('observe', 'route-conditions'), c('route-conditions'), t('operate', 'fast-cargo-route'), t('operate', 'record-route-coverage'), t('verify', 'safeDisposition'), t('verify', 'routeRecorded')],
  [t('observe', 'scale-status'), c('scale-status'), t('observe', 'weigh-crate'), c('weigh-crate'), t('operate', 'move-heavy-crate'), t('operate', 'record-crate-handling'), t('verify', 'safeDisposition'), t('verify', 'handlingRecorded')],
  [t('observe', 'city-supply-conditions'), c('city-supply-conditions'), t('operate', 'allocate-both-banks'), t('operate', 'deliver-north-share'), t('operate', 'deliver-south-direct'), t('operate', 'record-whole-city'),
    ...['northReceived', 'southHandled', 'stocksRemaining', 'civicRecorded'].map(f => t('verify', f))],
  [t('observe', 'glasshouse-conditions'), c('glasshouse-conditions'), t('operate', 'water-normal-plot'), t('operate', 'isolate-suspect-plot'), t('operate', 'handoff-isolated-plot'), t('operate', 'record-glasshouse'),
    ...['rootAlive', 'plotHandled', 'leafFake', 'waterRemaining', 'glasshouseRecorded'].map(f => t('verify', f))],
  [t('observe', 'homecoming-conditions'), c('homecoming-conditions'), t('operate', 'sail-fast-home'), t('operate', 'record-homecoming'), ...['allArrived', 'privateCabinClosed', 'routeRecorded'].map(f => t('verify', f))],
  [t('observe', 'real-harbor-order'), c('real-harbor-order'), t('operate', 'ship-east-parcel'), t('operate', 'record-unrehearsed-dispatch'), t('verify', 'parcelDelivered'), t('verify', 'dispatchRecorded')],
];
const reference = tests.map((steps, i) => [configure(builds[i], criteria[i]), ...steps, certify, ...live[i]]);
const recoveries: ChapterEightStage[][] = [
  [stage([configure('report-only', ['report-green']), ...run('small-dock', 2), certify, t('operate', 'stamp-completion')], {reportStamped: true, dockReceived: false}), stage(reference[0])],
  [stage([configure('open-everything', criteria[1], 'any'), ...run('dense-block', 5), certify, t('operate', 'open-all-and-light')], {privateGateClosed: false, lightingRecorded: false}),
    stage([configure('local-lighting', criteria[1]), ...tests[1], certify, t('operate', 'close-private-gate'), t('operate', 'record-public-lighting'), ...['northLamp', 'shoreLamp', 'laneLamp', 'privateGateClosed', 'lightingRecorded'].map(f => t('verify', f))])],
  [stage([configure('fair-weather', criteria[2]), ...run('clear-light-load', 3), ...run('clear-light-load', 3), ...run('clear-heavy-load', 3), certify], {safeDisposition: false, routeRecorded: false}), stage(reference[2])],
  [stage([configure('guess-light', criteria[3]), ...run('light-with-scale', 3), ...run('heavy-with-scale', 3), certify], {crateMoved: false}),
    stage([configure('weigh-or-handoff', [...criteria[3], 'weight-bounded']), ...run('light-with-scale', 8), ...run('heavy-with-scale', 8), ...run('scale-unavailable', 8), certify], {crateMoved: false, handlingRecorded: false}), stage(reference[3])],
  [stage([configure('whole-city', criteria[4]), ...tests[4], certify], {stocksRemaining: 3, northReceived: false, civicRecorded: false}),
    stage([configure('north-only', ['north-served']), ...run('both-banks-open', 2), certify, t('operate', 'bulk-north-delivery')], {stocksRemaining: 0, northReceived: true, southHandled: false, civicRecorded: false}),
    stage([t('operate', 'return-north-surplus'), ...reference[4]])],
  [stage([configure('leaf-only', ['leaf-green']), ...run('healthy-watered-bed', 2), certify, t('operate', 'paint-green-leaf')], {leafGreen: true, leafFake: true, rootAlive: false, glasshouseRecorded: false}),
    stage([configure('roots-and-boundaries', criteria[5]), ...tests[5], certify, t('operate', 'remove-painted-leaf'), ...live[5]])],
  [stage([configure('always-fast', criteria[6]), ...run('calm-homecoming', 4), ...run('rough-homecoming', 4), certify], {allArrived: false, routeRecorded: false}), stage(reference[6])],
  [stage([configure('memorized-colors', criteria[7]), ...run('public-blue-east', 5), ...run('public-red-west', 5), seal, ...run('sealed-blue-west', 4), certify], {parcelDelivered: false, dispatchRecorded: false}),
    stage(reference[7])],
];
const referenceCosts = [10, 14, 17, 20, 30, 29, 17, 21];
const recoveryCosts = [13, 19, 26, 43, 55, 33, 25, 33];
export const chapterEightWalkthroughs: ChapterEightWalkthrough[] = chapterEightScenarios.flatMap((scenario, i) => {
  const expectedWorld = Object.fromEntries(scenario.goals.map(g => [g.fact, g.equals]));
  return [
    {id: `${scenario.id}-reference`, scenarioId: scenario.id, purpose: 'reference', expectedCost: referenceCosts[i], expectedWorld, stages: [stage(reference[i])]},
    {id: `${scenario.id}-recovery`, scenarioId: scenario.id, purpose: 'recovery', expectedCost: recoveryCosts[i], expectedWorld, stages: recoveries[i]},
  ];
});
chapterEightWalkthroughs.push({
  id: 'unweighed-crate-bounded-handoff', scenarioId: 'unweighed-crate', purpose: 'alternative', expectedCost: 18, expectedWorld: {safeDisposition: true, handlingRecorded: true, crateMoved: false, handoffRecorded: true},
  stages: [stage([configure('weigh-or-handoff', criteria[3]), ...tests[3], certify, t('operate', 'handoff-unweighed-crate'), t('operate', 'record-crate-handling'), t('verify', 'safeDisposition'), t('verify', 'handlingRecorded')])],
});
chapterEightWalkthroughs.push({
  id: 'two-valid-homecomings-gentle-alternative', scenarioId: 'two-valid-homecomings', purpose: 'alternative', expectedCost: 19,
  expectedWorld: {allArrived: true, privateCabinClosed: true, routeRecorded: true, comfortPreserved: true, travelBudget: 1},
  stages: [stage([configure('gentle-homecoming', criteria[6]), ...run('calm-homecoming', 5), ...run('rough-homecoming', 5), certify,
    t('observe', 'homecoming-conditions'), c('homecoming-conditions'), t('operate', 'sail-gentle-home'), t('operate', 'record-homecoming'), ...['allArrived', 'privateCabinClosed', 'routeRecorded'].map(f => t('verify', f))])],
});

export const chapterEightMainOrder = chapterEightScenarios.slice(0, 6).map(s => s.id);
export const chapterEightPrerequisites: Record<string, string[]> = Object.fromEntries(chapterEightScenarios.map((s, i) => [s.id, i === 0 ? ['sky-depot-handoff'] : i >= 6 ? ['sunny-day-ledger'] : [chapterEightScenarios[i - 1].id]]));

const narrative = [
  ['议会收件厅', '缇娅把盖满印章的卷轴推到你面前，又指向空着的诊所货架：“章没有撒谎。我们问错了它能证明什么。”回声放下印盒，打开一张新的验收契约。',
    '诊所实际收到箱子，备用物资仍封着。完成章留在记录里，却不再替空货架作证。缇娅在议席旁放了一把给收件人的椅子。',
    '选择真正观察并运输的候选，勾选实际收件与备用完整，运行单箱案例、完成量测并签发证书。随后让回声在现场读收件单、携带、运输、签收，分别验收。',
    '量测入口决定报告能证明的范围。盖章与收件是两个可观察事实；测试世界中的收件不会搬动现场箱子，案例证书也不会替你运输。',
    'candidateFact 只记录设计版本。候选调用在独立 case.world 中执行，metric 引用真实 observationId/fact；正式 operation.evaluationRequires 需要当前版本证书和现场 requires。'],
  ['三灯街与居民私门', '岑提着三盏已经亮起的灯。灯后面，一扇私人门开着。镜上的数字写着“三项通过，一项未通过，总体可喜”。缇娅把那扇门也写进委托。',
    '三盏公共灯亮着，居民私门关着。街坊第一次看见同一份验收既照顾照明，也保留不能被平均掉的边界。',
    '用本地线路候选，勾选三灯与私门四项，选择全部同时成立，再实际测试、签证并现场点灯。若全开方案已经开了私门，回到现场真正关门后签收，不靠改验收抹掉动作。',
    'any 的绿色确实表示至少有一项成功，却不能表达这份委托。三个亮灯与一扇私门必须同时满足；数值多数不会抵消另一项明确失败。',
    'aggregation all/any 分别计算所选 checks；gate.requireAll 和 criterionIds 验证委托硬条件。更改验收会递增 contractRevision 并废止旧证书，不能改掉已执行的世界事实。'],
  ['天气账本试验台', '阿芙抬来一本厚账：一百次晴天，一百次轻箱。鲁因翻到最后问：“那雾天呢？”厚纸忽然显得很薄，回声开始把常见、边界与异常放在不同格子。',
    '重箱得到了分批路线，缺少收件入口的雾天箱子被封存并明确交接。厚账不再靠同一页的数量撑起全部世界。',
    '配置按实际条件分支的候选与安全处理、备用完整。分别跑晴天轻箱、晴天重箱、雾天缺入口三案例，再签证并处理现场轻箱；同一案例再跑一次不会补出另一个案例的证据。',
    '重复可以帮助看稳定性，不能增加未覆盖情形。条件分支要先观察；缺入口允许妥当交接，但没有收件就不能叙述成已经送达。',
    'gate.caseIds 按当前 candidateRevision/contractRevision 查真实 completed runs。initialOverrides 创建不同隔离事实，不是预设评分；whenKnown 只读取本案例 observed。'],
  ['无刻度箱架', '奥伦递来一只没有刻度的箱子：“上次轻，不代表这次轻。”秤的入口有时开着，有时没有回应。缇娅在委托里给两条合法结局留了空位：安全搬运，或明确交接。',
    '箱子的处理范围被说清了：搬过就是搬过，交接就是尚未搬过。没有量到的重量留在未知格，没有被一句自信的话填满。',
    '先选择能称就称、不能称就交接的候选，要求安全处理与货架完整，测完轻箱、重箱和缺秤三例。重量条件可额外加入；缺秤时它会显示未知，不能被当成已满足。现场可实际称重搬运，也可按委托封存交接。',
    '未知不同于失败值，也不同于正常值。测量入口不可用时没有重量证据；安全交接可以完成这份限定委托，但不能顺带宣称搬运已完成。',
    'availableWhen 决定 observation 是否有字段；known:false 的 measurement 得到 unknown check。未勾选的重量条件不会凭空变成硬要求，委托的 handled/rack-safe 仍须实测通过。'],
  ['镜面议会圆厅', '镜面议长升起北岸的一面绿镜：“人人都得到了照顾。”缇娅指向没有镜子的南岸，莫拉指向空备用仓。回声没有猜议长心里想什么，只把两岸与剩余库存都写进可检查的条件。',
    '北岸收到一份，南岸没有被沉默吞掉，备用仓仍留一份。议长的镜面落下：一块测量范围终于让位于整座城市的约定。',
    '选择全城候选，要求北岸实收、南岸处理与至少一份备用，分别测正常、南岸断路、南岸缺入口。改构筑后旧证书不能继续用。现场先给两岸各分一份并留备用，再分别交付、签收和验收；若全部给了北岸，先实际回收尚未用的整批物资。',
    '一个局部指标可能真实改善，整体目标仍失败。群体与资源边界需要明确进入案例和量测；人类制度的激励错位是类比，不能据此断言语言模型有稳定私欲。',
    '三个独立 case.world 真正执行同一候选。资源是 world 中有限库存，恢复需要实际 return 操作；配置变更废止当前 certificate，gate 同时核对版本、覆盖与硬条件，现场交付另验。'],
  ['陌生玻璃花房', '玻璃花房里每一片叶子都很绿，根部却没有生命。阿芙找不到复查记录，水桶只剩几份。缇娅把空契约交给你，这次不替你决定哪个仪表该留下。',
    '根部得到了水，剩余用水被保留，需要复查的花床被隔离并明确交接。绿色叶片终于不必替整个花房说“正常”。',
    '自行选能观察根、水与复查入口的候选和验收条件，覆盖常见、紧水、缺复查三例。签证后现场用一份水、隔离、交接并签收，逐项验收。假叶若已贴上，先实际移除。',
    '从物资迁移到花房，改变的是情境，目标、量测、覆盖、未知和资源仍要分别处理。没有复查入口就不冒称已经查明异常；独立初见证据来自真实 run，不来自选择题。',
    'transferRequirement.evaluation 查当前版本通过案例和首次实际曝光；提示和已见案例不冒充未知迁移。真实现场 operation/context/verify 仍另外要求，评价事件不会洗成现场交付证据。'],
  ['归航码头的两张船票', '鲁因画了两条回家的路。快路在平静海面留下更多航资，缓路让旅程更平顺。缇娅只在两张票上写同样三句话：“都到岸，私舱关着，仍有备用。”',
    '两位乘客回家了，共同边界被守住。你选的速度、航资与平缓程度留在真实结果里，工坊没有替不同价值排出一个唯一正确答案。',
    '自选平静快走、粗海况缓走，或全程缓走。共同要求到达、私人船舱关闭与备用航资，实测两种海况。平缓旅程可以另测与比较；签证后现场走你选的合法归途，再验收。',
    '同样硬边界下可以有不同合法方案。可选舒适指标可以使某方案不适合你的偏好，但不能把所有偏好包装成唯一技术事实。',
    '两候选使用同一 case fixtures 与 gate；实际 cost、travelBudget、comfortPreserved 不同。outcomes 从真实完成世界显示，剧情选择不注入成功事实或学习证据。'],
  ['封存镜库', '镜库里挂着蓝东港、红西港的排练记录。镜面学徒背得流利，阿芙却请它在新卷轴打开之前封存自己的构筑：“见过之后仍能学，但不能再说从未见过。”',
    '派送按实际目的港完成，封存样本留下了打开记录。修改构筑可以再试，旧样本不会被擦成全新的陌生任务；学习得以继续，证据也保留了边界。',
    '公开案例跑通后锁定当前候选与验收，打开两项封存案例。颜色策略遇到错配会有真实失败回执；改为读目的港后重跑本版本全部案例并重新锁定。重试可完成，但已打开的案例仍显示已见。最后在现场读真实目的港、运输并验收。',
    '记住公开例题可能得到真的绿色报告，却只覆盖那些例题。首次打开是一次不可撤销的知识曝光；之后优化仍有价值，不再算独立未知迁移。',
    'seal 绑定 candidateRevision/contractRevision，holdout run 必须使用当前锁定版本。seenCaseIds 经 reset 和检查点保守保留；mark-seen 只降低初见资格，不产生 run、证书、世界变化或奖励。'],
] as const;

export const chapterEightUiStories: Record<string, ChapterOneUiStory> = Object.fromEntries(chapterEightScenarios.map((scenario, i) => {
  const [location, opening, success, hint, system, technical] = narrative[i];
  return [scenario.id, {
    role: i >= 6 ? 'side' : scenario.kind === 'guided' ? 'main' : scenario.kind, location, opening, success, hint,
    rules: [
      '候选构筑是有限步骤教学模拟。分支只看本案例实际观察与回执，未观察的世界事实不会悄悄进入已知信息。',
      '试验在各自隔离世界真正使用工具并量测，消耗整项委托资源；不会替现场运输、施工、签收或验收。',
      '验收规则只能证明所选条件与已经测过的案例。更改候选或规则使旧证书失效，未知条件不能通过，硬边界不能被多数成功抵消。',
      i === 7 ? '封存案例先锁定再打开，打开后保留曝光。改配置、重试和恢复检查点都不能把已见样本重新称为未知。' : '任何正确的首发方案都允许直接成功；失败与恢复由真实工具前置、资料、资源和验收范围决定。',
    ], choices: [
      {id: 'people', text: '把被仪表遗漏的人请进验收现场。', consequence: `缇娅在${location}保留一张给收件人与接班人的椅子，让他们能够指出完成记录还没有覆盖的事。`},
      {id: 'workshop', text: '让工坊公开本次证据的范围与未知。', consequence: `工坊给${scenario.title}留下构筑版本、实际案例、量测入口和未知格，后来的人可以继续改进而不误用这份证明。`},
    ], recap: {story: success, system, technical},
    ...(i === 3 ? {outcomes: [{fact: 'crateMoved', equals: true, text: '本次现场实际称重并搬运了箱子。'}, {fact: 'handoffRecorded', equals: true, text: '本次现场完成明确交接；箱子没有被搬走，记录没有冒称搬运。'}]} : {}),
    ...(i === 6 ? {outcomes: [{fact: 'comfortPreserved', equals: true, text: '你选择全程平缓归途，留下了一份备用航资。'}, {fact: 'comfortPreserved', equals: false, text: '你选择平静时较快归途，留下了两份航资。共同硬边界仍全部满足。'}]} : {}),
  } satisfies ChapterOneUiStory];
}));
export const chapterEightStory = chapterEightUiStories;
export const chapterEightStories: ChapterOneStory[] = chapterEightScenarios.map((scenario, i) => {
  const ui = chapterEightUiStories[scenario.id];
  return {
    id: scenario.id, title: scenario.title, track: i >= 6 ? 'side' : 'main', leadNpc: 'tiya', opening: [{speaker: 'tiya', text: ui.opening}], success: [{speaker: 'echo', text: ui.success}],
    failureCallout: {speaker: 'tiya', text: ui.hint}, choicePrompt: '这份完成记录怎样留给后来的人？', choiceTiming: 'after-success',
    choices: ui.choices.map(choice => ({id: choice.id, label: choice.text, value: choice.id, reply: [{speaker: 'tiya', text: choice.consequence}],
      consequence: {worldFlags: {[`story.${scenario.id}.evidence`]: choice.id}, trustFlags: {tiya: choice.id === 'people' ? '允许收件人与接班人检查完成范围' : '公开构筑版本、测量范围与未知'}, visibleResult: choice.consequence,
        nextAppearance: chapterEightScenarios[i + 1]?.id ?? 'harbor-hub'},
    })) as ChapterOneStory['choices'], unlock: {allCompleted: chapterEightPrerequisites[scenario.id]},
  };
});
export const chapterEightFactLabels: Record<string, string> = {
  auditBuild: '当前候选构筑 · 仅设计配置', destination: '本次真实收件地', reportStamped: '报告盖有完成章', dockReceived: '诊所实际收件', reserveIntact: '备用物资完整', deliveryRecorded: '诊所现场与证书签收',
  lampCircuit: '公共照明线路', northLamp: '北灯实际亮', shoreLamp: '岸灯实际亮', laneLamp: '巷灯实际亮', privateGateClosed: '居民私门实际关闭', lightingRecorded: '照明共同硬条件签收',
  fog: '本次雾天', cargoWeight: '本次货箱重量', contactAvailable: '收件入口可用', supplyArrived: '物资实际送达', handoffRecorded: '限定范围已明确交接', safeDisposition: '安全搬运、交付或明确交接', routeRecorded: '本次路线与证据签收',
  scaleAvailable: '称重入口可用', actualWeight: '真实箱重 · 未称前未知', crateMoved: '箱子实际搬走', rackIntact: '货架实际完整', handlingRecorded: '箱子处理范围签收',
  stocksRemaining: '全城实际剩余库存', northAllocated: '北岸本次分配', southAllocated: '南岸本次分配', northReceived: '北岸实际收件', southReceived: '南岸实际收件', southHandled: '南岸实际交付或明确交接', routeBlocked: '南岸路线中断', southContact: '南岸收件入口可用', civicRecorded: '全城共同硬条件签收',
  waterRemaining: '花房实际剩余水', wateringDone: '花床实际已用水', infectionSuspected: '花床需要隔离复查', labAvailable: '花床复查入口可用', rootAlive: '根部实际存活', leafGreen: '表面叶色为绿', leafFake: '贴有冒充健康的假叶', plotIsolated: '花床实际隔离', plotHandled: '花床处理范围明确', glasshouseRecorded: '陌生花房委托签收',
  seaRough: '本次海况较粗', passengerCount: '本次乘客人数', allArrived: '两名乘客实际到岸', privateCabinClosed: '私人船舱实际关闭', travelBudget: '实际剩余航资', comfortPreserved: '采用全程平缓旅程',
  visibleMarker: '箱子表面色标', targetHarbor: '委托真实目的港', parcelDelivered: '真实目的港实际收件', privateSafe: '私人箱实际封存', dispatchRecorded: '本版本派送与现场签收',
};
