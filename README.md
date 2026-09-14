# Agent From Zero

用 Python 从零手搓一个参考 Pi Coding Agent 的命令行编程助手。学习者会 Python 基础语法，尚未开发过 Agent；每次只推进一个可理解、可运行、可验证的小步骤。

## 从这里继续

1. 看 [当前进度](docs/PROGRESS.md)，确认停在哪里。
2. 看 [学习方案](docs/PLAN.md)，了解当前阶段的目标。
3. 按进度中的“下一次具体操作”继续；[第 1 课](lessons/01-messages.md) 保留作回顾资料。

下次可以直接说：**“读这个项目的 AGENTS.md 和 docs/PROGRESS.md，带我继续下一步。”**

## 当前状态

独立网站 **[Agent 实验局](https://agent.li33.art/)** 已上线：八关课程、三个互动实验、七款 Agent 图鉴、社会映射与学习档案。网站源码和运行方式见 [website/README.md](website/README.md)。网站使用独立静态实现，不访问下面 Python 练习的模型配置。

已完成 S1 单次模型调用、S2 多轮聊天和 S3 第一个只读工具：程序能让模型请求 `read_file`，在工作目录边界内安全读取文件，并把工具结果回传模型生成最终回答。下一步进入 S4，把固定的一次工具往返改造成有结束条件的 Agent 循环。

环境已检查：Windows、PowerShell、Python 3.13.2、Git 2.51.0。

## 运行约定

当前使用系统 Python，运行：

```powershell
python hello_agent.py
```

已选 `python-dotenv` + OpenAI Python SDK，通过 Chat Completions 连接兼容服务。`.env` 中设置 `MODEL_BASE_URL`、`MODEL_NAME`、`MODEL_API_KEY`，详见进度文档；密钥不进入 Git。项目尚未创建虚拟环境。

## 参考

- [Pi 官方项目](https://github.com/earendil-works/pi)
- [Coding Agent 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)
- [Agent Core 文档](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)

2026-09-11 核对：原 `badlogic/pi-mono` 链接已跳转到上述项目。这里借鉴架构思路，用 Python 独立实现；不是 Pi 官方项目，也不承诺兼容它的插件或会话格式。若后续复制源码，先核对并保留相应许可和署名。
