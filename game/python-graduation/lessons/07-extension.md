# 07 · 新工具，原循环

只实现 `extension.py` 的 `register_extensions(host)`。

注册 `list_notes`，description 描述真实能力，parameters 为只含必填字符串 `prefix` 的对象，`write:False`，handler 接收参数对象并调用 `host.list_notes(args["prefix"])`。`parameters` 辅助函数在 runtime 中可用。新工具不用增加任何循环分支；describe_tools 和 dispatch 都应从注册表推导。

验收：`python workshop.py check --stage extension --report reports/extension.json`。陌生温室路径、两份成果文件、旧维护指令和列表工具进入同一回路。新工具不能扩张路径权限；注入没有办法借它读取工作目录之外的资料。

执行：`python workshop.py play --scenario greenhouse --discover`。试拒绝一次批准、重试、查看文件和最后 verified。现在你构建的是可扩展的单 Agent harness；给工具换一套参数，不等于创建新的模型或训练权重。
