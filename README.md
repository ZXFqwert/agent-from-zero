# Agent From Zero

用 Python 从零手搓一个参考 Pi Coding Agent 的命令行编程助手。学习者会 Python 基础语法，尚未开发过 Agent；每次只推进一个可理解、可运行、可验证的小步骤。

## 从这里继续

1. 看 [当前进度](docs/PROGRESS.md)，确认停在哪里。
2. 看 [学习方案](docs/PLAN.md)，了解当前阶段的目标。
3. 按进度中的“下一次具体操作”继续；[第 1 课](lessons/01-messages.md) 保留作回顾资料。

下次可以直接说：**“读这个项目的 AGENTS.md 和 docs/PROGRESS.md，带我继续下一步。”**

## 当前状态

手机游戏 **《回声工坊：失序之城》v0.11** 已发布，可在 [agent.li33.art/play/](https://agent.li33.art/play/) 继续玩完整第一季内容和长期模式：**84 场作者冒险**（八章64场、序终章6场、七款现实蓝图14试炼）、24类委托模板的有限变体、三层共用预算远征、能力旅历、延迟重遇建议和显式构筑复用。对应来源任务真实通关后才开放长期委托；复习不会冒充新迁移证据。九个离线包、可回放存档和Python三步骨架导出保留。

当前公开游戏制品为 `20261010-173835`，构建 `f0e266d0451690996d997028`，共享工坊入口已上线。474项前端检查、66项后端检查、49项发布器检查、22项升级检查、TSC及174条作者路线通过。公开Chrome核实根域口令、两个独立会话共享实验额度、84关／48变体／已完成远征旧存档，以及安全更新后第2／9章的过期凭证断网冷恢复。独立服务保留 `deepseek-flash` 连接和既有五场30轮模型记录，本轮零新增模型调用；第二模型继续关闭。完整实况见 [共享入口验收](game/docs/SHARED_ACCESS_QA_20261010.md)、[学习结果审计](game/docs/LEARNING_OUTCOME_AUDIT_20261010.md) 和 [游戏路线](game/docs/ROADMAP.md)。手机真机、玩家乐趣、掌握程度、实际时长和独立个人 Agent 编程毕业项目仍待完成。

入口已按用户 2026-10-10 的要求改为共享工坊口令：直接打开 **[agent.li33.art](https://agent.li33.art/)**，输入 `zhouxingfu`，主线不限次数，真实模型实验使用全站共享额度。旧网站保留在 **[/archive/v1/](https://agent.li33.art/archive/v1/)**；正式上线实况见共享入口验收记录。

独立审计确认：84 场作者任务已有实现与通关证据，但个人 Agent 编程毕业项目、稳定概念的四阶段学习证据和真人乐趣校准还未完成。Python 下载是需要亲手补工具的教学骨架，不能称已提供完整定制 Agent。具体缺口与验收方法见 [学习结果审计](game/docs/LEARNING_OUTCOME_AUDIT_20261010.md)。

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
