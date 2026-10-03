/** Official evidence for the teaching slice, never a product capability score. */
export interface BlueprintTrialSource {
  productId: 'codex' | 'claude-code' | 'openclaw' | 'hermes' | 'opencode' | 'pi' | 'deepseek-harness';
  label: string;
  reviewedAt: string;
  sourceVersion: string;
  sourceLinks: string[];
  simplification: string;
  sharedCapabilities: string;
}
export const blueprintTrialSources: BlueprintTrialSource[] = [
  {productId: 'codex', label: 'Codex', reviewedAt: '2026-10-03', sourceVersion: '官方在线文档快照；未绑定 CLI/桌面构建版本', sourceLinks: ['https://learn.chatgpt.com/docs/agent-approvals-security'], simplification: '有限虚拟目标、单次请求批准和两个独立世界；工具范围不是操作系统沙箱，固定审批不是完整审批策略。', sharedCapabilities: '工作区、批准、隔离与带证据交付也可由其他系统支持。'},
  {productId: 'claude-code', label: 'Claude Code', reviewedAt: '2026-10-03', sourceVersion: '官方在线工作方式与子代理文档快照', sourceLinks: ['https://code.claude.com/docs/en/how-claude-code-works', 'https://code.claude.com/docs/en/sub-agents'], simplification: '作者声明的私有任务、有限容量和摘要保留字段，不复现模型内部计算、生成摘要质量或真实 token 计数。', sharedCapabilities: '信息收集、验证、压缩和专项子任务不是产品独占；普通独立上下文与继承对话的 fork 需区分。'},
  {productId: 'openclaw', label: 'OpenClaw', reviewedAt: '2026-10-03', sourceVersion: 'dd66b67807344d7754de8f7bc29af7c9e9e59bf7; doc-schema-version 1', sourceLinks: ['https://github.com/openclaw/openclaw/blob/dd66b67807344d7754de8f7bc29af7c9e9e59bf7/docs/concepts/session.md', 'https://github.com/openclaw/openclaw/blob/dd66b67807344d7754de8f7bc29af7c9e9e59bf7/docs/concepts/queue.md'], simplification: '有限认证入口、会话分组、消息实例与逻辑轮，不连接外部聊天平台或复现真实流式调度。', sharedCapabilities: '多入口、队列与长期运行并非独占；路由和授权由宿主声明，不由模型猜身份。'},
  {productId: 'hermes', label: 'Hermes Agent', reviewedAt: '2026-10-03', sourceVersion: '仓库 HEAD eb7e8620324b32424c06218f6a28094df2e921f8；在线文档另按核查日期定位', sourceLinks: ['https://hermes-agent.nousresearch.com/docs/developer-guide/architecture', 'https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/', 'https://hermes-agent.nousresearch.com/docs/user-guide/features/skills', 'https://github.com/NousResearch/hermes-agent/blob/eb7e8620324b32424c06218f6a28094df2e921f8/README.md'], simplification: '少量有来源的事实、成功调用流程和显式会话快照，不生成技能，不模拟检索质量；保存经验不更新模型权重。', sharedCapabilities: '跨会话记忆与技能也存在于其他系统；持久写入、当前快照和工具检索回响是不同状态。'},
  {productId: 'opencode', label: 'OpenCode', reviewedAt: '2026-10-03', sourceVersion: '官方 V2 文档快照', sourceLinks: ['https://opencode.ai/v2/docs/agents', 'https://opencode.ai/v2/docs/providers', 'https://opencode.ai/v2/docs/permissions', 'https://opencode.ai/v2/docs/migrate-v1'], simplification: '有限连接适配、角色和有序三值规则，不连接真实提供方，也不实现完整配置解释器或真实模型比较。', sharedCapabilities: '模型、角色和执行授权可分别配置；受支持 V1 配置仍兼容，不能概括为全部失效。'},
  {productId: 'pi', label: 'Pi', reviewedAt: '2026-10-03', sourceVersion: 'a276dabe57911253350bffb93cb7d7aff6a73261', sourceLinks: ['https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/coding-agent/docs/how-pi-works.md', 'https://github.com/earendil-works/pi/blob/a276dabe57911253350bffb93cb7d7aff6a73261/packages/coding-agent/docs/security.md'], simplification: '三工具闭环、有限会话分支和声明式扩展，不执行 JavaScript、shell 或 MCP；简单分支不是完整 Pi 会话树。', sharedCapabilities: '当前 Pi 支持项目 MCP；项目信任控制资源加载，不等于运行沙箱，分支不撤销外部副作用。'},
  {productId: 'deepseek-harness', label: 'DeepSeek Harness', reviewedAt: '2026-10-03', sourceVersion: '5badb15009ae1756c3afe0ae0cef1faafc290ccc；developer preview', sourceLinks: ['https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/architecture.md', 'https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/README.md'], simplification: '有限模块依赖、版本接口、注册作用域与事件投影，不实现 Cordis、PTC 脚本、热重载或完整存储迁移。', sharedCapabilities: '模块化不是独占；该源码仍为开发者预览，不能宣称稳定 SDK。'},
];
export const blueprintTrialPairs = [
  {productId: 'codex', scenarioIds: ['bp-codex-workbench', 'bp-codex-approval']},
  {productId: 'claude-code', scenarioIds: ['bp-claude-scout', 'bp-claude-compaction']},
  {productId: 'openclaw', scenarioIds: ['bp-openclaw-routing', 'bp-openclaw-queue']},
  {productId: 'hermes', scenarioIds: ['bp-hermes-reuse', 'bp-hermes-stale']},
  {productId: 'opencode', scenarioIds: ['bp-opencode-separation', 'bp-opencode-migration']},
  {productId: 'pi', scenarioIds: ['bp-pi-core', 'bp-pi-extension']},
  {productId: 'deepseek-harness', scenarioIds: ['bp-dsh-composition', 'bp-dsh-lifecycle']},
] as const;
