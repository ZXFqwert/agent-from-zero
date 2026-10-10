# 08 · 自己的用途，自己的验收

这一步聚焦“验收”，不再添加新技术。实现 `accept_personal_result(host, final_text)`，依据 host.expected 中的相对路径与文本检查真实文件；缺失或不一致返回 false。不要依赖 final_text 自称成功。

先用网页导出的 brief（或本包模板）明确：我希望这个 Agent 服务什么用途、什么可观察结果说明完成、它可以读写哪里。参照 `mission.example.json` 编辑 `personal-mission.json`，将需求转成初始资料、目标和结果文件。空模板／未修改示例标题不通过。这里暂用精确文本验收；之后可以自行设计格式、事实覆盖、可接受偏差等更贴近用途的评测。

运行：`python workshop.py check --stage personal --brief personal-brief.json --mission personal-mission.json --report reports/personal.json`。最终检查会在当前代码上重跑前七步，执行你的任务，再破坏成果让验收器发现失败；也会跑灯塔和陌生温室以及拒绝分支。报告只证明这次本机测试，不证明你的需求在现实中已被正确建模。

去掉脚本的预设答案是下一项真实迁移：阅读 README 的 --live 说明，使用自己的模型配置和未见资料，观察失败，再改工具和验收。语言模型可以提出动作，但完成条件、权限、预算和证据由你设计的系统负责。
