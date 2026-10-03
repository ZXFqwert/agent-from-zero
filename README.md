# Agent From Zero

用 Python 从零手搓一个参考 Pi Coding Agent 的命令行编程助手。学习者会 Python 基础语法，尚未开发过 Agent；每次只推进一个可理解、可运行、可验证的小步骤。

## 从这里继续

1. 看 [当前进度](docs/PROGRESS.md)，确认停在哪里。
2. 看 [学习方案](docs/PLAN.md)，了解当前阶段的目标。
3. 按进度中的“下一次具体操作”继续；[第 1 课](lessons/01-messages.md) 保留作回顾资料。

下次可以直接说：**“读这个项目的 AGENTS.md 和 docs/PROGRESS.md，带我继续下一步。”**

## 当前状态

手机游戏 **《回声工坊：失序之城》v0.11** 已发布，可在 [agent.li33.art/play/](https://agent.li33.art/play/) 继续玩完整第一季内容和长期模式：**84 场作者冒险**（八章64场、序终章6场、七款现实蓝图14试炼）、24类委托模板的有限变体、三层共用预算远征、能力旅历、延迟重遇建议和显式构筑复用。对应来源任务真实通关后才开放长期委托；复习不会冒充新迁移证据。九个离线包、可回放存档和Python三步骨架导出保留。

当前公开游戏制品为 `20261003-220005`，构建 `211068a2ebb828909d8864b7`。462项软件测试、TSC、174条作者路线、构建及40项公开资源大小/SHA检查通过；制作方已在原生浏览器走完24模板×两变体48场、三层远征、重试不返预算和断网冷恢复。独立实验服务已连接 `deepseek-flash`，四场真实服务端实验加一场公开网页实验共计30轮请求；第五场两组都用完各4轮、尚未通过验收，忠实保留 incomplete。第二模型对照等待用户决定、保持关闭。源码与完整边界见 [游戏说明](game/README.md)、[长期模式验收](game/docs/POST_SEASON_V011_QA.md)、[真实模型验收](game/server/deploy/REAL_MODEL_QA.md) 和 [游戏路线](game/docs/ROADMAP.md)。手机真机、乐趣、学习效果和12–20小时时长尚未验证，整项重构仍有最终验收工作。

根入口仍保留独立网站 **[Agent 实验局](https://agent.li33.art/)**：八关课程、三个互动实验、七款 Agent 图鉴、社会映射与学习档案。按已确认的真机验收门槛，游戏暂不替换根入口。旧站源码和运行方式见 [website/README.md](website/README.md)。旧站与游戏均不访问下面 Python 练习的模型配置。

已完成 S1–S4：程序能进行多轮聊天、安全执行一个或多个 `read_file` 调用、把成功或错误结果回传模型，并在最大步数后停止。下一步进入 S5，逐步加入需用户确认的写文件与命令执行工具。

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
