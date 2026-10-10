# 回声工坊：个人 Agent 编程毕业工坊

这不是点一次就下载“完整答案”的 Agent。你负责写下核心机制，工坊负责提供可运行环境、真实文件任务和检查器。默认使用标准库与确定的脚本策略，无网络、无模型费用，不读取任何已有 `.env`。这里的文件与网站存档、原项目练习完全独立。

## 第一小步

用电脑安装 Python 3.10 或更高版本，解压本包，进入包含 `workshop.py` 的目录。在 PowerShell 或终端执行：

```text
python workshop.py inspect
python workshop.py check --stage context --report reports/context.json
```

第一次检查会失败，并告诉你要实现 `build_context`。这是实际执行你的函数产生的结果。打开 `lessons/01-context.md`，只完成当前函数，再重跑同一命令。每步都先讲原理、给函数契约，再给验收；不用同时完成后面七步。手机上的游戏负责提出目的、展示检查记录；Python 编程分支在你自己的电脑运行。

## 八步

| 步骤 | 你写什么 | 你观察什么 |
|---|---|---|
| 01 context | 消息组织 | 资料中的指令仍然是数据 |
| 02 schema | 工具声明 | 模型只能看到输入接口，看不到执行器 |
| 03 dispatch | 参数校验与回执 | 真实文件、错误、调用 ID |
| 04 approval | 逐次批准与业务去重 | 拒绝零副作用、重放只写一次 |
| 05 loop | 消息—工具—反馈循环 | 回答不等于验收；预算与取消 |
| 06 session | 版本化保存、恢复 | 完整配对消息和执行账本 |
| 07 extension | 注册新工具 | 原循环完成陌生温室任务 |
| 08 personal | 自己的用途和验收器 | 自己的任务改变文件，错误成果被拒绝 |

离线任务从第 05 步起可以运行：`python workshop.py play --scenario lighthouse`。每个具体写入都会展示参数；只有输入 `YES` 才批准。第 07 步后加 `--discover` 使用新工具。自己编辑文件，再观察运行与复查的区别。工作目录已存在时，只有输入 `RESET` 才重新放置任务样本。

## 给自己的 Agent 一个真实用途

网页可以导出 `personal-brief.json`，内容为 `purpose`、`acceptance`、`toolBoundaries` 三个文本字段；也可以直接填写本包模板。参照 `mission.example.json`，编辑 `personal-mission.json`：`files` 是任务开始时真实文件，`expected` 是可观察的最终文件内容，`goal` 是自然语言目标。目录路径必须相对且不能越界。默认空白任务不算毕业。

```text
python workshop.py check --stage personal --brief personal-brief.json --mission personal-mission.json --report reports/personal.json
python workshop.py play --mission personal-mission.json --scenario greenhouse --discover
```

最终检查会重新执行前七步，使用当前同一份代码，真实运行你自定义的任务，再故意破坏成果，确认你的验收器拒绝假成功。脚本 Provider 使用预先给出的正确工具请求，检查的是你写的执行系统。它不能证明模型会独立解决你的需求，也不能证明一个写下预期文件的任务足够实用。真实用途还要用未见资料和真实模型校准。

## 报告与存档

`reports/*.json` 是本机执行报告。导回网页后，只显示“本机检查通过／待修复”；报告文件可编辑，不是不可伪造的认证，也不是完全掌握证明。最终报告绑定 brief 的 SHA-256，代码指纹方便比较版本；代码和 brief 本文不进入报告。不同小步修改后指纹自然变化，只有最终回归检查证明同一次代码运行通过整套基础检查。

第 06 步完成后，用 `--session sessions/run.json` 在安全配对边界保存消息和去重账本；用 `--resume sessions/run.json` 恢复。恢复不会带回永久批准；已有成果会重新核验。终端强制退出发生在写入和保存之间时，不能宣称崩溃事务已保证，需要检查文件、再决定如何恢复。工具目录护栏是本练习的一项宿主实现，不是 OS 沙箱。

## 可选真实模型

先完成本机全部检查，再安装 `python -m pip install -r requirements-live.txt`。在你自己的终端设置 `MODEL_BASE_URL`、`MODEL_NAME`、`MODEL_API_KEY`；不把密钥放入源代码、brief、任务、报告或聊天。Base URL 是服务的兼容根路径，SDK 会拼接 `/chat/completions`，不要将这个接口路径重复加到 Base URL。创建客户端并不会请求模型，`complete` 才会发出请求。

```text
python workshop.py play --mission personal-mission.json --brief personal-brief.json --scenario greenhouse --discover --live
```

程序会先运行全部检查，再要求输入 `LIVE`；明确确认后才创建真实 Provider。最多 8 轮，每轮最多 512 输出 token，SDK 单次超时 30 秒且禁用自动重试；没有本网站的服务器 Key 或额度。真实模型仍不能直接执行代码或系统命令，只能请求当前注册的文件工具。本包没有多 Agent、检索索引或任意 shell 的实现；需在完成这个闭环后另加自己的工具、权限和评测。

官方协议参考（2026-10-10 核对）：[Function calling](https://developers.openai.com/api/docs/guides/function-calling)、[OpenAI Python SDK](https://github.com/openai/openai-python)。这里沿用 Chat Completions；脚本策略不声称复现模型内部计算。可参考工具协议，本包不复制官方 Agent 框架代码。
