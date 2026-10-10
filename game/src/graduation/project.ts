export const GRADUATION_PROJECT = {
  id: 'echo-personal-agent', version: '1.0.0', reportVersion: 1,
  downloadUrl: '/play/graduation/echo-personal-agent-v1.zip',
  filename: 'echo-personal-agent-v1.zip',
} as const;

export const GRADUATION_STAGES = [
  { id: 'context', title: '01 · 把资料放回资料的位置', principle: '指令、目标、项目约定和外部资料的来源不同；读到一段命令，不等于获得了授权。', task: '只实现 learner.py 的 build_context。保留资料来源、版本和时间，将资料作为有边界的数据交给模型。', acceptance: ['项目约定进入 system；玩家目标进入 user。', '资料中的“忽略规则”仍在 user 数据区，不升级为 system。', '未知、过期和缺失信息保留，不编造世界状态。'], command: 'python workshop.py check --stage context --report reports/context.json' },
  { id: 'schema', title: '02 · 给法器一个精确接口', principle: '模型看到的是工具声明；程序保存的是执行器。schema 描述输入，不能授予权限。', task: '只实现 describe_tools：从注册表生成 Chat Completions 工具声明，说明必填字段、类型和额外字段规则。', acceptance: ['read_note、write_patch、check_state 的参数声明正确。', '声明中没有 Python 执行器或权限回调。', '加入新注册工具，声明自动出现，无需改循环。'], command: 'python workshop.py check --stage schema --report reports/schema.json' },
  { id: 'dispatch', title: '03 · 让请求变成可追踪的回执', principle: '模型只提出请求；宿主校验、执行并用同一个调用 ID 返回成功或错误。', task: '只实现 dispatch：解析参数、校验工具及字段，调用宿主，返回带调用 ID 的回执。先处理只读工具。', acceptance: ['未知工具、坏 JSON、缺参数、错类型和额外字段拒绝执行。', '读取真实练习文件；路径越界和链接越界拒绝。', '错误也能作为 tool 消息回传，ID 不丢失。'], command: 'python workshop.py check --stage dispatch --report reports/dispatch.json' },
  { id: 'approval', title: '04 · 确认一次，执行一次', principle: '批准某次具体写入，不等于永久授权；同一请求重放不能再次产生副作用。', task: '只实现 write_once，并从 dispatch 接入：先检查批准，再查请求账本，写入后保存内容指纹。', acceptance: ['拒绝批准时，文件和计数都不改变。', '批准后写入、回执和真实内容一致。', '同 ID 同内容只写一次；同 ID 改内容被拒绝。', '保存“已发货”的旧回执后世界改变，必须重新核验。'], command: 'python workshop.py check --stage approval --report reports/approval.json' },
  { id: 'loop', title: '05 · 亲手接通行动闭环', principle: '模型回复、工具执行、世界验证是三个不同事件；循环必须有预算和中断出口。', task: '只实现 run_agent：收集上下文、请求模型、逐条回传工具结果，并在最终回答、预算或取消时停止。', acceptance: ['读→写→检查→回答能连续运行；多个调用逐一配对。', '只有一句“完成”时 verified 仍为 false。', '预算耗尽后没有下一次请求。', '取消发生后不继续执行本轮剩余副作用。', '错误回执能指导下一轮纠正参数。'], command: 'python workshop.py check --stage loop --report reports/loop.json' },
  { id: 'session', title: '06 · 断电后，接着修', principle: '会话是持久化的消息和执行账本；恢复不会训练权重，也不能恢复未经验证的权限。', task: '只实现 save_session / load_session：版本化保存消息和去重账本，原子替换，恢复前校验配对。', acceptance: ['保存后恢复的消息和账本一致。', '未来版本、孤立 tool 回执、未完成调用链都拒绝恢复。', '凭据和永久批准不进入存档。', '恢复账本后重放同请求仍不重复写入。'], command: 'python workshop.py check --stage session --report reports/session.json' },
  { id: 'extension', title: '07 · 迁移到陌生法器', principle: '工具注册和执行循环分离后，新能力来自接口扩展；新工具仍受相同边界约束。', task: '为 list_notes 注册只读处理器（extension.py）；让现有声明和 dispatch 支持它，避免在循环里增加品牌或工具分支。', acceptance: ['新增工具真实列出练习目录文件。', '参数、调用 ID、未知工具的检查仍生效。', '新工具不能越过项目目录；同一循环能完成陌生温室任务。'], command: 'python workshop.py check --stage extension --report reports/extension.json' },
  { id: 'personal', title: '08 · 交付你的个人 Agent', principle: '可用的 Agent 要有可观察的完成条件；最终回答不能替代验收，也不能用通过内置关卡代替自己的用途。', task: '在 personal-brief.json 写明真正的用途，在 personal-mission.json 定义任务文件与可观察验收；实现 accept_personal_result，用真实文件验证成果，运行两种陌生故障任务后再接真实模型。', acceptance: ['自己的 brief 三项和任务配置都具体；不是默认空白模板。', '错误成果即使说“完成”也验收失败；正确成果通过。', '自己的任务真实执行、改变文件，并在破坏成果后拒绝验收。', '当前代码重新通过前七步全部检查；灯塔和温室全闭环通过。', '可选择显式 --live 接入自己的 Chat Completions 环境；本机脚本报告不冒充真实调用或掌握证明。'], command: 'python workshop.py check --stage personal --brief personal-brief.json --mission personal-mission.json --report reports/personal.json' },
] as const;

export type GraduationStageId = typeof GRADUATION_STAGES[number]['id'];

// A stage report must contain this complete checklist; one cherry-picked pass is not a stage pass.
export const GRADUATION_CHECK_IDS: Record<GraduationStageId, readonly string[]> = {
  context: ['context.goal_roles', 'context.injection_data', 'context.provenance'],
  schema: ['schema.declarations', 'schema.no_handler', 'schema.new_registered'],
  dispatch: ['dispatch.read_pair', 'dispatch.invalid_calls', 'dispatch.path_boundary', 'dispatch.symlink_boundary'],
  approval: ['approval.denied', 'approval.once', 'approval.id_conflict', 'approval.stale_receipt'],
  loop: ['loop.closed_loop', 'loop.claim_unverified', 'loop.budget', 'loop.cancel', 'loop.errors', 'loop.multiple_calls'],
  session: ['session.roundtrip', 'session.versions_fields', 'session.protocol', 'session.restored_idempotence'],
  extension: ['extension.register_and_dispatch', 'extension.boundary', 'extension.unseen_loop'],
  personal: ['personal.brief', 'personal.reject_claim', 'personal.own_acceptance', 'personal.two_missions', 'personal.denied_mission', 'personal.core_regression', 'personal.custom_mission'],
};
