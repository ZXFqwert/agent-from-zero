# Agent 实验局

中文互动 Agent 学习网站，公开站点使用 `agent.li33.art`。与根目录的 Python 学习练习独立；没有接入该项目的模型配置或真实会话。

## 体验

- 八个完整关卡：模型与行动、工具协议、反馈循环、上下文、Harness、记忆、授权、验收。
- 三个规则驱动的实验：反馈循环、上下文选材、协作成本。明确标记为教学模拟。
- Codex、Claude Code、OpenClaw、Hermes Agent、OpenCode、Pi、DeepSeek Harness 的官方来源分析与双列比较。
- 六组社会类比与明确的类比边界。
- 理解测试、针对选项的反馈、本地笔记、完成记录、去重 XP、循环排序挑战。
- 可下载的标准库 Python 示例，运行真实文件读取，但模型为确定规则替身；不访问模型接口。

## 本地运行

Node.js 18+，没有 npm 运行依赖：

```powershell
node server.mjs
```

打开 `http://127.0.0.1:4173/`。可通过 `PORT` 环境变量改端口。所有浏览器文件均在 `dist/`，无需打包构建，也没有外部字体/CDN依赖。课程、图鉴、实验使用 hash 路由，静态服务器即可托管。

内容在 `dist/content.js`；交互在 `dist/app.js`；样式在 `dist/styles.css`。进度使用当前浏览器的 `localStorage`，不跨设备同步、不上传服务器。WebMCP 仅在浏览器支持时提供课程导航，普通浏览器不受影响。

## 核查与测试

- 资料核查日期：2026-09-12；产品详情页链接到对应官方资料。
- JavaScript 语法通过；Python 示例的完成与预算耗尽路径已运行。
- Playwright 检查 24 条路由，在 1440 与 390 像素宽度无水平溢出。
- 检查答题正误反馈、积分去重、笔记刷新恢复、工具禁止/反馈断开/预算耗尽/成功四条分支、单步执行、上下文材料与超预算、协作开关、产品比较、排序挑战、下载、移动菜单、重置确认与不存在页面。
- 浏览器运行错误为 0。自动化截图与临时检查脚本位于被忽略的 `output/playwright/`。
- WebMCP 的原生支持环境未提供，因此未把该可选能力列为已验证功能。

## VPS 部署

使用 VPS 原有 Nginx。HTTP/HTTPS 模板在 `deploy/`，正式网站目录为 `/var/www/agent.li33.art/current`，指向独立 release 目录。只发布以下文件：

```text
index.html
styles.css
app.js
content.js
agent_lab.py
```

不要发布根项目、`.env`、Git 元数据、测试日志和运行时生成的样例目录。先上传新 release，再检查 Nginx 配置并平滑重载。证书由已有 Certbot 管理，HTTP challenge 使用独立的 `/var/www/agent.li33.art/acme`，续期服务沿用 VPS 现有 timer。

本项目没有注册或使用 Sites 远程托管，按用户选择部署到自有 VPS。
