# 04 · 一次批准与业务去重

只实现 `write_once(host, path, content, request_id, approved)`，再让 dispatch 的写入分支调用它。

授权顺序：`approved is True` 才能继续，其他情况抛 `ToolFault`（dispatch 转为错误回执）。批准的是当前路径和内容；恢复后重放时也不能把过去批准当成永久权限。`host.write_note` 是裸副作用，故意不替你检查批准。

幂等顺序：把 `{path, content}` 稳定 JSON 序列化并计算 SHA-256；在 `host.ledger` 按 `request_id` 存 `{fingerprint, result}`。已有键同指纹返回旧结果，同键不同内容拒绝；新键才调用 `host.write_note`，之后保存回执。发生在执行和账本保存之间的崩溃，需要更强的事务，这个教学版本不伪装已解决。

不要混淆 `call.id`（本次消息关联号）和 `request_id`（业务去重键）。模型换了调用 ID，仍可能请求同一次业务操作。

验收：`python workshop.py check --stage approval --report reports/approval.json`。同业务键、不同调用 ID 只写一次；拒绝批准不改变文件。旧成功回执重放后，世界可能已经损坏，要重新调用 `check_state`，不能把账本当世界事实。
