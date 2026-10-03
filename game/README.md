# 回声工坊：失序之城

手机竖屏 Agent 学习冒险。独立于根目录 Python 教学项目，旧网站源码仍在 `../website/`。

## 当前交付范围

当前 v0.10 已发布 84 个作者任务：八章 64 场、序终章各 3 场，以及七款现实蓝图各 2 场机制试炼；28 项原创场景角色资源。序章直接从拉开工坊窗帘开始，终章要求诊断陌生系统、配置协作，再检验城市整体结果。八章依次覆盖闭环、工具协议、规划与停止、上下文、记忆技能、信任权限、伙伴协作和独立评测。174 条参考、替代及错误恢复路线由实际内核运行。用户已授权制作方试玩后继续。完整工程还包括成长与延迟重遇、24 委托模板、三层远征、受限真实实验和上线验收，不能因任务数量达到 84 就宣称整体完成。

- React 负责中文剧情、工坊、可访问操作和记录；Phaser 负责原创场景、伙伴、灯光、开门与首领反馈。
- 纯 TypeScript 内核模拟工具请求、实际执行、上下文回执、访问权限、预算与验收。只有世界事实与独立证据相符才会获胜。
- 自动与逐步指挥，点选能力/目标/成本后执行；三层事件复盘，按真实动作回放。
- v2 区分整项任务能量与单次派遣预算，增加容量、操作成本、目标排序、事件与证据撤销。旧三关继续冻结 v1 行为，旧存档可迁移。
- v3 将参数刻度、单次调用编号与业务凭证分开。成功业务保存执行凭证，匹配重试只重送原回执；领取回执不代替新鲜验收。
- IndexedDB 每次动作提交后更新 UI；三个恢复检查点、JSON 导入导出、历史通关去重、提示使用证据保留。
- 九个独立离线包，含序章、八章、终章及现实试炼需要的场景。资源逐项哈希核验；更新只在安全检查点显式应用。
- 七款产品两场试炼分别体验其设计和取舍。模型、岗位、工作区、入口路由、队列、扩展信任与执行边界分别生效；资料页附官方出处、源码版本、核查日期和教学简化。不设品牌战力榜。
- 复盘可分三步导出 Python 消息、工具及有限循环骨架；只使用已观察信息与当前可用工具，实际工具实现由学习者补充，默认不发模型请求。
- `server/` 独立实验后端已部署，VPS Python 3.10 的40项假 Provider测试通过；模型连接仍关闭，前端默认关闭。三类实验的真实界面使用明确的假服务验证，见 `docs/LAB_CLIENT_QA.md`；真实连接核验后再启用 `VITE_LAB_ENABLED=true`。

## 本地运行

Node.js 22.12+（本次 Node 24.15）。依赖精确锁定，无脚手架匿名日志。

```powershell
cd game
npm ci
npm run dev
```

地址 `http://127.0.0.1:4174/play/`。检查与正式构建：

```powershell
npm test
npm run validate:content
npm run build
npm run preview
```

离线功能只在正式构建启用。`build` 自动生成资源版本及 `offline-manifest.json`，首次打开不会强制下载离线包。外部官方资料与真实 AI 实验需要网络。

## 结构

```text
src/engine/          纯函数规则、教学策略、事件和导入校验
src/content/         八十四个任务、剧情、依赖图与来源可查的产品档案
src/components/      工坊、复盘、可选实验台、可访问对话框
src/Scene.tsx        React → Phaser 单向表现桥接
src/storage.ts       IndexedDB、动作回放校验、原子恢复
src/offline.ts       显式章节下载与安全更新
public/art/          优化后的原创游戏 WebP
art-source/          原始美术文件（不发布到网站）
public/sw.js         仅拦截 /play/ 的 Service Worker
scripts/             内容/参考路线校验、离线清单生成
server/              独立 FastAPI + SQLite 实验后端
tests/               内核与存档证据测试
deploy/              发布与回滚脚本
```

主线内核不调用模型，不宣称复现模型内部计算。作者任务没有伪装成随机生成；独立长期生成工厂的验证状态另见路线文档。七款产品的游戏类比不暗示模型具有人的意识或稳定动机。内容规范见 [CONTENT_AUTHORING.md](docs/CONTENT_AUTHORING.md)，第一至八章验证见 [CHAPTER_EIGHT_QA.md](docs/CHAPTER_EIGHT_QA.md)，序终章及现实试炼另见 [SEASON_V010_QA.md](docs/SEASON_V010_QA.md)。发布版本以 [DELIVERY.md](docs/DELIVERY.md) 的最后一条记录为准。

## 发布边界

只打包 `dist/` 至 `/play/`。`deploy/release.sh` 将现站复制到新 release，并在 `/archive/v1/` 保留旧版；根入口暂时保持旧网站。原子切换 `current`，不修改其他 Nginx 站点、Python 练习或真实模型配置。哈希资源跨 release 保留供尚未关闭的客户端使用。

现有 Nginx 的 `Cache-Control: no-cache` 对 Service Worker 和 manifest 同样适用。Service Worker 缓存名含构建哈希，不在游戏中自动 `skipWaiting`，也不删除旧缓存；回滚至游戏旧 release 后，客户端应在安全检查点应用已检测到的旧版 worker。回滚到最初旧站会移除在线 `/play/`，不应当作为已有游戏用户的常规回滚目标。

生产部署与验收实况见 `docs/DELIVERY.md`。图片提示词、来源、尺寸与格式转换记录见 `docs/ART.md`。真实设备触控、安装、音效以及乐趣和学习效果需要用户试玩，浏览器自动化不能替代。

第七章实际界面、断网队列恢复与审查结果见 [CHAPTER_SEVEN_QA.md](docs/CHAPTER_SEVEN_QA.md)。第八章实际试玩见 [CHAPTER_EIGHT_QA.md](docs/CHAPTER_EIGHT_QA.md)；未制作部分不计入当前任务数。
