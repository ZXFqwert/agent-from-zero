# 当前进度

更新时间：2026-09-11（Asia/Shanghai）

## 接续摘要

- 目标：用 Python 从零手搓参考 Pi 的 Coding Agent。
- 基础：会 Python 基础语法，尚未做过 Agent。
- 节奏：按完整功能布置有分量的练习，解释核心概念与验收条件；学习者独立写代码，助教检查并维护文档。“步子大”不是授权代写。
- 当前：S0 已完成，首个提交已推送并核对本地与远端一致。
- GitHub：https://github.com/ZXFqwert/agent-from-zero （私有，主分支 main）。
- 本机认证：已修复 gh 登录并配置 Git HTTPS 认证，凭据保存在系统密钥环。
- 实现进度：S1 进行中；S2 的终端交互部分已通过验证，包括连续输入、空白过滤和三个命令。尚未调用模型，S1 和 S2 整体均未验收；S3–S8 未开始。
- 暂停：用户去吃饭，要求收尾。已完成 .env 加载与三个配置读取；已导入 OpenAI。用户称客户端创建完成，但当前保存的 hello_agent.py 未见 client = OpenAI(...)，需下次确认是否未保存；助教未补写。
- 下一步：先确认并检查客户端初始化，再只指导第一次 Chat Completions 请求。

## 已完成

- [x] 检查本地 Python 和 Git。
- [x] 确认学习基础和 Pi 参考方向。
- [x] 核对 Pi 官方说明及项目地址跳转。
- [x] 编写方案、首课入口和持续协作约定。
- [x] 初始化本地 Git 并提交。
- [x] 创建私有 GitHub 仓库并推送。
- [x] 核对远端 main 与本地提交一致（首个提交 `1bf6f77`）。

## 下一次具体操作

1. 先读 hello_agent.py，确认用户是否保存 client = OpenAI(...)。当前只看到导入，不能把客户端初始化记为完成。
2. 客户端应使用已读取的 api_key 与 base_url，在输入循环之前创建；创建客户端不等于请求成功。
3. 下一小步仅指导一次 client.chat.completions.create 调用，模型名使用 model_name、历史使用 messages；由学习者写和运行。
4. 请求成功后再分步讲响应提取、保存 assistant 和多轮集成，不在同一轮全部布置。

## 已确定配置与环境

- Base URL：https://api.li33.art/gpu1/v1。
- 模型：huihui-qwen3.8-27b。
- 协议：Chat Completions，用户明确确认服务支持；尚未发请求验证。
- 配置：.env + python-dotenv；变量 MODEL_BASE_URL、MODEL_NAME、MODEL_API_KEY。密钥不写入本文档。
- 客户端：OpenAI Python SDK；保留当前选型，不再切换到 Responses 或 requests。
- 当前使用 C:\Python313\python.exe；项目未建 .venv。继续沿用当前可运行环境，环境隔离留待合适时机解释。
- 已运行 python hello_agent.py，输入 /exit 后正常退出；地址、模型名正确，密钥存在检查为 True；.env 被 Git 忽略。

本次没有真实模型调用，不需要把 GitHub PAT 当成模型 API Key。

## 学习记录

| 日期 | 内容 | 验证/证据 | 下一步 |
| --- | --- | --- | --- |
| 2026-09-11 | 建立学习路线与首课，修复认证并完成首次同步 | Python 3.13.2、Git 2.51.0；git diff --cached --check 通过；首个提交本地与远端一致 | 开始 S1 消息练习 |
| 2026-09-11 | 学习者完成三条消息与打印循环 | 助教读取 hello_agent.py 并运行 python hello_agent.py，退出码 0，按序输出三条消息 | 练习 append 追加用户消息；尚未验证真实模型调用 |
| 2026-09-11 | 学习者完成键盘输入与追加，理解保留历史的作用 | 输入 hello agent 后正确追加为第四条 user 消息，退出码 0；助教代写的外壳已按要求撤回 | 独立实现终端会话循环与命令 |
| 2026-09-11 | 学习者完成终端会话管理 | 两条普通输入、空白、/history、/clear、/history、/exit 依次运行，第一次历史三条、第二次仅 system，退出码 0 | 讲解模型调用数据流并确定服务；用户要求任务同时提供关键原理 |
| 2026-09-11 | 确定 Chat Completions 路线，学习者完成 .env 读取并导入 SDK，暂停收尾 | 配置读取与 /exit 运行通过；尚未看到客户端初始化代码，无真实请求 | 恢复时先确认客户端初始化是否保存，再指导单次请求 |

## 每次结束时更新

记录：当前阶段、实际完成的内容、运行命令与结果、学习者是否能解释、未解决问题、下次第一个动作。阶段验收通过才标完成。Git 提交历史记录具体版本，不在文档中预写尚未发生的测试结果。
