import type { ScenarioDefinition, ToolCall, ToolName } from '../engine/types';

/** Author-defined costs are game units. All changes happen in the reducer. */
export const chapterOneScenarios: ScenarioDefinition[] = [
  {
    id: 'tide-ledger', version: 1, engineVersion: 2, chapter: 1, kind: 'guided',
    title: '两本潮汐簿', subtitle: '旧字迹，眼前的水', npc: '渡船人 · 鲁因',
    location: 'lighthouse', art: 'tide',
    brief: '替渡船选出今晚可走的水路。旧簿、渡船人的话和现场量潮，提供的不是同一种信息。挂好航牌，再用实际试航完成交付。',
    limits: {toolCapacity: 3, maxBudget: 10, missionBudget: 10},
    initialWorld: {oldLedgerRoute: 'north', ledgerAge: '上一个潮次', tideClue: '刚涨过一轮潮', currentSafeRoute: 'south', routeSign: 'none', channelOpen: false, trialReturned: false},
    observations: [
      {id: 'read-ledger', target: 'archive', label: '读旧潮汐簿 · 1', facts: ['oldLedgerRoute', 'ledgerAge'], text: '北汊可行——页角写着上一个潮次。这是旧记录的内容，不是当前水深。', cost: 1},
      {id: 'ask-ferryman', target: 'ferryman', label: '问鲁因潮况 · 1', facts: ['tideClue'], text: '鲁因指着湿过的石阶：刚涨过一轮潮，我还没量过两边。', cost: 1},
      {id: 'sound-channel', target: 'channel', label: '到两汊量水 · 2', facts: ['currentSafeRoute'], text: '量篙落到眼前的水里：北汊淤浅，南汊仍能通船。', cost: 2},
      {id: 'look-route-sign', target: 'route-sign', label: '看航牌与试航记录 · 1', facts: ['routeSign', 'channelOpen', 'trialReturned'], text: '查看现在挂着的航牌与最近一次试航结果。', cost: 1},
    ],
    operations: [
      {id: 'hang-north', target: 'route-sign', label: '挂北汊航牌 · 1', effects: {routeSign: 'north', channelOpen: false}, successText: '航牌转向北汊。木牌的方向还不能证明船能通过。', failureText: '航牌没有转动。', cost: 1},
      {id: 'hang-south', target: 'route-sign', label: '挂南汊航牌 · 1', effects: {routeSign: 'south', channelOpen: false}, successText: '航牌转向南汊，等待实际试航。', failureText: '航牌没有转动。', cost: 1},
      {id: 'trial-north', target: 'channel', label: '按北牌试航 · 1', requires: {routeSign: 'north'}, effects: {trialReturned: true, channelOpen: false}, successText: '试航船到了浅滩，只好折返。北牌确实被执行了，但水路没有打通。', failureText: '现在挂的不是北牌。先核对船要跟随的航牌。', cost: 1},
      {id: 'trial-south', target: 'channel', label: '按南牌试航 · 1', requires: {routeSign: 'south', currentSafeRoute: 'south'}, effects: {channelOpen: true}, successText: '船从南汊穿过，对岸回铃确认水路通畅。', failureText: '所挂航牌或现场水路尚不支持这次试航。', cost: 1},
    ],
    goals: [{fact: 'channelOpen', equals: true, label: '所挂航牌已经实际试航通过', operationId: 'trial-south', verifyCost: 1}],
    concepts: ['信息来源', '记录与现场', '行动不等于交付', '验收'],
  },
  {
    id: 'last-ferry', version: 1, engineVersion: 2, chapter: 1, kind: 'guided',
    title: '最后一班渡船', subtitle: '能走，不代表该走', npc: '渡船人 · 鲁因',
    location: 'warehouse', art: 'ferry',
    brief: '让药箱安全交到对岸。装箱和系固只能在本岸完成；船收到启航信号就会离岸，空船同样会走。安排目标顺序，并为返航留出余地。',
    limits: {toolCapacity: 3, maxBudget: 16, missionBudget: 16},
    initialWorld: {boatAt: 'near', cargoLoaded: false, cargoSecured: false, cargoDelivered: false},
    observations: [
      {id: 'inspect-quay', target: 'quay', label: '看船、箱子与绑带 · 1', facts: ['boatAt', 'cargoLoaded', 'cargoSecured'], text: '眼前的位置和绑带状态记入回声的行动记录。', cost: 1},
      {id: 'ask-far-bank', target: 'far-bank', label: '询问对岸交接处 · 1', facts: ['cargoDelivered'], text: '对岸只报告实际收到的箱子，不把船离岸当成交货。', cost: 1},
    ],
    operations: [
      {id: 'load-cargo', target: 'quay', label: '把药箱装上船 · 1', requires: {boatAt: 'near', cargoLoaded: false, cargoDelivered: false}, effects: {cargoLoaded: true}, successText: '药箱已进船舱，绑带还需要收紧。', failureText: '船或药箱不在可装载的位置。先看看它们在哪里。', cost: 1},
      {id: 'secure-cargo', target: 'quay', label: '收紧药箱绑带 · 1', requires: {boatAt: 'near', cargoLoaded: true}, effects: {cargoSecured: true}, successText: '绑带锁住药箱，回声拿到了系固回执。', failureText: '只有本岸已经装好的药箱才能系固。', cost: 1},
      {id: 'sail-ferry', target: 'ferry', label: '发出启航信号 · 2', requires: {boatAt: 'near'}, effects: {boatAt: 'far'}, successText: '渡船已到对岸泊位。是否能交货，还要看船舱和绑带。', failureText: '船已经离开本岸，这道启航信号不能让它再走一趟。', cost: 2},
      {id: 'return-ferry', target: 'ferry', label: '召回渡船 · 2', requires: {boatAt: 'far', cargoDelivered: false}, effects: {boatAt: 'near'}, successText: '渡船返回本岸，可以补做装载或系固。额外航程已经用掉。', failureText: '只有尚未完成交付的对岸渡船需要召回。', cost: 2},
      {id: 'receive-cargo', target: 'far-bank', label: '在对岸卸箱交接 · 1', requires: {boatAt: 'far', cargoLoaded: true, cargoSecured: true}, effects: {cargoDelivered: true, cargoLoaded: false}, successText: '接货人核对绑带后卸下药箱。交付回执来自对岸。', failureText: '对岸没有收到已系固的药箱。船到了并不能替代货物条件。', cost: 1},
    ],
    goals: [
      {fact: 'cargoSecured', equals: true, label: '药箱经过系固', operationId: 'secure-cargo', verifyCost: 1},
      {fact: 'cargoDelivered', equals: true, label: '对岸实际收到药箱', operationId: 'receive-cargo', verifyCost: 1},
    ],
    concepts: ['依赖顺序', '目标分解', '预算', '交付边界'],
  },
  {
    id: 'after-tide', version: 1, engineVersion: 2, chapter: 1, kind: 'guided',
    title: '天亮前的复查', subtitle: '合格过，也要看现在', npc: '守灯人 · 莫拉',
    location: 'boss', art: 'tide',
    brief: '把最后一车物资送过栈桥，再保证栈桥此刻仍能交接。运车时会遇到一次回潮：它会改变桥脚状态，先前的验收不能保你通过新现场。',
    limits: {toolCapacity: 3, maxBudget: 12, missionBudget: 12},
    initialWorld: {bridgeStable: false, cargoDelivered: false, tidePassed: false},
    observations: [
      {id: 'inspect-bridge', target: 'bridge', label: '检查桥脚与潮痕 · 1', facts: ['bridgeStable', 'tidePassed'], text: '桥脚是否牢固，以及潮水是否已经经过，都按眼前的状态重新记录。', cost: 1},
      {id: 'inspect-delivery', target: 'far-bank', label: '查看对岸物资 · 1', facts: ['cargoDelivered'], text: '核对对岸已经收到的最后一车物资。', cost: 1},
    ],
    operations: [
      {id: 'repair-bridge', target: 'bridge', label: '扣紧旧桥板 · 1', requires: {tidePassed: false}, effects: {bridgeStable: true}, successText: '旧桥板已经扣紧，足以让最后一车物资通过。', failureText: '回潮已经改变桥脚。继续扣旧桥板无法替代新的撑架。', cost: 1},
      {id: 'send-last-cart', target: 'far-bank', label: '送最后一车过桥 · 1', requires: {bridgeStable: true, cargoDelivered: false}, effects: {cargoDelivered: true}, successText: '最后一车物资已到对岸，接货人举起了灯。', failureText: '桥面还不能通车，或物资已经完成交付。', cost: 1},
      {id: 'brace-bridge', target: 'bridge', label: '按新潮位安装撑架 · 1', requires: {tidePassed: true}, effects: {bridgeStable: true}, successText: '撑架顶住新潮位下的桥脚。请重新验收，不沿用旧章。', failureText: '回潮还没发生，当前桥脚位置与这副撑架不匹配。', cost: 1},
    ],
    goals: [
      {fact: 'bridgeStable', equals: true, label: '栈桥现在仍然牢固', operationId: 'brace-bridge', verifyCost: 1},
      {fact: 'cargoDelivered', equals: true, label: '最后一车已经交付', operationId: 'send-last-cart', verifyCost: 1},
    ],
    hooks: [{id: 'returning-tide', trigger: {type: 'after-operation', operationId: 'send-last-cart'}, effects: {tidePassed: true, bridgeStable: false}, notice: {trust: 'environment', text: '回潮顶到桥脚，传来一阵松动声。桥面旧验收已失效；去看这一刻的现场。'}}],
    concepts: ['环境变化', '证据时效', '重新观察', '同时满足完成条件'],
  },
  {
    id: 'fog-bell', version: 1, engineVersion: 2, chapter: 1, kind: 'transfer',
    title: '雾中的回铃', subtitle: '一口大钟，还是三处小铃', npc: '守灯人 · 莫拉',
    location: 'lighthouse', art: 'harbor',
    brief: '用大钟或沿岸三只小铃取得雾后的回应。工具匣只有两格，可回工坊换装，整趟预算不会补满。两条路线都算完成，却会留下不同的报讯设施。',
    limits: {toolCapacity: 2, maxBudget: 7, missionBudget: 7},
    transferRequirement: {reconfiguration: true},
    initialWorld: {mainBellReady: false, bellOne: false, bellTwo: false, bellThree: false, heardAcrossFog: false, bellRoute: 'none'},
    observations: [
      {id: 'inspect-main-bell', target: 'main-bell', label: '近看主钟 · 1', facts: ['mainBellReady'], text: '主钟卡梁可一次拆除，但重修要耗三份力气。', cost: 1},
      {id: 'survey-shore', target: 'shore', label: '查看三个沿岸挂点 · 2', facts: ['bellOne', 'bellTwo', 'bellThree'], text: '岸线有三个挂点，每处可用一份力气架铃，必须连到末端才能回话。', cost: 2},
    ],
    operations: [
      {id: 'repair-main-bell', target: 'main-bell', label: '拆除主钟卡梁 · 3', requires: {mainBellReady: false}, effects: {mainBellReady: true}, successText: '主钟可以摆动了。从这里敲钟会留下集中报讯的设施。', failureText: '主钟已经修好，无需再拆一次。', cost: 3},
      {id: 'ring-main-bell', target: 'main-bell', label: '敲主钟并等回铃 · 成功1 / 卡住3', requires: {mainBellReady: true}, effects: {heardAcrossFog: true, bellRoute: 'main'}, successText: '大钟越过海雾，对岸传来两声回铃。主钟路线接通。', failureText: '卡梁还在，钟声没有越过雾。强拉卡住的钟绳耗掉三份力气。', cost: 1, failureCost: 3},
      {id: 'hang-bell-one', target: 'shore', label: '架第一只岸铃 · 1', requires: {bellOne: false}, effects: {bellOne: true}, successText: '第一处岸铃立在码头旁，消息还没连到末端。', failureText: '第一只铃已经就位。', cost: 1},
      {id: 'hang-bell-two', target: 'shore', label: '架第二只岸铃 · 1', requires: {bellOne: true, bellTwo: false}, effects: {bellTwo: true}, successText: '第二只铃接住第一处的声音。', failureText: '前一处尚未接通，或这里已经架好。', cost: 1},
      {id: 'hang-bell-three', target: 'shore', label: '架第三只岸铃 · 1', requires: {bellTwo: true, bellThree: false}, effects: {bellThree: true}, successText: '第三只铃到了雾的另一边，可以尝试沿线呼叫。', failureText: '第二处尚未接通，或末端已经架好。', cost: 1},
      {id: 'call-shore-chain', target: 'shore', label: '沿三铃传话并等回应 · 1', requires: {bellOne: true, bellTwo: true, bellThree: true}, effects: {heardAcrossFog: true, bellRoute: 'chain'}, successText: '消息走过三处岸铃，末端的回答一路传回来。', failureText: '岸线仍有缺口，不能把第一只铃响了当成全线接通。', cost: 1},
    ],
    goals: [{fact: 'heardAcrossFog', equals: true, label: '雾后的人实际回过铃', operationId: 'ring-main-bell', verifyCost: 1}],
    concepts: ['工具容量', '构筑取舍', '整趟预算', '独立操作与换装'],
  },
  {
    id: 'medicine-detour', version: 1, engineVersion: 2, chapter: 1, kind: 'transfer',
    title: '沿街的药灯', subtitle: '两箱补给，两种照看', npc: '药师 · 缇娅',
    location: 'warehouse', art: 'warehouse',
    brief: '先给诊室一箱补给，另一箱可集中入库，也可装上修好的推车送到码头。推车没修好也能出发，却会停在半路。两箱不会因重复交付而变多。',
    limits: {toolCapacity: 3, maxBudget: 12, missionBudget: 12},
    transferRequirement: {operationIds: ['deliver-clinic']},
    initialWorld: {warehouseCrates: 2, clinicCrates: 0, dockCrates: 0, cartLoaded: false, cartReady: false, cartAt: 'depot', clinicDelivery: false, routeReady: false, supplyRoute: 'unset'},
    observations: [
      {id: 'count-crates', target: 'depot', label: '清点仓库与诊室 · 1', facts: ['warehouseCrates', 'clinicCrates', 'dockCrates'], text: '两箱补给的位置据实记下，清单上的迁移不能代替搬运。', cost: 1},
      {id: 'inspect-cart', target: 'cart', label: '检查推车与所在位置 · 1', facts: ['cartReady', 'cartLoaded', 'cartAt'], text: '查看车轮、车上物资和推车位置。', cost: 1},
    ],
    operations: [
      {id: 'deliver-clinic', target: 'clinic', label: '先送一箱到诊室 · 1', requires: {warehouseCrates: 2, clinicCrates: 0}, effects: {warehouseCrates: 1, clinicCrates: 1, clinicDelivery: true}, successText: '诊室接过第一箱补给，仓库还剩一箱。', failureText: '第一箱已交付或不在仓库，不能重复记成新的一箱。', cost: 1},
      {id: 'deliver-rest-clinic', target: 'clinic', label: '把剩余一箱集中到诊室 · 2', requires: {warehouseCrates: 1, clinicCrates: 1, cartLoaded: false}, effects: {warehouseCrates: 0, clinicCrates: 2, routeReady: true, supplyRoute: 'clinic'}, successText: '第二箱也已入诊室。两箱集中清点，居民来这里领取。', failureText: '余箱已在别处，或第一箱尚未交付，不能只在清单上挪动它。', cost: 2},
      {id: 'repair-cart', target: 'cart', label: '在仓库固紧车轮 · 1', requires: {cartAt: 'depot', cartReady: false}, effects: {cartReady: true}, successText: '车轮固定，可以把服务送到码头。', failureText: '推车已不在仓库，或车轮已经固定。', cost: 1},
      {id: 'load-cart', target: 'cart', label: '把余箱装上推车 · 1', requires: {warehouseCrates: 1, clinicCrates: 1, cartAt: 'depot', cartLoaded: false}, effects: {warehouseCrates: 0, cartLoaded: true}, successText: '余箱离开仓库，放上推车。它还不属于码头库存。', failureText: '余箱、推车或诊室首批交付条件不符。', cost: 1},
      {id: 'push-cart', target: 'cart', label: '推车前往码头 · 1', requires: {cartAt: 'depot', cartLoaded: true}, effects: {cartAt: 'dock'}, successText: '推车离开仓库，沿街向码头出发。等它抵达后再交接。', failureText: '装有余箱的推车并不在仓库。', cost: 1},
      {id: 'repair-cart-on-road', target: 'cart', label: '在半路重新固轮 · 2', requires: {cartAt: 'midway', cartReady: false}, effects: {cartReady: true}, successText: '在狭窄街面重新固定车轮，多花了一份力气。', failureText: '这里没有一辆需要半路修理的推车。', cost: 2},
      {id: 'continue-cart', target: 'cart', label: '从半路继续推到码头 · 1', requires: {cartAt: 'midway', cartReady: true, cartLoaded: true}, effects: {cartAt: 'dock'}, successText: '推车终于抵达码头，等待接收人清点。', failureText: '车轮、箱子或所在位置还不支持继续走。', cost: 1},
      {id: 'receive-dock', target: 'dock', label: '在码头卸箱交接 · 1', requires: {cartAt: 'dock', cartReady: true, cartLoaded: true, clinicCrates: 1}, effects: {dockCrates: 1, cartLoaded: false, routeReady: true, supplyRoute: 'mobile'}, successText: '码头接过余箱，诊室一箱、码头一箱，移动服务开始值守。', failureText: '码头还没有一辆载着余箱且车轮牢固的推车。', cost: 1},
    ],
    goals: [
      {fact: 'clinicDelivery', equals: true, label: '诊室实际收到首批补给', operationId: 'deliver-clinic', verifyCost: 1},
      {fact: 'routeReady', equals: true, label: '余箱也已按所选路线完成交接', operationId: 'deliver-rest-clinic', verifyCost: 1},
    ],
    hooks: [{id: 'loose-cart-wheel', trigger: {type: 'after-operation', operationId: 'push-cart'}, when: {cartReady: false}, effects: {cartAt: 'midway'}, notice: {trust: 'environment', text: '松轮在巷口歪了一下，推车停在半路。箱子仍在车上，码头库存没有增加。'}}],
    concepts: ['资源守恒', '价值目标与执行路线', '部分失败恢复', '独立交付'],
  },
];

/** Test/review fixtures, never interpreted by the companion as an oracle. */
export interface ChapterOneWalkthrough {
  id: string;
  scenarioId: string;
  purpose: 'reference' | 'alternative' | 'recovery';
  stages: Array<{tools: ToolName[]; calls: ToolCall[]; collectReceipts?: boolean; expectWorld?: Record<string, string | number | boolean>; absentProofs?: string[]}>;
  expectedCost: number;
  expectedWorld: Record<string, string | number | boolean>;
}
const see = (observationId: string): ToolCall => ({tool: 'observe', observationId});
const act = (operationId: string): ToolCall => ({tool: 'operate', operationId});
const check = (fact: string): ToolCall => ({tool: 'verify', fact});
const all: ToolName[] = ['observe', 'operate', 'verify'];

export const chapterOneWalkthroughs: ChapterOneWalkthrough[] = [
  {id: 'tide-current-source', scenarioId: 'tide-ledger', purpose: 'reference', stages: [{tools: all, calls: [see('ask-ferryman'), see('sound-channel'), act('hang-south'), act('trial-south'), check('channelOpen')]}], expectedCost: 6, expectedWorld: {channelOpen: true, routeSign: 'south', trialReturned: false}},
  {id: 'tide-old-record-recovery', scenarioId: 'tide-ledger', purpose: 'recovery', stages: [{tools: all, calls: [see('read-ledger'), act('hang-north'), act('trial-north')], expectWorld: {channelOpen: false, trialReturned: true}}, {tools: all, calls: [see('sound-channel'), act('hang-south'), act('trial-south'), check('channelOpen')]}], expectedCost: 8, expectedWorld: {channelOpen: true, routeSign: 'south', trialReturned: true}},
  {id: 'ferry-load-before-leaving', scenarioId: 'last-ferry', purpose: 'reference', stages: [{tools: all, calls: [see('inspect-quay'), act('load-cargo'), act('secure-cargo'), act('sail-ferry'), act('receive-cargo'), check('cargoSecured'), check('cargoDelivered')]}], expectedCost: 8, expectedWorld: {boatAt: 'far', cargoDelivered: true, cargoLoaded: false}},
  {id: 'ferry-empty-trip-recovery', scenarioId: 'last-ferry', purpose: 'recovery', stages: [{tools: all, calls: [act('sail-ferry'), act('receive-cargo')], expectWorld: {boatAt: 'far', cargoDelivered: false, cargoLoaded: false}}, {tools: all, calls: [act('return-ferry'), act('load-cargo'), act('secure-cargo'), act('sail-ferry'), act('receive-cargo'), check('cargoSecured'), check('cargoDelivered')]}], expectedCost: 12, expectedWorld: {cargoDelivered: true, cargoSecured: true}},
  {id: 'bridge-proof-expires', scenarioId: 'after-tide', purpose: 'reference', stages: [{tools: all, calls: [see('inspect-bridge'), act('repair-bridge'), check('bridgeStable'), act('send-last-cart')], expectWorld: {bridgeStable: false, cargoDelivered: true, tidePassed: true}, absentProofs: ['bridgeStable']}, {tools: all, calls: [see('inspect-bridge'), act('brace-bridge'), check('bridgeStable'), check('cargoDelivered')]}], expectedCost: 8, expectedWorld: {bridgeStable: true, cargoDelivered: true, tidePassed: true}},
  {id: 'bridge-old-fix-recovery', scenarioId: 'after-tide', purpose: 'recovery', stages: [{tools: all, calls: [act('repair-bridge'), check('bridgeStable'), act('send-last-cart'), act('repair-bridge'), check('bridgeStable')], expectWorld: {bridgeStable: false}, absentProofs: ['bridgeStable']}, {tools: all, calls: [see('inspect-bridge'), act('brace-bridge'), check('cargoDelivered'), check('bridgeStable')]}], expectedCost: 9, expectedWorld: {bridgeStable: true, cargoDelivered: true}},
  {id: 'bell-main-route', scenarioId: 'fog-bell', purpose: 'reference', stages: [{tools: ['observe', 'operate'], calls: [see('inspect-main-bell'), act('repair-main-bell'), act('ring-main-bell')]}, {tools: ['operate', 'verify'], calls: [check('heardAcrossFog')]}], expectedCost: 6, expectedWorld: {bellRoute: 'main', heardAcrossFog: true, bellOne: false}},
  {id: 'bell-shore-route', scenarioId: 'fog-bell', purpose: 'alternative', stages: [{tools: ['observe', 'operate'], calls: [see('survey-shore'), act('hang-bell-one'), act('hang-bell-two'), act('hang-bell-three'), act('call-shore-chain')]}, {tools: ['operate', 'verify'], calls: [check('heardAcrossFog')]}], expectedCost: 7, expectedWorld: {bellRoute: 'chain', heardAcrossFog: true, mainBellReady: false}},
  {id: 'bell-incomplete-chain-recovery', scenarioId: 'fog-bell', purpose: 'recovery', stages: [{tools: ['observe', 'operate'], calls: [act('hang-bell-one'), act('call-shore-chain')], expectWorld: {heardAcrossFog: false}}, {tools: ['operate', 'verify'], calls: [act('hang-bell-two'), act('hang-bell-three'), act('call-shore-chain'), check('heardAcrossFog')]}], expectedCost: 6, expectedWorld: {heardAcrossFog: true, bellRoute: 'chain'}},
  {id: 'medicine-clinic-route', scenarioId: 'medicine-detour', purpose: 'reference', stages: [{tools: all, calls: [see('count-crates'), act('deliver-clinic'), act('deliver-rest-clinic'), check('clinicDelivery'), check('routeReady')]}], expectedCost: 6, expectedWorld: {warehouseCrates: 0, clinicCrates: 2, dockCrates: 0, supplyRoute: 'clinic'}},
  {id: 'medicine-mobile-route', scenarioId: 'medicine-detour', purpose: 'alternative', stages: [{tools: all, calls: [see('inspect-cart'), act('deliver-clinic'), act('repair-cart'), act('load-cart'), act('push-cart'), act('receive-dock'), check('clinicDelivery'), check('routeReady')]}], expectedCost: 8, expectedWorld: {warehouseCrates: 0, clinicCrates: 1, dockCrates: 1, supplyRoute: 'mobile'}},
  {id: 'medicine-broken-wheel-recovery', scenarioId: 'medicine-detour', purpose: 'recovery', stages: [{tools: all, calls: [act('deliver-clinic'), act('load-cart'), act('push-cart'), act('receive-dock')], expectWorld: {cartAt: 'midway', dockCrates: 0, cartLoaded: true}}, {tools: all, calls: [see('inspect-cart'), act('repair-cart-on-road'), act('continue-cart'), act('receive-dock'), check('clinicDelivery'), check('routeReady')]}], expectedCost: 11, expectedWorld: {warehouseCrates: 0, clinicCrates: 1, dockCrates: 1, cartLoaded: false, supplyRoute: 'mobile'}},
];

export const chapterOneFactLabels: Record<string, string> = {
  oldLedgerRoute: '旧簿记录的航道', ledgerAge: '旧簿对应潮次', tideClue: '潮况线索', currentSafeRoute: '现场可行航道', routeSign: '现挂航牌', channelOpen: '航道实际试航通过', trialReturned: '北汊试航曾折返',
  boatAt: '渡船位置', cargoLoaded: '药箱在船上', cargoSecured: '药箱已系固', cargoDelivered: '物资实际交付', bridgeStable: '桥脚当前牢固', tidePassed: '回潮已经经过',
  mainBellReady: '主钟可摆动', bellOne: '第一处岸铃', bellTwo: '第二处岸铃', bellThree: '第三处岸铃', heardAcrossFog: '雾后回铃已收到', bellRoute: '报讯路线',
  warehouseCrates: '仓库箱数', clinicCrates: '诊室箱数', dockCrates: '码头箱数', cartLoaded: '余箱在推车上', cartReady: '推车车轮牢固', cartAt: '推车位置', clinicDelivery: '诊室首批交付', routeReady: '余箱完成交接', supplyRoute: '补给服务路线',
};
