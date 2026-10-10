# Agent From Zero

用 Python 从零手搓一个参考 Pi Coding Agent 的命令行编程助手。学习者会 Python 基础语法，尚未开发过 Agent；每次只推进一个可理解、可运行、可验证的小步骤。

## 从这里继续

1. 看 [当前进度](docs/PROGRESS.md)，确认停在哪里。
2. 看 [学习方案](docs/PLAN.md)，了解当前阶段的目标。
3. 按进度中的“下一次具体操作”继续；[第 1 课](lessons/01-messages.md) 保留作回顾资料。

下次可以直接说：**“读这个项目的 AGENTS.md 和 docs/PROGRESS.md，带我继续下一步。”**

## 当前状态

手机游戏 **《回声工坊：失序之城》v0.13** 已发布，可在 [agent.li33.art](https://agent.li33.art/) 输入共享口令 `zhouxingfu` 后游玩：84场作者冒险、24类有限变体、三层远征、20概念学习链、八步Python个人Agent项目，以及三场隐藏品牌架构试炼。完成第二章「无声的货梯」后，还可在毕业工坊进入新增「暴雨签收站／断电夜市」，亲手处理丢回执、持久恢复、同业务键重试与参数冲突。

当前公开制品 `20261010-212421`，构建 `430feee71fb89c3ccdd3d295`，41项资源共12,197,531字节大小/SHA逐项一致，532项前端软件检查、TSC及174条作者路线通过。签收站使用独立存档与完整动作重放，旧84主线／48变体／三层远征存档没有变化。制作方真实操作补上幂等迁移后，核心学习链从58/80、19迁移变为59/80、20迁移、0间隔回访；这些不是人的掌握率。公开Chrome验证安全交付、提示跨备份保留、已有证明保留、第二标签只读，以及第2章下载后的离线冷恢复与新交付。详情见 [签收站验收](game/docs/COURIER_TRANSFER_V013_QA.md) 和 [游戏路线](game/docs/ROADMAP.md)。真人乐趣、手机真机、实际时长和学习者独立个人Agent作品继续待验；模型后端保持既有配置，本轮零新增模型调用。

入口已按用户 2026-10-10 的要求改为共享工坊口令：直接打开 **[agent.li33.art](https://agent.li33.art/)**，输入 `zhouxingfu`，主线不限次数，真实模型实验使用全站共享额度。旧网站保留在 **[/archive/v1/](https://agent.li33.art/archive/v1/)**；正式上线实况见共享入口验收记录。

独立审计后的学习工坊已补齐八步个人Agent练习和稳定概念链，并提供幂等陌生迁移玩法。学习者亲手完成的作品、完整间隔重遇与真人乐趣仍未验收。Python下载仍须自己实现；软件检查和制作方操作不能称为玩家已掌握或已完成定制Agent。历史缺口及后续记录见 [学习结果审计](game/docs/LEARNING_OUTCOME_AUDIT_20261010.md)、[学习工坊](game/docs/LEARNING_WORKSHOP_V012_QA.md) 和 [签收站验收](game/docs/COURIER_TRANSFER_V013_QA.md)。

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
