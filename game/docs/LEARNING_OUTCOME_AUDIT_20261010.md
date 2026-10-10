# 第一季内容与学习结果独立审计

核查日期：2026-10-10（Asia/Shanghai）。本轮只读检查公开内容、内核、成长、导出和现有验收文档；没有读取 `.env`、密钥、私人邀请或模型记录，没有发起真实模型调用，没有修改冻结内容、产品档案或根 Python 练习。新增此报告。上线和浏览器实况引用既有 2026-10-03 验收记录，本轮未重新代验手机或玩家学习。

## 可向用户直接说明的结论

**84 场作者关卡确实已制作；“能通关”已有软件和制作方浏览器证据。快乐、长期吸引力、完整掌握和独立编程能力还没有被证明。** 现状是具备真实因果的 Agent 机制解谜冒险，学习主题覆盖广，仍需玩法打磨、稳定概念评价和实际编程毕业任务，才能接近“玩完就能自己造个人 Agent”的目标。三步 Python 下载是起点，不能包装为已完成的编程课程或可直接运行的个人 Agent。

## 内容数量核对

本轮通过 TypeScript 只读导入 `src/content/scenarios.ts`、`progression.ts`、`stories.ts` 核对：84 个唯一任务 ID，84 份剧情；54 个主线 ID（八章各六场，加序终章六场）、16 条支线、14 场现实蓝图。任务类型为 56 guided、20 transfer、8 boss。序章三个 ID 为 `inherited-workshop`、`key-and-neighbor`、`first-warm-commission`；终章为 `nameless-system-diagnosis`、`unfamiliar-system-assembly`、`city-after-the-mirrors`。

`docs/SEASON_V010_QA.md` 记录 84 内容、174 条参考/替代/恢复路线和新增 20 场原生界面操作；`docs/POST_SEASON_V011_QA.md` 记录此前 64 场实际操作证明的接续、24 模板 × 两分支 48 场、三层远征及公开更新/回滚。462 软件测试是既有发布记录，**本轮没有重跑，也不是 462 次玩家学习测量**。内容校验器 `scripts/validate-content.ts` 执行可解路线并检查数据/资源；它明确只检查官方链接归属和元数据，不联网复核正文。

## 目标覆盖与证据层次

| 用户目标 | 已实现机制与具体入口 | 实际证据支持到哪里 | 仍欠缺的验收 |
| --- | --- | --- | --- |
| 从零理解 Agent 闭环 | `harbor-light`、`warehouse-gate`；模型文字、执行、回执、世界状态和验收分别保存 | 机制能让“只说完成”不能获胜，玩家需实际动作与复查 | 玩家能在未见情境自己说明、画出并诊断闭环 |
| 工具协议、调度和副作用 | `etched-door`、`paired-valves`、`missing-crate`；类型、调用 ID、异步回执、业务键 | 具体错误会被拒绝或产生可见后果，恢复路径可执行 | 玩家能独立写 schema、分派工具、配对结果和解决重复执行 |
| 规划、反馈与停止 | `cooling-pulse`、`one-crystal-left`、`broken-escapement`、`endless-warden`；预算、重试、中断、前置条件 | 有限资源、永久故障和错误计划确实影响结果 | 把游戏晶石转换为真实请求/token/时间限制；遇真实模型变化仍能调试 |
| 上下文、检索和压缩 | `narrow-satchel`、`absent-margin`、`field-hospital`；有限携带、显式检索、摘要保留字段 | 材料在档案内并不自动进上下文；漏字段会失败 | 真正 token 计数、真实检索召回/排序、模型生成摘要的质量与损失 |
| 记忆、技能和会话 | `night-handoff`、`saved-procedure`、`forked-courier`；保存/召回/修订、流程、分支 | 记忆不是训练；消息分支不回滚外部世界；技能仍收费与授权 | 实际 JSONL/SQLite 会话持久化、崩溃恢复、记忆来源与过期处理的编程练习 |
| 信任、权限和社会映射 | `footer-order`、`borrowed-seal`、`one-use-writ`、`glass-court` | 资料不能自己变身份；原件、一次批准、隔离与现场验收分开 | 操作系统隔离、路径/进程/网络边界及实际恶意资料；不把类比推成模型意识 |
| 多 Agent 的取舍 | `private-scrolls`、`wet-foundation`、`chorus-bridgewright`、`one-lamp-enough` | 私有输入、共享板、依赖、版本冲突和协作成本真实影响模拟 | 真正异步模型调用、队列持久化、共同错误来源；何时应减少 Agent 的陌生设计题 |
| 评测与整体目标 | `sunny-day-ledger`、`unweighed-crate`、`well-rehearsed-mirror`、终章 | 隔离试验、未知、留出曝光、硬条件、制度取舍与现场交付分别留证据 | 玩家自己设计新的验收合同/案例，防止只选择已列出的正确候选 |
| 七款主流系统比较 | 七组 × 两试炼；见下表，源码 `content/blueprintTrialSources.ts` | 能体验指定设计维度，附日期/版本/来源/简化；无固定战力榜 | 同一个陌生任务中无品牌提示解释系统组合；真实安装、配置和跨系统实践 |
| 快乐玩、快乐学、持续玩 | 奇幻场景、八首领、伙伴、复盘、失败恢复、24 模板和共享预算远征 | 有可玩的循环与策略后果，软件验证了这些行为 | 真人自愿重试、兴趣、疲劳、手机舒适度、体验时长；代码和作者走通不能替代 |
| 手搓个人定制 Agent | 三步 Python 骨架下载，根项目 S1–S4 已完成的独立学习路线 | 已建立概念向消息/工具/循环代码的桥梁 | 实际文件工具、持久会话、个性化、调试和独立毕业作品；当前尚未完成 |

## Python 三步下载究竟能做什么

来源：`src/exports/pythonBlueprint.ts`；对应检查：`tests/python-blueprint-export.test.ts`（11 项）。84 × 三阶段语法检查、数据转义、权限筛选、默认无网络、假客户端调用 ID/上限/失败等是代码安全和骨架一致性证据，不证明学习者独立实现。

| 阶段 | 默认执行 | 自己加 `--live` 后 | 尚需亲手实现 |
| --- | --- | --- | --- |
| messages | 打印阶段、公开目标与任务；无网络、无 SDK 配置读取 | 按本地三个环境变量创建 OpenAI SDK 客户端，发一次 Chat Completions 请求并打印文字；明确未验收 | 说明消息角色/资料与指令，不能把文字当结果 |
| tools | 同上 | `TOOLS_IMPLEMENTED = False` 时请求前停止；手动开启且填好实现后，最多一次工具请求与一次后续文字请求 | `read_observation`、`perform_operation`、`verify_live` 当前均抛 `NotImplementedError` |
| loop | 同上 | 同样先检查实现开关；填好后至多 8 次模型请求，按 `maxCalls` 限制真实工具次数，保留 tool_call_id；工具失败/取消即停 | 三件现场工具和宿主边界；不能靠删开关获得完整 Agent |

骨架已提供工具表、有限类型/枚举/范围校验、调度、逐动作 YES 确认、结果回传及独立验收规则。每次动作清掉旧验收，未知/类型不一致不会记为完成。这些都是有价值的教学材料。

但它**没有实现真实文件读取/写入/编辑、命令执行、持久会话、记忆检索、技能执行、认证、操作系统沙箱、异步队列、伙伴模型调用或评测**。带安全/记忆/协作/模块边界的动作默认拒绝执行。导出的 `maxRetries`/`permanentFailure` 是配置资料，通用 loop 目前仍遇工具失败就停，不实现游戏中的完整重试策略。`operate.arguments` 的 SDK schema 是一般 object，具体字段依靠宿主 `validate_arguments` 检查；不能称已导出完整逐工具严格 schema。

终章 `unfamiliar-system-assembly` 是在作者给定的有限工具/岗位/资料/总图中构筑；`city-after-the-mirrors` 在预设候选制度中选择与实测。它们不是编辑并运行自己的 Python 程序。根 `docs/PLAN.md` / `docs/PROGRESS.md` 明确 S5 写/编辑/执行、S6 持久化、S7 可靠性、S8 扩展仍待开始；本轮不代写学习者练习。

## 影响学习和乐趣的具体不足

1. **概念标签没有形成完整的四阶段课程链。** 本轮统计 284 种精确概念文字标签，263 个只出现在一个任务，只有 9 个标签同时出现在 guided 和 transfer。这是标签统计，不是“284 个独立原理”。`learningAtlas.ts` 的 `chapterRows` 按文字相等聚合；例如 `工具参数`、`类型与字段` 只来自 `etched-door`，其他参数迁移任务用不同文字，不会合并成同一掌握链。已有 capability 分组展示实际机制，但不能据此宣称每个核心概念都有引导、独立、迁移、延迟四次证据。
2. **独立标签仍是操作证据。** `engine/v6.ts`–`v10.ts` 的迁移判断要求真实动作、材料、审批、队伍或评测证据且未点提示；这是必要但有限的信号，无法判断玩家是在理解、照抄外部路线、记住按钮还是随机尝试。各场 `learningEvidence` 使用本关概念列表，不是逐概念的人类理解测验。旧 v1 的泛化完成在能力地图中降为 guided，边界处理正确。
3. **复习是有限变体。** `challenges/catalog.ts` 的 24 模板来自既有作者关卡，两类决策分支和种子增强重复练习，并非无限新机制。`challenges/growth.ts` 已正确令 factory-1 `freshWins` 恒为 0，最多标练习完成。`learningAtlas.ts` 的延迟建议由来源后两个不同主线首胜触发，最多三条；它是进度间隔，不是按真实日历、遗忘速度或个人薄弱点自适应复习。
4. **升级和战斗的主要内容是系统解谜。** `Scene.tsx` 是手绘背景/角色图、摆动、光环/脉冲、状态光照与首领透明度等反馈；`audio.ts` 仅三类合成提示音。首领有实际机制并非全是同一闭环，但没有一般 RPG 的数值战斗和养成系统可据此承诺。成长目前主要是能力记录、任务/模板开放及显式构筑复用。是否让玩家持续上瘾尚未验证。
5. **多数剧情选择的后果较轻。** `App.tsx` 保存 `choices` 并显示回应，`content/narrative.ts` 约十组既有选择改变后续开场。内容定义中的 `worldFlags` / `trustFlags` 不是已实现的一套 NPC 关系数值与支线开放系统；任务开放主要看通关前置。终章两制度确实通过真实 operate 改变库存、交接方式等世界结果，应与这些文案反应区分。
6. **后期控制复杂性有手机疲劳风险。** 卷轴、档案、身份、审批、岗位、队列、总图与评价台是真机制；复杂并不自动等于有趣。应观察是否出现大量重复签订/装卷/接回手续，以及玩家是否能从当下画面看懂失败，不能用单纯“控件都可点”代验。
7. **真实 LLM 经验仍较少。** 主线明确是固定教学策略，不复现模型内部计算、随机性、真实 token、生成检索/摘要质量。既有独立模型实验能帮助验证工具请求的不稳定性，不能把其有限模型与小预算实验推广为七产品全面实测。

## 七组蓝图及当前官方资料抽查

游戏冻结教材的核查日期为 2026-10-03；下面是 2026-10-10 对相同设计切片的官方资料抽查，不是七产品全部功能审计，不改变冻结试炼/档案，不把多个系统共享的能力称独占。在线页未绑定发行构建，资料有效性不能永久保证。

| 产品 / 两试炼 ID | 游戏覆盖切片与抽查结论 | 官方来源 |
| --- | --- | --- |
| Codex：`bp-codex-workbench` / `bp-codex-approval` | 批准与运行隔离分开；当前文档仍分别配置两者。游戏不实现操作系统隔离或全部审批策略 | [审批与安全](https://learn.chatgpt.com/docs/agent-approvals-security) |
| Claude Code：`bp-claude-scout` / `bp-claude-compaction` | 收集/行动/验证、压缩和子代理独立上下文；当前文档区分新上下文与 fork 继承。游戏摘要是作者确定字段 | [工作方式](https://code.claude.com/docs/en/how-claude-code-works) |
| OpenClaw：`bp-openclaw-routing` / `bp-openclaw-queue` | 会话路由、原始来源权限与队列/中断；官方仍要求显式 DM 隔离、逐会话串行。游戏无外部聊天平台和真实流式调度 | [会话](https://docs.openclaw.ai/concepts/session)、[队列](https://docs.openclaw.ai/concepts/queue) |
| Hermes：`bp-hermes-reuse` / `bp-hermes-stale` | 持久记忆、经验纠错与启动快照；当前文档确认中途写磁盘不会刷新现有系统块，工具可返回实时状态。游戏不生成技能或检索排序 | [持久记忆](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/) |
| OpenCode：`bp-opencode-separation` / `bp-opencode-migration` | 模型/角色/权限及版本迁移。官方说明受支持 V1 功能仍应兼容；游戏来源的简化备注正确保留此点，但 `scenarios.ts` 继承的旧 tradeoff “V1 与 V2 的配置不能直接混用”较笼统，需下次资料维护时收窄 | [V1 迁移](https://opencode.ai/v2/docs/migrate-v1) |
| Pi：`bp-pi-core` / `bp-pi-extension` | 小循环、分支、项目加载信任与扩展自身执行域；当前安全文档确认项目 MCP 及信任不限制工具可访问范围。游戏不执行 shell/JavaScript/MCP | [当前安全文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)；教材固定提交 `a276dabe57911253350bffb93cb7d7aff6a73261` |
| DeepSeek Harness：`bp-dsh-composition` / `bp-dsh-lifecycle` | 插件依赖、可替换存储、提交日志/恢复。当前仓库 README 仍标开发者预览和可能破坏兼容；游戏未实现 Cordis/PTC/热重载 | [官方仓库 README](https://github.com/deepseek-ai/deepseek-harness)；教材固定提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc` |

## 可验证的下一步

| 优先 | 改进 | 完成证据，而非口号 |
| --- | --- | --- |
| 1 | 新增外部课程映射 `conceptId`，把同义标签与玩法前置接成机制链；保留原存档证据和冻结胜负 | 每个核心机制列出引导、独立、未见迁移、延迟重遇四个具体任务/评分规则；重复和提示不冒充独立证据 |
| 1 | 增设独立个人 Agent 毕业项目，以学习者自己的目标为委托 | 学习者写出可运行工具注册/schema、读/经批准写/验证工具、循环/上限/取消、保存/恢复、项目指令；能给另一未见任务增加工具并定位一个注入/过期/重复副作用故障；助手不给整套成品替代学习 |
| 1 | 两类真人短试玩：新玩家首次进入和已玩玩家陌生迁移 | 至少记录自愿重试、卡住原因、操作/阅读时间、疲劳与复述；15 分钟能看出有趣因果，隔日能无提示诊断新故障；人数和实况公开，不把自动代理操作算人 |
| 2 | 把后期战斗、交接和故事反馈做成更少重复手续、更多场景反应与有意义选择 | 在同一遭遇删除解释问答后仍需理解才能赢；玩家能在不翻长日志时说出哪条证据失效；测试不同合法构筑和价值结果 |
| 2 | 加一个无品牌提示的七系统比较/组合毕业题，再揭示档案 | 玩家在相同未知任务下解释选择哪种路由/隔离/记忆/接口/协作配置及代价；不靠品牌强弱口诀，能指出教材简化 |
| 2 | iOS Safari 与 Android Chrome 真机验收、整季体验时长记录 | 真机触控/安全区/音频/PWA/离线更新通过；12–20 小时由实际游玩记录校准，桌面390宽截图不代替 |

这些建议没有在本轮冒称已实现；不要求先把私人 Python 练习代写完才继续玩。应保留内容可玩入口，同时诚实地把“课程覆盖”“操作证据”“玩家理解”“独立编程作品”四种完成线分别记录。
