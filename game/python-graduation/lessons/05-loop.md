# 05 · 从回答到闭环

只实现 `run_agent(provider, host, goal, project_rules, documents, max_rounds=8, cancelled=...)`。

返回 `{reason, rounds, messages, verified}`。`reason` 为 `answered`、`budget` 或 `cancelled`。预算必须为整数 1..8，拒绝不合法值。先用已实现的消息组织和工具声明，再每轮调用 `provider.complete(messages, tools)`。将 assistant 回复原样加入；无工具调用就停止，有调用则逐条执行并加入 `{role:"tool", tool_call_id:原ID, content:JSON回执}` 后继续。

写入前调用 `host.approval(call)`；只读无须询问。每次请求前、每个工具执行前检查 `cancelled()`。本轮剩余调用被取消时，为它们补明确取消回执，保持已收到调用配对，再停止。不继续请求或执行。

最终 `verified` 来自 `host.verified`，不能从回答包含“完成”推导。`host.check_state` 真正重新读取文件；它是验收工具，`host.verified` 也会检测回执后发生的外部文件改动。

验收：`python workshop.py check --stage loop --report reports/loop.json`，然后 `python workshop.py play --scenario lighthouse`。默认脚本策略不理解语言，只按预设请求走流程；它检验你写的系统，不代表真实模型能力。
