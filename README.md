# Agent From Zero

用 Python 从零手搓一个参考 Pi Coding Agent 的命令行编程助手。学习者会 Python 基础语法，尚未开发过 Agent；每次只推进一个可理解、可运行、可验证的小步骤。

## 从这里继续

1. 看 [当前进度](docs/PROGRESS.md)，确认停在哪里。
2. 看 [学习方案](docs/PLAN.md)，了解当前阶段的目标。
3. 从 [第 1 课：消息与模型调用](lessons/01-messages.md) 开始。

下次可以直接说：**“读这个项目的 AGENTS.md 和 docs/PROGRESS.md，带我继续下一步。”**

## 当前状态

已建立学习文档和版本管理起点。尚未实现模型调用、工具或 Agent 循环，也没有安装第三方依赖。

环境已检查：Windows、PowerShell、Python 3.13.2、Git 2.51.0。

## 运行约定

后续在项目目录创建虚拟环境：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe --version
```

直接使用虚拟环境中的 Python，不要求修改 PowerShell 执行策略。模型服务、模型名和接口地址在第 1 课确定；密钥仅放环境变量或被忽略的本地配置中。

## 参考

- [Pi 官方项目](https://github.com/earendil-works/pi)
- [Coding Agent 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)
- [Agent Core 文档](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)

2026-09-11 核对：原 `badlogic/pi-mono` 链接已跳转到上述项目。这里借鉴架构思路，用 Python 独立实现；不是 Pi 官方项目，也不承诺兼容它的插件或会话格式。若后续复制源码，先核对并保留相应许可和署名。
