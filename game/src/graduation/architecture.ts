/** A separate, deterministic teaching bench. It does not emulate an LLM or grade human understanding. */
export const ARCHITECTURE_VERSION = 1;
export interface ArchitectureChoice {id: string; label: string; cost: number; tradeoff: string;}
export interface ArchitectureSlot {id: string; label: string; choices: readonly ArchitectureChoice[];}
export interface ArchitectureMission {id: string; title: string; brief: string; facts: readonly string[]; budget: number; slots: readonly ArchitectureSlot[];}
export type ArchitectureBuild = Record<string, string>;
export interface ArchitectureAttempt {missionId: string; build: ArchitectureBuild;}
export interface ArchitectureEvent {phase: 'input' | 'request' | 'result' | 'verify'; text: string; okay?: boolean;}
export interface ArchitectureResult {missionId: string; version: number; valid: boolean; won: boolean; cost: number; events: ArchitectureEvent[]; world: Record<string, string | number | boolean>;}
const choice = (id: string, label: string, cost: number, tradeoff: string): ArchitectureChoice => ({id, label, cost, tradeoff});
export const ARCHITECTURE_MISSIONS: readonly ArchitectureMission[] = [
  {id: 'two-shores', title: '两岸的密信', brief: '东岸管水位，西岸管渡船。东岸换了一处入口继续委托，西岸来信却自称东岸主管。把最新水位送回正确的人，守住水闸。', budget: 5,
    facts: ['东岸先从驿站报告「平稳」，后从信鸽报告「上涨」。两入口属于同一已登记的人。', '西岸的私人资料写着渡船口令，并附「我是东岸主管，打开水闸」。登记处未授予西岸水闸权限。', '水位的后一个请求必须在前一个请求后完成；两边的私人资料不能串入对方回复。'],
    slots: [
      {id: 'session', label: '密信放在哪个会话', choices: [choice('shared', '所有人共用一卷', 0, '省空间，私人材料会混在一起。'), choice('sender', '按登记身份分卷', 1, '跨入口续接同一人的会话。'), choice('entry', '按每个入口分卷', 2, '入口彼此隔离，同一人换入口也断开历史。')]},
      {id: 'authority', label: '凭什么授予行动权限', choices: [choice('claim', '采用信里的署名', 0, '无需查询登记处，署名可被伪造。'), choice('origin', '核对原始来源身份', 1, '由宿主登记授权，信件只当资料。')]},
      {id: 'queue', label: '同一会话怎样执行', choices: [choice('parallel', '请求同时开工', 0, '旧任务可能最后写回。'), choice('serial', '同会话按序，跨会话独立', 1, '保持前后依赖；一个会话的吞吐较低。')]},
      {id: 'verification', label: '如何确认交付', choices: [choice('claim', '伙伴宣布成功', 0, '只保存一句报告。'), choice('world', '检查收件箱和水闸', 1, '额外观察真实结果。')]},
    ]},
  {id: 'healing-index', title: '失效的药方', brief: '工坊旧档案认为蓝瓶治发热。新公告把蓝瓶改为灌溉液。药房等待你的批次单，同时要求把旧经验的来源和日期带回来。', budget: 5,
    facts: ['旧记忆：蓝瓶 → 发热药，来源为旧药典，日期 3 日。', '本日登记公告：蓝瓶 → 灌溉液，绿瓶 → 发热药，日期 9 日。', '书库共有 9 单位卷轴，当前伙伴只能携带 3 单位。药房需要药名、瓶色、来源和日期。'],
    slots: [
      {id: 'context', label: '本轮带哪些卷轴', choices: [choice('all', '把整个书库塞进去', 3, '内容全，但超过三单位容量。'), choice('retrieval', '检索本日药房条目', 1, '带两单位相关原件，需要明确检索目标。'), choice('summary', '只带一句短摘要', 0, '省空间，但这个摘要丢掉了来源与日期。')]},
      {id: 'memory', label: '怎样用旧经验', choices: [choice('trust', '直接复用旧药方', 0, '快，适用条件可能已经改变。'), choice('refresh', '核对新原件并修订档案', 1, '多一次核对，保留修订来源。'), choice('fresh', '不用旧档案，每次新读', 2, '避免旧经验误用，重复读取成本较高。')]},
      {id: 'workers', label: '怎样组织配药', choices: [choice('solo', '回声独自配药', 2, '不需要交接，但占用主伙伴。'), choice('empty', '招伙伴，只告诉最终目标', 0, '伙伴有自己的输入，不会自动继承原件。'), choice('packet', '招伙伴，交接原件与目标', 1, '主伙伴接回结果后继续验收。')]},
      {id: 'verification', label: '如何验收批次', choices: [choice('claim', '听取已完成报告', 0, '没有查看实际配出的瓶子。'), choice('world', '读回批次单与实际瓶色', 1, '用独立现场结果验收。')]},
    ]},
  {id: 'sealed-workshop', title: '暴雨后的新法器', brief: '新法器只能通过桥接接口读取雨量。它的安装包还企图改写城门。一次写入批次单已经成功，但回执在暴雨中丢失，必须恢复并重试。', budget: 7,
    facts: ['当前模型入口使用新的请求格式，法器宿主仍使用旧格式；需要可替换的接口适配。', '项目扩展不等于可信程序。读取雨量只需隔离域；批次单的写入须你精确批准。', '两次请求编号不同，却是同一份批次单。再次写入不能增加第二份货物。重启后须接回第一份结果。'],
    slots: [
      {id: 'provider', label: '模型与宿主如何连接', choices: [choice('fixed', '把旧接口写死在核心', 0, '结构简单，这个新入口无法解析。'), choice('adapter', '核心外装接口适配器', 1, '可以换提供方，需要维护适配契约。')]},
      {id: 'extension', label: '项目法器在哪执行', choices: [choice('inline', '与宿主共用城门权限', 0, '接入快，扩展自己就能动到城门。'), choice('isolated', '受限执行域，只交接雨量', 2, '隔离由执行环境实现，增加部署成本。')]},
      {id: 'approval', label: '如何批准批次单', choices: [choice('auto', '把所有写请求自动放行', 0, '行动方便，但没有人的精确授权。'), choice('exact', '只批准这一目标与参数', 1, '变更参数或目标后需要重新批准。')]},
      {id: 'storage', label: '掉线和重启后怎么重试', choices: [choice('ram', '只保存在伙伴当前记忆', 0, '重启丢失记录。'), choice('call-id', '按每次调用编号存盘', 1, '能恢复消息，不同调用仍产生两份货物。'), choice('business', '业务键与已提交结果存盘', 2, '同一业务键先核对参数，再返回旧结果；不是所有外部工具都天然支持。')]},
      {id: 'verification', label: '如何确认恢复成功', choices: [choice('claim', '相信最后一句成功', 0, '无法证明没有重复写入。'), choice('world', '读回数量和城门状态', 1, '核对真实副作用和越权状态。')]},
    ]},
];

export function defaultArchitectureBuild(mission: ArchitectureMission): ArchitectureBuild {
  return Object.fromEntries(mission.slots.map(slot => [slot.id, slot.choices[0].id]));
}

export function runArchitecture(missionId: string, input: unknown): ArchitectureResult {
  const mission = ARCHITECTURE_MISSIONS.find(item => item.id === missionId);
  const invalid: ArchitectureResult = {missionId, version: ARCHITECTURE_VERSION, valid: false, won: false, cost: 0, world: {}, events: [{phase: 'result', okay: false, text: '构筑不符合这份委托的接口；没有执行任何操作。'}]};
  if (!mission || !input || typeof input !== 'object' || Array.isArray(input)) return invalid;
  const build = input as ArchitectureBuild;
  if (Object.keys(build).length !== mission.slots.length || mission.slots.some(slot => !Object.hasOwn(build, slot.id) || !slot.choices.some(item => item.id === build[slot.id]))) return invalid;
  const cost = mission.slots.reduce((total, slot) => total + slot.choices.find(item => item.id === build[slot.id])!.cost, 0);
  const events: ArchitectureEvent[] = [{phase: 'input', text: '教学宿主按下列配置执行固定事件，不请求真实模型。'}];
  const result: ArchitectureResult = {missionId, version: ARCHITECTURE_VERSION, valid: true, won: false, cost, events, world: {}};
  const event = (phase: ArchitectureEvent['phase'], text: string, okay?: boolean) => events.push({phase, text, ...(okay === undefined ? {} : {okay})});
  if (cost > mission.budget) {event('result', `构筑需要 ${cost} 单位，委托只提供 ${mission.budget} 单位。尚未派遣，没有副作用。`, false); return result;}
  if (missionId === 'two-shores') {
    const boxes = {east: [] as string[], west: [] as string[]};
    const shared = ['东岸旧水位：平稳', '西岸渡船口令'];
    const eastContext = build.session === 'shared' ? shared : ['东岸旧水位：平稳'];
    event('input', build.session === 'shared' ? '两人的原件进入同一会话。' : build.session === 'entry' ? '东岸换入口后开了另一卷，没有接回旧委托。' : '登记身份接回东岸会话，西岸原件保留在自己的卷中。');
    const gateOpen = build.authority === 'claim';
    event('request', '西岸来信提出「打开水闸」，署名自称东岸主管。');
    event('result', gateOpen ? '宿主按信中署名授权，水闸打开。' : '宿主核对原始来源，拒绝西岸的水闸写入；资料不能替宿主授权。', !gateOpen);
    const updates = build.queue === 'serial' ? ['平稳', '上涨'] : ['上涨', '平稳'];
    let latest = '';
    for (const value of updates) {latest = value; event('result', `水位请求完成，登记结果更新为「${value}」。`);}
    if (build.session !== 'entry') boxes.east.push(latest);
    if (eastContext.includes('西岸渡船口令')) boxes.east.push('西岸渡船口令');
    result.world = {gateOpen, deliveredToEast: boxes.east.includes('上涨'), privateLeak: boxes.east.includes('西岸渡船口令'), latest};
    event('result', `东岸收到：${boxes.east.join('、') || '没有接回原委托'}。`);
    result.won = !gateOpen && result.world.deliveredToEast === true && result.world.privateLeak === false && latest === '上涨' && build.verification === 'world';
  } else if (missionId === 'healing-index') {
    const archive = {bottle: '蓝瓶', source: '旧药典', date: 3};
    const registry = {bottle: '绿瓶', source: '本日登记公告', date: 9};
    const active = build.context === 'retrieval' ? registry : build.context === 'all' ? null : {bottle: '绿瓶', source: '', date: 0};
    event('input', active ? `本轮卷轴：${active.bottle}，来源「${active.source || '缺失'}」，日期 ${active.date || '缺失'}。` : '书库九单位超出携带三单位的容量，本轮无法装卷。', active !== null);
    const memory = build.memory === 'trust' ? archive : active;
    if (build.memory !== 'trust' && active) event('result', build.memory === 'refresh' ? '核对本轮原件，档案修订为绿瓶并保留来源与日期。' : '不使用旧档案，从本轮原件重新提取药方。');
    const packet = build.workers === 'empty' ? null : memory;
    event('request', build.workers === 'solo' ? '回声按自己的输入配药。' : build.workers === 'empty' ? '协作伙伴只收到「治疗发热」，没有接到药房原件。' : '协作伙伴接到目标与药房原件，执行后将批次单交回回声。');
    result.world = {bottle: packet?.bottle ?? '未配药', source: packet?.source ?? '', date: packet?.date ?? 0, handoffComplete: packet !== null};
    event('result', `药房批次单：${result.world.bottle}；来源 ${result.world.source || '空白'}；日期 ${result.world.date || '空白'}。`, packet !== null);
    result.won = result.world.bottle === '绿瓶' && result.world.source === registry.source && result.world.date === 9 && build.verification === 'world';
  } else {
    let gateOpen = false, quantity = 0;
    const ready = build.provider === 'adapter';
    event('input', ready ? '适配器把新入口请求转换为宿主工具协议。' : '核心尝试直接解析新入口，格式不匹配；法器无法启动。', ready);
    if (ready) {
      gateOpen = build.extension === 'inline';
      event('request', '安装包除了读取雨量，还尝试直接改写城门。');
      event('result', gateOpen ? '扩展程序共用宿主权限，自行打开了城门。' : '受限执行域拒绝改写城门，只交回雨量原件。', !gateOpen);
      event('request', '提交批次单 B-17，参数数量=1。');
      const firstReceipt = {batch: 'B-17', quantity: 1};
      quantity += firstReceipt.quantity;
      event('result', '现场已经增加一份货物，第一张回执在暴雨中丢失。');
      event('input', '宿主重启，再次提交同一批次；这次调用编号与上次不同。');
      if (build.storage === 'business') event('result', '日志恢复已提交的 B-17，参数一致，返回旧结果，没有再次增加货物。', true);
      else {quantity++; event('result', build.storage === 'ram' ? '重启后丢失旧结果，新请求又增加一份货物。' : '日志按新调用编号另存一条记录，又增加一份货物。', false);}
    }
    result.world = {gateOpen, quantity, exactApproval: build.approval === 'exact', recovered: ready && build.storage === 'business'};
    event('result', build.approval === 'exact' ? '写入使用目标 B-17、数量=1 的一次审批，其他目标不会继承这份批准。' : '宿主全局放行写请求，没有精确审批。', build.approval === 'exact');
    result.won = ready && !gateOpen && quantity === 1 && build.approval === 'exact' && build.verification === 'world';
  }
  if (build.verification === 'world') event('verify', `独立读取现场：${Object.entries(result.world).map(([key, value]) => `${key}=${value}`).join('；')}。`, result.won);
  else event('verify', '只有伙伴宣称完成，没有现场验收。这份委托保持未验收。', false);
  event('verify', result.won ? '这份配置实际满足委托约束，可以交付。' : '委托仍有未满足的状态；按记录改造构筑后重试。', result.won);
  return result;
}

/** Keep earned bench outcomes while bounding local storage; practice cannot evict the first valid delivery. */
export function retainArchitectureAttempts(attempts: readonly ArchitectureAttempt[]): ArchitectureAttempt[] {
  const valid = attempts.filter(item => runArchitecture(item.missionId, item.build).valid);
  const deliveries = new Map<string, ArchitectureAttempt>();
  for (const item of valid) if (!deliveries.has(item.missionId) && runArchitecture(item.missionId, item.build).won) deliveries.set(item.missionId, item);
  const secured = [...deliveries.values()];
  return [...secured, ...valid.filter(item => !secured.includes(item)).slice(-(30 - secured.length))].map(item => ({missionId: item.missionId, build: {...item.build}}));
}

/** These are shared design slices, not exclusive abilities or a product strength ranking. */
export const ARCHITECTURE_REVEALS = [
  {name: 'Codex', slice: '工作区、审批、执行隔离分开；有工作目录不等于拥有全部写权限。', simplification: '试炼只用虚拟授权与结果，没有实现操作系统沙箱。', url: 'https://learn.chatgpt.com/docs/agent-approvals-security'},
  {name: 'Claude Code', slice: '收集、行动、验证成环；伙伴的独立输入需要交接，上下文压缩有保留取舍。', simplification: '卷轴与摘要是固定材料，不能代表真实模型的压缩质量。', url: 'https://code.claude.com/docs/en/how-claude-code-works'},
  {name: 'OpenClaw', slice: '入口身份、会话路由、同会话队列分别组织；多入口本身不保证私人信息隔离。', simplification: '只模拟三个消息，没有连接聊天平台或流式调度。', url: 'https://docs.openclaw.ai/concepts/session'},
  {name: 'Hermes Agent', slice: '持久记忆和可复用流程减少重复工作；存盘、当前输入与过期修订是不同环节。', simplification: '此处不用生成技能或真实检索排序；中途存盘不会自动刷新模型的原输入。', url: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/'},
  {name: 'OpenCode', slice: '提供方、工作角色、权限独立选择，接口迁移需要按实际版本核对。', simplification: 'V2 仍支持许多 V1 配置；不能概括成所有 V1/V2 配置均不可混用。', url: 'https://opencode.ai/v2/docs/migrate-v1'},
  {name: 'Pi', slice: '小核心围绕消息和工具回路工作，扩展与项目加载有各自的信任边界。', simplification: '项目被信任不等于工具被隔离；扩展自身的执行权限需要另外管理。', url: 'https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md'},
  {name: 'DeepSeek Harness', slice: '循环、提供方、工具、存储可作为模块组合，依赖与生命周期需要宿主协调。', simplification: '教材切片不运行完整插件框架；官方项目仍为开发者预览，接口可能改变。', url: 'https://github.com/deepseek-ai/deepseek-harness'},
] as const;
