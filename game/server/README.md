# 可选真实 AI 实验区后端

这是游戏主线之外的独立实验服务。FastAPI + SQLite，模型只在虚构的 `source → relay → beacon` 世界中提出工具调用。主线不依赖它，模型失败不会改变游戏存档或学习证据。

**代码从不读取任何 `.env` 文件。** 仅读取本服务进程环境。不要将根目录 Python 学习项目的 `.env` 或会话用于此服务，也不要将服务端密钥打包到前端。未配置完整的 `MODEL_BASE_URL`、`MODEL_NAME`、`MODEL_API_KEY` 时，服务仍可启动；状态返回 `enabled:false`，创建实验返回 503，不扣额度。

2026-10-03：独立 VPS 服务已部署，主模型 `deepseek-flash` 的 Chat Completions 连接已启用。首轮服务端 QA 四场计入22轮模型请求，另一次公开网页两组反馈对照8轮，合计五场30轮，包括一轮运行中取消。单伙伴取得真实工具验收；公开网页两组各四轮用尽预算且未验收，仍记incomplete，未将其写成通关或品牌排名。第二模型尚未配置，其对照仍不可用。公开构建已启用实验界面，本地默认开关关闭。详情见 [真实模型验收记录](deploy/REAL_MODEL_QA.md)；没有把邀请码、令牌、密钥或原始模型记录放入仓库。

2026-10-10：按用户要求增加共享口令入口。独立服务环境设置 `LAB_ACCESS_PASSPHRASE=zhouxingfu` 后，浏览器可以直接登录，不需要预先发放或消耗邀请码。每次登录有独立实验记录所有者，所有口令登录合用每天10场真实模型实验的额度；重新登录、换浏览器、改口令或重启服务均不会重置当天共享额度。课程和模拟游戏不计入该模型额度。此门只是低摩擦共享访问，不是个人账户系统，也不证明登录者身份。旧邀请码端点与已有令牌继续兼容。

## 本地运行和测试

Python 3.10+。在本目录运行（Windows PowerShell）：

```powershell
python -m venv .venv
& '.venv/Scripts/python.exe' -m pip install -r requirements-dev.txt
& '.venv/Scripts/python.exe' -m pytest -q --basetemp '.pytest-tmp'
& '.venv/Scripts/python.exe' -m uvicorn agent_lab.app:app --host 127.0.0.1 --port 8788 --no-access-log
```

测试只使用临时 SQLite、假 Provider 或 HTTPX MockTransport，不读取真实配置，不消耗模型额度。测试环境只安装在本目录 `.venv/`。`--basetemp` 专用于测试临时文件，pytest 会清理该目录，不要指定已有重要目录。

独立本机 Python 3.13 与 VPS Linux Python 3.10.12 均实际运行 40 项测试通过，全部只用假 Provider 或 HTTPX MockTransport；VPS 验证在单独临时测试 venv 中完成，固定生产依赖也只装在独立服务 venv。没有使用 TaskGroup、StrEnum、asyncio.timeout 等 3.11 API，没有改系统或根目录教学环境。真实模型验收另行记录，不能用假 Provider 测试代替。

2026-10-10共享访问版本在独立本机Python 3.13运行 **66项假Provider/SQLite/MockTransport检查通过**，包括两个浏览器记录隔离、共享额度最后名额的事务竞态、十次之后重登录仍拒绝、UTC恢复、口令更改/清空、过期令牌及旧数据库幂等迁移。此次代码未调用真实模型；生产Python 3.10及公开端点检查由部署步骤另行验证。

## API 契约

所有路径以 `/api/lab` 开头，JSON 请求/响应。授权头为 `Authorization: Bearer <access_token>`。服务不使用 Cookie，不开放跨域；浏览器通过站点同源的 Nginx 代理访问。前端必须将模型文本视为普通文本，不能插入未转义 HTML。所有响应禁止缓存，PWA 也必须将 `/api/` 排除出离线缓存。

| 方法与路径 | 请求 | 返回 |
| --- | --- | --- |
| `GET /status` | 可选 Bearer | `enabled, access_enabled, scenario_ids, experiments, limits, busy`；有授权时另有 `remaining_runs, active_run, quota_scope` |
| `POST /access` | `{passphrase}` | `{access_token, token_type:"bearer", expires_at}`，共享口令登录 |
| `POST /redeem` | `{invite_code}` | `{access_token, token_type:"bearer", expires_at}` |
| `POST /runs` | `{request_id, scenario_id?:"signal-rescue", experiment_type?:固定实验ID}` | RunView；省略实验ID沿用原单伙伴实验 |
| `GET /runs/{id}` | Bearer | 最新 RunView，适合请求中断或刷新后恢复 |
| `POST /runs/{id}/step` | `{request_id}` + Bearer | 执行最多一次模型请求后返回 RunView |
| `POST /runs/{id}/cancel` | `{request_id}` + Bearer | 取消后的 RunView |

`request_id` 为客户端生成的 UUID，允许 8–64 个英文字母、数字、下划线和连字符。一次用户动作创建一次 ID；网络重试必须复用同一个 ID。创建实验同 ID 返回已有实验的当前状态，不重复扣额；同 ID 改实验类型返回 409。步骤/取消同 ID 返回首次保存的结果；仍执行中的重复步骤返回 409 `step_in_progress`，可稍后 `GET` 查询或同 ID 重试。一个 ID 不能同时用于步骤和取消，否则返回 `idempotency_conflict`。令牌之间不能读写彼此的实验。

`POST /access` 的口令必须是1–128字符的字符串，严格禁止额外字段，不转换数字、布尔或空值。匹配大小写和前后空格；客户端可以在提交前去掉输入时无意添加的空格。服务器以固定长度SHA-256摘要做常量时间比较，不将输入口令或它的摘要存进SQLite。成功返回的Bearer有效期仍为 `LAB_TOKEN_DAYS`，默认30天，只保存其SHA-256摘要。错误口令为403 `invalid_access`；未配置共享口令或模型缺项为503 `access_unavailable`；错误结构、类型、空串或超过128字符为422 `invalid_request`。失败不创建会话、不扣额度，也不调用模型。

`GET /status` 始终带 `access_enabled:boolean`，只有口令和模型配置均完整时为true。有Bearer时另带 `quota_scope:"shared"|"session"`：共享口令令牌为shared，旧邀请码令牌为session；无Bearer时省略该字段。`remaining_runs` 按对应额度组计算，`active_run` 只返回该浏览器会话自身的活动实验，`busy` 仍表示全站一个实验占位。共享额度不是共享记录，其他浏览器不能读取、推进或取消本会话的运行。重复登录会发一个新会话令牌，旧有效令牌不因此撤销；同一浏览器应保留既有令牌以恢复旧运行，而不是每次刷新都登录。口令更改或清空只影响新登录，已签发令牌仍依照原到期时间有效。

```json
{
  "id": "UUID",
  "scenario_id": "signal-rescue",
  "status": "active",
  "steps_used": 0,
  "max_steps": 8,
  "expires_at": "2026-10-02T00:02:00Z",
  "step_in_progress": false,
  "world": {
    "scenario_id": "signal-rescue",
    "observed": [],
    "connections": [],
    "active": ["source"],
    "verified": false
  },
  "events": [],
  "final_text": ""
}
```

`status`：`active`、`completed`、`incomplete`、`budget_exhausted`、`timed_out`、`cancelled`、`failed`。只有工具验收通过才是 `completed`；模型口头宣称成功会得到 `incomplete`。

事件按顺序累计：

- `{kind:"assistant",text}`：模型可见输出，不是内部思维。
- `{kind:"tool",call_id,tool,arguments,result}`：`arguments` 是有长度限制的 JSON **字符串**；result 为 `{ok,...}` 或 `{ok:false,error}`。
- `{kind:"stop",code}`：`run_timeout`、`step_budget_exhausted`、`verification_missing`、`user_cancelled`、`provider_error` 或 `request_interrupted`。

## 三类对照实验

这些对照使用同一虚拟信号任务、相同初始世界与验收标准，两个 `arm` 各有独立世界。它们是一轮可观察的实验，不是受控统计结论、品牌排名或真实产品内部机制复现。

| 固定实验ID | 实际改变的机制 | 两组 |
| --- | --- | --- |
| `same-model-blueprints` | 同服务器模型，实际工具结果完整进入上下文或被构筑隐藏；被隐藏时仍提供配对工具协议回复，明确标为 `feedback_hidden` | 反馈完整 / 反馈隐藏 |
| `same-blueprint-models` | 相同工具、权限、提示、反馈与预算；由服务器固定的两个模型名分别发送 Chat Completions 请求 | 模型 A / 模型 B |
| `solo-team` | 单私有会话与调查/施工/验收三个私有岗位；岗位工具权限和实际收到的交接分别校验 | 单伙伴 / 三岗位协作 |

第二模型仅由本服务环境 `LAB_ALTERNATE_MODEL_NAME` 配置，沿用同一个兼容 Base URL 和服务端密钥。未设置、与主模型相同或预算不足时目录注明不可用，创建返回 503 `experiment_unavailable`，不占位、不扣日额。客户端和模型不能传模型名、提供方地址、密钥、任意 prompt 或构筑数组。现版没有多提供方、多密钥或动态模型发现。

每次对照占一次对应额度组的日额和一个全局席位。**两个组共同最多 8 请求、120 秒，默认每组最多 4 请求**，顺序运行，下一组不重置期限。配置较低预算时每组为 `floor(LAB_MAX_STEPS/2)`，至少每组一轮才开放对照；不用奇数剩余请求给某组加时。每个模型回复仍最多四个工具、512 输出 token 默认上限。总轮数在发请求前提交，工具、协作交接、刷新查询不伪装成免费额外模型请求。

协作组按调查、施工、验收的有限逻辑次序请求模型，不并发生成。调查只能 `observe`，施工只能 `connect/activate`，验收只能 `verify`。每个岗位保存独立消息；宿主只把实际成功工具结果显式交接，并记录 `handoff`。施工不能借世界中“别的伙伴观察过”的总表，必须实际收到对应节点的调查结果。显示姓名、模型文字与共享结果不授予其他工具权限。没有随机“协作加成”或默认必胜。

`status.experiments` 的每项包含 `id,label,enabled,reason,arms:[组A标题,组B标题],arm_budget`。`reason` 为 `null` 或 `alternate_model_unconfigured`、`alternate_model_matches_primary`、`comparison_budget_too_small`、`lab_unavailable`。

RunView 的原字段保持兼容；对照另有：

```text
experiment: {
  version: 1, type: 固定实验ID, current_arm: 0|1, arm_budget: 4,
  arms: [{
    id: left|right, label, model_id: primary|secondary,
    blueprint_id: feedback-open|feedback-hidden|solo|team,
    status, steps_used, world, events,
    actors: [{id,label,tools,known_targets}], current_actor?: 岗位ID,
    tool_calls, denied_calls, handoffs
  }]
}
```

组状态另允许 `pending`；组的 `completed` 必须真实 `verify` 成立。总体 `completed` 及顶层 `world.verified:true` 需要两组都成立，否则仍有任务时为 `active`、两组结束后为 `incomplete`。不能把第一组成功当成第二组已成功。模型错误可结束当前组并让另一组继续；取消、总期限和总预算停止所有未执行部分。两份世界的已执行事实与费用保留。

对照事件附 `arm_id,actor_id`；`handoff` 还附 `from_actor,to_actor,results:[{call_id,tool,result}]`。交接数据来自真实回执，不含未经观察的世界快照。公共响应不含每人的私有 `messages`、实际模型名、Base URL 或密钥。`denied_calls` 统计实际 `result.ok:false`；验收工具返回 `ok:true,verified:false` 是未通过验收，不能计作胜利。

## 离线、取消与恢复

主线离线存档不调用该服务。实验请求和 Bearer 不能放入 Service Worker 缓存；断网时禁止创建新实验和请求下一轮，保留原请求编号和最后已确认记录。离线点击停止只能记为“停止尚未确认”，不能假称服务器已经取消。网络恢复先 `GET` 同一运行查询；若仍需停止，沿用该取消 ID 提交。不要因超时回执不明而创建新实验或换 ID 重发工具。

关闭页面不暂停服务器期限，刷新和后台切换不自动请求模型。即使未能联网取消，原始总期限仍会释放占位。重播只读取保存事件，不重新请求模型，也不承诺生成文本再次相同。后端保存实验记录但不改变主线奖励、概念掌握或游戏状态。

错误形状统一为 `{"error":{"code":"..."}}`。401 为旧邀请码/令牌无效，403为共享口令不匹配，404 不暴露其他会话实验，409 为并发/状态/幂等冲突，413 为请求太大，422 为参数不符，429 为当天额度耗尽，503 为未配置或存储暂不可用。代理自身的 429/502/504 可能不是 JSON，前端应显示可恢复提示并保留 request_id。

## 模型和工具边界

协议固定为 Chat Completions：对 `MODEL_BASE_URL` 追加 `/chat/completions`，发送 `model/messages/tools/tool_choice/max_tokens/stream:false`。使用 HTTPX 异步请求，不跟随重定向、不自动重试、不使用环境代理。Base URL 由服务器管理员固定，不能由请求或模型覆盖。无需客户端提供密钥。

可调用工具严格限制为：

| 工具 | 参数与限制 |
| --- | --- |
| `observe` | `target` 为 source / relay / beacon；记录观察到的节点 |
| `connect` | `source,target`；只允许 source→relay、relay→beacon；必须先观察两端 |
| `activate` | `target` 为 relay / beacon；必须观察目标，上游已连接并激活 |
| `verify` | `target` 只能为 beacon；独立检查完整链路和激活状态 |

未知工具、额外字段、类型错误、任意文件路径或其他目标均被拒绝，世界状态不变。工具只有内存中的固定数据操作，没有宿主机文件、网络、执行命令或动态代码入口。模型每次最多请求 4 个工具；工具错误作为结果回传下一轮。成功条件由程序判定。

默认所有共享口令会话合用每天 **10 次真实模型实验（UTC 日期）**；兼容的旧邀请码会话仍有各自日额。全局并发 **1 个实验**、每次最多 **8 个模型请求**、从创建起 **120 秒**、模型每次最多 **512 输出 token**。创建后取消、失败、超时仍计一次；忙碌、无配置、幂等重试不计新次数。最大步骤和时限可调低；输出上限可配置 64–2048。设置见 `.env.example`。

SQLite 的 `BEGIN IMMEDIATE` 将额度检查、并发占位、步骤计数和幂等记录放在同一事务。模型请求在事务之外等待。取消优先于迟到的模型响应，后者不能执行工具。取消时已有请求会被中断；并发占位要等请求结束或总时限到达才释放。服务崩溃遗留的实验最多保留到原始 120 秒期限；每 5 秒和每次相关请求都会清理过期占位。步骤在调用前计数，避免异常造成隐形重试。

Bearer 是 384 位随机数，默认有效 30 天，数据库只保存SHA-256摘要，原始令牌仅在登录/兑换响应中返回。共享口令只由独立服务进程环境提供，不写入SQLite。旧邀请码兼容路径仍使用256位随机数、单次兑换，CLI不会被新登录调用。不要将令牌或旧邀请码写入 Git、公共日志、URL 或长期分析事件。

## VPS 部署模板

生产推荐布局：只读代码 `/opt/agent-game-lab/releases/<version>`，`/opt/agent-game-lab/current` 指向当前版本；独立 venv `/opt/agent-game-lab/venv`；数据库 `/var/lib/agent-game-lab/lab.sqlite3`；服务配置 `/etc/agent-game-lab.env`，由 root 保存且模式为 0600。

版本实际运行环境位于 `/opt/agent-game-lab/venvs/<version>`，稳定 `venv` 为它的链接。这样新版本安装依赖不会改动正在运行的旧环境。现有 unit 的稳定路径适配该布局；不向系统 Python 或根学习项目安装包。

部署脚本分成明确两步，均须在审核完成后由部署者运行。当前已部署制品与实际检查见 [部署验收记录](deploy/DEPLOYMENT_QA.md)；以下是操作说明，不表示执行命令会自动获授权：

```powershell
# 在本机：仅白名单运行文件，输出目录已被忽略；不含 .env、SQLite、缓存或测试。
& 'game/server/.venv/Scripts/python.exe' 'game/server/deploy/bundle.py' 'YYYYMMDD-HHMMSS' --out 'game/output/backend'
```

将正式 `agent-game-lab-<version>.tar.gz` 上传到 `/tmp/`，另将可信 `prepare.sh`、`verify.py` 上传到同一个独立脚本目录。审核并核对本机提供的整个 tar SHA-256 后，服务器以 Bash 执行：

```bash
# 只准备只读 release 与独立 venv；不切链接、不安装/启停 unit、不改 Nginx。
sudo bash /tmp/<deployment-script-directory>/prepare.sh <version> /tmp/agent-game-lab-<version>.tar.gz
# 初次关闭模型的启动步骤，需要另行审核。仍不改 Nginx。
sudo bash /opt/agent-game-lab/releases/<version>/deploy/activate-disabled.sh <version>
```

`verify.py` 在写目标目录前核对完整白名单、每项大小/SHA-256、包类型与版本；拒绝绝对路径、`..`、符号/硬链接、重复文件、未知文件、过大压缩/解压内容和已有目标。`prepare.sh` 验证 Python 最低版本并只在版本 venv 安装固定依赖，清除模型环境后做导入；不创建服务账户或状态数据库。`activate-disabled.sh` 才创建无登录专用账户、状态目录、空 0600 配置文件和稳定链接，安装 unit 并仅启动关闭模型的服务；已有非空模型配置会被明确拒绝，不能用于更新当前已开启模型的服务。当前本域名的两个 Nginx API location 与独立 rate zone 已经审阅并安装；不要将样例重复粘贴到现有配置。

临时测试包必须额外使用 `--test-bundle`，名字为 `agent-game-lab-test-<version>.tar.gz`，含测试和开发依赖但仍不含环境、数据或缓存。正式 `prepare.sh` 拒绝它。临时测试只放随机 `/tmp/agent-lab-check-*` 并用其中的 Python venv，不安装到正式 release。验证与尚未执行事项记录见源码中的 `deploy/DEPLOYMENT_QA.md`；这份审查记录不进入运行包。

1. 建立专用无登录服务账户 `agent-game-lab`，使用 Python 3.10+ 创建独立 venv，并在其中安装 `requirements.txt`。现有 VPS Python 3.10.12 满足声明的最低版本；部署后仍须实际导入和接口检查。不要发布 `.venv`、测试数据库、本地配置或根项目。
2. 将 `.env.example` 的所需变量写入上述独立 EnvironmentFile。服务配置不读取根项目 `.env`。无真实配置时也可部署，保持实验区关闭。
3. 审阅并安装 `deploy/agent-game-lab.service`。systemd 限制写入状态目录，以单 worker 运行，监听 127.0.0.1:8788；不对公网直接开放端口。
4. 在现有 Nginx 的正确上下文中添加 `deploy/nginx-api.conf.example`，包含严格的兑换速率和请求体限制；先 `nginx -t` 再平滑重载。保留原域名证书、静态站点与其他站点设置。
5. 在独立EnvironmentFile中设置 `LAB_ACCESS_PASSPHRASE=zhouxingfu`，保留文件0600；服务重启后检查 `access_enabled:true` 和口令登录。不需要创建邀请码。旧 `python -m agent_lab.invites --days 30` 只留作兼容既有客户端，现网站不使用它。代理应对 `/api/lab/access` 采用与原兑换端点相同的严格速率/请求体限制，不将口令或响应令牌放入日志。
6. 检查 `/api/lab/status`、未授权拒绝、假 Provider 测试、取消/过期释放，再决定是否进行真实模型验收。代码测试不能替代真实接口验证。

备份 SQLite 时使用 SQLite backup API 或在停止服务后复制完整数据库；不要在线只复制主库而遗漏 WAL。当前schema `user_version=3` 为 `invites` 幂等新增可空 `quota_id` 和索引，继续兼容schema2的实验列迁移。旧行的 `quota_id` 为NULL，原令牌、实验历史和幂等记录保留；新口令登录行归到固定 `shared-access-v1` 额度组，各行仍有不同记录owner。旧代码的原字段/SELECT读取可使用增加列后的数据库，但旧执行代码按owner计算额度，**不支持共享额度保护，回退必须禁用创建新实验**，不能只凭schema可读就开放共享令牌执行。口令清空仅禁止新登录，已有令牌不会立即失效；必要时应关闭模型服务或模型配置以停止所有新创建。先让活动实验结束、备份、保留新版读取历史的途径或恢复部署前快照后再回退；已经创建的对照运行也不能交给旧单伙伴代码执行。课程主线和静态站点回滚与该服务分开操作。

本版保留实验事件供用户查看和幂等恢复；尚未加入自动历史删除、账号管理、付费、多租户模型配置或线上分析。若扩大公开邀请范围，应先定义保留时间与运维告警。
