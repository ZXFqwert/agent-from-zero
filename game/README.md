# 回声工坊：失序之城

手机竖屏 Agent 学习冒险。独立于根目录 Python 教学项目，旧网站源码仍在 `../website/`。

## 当前交付范围

这是方案的**第一阶段核心玩法验证**，包含三个作者设计任务：熄灭的灯塔、门后的药箱（陌生情境迁移）、空言执政官（双目标验收首领）。当前不是完整第一章或 84 任务第一季；12–20 小时、24 委托模板、远征、多伙伴和七组产品试炼尚未实现。

- React 负责中文剧情、工坊、可访问操作和记录；Phaser 负责原创场景、伙伴、灯光、开门与首领反馈。
- 纯 TypeScript 内核模拟工具请求、实际执行、上下文回执、访问权限、预算与验收。只有世界事实与独立证据相符才会获胜。
- 自动与逐步指挥；三层事件复盘，按真实动作回放。
- IndexedDB 每次动作提交后更新 UI；三个恢复检查点、JSON 导入导出、历史通关去重、提示使用证据保留。
- 一个完整离线章节包，明确下载后可离线。资源逐项哈希核验；更新只在安全检查点显式应用。
- 七款产品资料页附官方出处与核查日期；专属机制试炼仍在后续阶段。
- `server/` 实现可选真实 AI 实验后端与测试；本阶段未部署，前端默认关闭。后续部署并核验后用 `VITE_LAB_ENABLED=true` 构建启用。

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
npm run build
npm run preview
```

离线功能只在正式构建启用。`build` 自动生成资源版本及 `offline-manifest.json`，首次打开不会强制下载离线包。外部官方资料与真实 AI 实验需要网络。

## 结构

```text
src/engine/          纯函数规则、教学策略、事件和导入校验
src/content/         三个关卡与来源可查的产品档案
src/components/      工坊、复盘、可选实验台、可访问对话框
src/Scene.tsx        React → Phaser 单向表现桥接
src/storage.ts       IndexedDB、动作回放校验、原子恢复
src/offline.ts       显式章节下载与安全更新
public/art/          优化后的原创游戏 WebP
art-source/          原始美术文件（不发布到网站）
public/sw.js         仅拦截 /play/ 的 Service Worker
scripts/             离线清单生成
server/              独立 FastAPI + SQLite 实验后端
tests/               内核与存档证据测试
deploy/              发布与回滚脚本
```

内核不调用模型，不宣称复现模型内部计算。种子目前只记录以支持未来变体；当前三关没有伪装成“随机生成”。七款产品的游戏类比不暗示模型具有人的意识或稳定动机。

## 发布边界

只打包 `dist/` 至 `/play/`。`deploy/release.sh` 将现站复制到新 release，并在 `/archive/v1/` 保留旧版；根入口暂时保持旧网站。原子切换 `current`，不修改其他 Nginx 站点、Python 练习或真实模型配置。哈希资源跨 release 保留供尚未关闭的客户端使用。

现有 Nginx 的 `Cache-Control: no-cache` 对 Service Worker 和 manifest 同样适用。Service Worker 缓存名含构建哈希，不在游戏中自动 `skipWaiting`，也不删除旧缓存；回滚至游戏旧 release 后，客户端应在安全检查点应用已检测到的旧版 worker。回滚到最初旧站会移除在线 `/play/`，不应当作为已有游戏用户的常规回滚目标。

生产部署与验收实况见 `docs/DELIVERY.md`。图片提示词、来源、尺寸与格式转换记录见 `docs/ART.md`。真实设备触控、安装、音效以及乐趣和学习效果需要用户试玩，浏览器自动化不能替代。
