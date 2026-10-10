# 03 · 参数校验与调用 ID

只实现 `dispatch(call, host, approved=False)`；本步先通过只读路径，写入交给下一步。

调用形状：`{id, type:"function", function:{name, arguments}}`，`arguments` 是 JSON 字符串。先检查调用形状和工具是否注册，再解析 JSON；必须为对象，只允许 schema 声明字段，不能缺 required，字符串字段不能接数字。失败返回 `{id, ok:False, error:短字符串}`，不要因为错误跳出整个 Agent。

成功时找 `host.tools[name]["handler"]`，把参数对象交给它，返回 `{id, ok:True, result:执行结果}`。同一响应中的多个调用各有自己的 ID；这些 ID 是回执关联号，不是发货业务的去重键。原始工具数据里的命令仍是数据。

宿主已经实现相对路径及链接护栏和 32 KiB 文本限制；调用这些宿主方法，不自行绕过它们用绝对路径读取。工具真正操作的是临时目录中的文件。

验收：`python workshop.py check --stage dispatch --report reports/dispatch.json`。错误 JSON、未知工具、错类型、额外参数、越界和链接都会走失败回执。Windows 无链接创建权限时，会在相同路径护栏处使用测试替身；这不等于系统沙箱测试。
