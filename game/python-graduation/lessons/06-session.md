# 06 · 保存与恢复

只实现 `save_session(path, state)` 与 `load_session(path)`。

state 只接受 `{version:1, messages:[...], ledger:{...}}` 三个顶层字段。未来版本、永久批准、配置密钥等额外字段拒绝。每个账本项仅 `{fingerprint:64位hex, result:对象}`；消息必须完成全部工具配对，孤立回执或未回复调用不能恢复为完成状态。

可以复用 `runtime.messages_well_formed` 作为协议护栏。保存前先校验；写入旁边的临时文件再 replace 正式文件，防止半份 JSON 替代原存档。文件最多 256 KiB，消息／账本最多 256 项。恢复后重新执行同样校验；存档是可能被编辑的外部数据，不会自动授予批准。

验收：`python workshop.py check --stage session --report reports/session.json`。将经过批准写入后的账本保存、恢复，再重放；真实文件写计数仍为一次。

实际任务：`python workshop.py play --scenario lighthouse --session sessions/lighthouse.json`，之后 `python workshop.py play --scenario lighthouse --resume sessions/lighthouse.json`。保存发生在完整消息配对边界。突然断电恰好位于副作用和账本提交之间时，要人工重新核验；下一阶段才能考虑事务日志。
