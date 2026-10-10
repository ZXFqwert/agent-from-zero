/** Stable teaching IDs are independent of the frozen simulator and its wording. */
export type CoreStageId = 'guided' | 'independent' | 'transfer' | 'revisit';
export type CoreCheckpoint = 'cycle' | 'contract' | 'schema' | 'correlation' | 'idempotency' | 'bounded-loop' | 'context' | 'compression' | 'memory' | 'session' | 'skill' | 'trust' | 'identity' | 'isolation' | 'team-input' | 'queue' | 'integration' | 'evaluation' | 'holdout' | 'modules';
export interface CoreConceptDefinition {
  id: string;
  title: string;
  principle: string;
  prerequisites: string[];
  /** These labels are reading aliases, never evidence rules or automatic awards. */
  aliases: string[];
  checkpoint: CoreCheckpoint;
  routes: Record<CoreStageId, string[]>;
  transferGap?: string;
}

function define(id: string, title: string, principle: string, prerequisites: string[], aliases: string[], checkpoint: CoreCheckpoint,
  guided: string[], independent: string[], transfer: string[], revisit: string[], transferGap?: string): CoreConceptDefinition {
  return {id, title, principle, prerequisites, aliases, checkpoint, routes: {guided, independent, transfer, revisit}, ...(transferGap ? {transferGap} : {})};
}

export const CORE_CONCEPTS: readonly CoreConceptDefinition[] = [
  define('agent-cycle', '语言、行动与验收', '语言模型提出文字或行动请求；宿主执行工具，接回结果，再检查真实状态。', [],
    ['输出不等于行动', '语言输出与实际动作', '反馈闭环', '状态验收', '交付与验收'], 'cycle',
    ['inherited-workshop', 'harbor-light'], ['first-warm-commission', 'tide-ledger'], ['fog-bell', 'medicine-detour'], ['first-warm-commission', 'tide-ledger', 'fog-bell']),
  define('goal-contract', '目标、约束与依赖', '完成条件包含目标与边界；局部成功不能替代同时成立的交付条件。', ['agent-cycle'],
    ['目标与范围', '约束也是完成条件', '依赖顺序', '局部成功与整体完成', '共同硬边界'], 'contract',
    ['key-and-neighbor'], ['last-ferry', 'quiet-hours', 'brass-order'], ['rescue-rope', 'medicine-detour'], ['last-ferry', 'quiet-hours', 'rescue-rope']),
  define('tool-schema', '工具参数与任务语义', '工具名、字段类型和参数值组成可执行请求；格式正确仍可能选错对象。', ['agent-cycle'],
    ['工具参数', '类型与字段', '参数不等于愿望', 'schema 与任务语义'], 'schema',
    ['etched-door'], ['backyard-address', 'reusable-scale'], ['courier-lock'], ['backyard-address', 'courier-lock']),
  define('call-correlation', '请求编号与结果配对', '调用 ID 关联这次请求的回执；异步结果必须接回对应请求。', ['tool-schema'],
    ['调用 ID', '异步回执', '请求与结果配对', '独立配对', '结果配对'], 'correlation',
    ['paired-valves'], ['missing-crate', 'doubled-clerk'], ['courier-lock', 'bp-dsh-lifecycle'], ['paired-valves', 'courier-lock']),
  define('idempotent-effects', '重试与重复副作用', '丢失回执不代表动作未执行；业务键约束重复副作用，不能拿调用 ID 代替。', ['call-correlation'],
    ['不确定结果', '幂等业务凭证', '重试与副作用', '同凭证参数冲突'], 'idempotency',
    ['missing-crate'], ['doubled-clerk'], [], ['missing-crate', 'doubled-clerk'],
    '现有陌生签收任务验证回执配对，没有验证同一业务键重试的副作用；该迁移证据尚缺。'),
  define('bounded-feedback', '反馈、预算与停止', '结果改变下一步；请求、工具和整趟资源都有限，永久故障应改方案或停止。', ['agent-cycle', 'goal-contract'],
    ['短暂故障', '有限重试', '反馈与重新决策', '中断恢复', '停止与人工介入'], 'bounded-loop',
    ['cooling-pulse'], ['one-crystal-left', 'broken-escapement', 'endless-warden'], ['rescue-rope', 'fog-bell'], ['one-crystal-left', 'rescue-rope']),
  define('context-retrieval', '档案、检索与当前输入', '保存或读到的材料不会自动进入本轮输入；主动检索和装卷才能参与决策。', ['agent-cycle'],
    ['档案与当前上下文', '检索不是知识自动注入', '相关性与来源', '独立迁移：有限上下文'], 'context',
    ['folded-map'], ['indexed-door', 'receipt-drawer'], ['field-hospital', 'nameless-system-diagnosis'], ['indexed-door', 'field-hospital']),
  define('lossy-compaction', '压缩与关键条件', '摘要减少携带量，也可能丢掉行动条件；要保留决定行动的字段及其来源。', ['context-retrieval'],
    ['压缩与信息损失', '有损摘要', '条件不可省略', '摘要保留关键条件', '摘要保留字段'], 'compression',
    ['narrow-satchel'], ['absent-margin', 'many-faced-archivist'], ['field-hospital', 'bp-claude-compaction'], ['absent-margin', 'field-hospital']),
  define('memory-validity', '记忆、来源与过期', '持久记忆是外部保存的经验；召回后仍需核对适用条件，它不会训练模型权重。', ['context-retrieval'],
    ['持久记忆', '记忆纠错', '适用条件', '过期经验', '记忆不等于训练', '显式检索'], 'memory',
    ['night-handoff'], ['dusty-route', 'bad-experience'], ['flooded-scriptorium', 'bp-hermes-stale', 'nameless-system-diagnosis'], ['dusty-route', 'bp-hermes-stale']),
  define('session-boundaries', '会话恢复与外部世界', '恢复或分支改变可用消息；已经发生的外部动作不会随会话倒退。', ['context-retrieval', 'call-correlation'],
    ['会话恢复', '消息历史', '共享外部状态', '分支不是沙箱', '提交后恢复'], 'session',
    ['checkpoint-desk'], ['forked-courier', 'bp-pi-core'], ['flooded-scriptorium', 'bp-dsh-lifecycle'], ['forked-courier', 'bp-dsh-lifecycle']),
  define('reusable-skills', '技能保存与适用范围', '技能保存一段流程；使用时仍需当前资料、权限、工具成本和验收。', ['memory-validity', 'bounded-feedback'],
    ['技能保存', '流程复用', '技能不授予权限', '技能适用范围', '技能复用'], 'skill',
    ['saved-procedure'], ['palimpsest-keeper', 'bp-hermes-reuse'], ['flooded-scriptorium'], ['saved-procedure', 'flooded-scriptorium']),
  define('trust-boundaries', '资料与指令的边界', '资料里的命令和身份宣称仍是数据；转述、记忆和摘要不能自行提高它的权限。', ['context-retrieval'],
    ['提示注入', '资料与指令', '信任边界', '来源保留', '转述与权限'], 'trust',
    ['footer-order'], ['copied-authority', 'borrowed-voice', 'narrow-contract'], ['river-relief', 'nameless-system-diagnosis'], ['footer-order', 'river-relief']),
  define('identity-permission', '身份、范围与最小权限', '核验谁在请求，再检查这项动作的允许范围；能读取不等于能执行。', ['trust-boundaries'],
    ['身份核验', '授权范围', '最小权限', '读取与执行权限', '身份与授权'], 'identity',
    ['borrowed-seal'], ['narrow-contract', 'counterfeit-regent'], ['river-relief', 'bp-codex-approval'], ['borrowed-seal', 'river-relief']),
  define('approval-isolation', '单次批准与隔离', '批准绑定具体请求；隔离限定执行域，隔离成功还需要现场验收。', ['identity-permission', 'goal-contract'],
    ['一次性审批', '意图与目标绑定', '沙箱隔离', '隔离与现场', '精确单次请求'], 'isolation',
    ['one-use-writ', 'glass-court'], ['counterfeit-regent', 'glass-court'], ['river-relief', 'bp-codex-approval'], ['glass-court', 'bp-codex-approval']),
  define('team-inputs', '分工、私有输入与交接', '伙伴只使用交给它的材料；共享和接回结果必须显式发生，主任务仍负责验收。', ['context-retrieval', 'identity-permission'],
    ['多 Agent 分工', '私有上下文', '显式共享状态', '输入快照', '报告交接'], 'team-input',
    ['three-hands'], ['private-scrolls', 'bp-claude-scout'], ['sky-depot-handoff', 'unfamiliar-system-assembly'], ['private-scrolls', 'sky-depot-handoff']),
  define('queue-dependencies', '任务队列、依赖与中断', '排队不等于完成；依赖结果需关联到具体任务，中断不能撤回已发生的动作。', ['team-inputs', 'call-correlation'],
    ['异步任务队列', '任务依赖', '失败传播', '稳定任务身份', '会话队列', '已执行副作用'], 'queue',
    ['late-depth-charts'], ['wet-foundation', 'bp-openclaw-routing'], ['sky-depot-handoff', 'bp-openclaw-queue'], ['wet-foundation', 'bp-openclaw-queue']),
  define('artifact-integration', '成果版本与整体集成', '多份成果必须基于明确版本合并；多个伙伴使用同一错误来源仍会一起出错。', ['team-inputs', 'queue-dependencies'],
    ['成果集成', '版本冲突', '共同盲点', '独立来源', '依赖与集成'], 'integration',
    ['chorus-bridgewright'], ['chorus-bridgewright'], ['sky-depot-handoff', 'unfamiliar-system-assembly'], ['chorus-bridgewright', 'sky-depot-handoff']),
  define('evaluation-contract', '评测合同与实际交付', '先定义量测和共同硬条件，用隔离案例检查方案，再独立核实现场交付。', ['goal-contract', 'approval-isolation'],
    ['目标与代理指标', '硬条件同时成立', 'all 与 any', '案例覆盖', '版本化验收'], 'evaluation',
    ['stamps-and-supplies'], ['three-lamps-one-boundary', 'sunny-day-ledger', 'perfect-mirror-speaker'], ['glasshouse-audit', 'city-after-the-mirrors'], ['sunny-day-ledger', 'glasshouse-audit']),
  define('uncertainty-holdout', '未知、留出与曝光', '没有量测不能判为成功；留出案例一旦提前看过，就失去首次陌生验证的意义。', ['evaluation-contract'],
    ['不确定性', '观察入口与未知', '评测过拟合', '留出案例', '持久曝光记录'], 'holdout',
    ['unweighed-crate'], ['well-rehearsed-mirror'], ['glasshouse-audit', 'city-after-the-mirrors'], ['well-rehearsed-mirror', 'glasshouse-audit']),
  define('modular-host', '模型、宿主与模块合同', '模型、循环、工具、角色和存储可独立配置；替换模块仍需验证接口与持久状态。', ['bounded-feedback', 'session-boundaries', 'identity-permission'],
    ['模块依赖', '工具注册', '提供方与模型', '独立权限', '接口版本', '可替换存储'], 'modules',
    ['bp-dsh-composition', 'bp-opencode-separation'], ['bp-opencode-separation', 'bp-dsh-composition'], ['bp-dsh-lifecycle', 'bp-opencode-migration', 'bp-pi-extension'], ['bp-opencode-separation', 'bp-dsh-lifecycle']),
];
