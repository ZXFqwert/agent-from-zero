# 静态游戏回滚与存档兼容边界

`rollback.sh` 仅接受一个发布 ID，只能替换 `/var/www/agent.li33.art/current`。实际切换由 `rollback_release.py` 完成；`verify_release.py` 可单独只读检查发布目录。三份文件须一起上传到可信的部署工具目录。没有 `--force`、自定义生产根目录或删存档选项。

## 先拒绝不能证明可读的版本

0.11 存档包含长期委托与远征，0.10 不能读取这些记录。因此不能把服务器退回 0.10，再将新存档删掉、裁剪成旧格式或宣称已回滚成功。旧发布缺少兼容元数据也拒绝回滚。

每次构建生成 `/play/release-compat.json`，并将它纳入离线资源哈希和每个章节包。合同如下（digest 为示意，必须由实际构建生成）：

```json
{
  "schema": 1,
  "domain": "agent.li33.art",
  "contentVersion": "season-0.11.0",
  "saveVersion": 1,
  "kernelVersion": 1,
  "playerVersion": 1,
  "saveFeatures": ["post-season-v1"],
  "readableContentVersions": ["season-0.10.0", "season-0.11.0"],
  "readableSaveFeatures": ["post-season-v1"],
  "maxSaveBytes": 16000000,
  "simulatorDigest": "由实际模拟器和存档源码生成的64位小写SHA256"
}
```

构建脚本从 `src/storage.ts` 读取当前内容版本、全部已接受旧版本和字节上限。模拟摘要覆盖 `src/engine/**/*.ts`、`src/content/**/*.ts`、`src/challenges/**/*.ts`、`src/postSeason.ts` 和 `src/storage.ts`。按相对于 `game/` 的 POSIX 路径排序，每个文件贡献 `路径 + NUL + SHA256(原始文件字节) + 换行`，再对串接文本取 SHA256。原始源码中的事件文本变化也会改变摘要。

回滚目标须满足：三种存档信封版本相同、能读取当前版本及其所有功能、字节上限不降低、模拟摘要完全相同。这个保守策略支持同一模拟器的界面/CSS修正版本之间回滚；模拟器或内容改变时，须先另行审计迁移方案，现脚本不会接受手填白名单。

首次从没有元数据的 0.10 升级到 0.11，正向发布验证已审计旧发布及新目标完整性，旧发布例外限定为当前已发布的 `20261003-192945`，新目标须为读取 `season-0.10.0` 的 `season-0.11.0` 且包含长期挑战功能。其他缺失元数据的目录拒绝直接升级。这不授权此后降级回原 0.10。不要为旧文件补写伪造元数据。生产与离线存档均保留原样。

## 实际检查和切换

只读检查可指定隔离目录，不需要 root，也不请求网络：

```bash
python3 verify_release.py /var/www/agent.li33.art 20261003-200001
python3 verify_release.py /var/www/agent.li33.art 20261003-200001 --preflight
```

第一条只验证目标，第二条同时验证 current 与回滚可读性。实际回滚必须由 root 执行，域名和根目录固定：

```bash
sudo -n bash /opt/agent-game-static-deploy/rollback.sh 20261003-200001
```

执行前会检查 current 是绝对规范链接，current/target 都是该根的 `releases/` 下直接真实目录；目录内不允许符号链接、特殊文件或路径逃逸。页面引用、安装清单图标、离线清单所有资源的长度与 SHA256、章节共同资源、SW 内嵌清单与磁盘清单都须一致。根页面与旧站归档也检查实际 HTML 引用。

脚本取得 `.release.lock` 排他锁后运行 `nginx -t`。随机命名的临时链接只指向已验证绝对目标，`os.replace` 原子替换 current；替换前再次检查 current 未被其他操作改变。目标目录在切换后重新校验，随后再次运行 `nginx -t`，通过本地 HTTPS（`--resolve agent.li33.art:443:127.0.0.1`、正常证书校验、禁止跳转）逐项下载所有被验证的页面、资源、SW 和离线清单，对响应状态和实际字节核对。只有全部通过才输出 `ROLLBACK_VERIFIED`。

切换后的任何失败都会恢复**切换前的准确绝对链接**并重新核对上一版磁盘和 HTTPS。即使原子替换之后目录 fsync 失败，也走恢复流程。如果 current 已被其他部署改为第三版，脚本拒绝覆盖不属于自己这次操作的链接。如果上一版健康检查也失败，脚本退出非零并明确报告恢复到的链接与检查失败；不会假称站点已健康。临时链接只清理本操作创建且仍指向预期目标的一份。

仓库里的正向发布与回滚已使用同一 `.release.lock`，均通过禁止跟随链接的文件打开方式取得排他非阻塞锁，检查锁是 root 所有的独立普通文件。部署时必须把新版 `release.sh`、`rollback.sh` 与两份 Python helper 一起安装到可信目录；运行旧版未遵循锁的 helper 或手工改 current 不受此互斥协议保护。已发布目录须保持 root 所有、普通用户不可写。

生产四文件安装在 root 所有、755 的 `/opt/agent-game-static-deploy/`。正向命令保持两个参数及固定域名根目录：`sudo -n bash /opt/agent-game-static-deploy/release.sh 发布时间戳 /tmp/echo-game-同一时间戳.tar.gz`。准备阶段拒绝已存在的发布目录；压缩包只允许有限数量/大小的相对普通文件与目录，禁止路径逃逸、重复规范路径、链接与特殊文件，且新包必须自身包含 HTML、SW、离线清单、安装清单及兼容元数据，不能借继承的旧文件凑完整。复制旧发布保留根页面、归档和旧哈希资源，再受限写入 `/play/`；压缩包准备前后 SHA256须一致，新目标逐项完整核对通过后才运行 Nginx检查和原子切换。已有元数据的发布之间采用同样的存档/摘要兼容门槛。切换后任何失败也精确恢复旧链接并验证实际资源。准备失败的未激活目录留作检查，不递归删除其他目录或自动覆盖重试。

## Service Worker 和已经打开的客户端

v0.13 的陌生签收站使用独立 `echo-courier-workshop` IndexedDB，模块规则 `courier-v1`、备份信封1。其完整动作重放与提示曝光不进入旧主线存档。主线模拟摘要相同只证明上述主线兼容合同，不证明旧版本能运行签收站；回到 v0.12 时这份数据库保留，但没有入口和读取器。再次升级到支持 `courier-v1` 的版本后才可继续。不得删库、修改旧版本元数据或用主线兼容白名单冒充模块迁移。以后改变这份已发布模块的规则或事件，须增加模块版本并实现、验证迁移；规则版本不随界面版本变化。

签收站的“返回起航检查点”明确创建新的虚拟练习尝试，重置该尝试的模拟货物，保留本设备提示曝光与此前合法行动证明。它不回滚真实外部副作用。宿主重启则发生在同一尝试内，清空会话和内存，保留现场交付与已落盘账本；两种操作不能混称。

服务器检查覆盖目标 HTML、所有离线资产、安装清单和 SW 实际字节。它不会替手机强制激活 worker，也不删除任何旧离线缓存。游戏仍在安全检查点处理更新；已经安装的客户端可能暂时使用旧 worker，需另做浏览器在线/离线和安全更新验证。

回退预检要求目标保留 current 的 `/play/assets/` 下全部带构建哈希的脚本、样式等文件，且字节与 SHA256 相同；缺失或改变时拒绝切换。准备兼容候选目录时可以把这些不变的哈希文件追加进去，不修改目标自己的清单。这些额外资源也纳入切换前后及 HTTPS 字节校验，但不会因此变成目标离线包的一部分。固定名字的美术资源允许随目标版本变化；`index.html`、`sw.js`、`offline-manifest.json`、`manifest.webmanifest`、兼容元数据须属于目标自己的完整版本，不能混装。服务器 HTTPS检查通过不等于 iOS/Android 真机回滚体验已通过。

## 隔离测试

```bash
python3 -m unittest discover -s game/deploy/tests -p test_rollback.py -v
python3 -m unittest discover -s game/deploy/tests -p test_forward_release.py -v
bash -n game/deploy/rollback.sh
bash -n game/deploy/release.sh
```

测试仅使用临时目录与模拟命令回执，不调用生产 CLI，不访问 `/var/www`，不运行真实 Nginx/curl 请求。Windows 缺少原生链接权限时，事务测试明确跳过；必须在 Linux 临时目录运行通过这些事务测试后，才把原子切换、失败恢复、fsync 和并发边界列为已验证。脚本使用 Python 3.10+ 标准库。

2026-10-03 隔离检查：本机 Python 3.13 的回滚 28 项中 13 通过、15 因原生链接权限明确跳过；正向 17 项中 5 通过、12 跳过。Bash 与 Python 3.10 语法检查通过。VPS Python 3.10 在临时 `/tmp` 独立目录实际运行 **回滚 28/28、正向 17/17，零跳过**，包含真实文件系统原子链接、失败恢复、压缩包边界及共享锁；Nginx/HTTPS仍为测试回执。输出保存于忽略目录 `game/output/v011-rollback-linux-tests.txt` 与 `v011-forward-linux-tests.txt`。

之后另做了真实生产回滚演练：`20261003-213049` → `20261003-212335-compatible-2` → `20261003-213049`，两个版本模拟摘要相同，兼容候选保留已发布哈希文件。两次都真实运行 Nginx和 HTTPS 86资源检查，输出 `ROLLBACK_VERIFIED`；浏览器通过安全检查点显式激活对应 Worker。实际存档导出后，与切换前唯一变化为刻写时间，世界、动作、权限、84作者/48挑战/远征剩余6等完整相同；实验只读记录也未丢失或重发模型请求。具体见 [长期系统验收](../docs/POST_SEASON_V011_QA.md)。这是桌面 Chrome 实际发布检查，iOS/Android 真机仍独立待验。
