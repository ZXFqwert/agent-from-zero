# 共享口令升级辅助 · 2026-10-10

新增两个独立、经部署者审核的辅助脚本，不进入15文件运行包，也不进入20文件测试包。它们只服务于现有 `agent.li33.art` 和 `agent-game-lab.service`，不读取根学习项目配置、不创建邀请码、不调用模型、不清除原会话或记录。生产操作由根代理执行；本文命令本身不代表已经发布。

## 脚本与信任边界

- `shared-access-proxy.py`：SHA-256 `f395944de968a2561674ebbe940044c697a9984eedad0211c7767ebd9702bdff`。
- `upgrade-shared-access.py`：SHA-256 `8911fb2ecf1b9b3f962c601317d767636c7dc3c77b5ae871af8a649266a54c2b`。
- 代理辅助只加载固定 `/opt/agent-game-lab/deploy-tools/site-proxy.py`，源码SHA必须是 `b6a73479b0eee4c5e6489a14924919263c8c7fcc8a965c6de996fafe93dc703a`，并检查固定部署路径、root所有权、不可组/他人写及无文件链接。复用其预检、原字节备份、原子替换和失败恢复；不从命令行接受任意模块路径。
- 新脚本放在root所有的 `/opt/agent-game-lab/deploy-tools/`；该目录现有0700权限可保留，脚本0600/0644均可由root通过Python运行，不需要赋予其他用户执行或读取权限。

## 后端升级

先用原 `prepare.sh` 准备15文件正式运行包及独立venv，核对包SHA和各文件manifest，不用“首次关闭模型激活”脚本更新已启用模型的服务。本次辅助只允许从明确的旧release/venv切到已准备的新release/venv，要求两端为固定目录下的root可信制品；已安装unit须与新包中的unit字节一致。独立EnvironmentFile必须root:root 0600，状态目录须由非root服务账户持有0700、SQLite及可选WAL/SHM为0600，无符号/硬链接。

升级者先审查当前release、venv链接与环境文件SHA。只输出SHA，不输出环境内容或模型密钥：

```bash
sudo -n sha256sum /etc/agent-game-lab.env
sudo -n python3 /opt/agent-game-lab/deploy-tools/upgrade-shared-access.py \
  20261010-191901 --expect-current 20261003-190302 \
  --expected-config-sha <刚审查的64位SHA> --passphrase zhouxingfu
```

`--expected-config-sha`必须是真实已审查值，尖括号占位不能直接执行。口令参数只接受1–128个简单单行字母、数字、下划线、点和连字符；目标口令为用户指定的 `zhouxingfu`，这不是模型API Key。

流程为：root私有升级锁 → 完整路径、manifest、runtime、unit、配置/状态权限预检 → localhost状态必须启用且空闲 → 保存原EnvironmentFile的精确字节 → 停止专用服务 → SQLite backup API制作包含已提交WAL的备份，并复查无活动或inflight运行 → 再核对原配置SHA → 只增改 `LAB_ACCESS_PASSPHRASE`，原模型Key与其行字节保持 → 原子切两个链接 → 启动专用服务 → 健康状态必须 `enabled:true,access_enabled:true`。不修改Nginx、unit或系统Python。

备份位于 `/opt/agent-game-lab/upgrade-backups/<新release>/`，目录root0700，`environment.original`、`lab.before.sqlite3`、`upgrade.json`均root0600；禁止发布或提交这些文件。重复目标backup目录会拒绝，避免覆盖既有恢复证据。

失败后保留当前SQLite数据库，包括升级期间新发出的会话与迁移结果；不会用旧快照覆盖用户记录。脚本恢复旧release/venv链接，但清空 `MODEL_NAME`、保留API Key及其他配置，并尝试启动旧服务。旧schema2代码虽能读取schema3新增列，却不能按共享quota归组，必须让它不能创建新模型实验。并行管理员改过的配置也会被保留，只将其 `MODEL_NAME` 清空以停用创建。取消/记录恢复与后续修复应另行审查，不能自动重开旧执行代码的共享模型访问。

## 代理增加共享登录限流

确认上一段服务升级健康后，在现有已审查站点配置上应用：

```bash
sudo -n python3 /opt/agent-game-lab/deploy-tools/shared-access-proxy.py \
  apply 20261010-191901 <刚审查的站点配置64位SHA>
```

增加独立 `agent_li33_lab_access` 5r/m zone和exact `/api/lab/access` location，burst3/nodelay、限流429、请求体8k、读/发送超时10s、no-store及nosniff。原 `/redeem` 的独立邀请限流和普通 `/api/lab/` 的10r/s规则保持原字节。仅对本站候选配置做独立Nginx预检，正式替换后再全局 `nginx -t` 和平滑reload；任何测试/reload失败均恢复原站点字节并重验/reload。站点SHA不符、已有access规则或布局不符会拒绝修改。

原字节和JSON记录保存在原有root0700 `nginx-backups/`，文件root0600。同一个release已有代理backup时不会覆盖。若以后要独立撤回这次新增location，先审核当前配置与已记录候选SHA，再运行：

```bash
sudo -n python3 /opt/agent-game-lab/deploy-tools/shared-access-proxy.py \
  rollback 20261010-191901 <这次记录的proxy_sha256>
```

代理回滚只恢复站点配置，不恢复数据库、不恢复模型配置、不切后端代码；站点在之后被修改时SHA检查会拒绝，须重新审查。

## 验证

独立 `deploy/tests/test_shared_access_deploy.py` 用临时文件、SQLite、假的systemctl/Nginx命令和健康响应验证：升级成功精确备份；busy先拒绝；活动竞态；损坏DB、健康或metadata失败仍禁用旧执行并保留新会话；并行Key修改保留；异常配置与manifest拒绝；代理新增精确范围、独立回滚、reload失败原字节恢复、错误SHA及修改过的加载器拒绝。所有测试均不调用Provider或真实服务。测试目录的父目录应包含两新脚本和固定SHA的原 `site-proxy.py`。

本机Python 3.13实际22项通过；Linux fake orchestration须模拟root lock metadata而不是依赖启动pytest的用户为root。生产真实root/路径预检、Linux测试及上线结果由部署者另行记录。后端业务66项假Provider/SQLite/MockTransport已由根代理在Linux Python 3.10复核通过。测试不能替代公开登录、错误口令、旧会话恢复、共享额度隔离和公开页面实测，也不证明玩家学习效果。
