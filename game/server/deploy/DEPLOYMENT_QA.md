# 独立实验服务部署准备记录

核查日期：2026-10-03。此记录针对 `agent.li33.art` 的独立实验后端。后端和本站 API 代理已实际部署，模型连接保持关闭；没有真实模型验收。

## 已实际核查

- 通过明确授权目标 SSH 只读检查：Python 3.10.12、venv 模块、Nginx 1.18.0、systemd 249。
- 仅读取本域名 Nginx 中的路径/监听/location 指令：`sites-enabled/agent.li33.art` 链到同名 `sites-available`，静态根为 `/var/www/agent.li33.art/current`，API location 尚未加入。没有读取其他站点或任何配置密钥。
- 部署前 `/etc/agent-game-lab.env`、`/opt/agent-game-lab`、专用服务账户均未存在；实验 unit inactive，127.0.0.1:8788 未监听。
- 本机既有独立 Python 3.13 venv 的后端 40 测试通过，仅用假 Provider / HTTPX MockTransport。源代码和每项锁定依赖元数据支持 Python 3.10.12。
- 白名单打包器已实际生成正式 15 文件包和临时测试 19 文件包。正式包无 `.env`、SQLite、缓存、测试、用户文件或私有内容。每项记录字节数和 SHA-256；包类型与版本由验证器核对。
- 验证器正常正式包通过；测试包作为正式包、路径穿越、绝对路径、符号链接、未知私有文件、覆盖已有目录均被拒绝，拒绝前目标未创建。压缩与解压大小、成员数另有固定上限。

## 已完成的 VPS 隔离测试

在随机 `/tmp/agent-lab-check-20261003-*` 中上传白名单测试包及验证脚本，创建该目录自己的 venv，从公共 PyPI 安装现有固定开发/运行依赖。没有更改系统 Python/pip、正式代码路径、状态目录、服务账户、unit 或 Nginx。

这项测试使用空模型环境及假 Provider；在 VPS Python **3.10.12 实际运行 40 项测试全部通过**，`pip check` 无依赖冲突，关闭模型状态导入检查通过，两项 Bash 脚本语法检查通过。测试没有真实 Provider 请求。仅出现与本机一致的固定 TestClient 弃用提示，没有测试失败。

实际目录为 `/tmp/agent-lab-check-20261003-2zqqqW`。Linux 3.10 安装发现此前在 3.13 不需要的条件依赖 `exceptiongroup 1.3.1`（运行）和 `tomli 2.4.1`（pytest）；已经按实际安装版本添加 `<3.11` 标记的固定版本，未改系统包。最终包已重新验证全部活跃依赖精确版本、40 项测试和脚本语法。临时目录不公开发布，不自动兑换真实邀请码或发起模型请求。

第一轮制品版本为 `20261003-185308`：

- 正式包 `game/output/backend/agent-game-lab-20261003-185308.tar.gz`，SHA-256 `d25d0e58eea0064de564e3eb755831bc0cfdbc7ee50a972f251d643ba49834df`，15 项白名单文件与 manifest。
- 临时测试包 `game/output/backend/agent-game-lab-test-20261003-185308.tar.gz`，SHA-256 `b5a223333cfca7a3b7a58363b90d759c81421f88a22a8ae7c59671c8378cebeb`，19 项白名单文件与 manifest；仅用于隔离测试，不能作为正式包准备。
- 两项整包 SHA 已在 VPS 与本机核对相同；正式制品尚未包含任何模型配置、数据库或邀请码。

## 已实际部署和验证

根代理审核脚本后，明确授权正式 `prepare`、模型关闭的初次启动、本站 API 代理和通过检查后的开机启用。

- 第一次启动发现 systemd 的 `StateDirectory` 默认模式把目录改成 755；SQLite 文件仍为 600。已在 unit 中明确增加 `StateDirectoryMode=0700`，重新生成并部署最终版本 **`20261003-190302`**，没有让包与线上 unit 不一致。
- 最终正式包 `game/output/backend/agent-game-lab-20261003-190302.tar.gz`，15 文件，SHA-256 **`698014e4c8b2ac15464b7c3bb69eb1dd8a3f8a8aca3233e13cded018e963f6a9`**。最终测试包 SHA-256 `ef2bb9755d97585e5732f5353671a136cf311b4ebb4d29ef6c9888296befa065`，19 文件；在实际 VPS Python 3.10.12 再跑 **40/40 通过**。
- 最终 `prepare` 在独立 `venvs/20261003-190302` 安装固定运行依赖，`pip check` 和 disabled import 通过。代码为 `/opt/agent-game-lab/releases/20261003-190302`，稳定 `current` 与 `venv` 两链接均指向该版本。
- `agent-game-lab.service` 实际 `active/running/enabled`，专用同名非 root 用户/组，**仅监听 127.0.0.1:8788**。`/var/lib/agent-game-lab` 为 700、数据库为 600、独立空配置文件 `/etc/agent-game-lab.env` 为 root:root 600。
- 运行 unit 实际属性为 `NoNewPrivileges=yes`、`PrivateTmp=yes`、`PrivateDevices=yes`、`ProtectSystem=strict`、`ProtectHome=yes`、kernel/control-group 保护开启、`RestrictSUIDSGID=yes`、仅允许 AF_UNIX/AF_INET/AF_INET6，写目录限定 `/var/lib/agent-game-lab`。这是运行配置核查，没有声称完成操作系统渗透测试。
- 本机 HTTP 与公网 HTTPS `/api/lab/status` 均 200、`enabled=false`、`busy=false`，三种实验全部关闭。实际上限为 UTC 每日 10、全站并发 1、8 请求、120 秒、512 输出 token；响应 `no-store` 与 `nosniff` 通过。
- HTTP/HTTPS 无身份创建请求 401 `authentication_required`、非已发行邀请码兑换 401 `invalid_invite`、错误请求结构 422 `invalid_request`。没有为测试生成身份，因此**带合法身份的 disabled-create 503 只由假 Provider 测试覆盖，未作生产 HTTP 断言**。
- 正式数据库 schema 为 2；这些检查后 `invites`、`runs`、`operations` 行数均为 0，没有创建运行或额度记录。
- 旧首页 `/` 和游戏 `/play/` 实际 HTTPS 均 200，静态站的 `current` 链接由根代理处理，本后端部署没有修改它。

## 本站代理与回退

`site-proxy.py` 是源代码中的独立部署工具，不在 15 文件运行包内。线上审核副本为 `/opt/agent-game-lab/deploy-tools/site-proxy.py`，SHA-256 `b6a73479b0eee4c5e6489a14924919263c8c7fcc8a965c6de996fafe93dc703a`。

工具仅处理固定 `/etc/nginx/sites-available/agent.li33.art`，核对 `sites-enabled` 精确链接、所有者和已审核 SHA。先用只含本站候选的临时 http wrapper 做 `nginx -t`，再保存原文件精确字节、原子替换、全配置 `nginx -t` 和 reload；失败路径恢复原字节并重新验证/reload。没有写其他站点或 conf.d，原 ACME、TLS 和静态路由保持原文。

- 原配置 SHA-256：`754de0912823bace0b9efa84bc468c524e8ae59b7d12126e19615d4834f1be56`。
- 原文件备份：`/opt/agent-game-lab/nginx-backups/20261003-190302.original.conf`，root:root 600，实际 SHA 与原配置相同；同目录 JSON 保存原/新 SHA。
- 已发布代理配置 SHA-256：`2e41388f12cd6af1136ada3d87ce72c05f45a37198439a4f56b69e382c7f4916`。
- 专用 zones 为 `agent_li33_lab_api`（10r/s）和 `agent_li33_lab_invites`（5r/m）；两 API location 均 8k 请求上限、429 限流、no-store，普通 API 130s 读取超时，兑换 10s。

撤回 API 代理的独立命令（当前配置 SHA 若改变会拒绝，须先审查后续修改）：

```bash
sudo -n python3 /opt/agent-game-lab/deploy-tools/site-proxy.py rollback 20261003-190302 2e41388f12cd6af1136ada3d87ce72c05f45a37198439a4f56b69e382c7f4916
```

随后停止并撤销后端开机启动，但保留所有代码和数据：

```bash
sudo -n systemctl disable --now agent-game-lab.service
```

以上回退命令已经准备并审核其边界，**没有为演示执行线上回退**。不删除状态目录；今后已有运行时，代码切换前需备份数据库，不能让旧单伙伴版本执行已存在的对照运行。

## 仍待完成

- 模型配置来源待用户确认，只使用独立 `/etc/agent-game-lab.env`；不读取根学习项目 `.env`。B 模型可选且需不同名称，未配置时禁用该对照。
- 有合法身份后的生产端点、真实 Provider 工具调用、真实取消/网络恢复与学习效果尚待验收。后台空配置部署不等于真实 AI 实验已经可用。
- 主游戏完整八十四任务、真人手机体验及静态站发布由根代理独立记录，不由本文件代为断言。

本轮未安装系统 Python/pip 包、读取模型密钥、生成邀请码、调用真实 Provider 或改动其他站点。所有依赖安装只在专用 venv 内。
