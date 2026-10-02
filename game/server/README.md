# 可选真实 AI 实验区后端

这是游戏主线之外的独立实验服务。FastAPI + SQLite，模型只在虚构的 `source → relay → beacon` 世界中提出工具调用。主线不依赖它，模型失败不会改变游戏存档或学习证据。

**代码从不读取任何 `.env` 文件。** 仅读取本服务进程环境。不要将根目录 Python 学习项目的 `.env` 或会话用于此服务，也不要将服务端密钥打包到前端。未配置完整的 `MODEL_BASE_URL`、`MODEL_NAME`、`MODEL_API_KEY` 时，服务仍可启动；状态返回 `enabled:false`，创建实验返回 503，不扣额度。

## 本地运行和测试

Python 3.11+。在本目录运行（Windows PowerShell）：

```powershell
python -m venv .venv
& '.venv/Scripts/python.exe' -m pip install -r requirements-dev.txt
& '.venv/Scripts/python.exe' -m pytest -q --basetemp '.pytest-tmp'
& '.venv/Scripts/python.exe' -m uvicorn agent_lab.app:app --host 127.0.0.1 --port 8788 --no-access-log
```

测试只使用临时 SQLite、假 Provider 或 HTTPX MockTransport，不读取真实配置，不消耗模型额度。测试环境只安装在本目录 `.venv/`。`--basetemp` 专用于测试临时文件，pytest 会清理该目录，不要指定已有重要目录。

本次在 Python 3.13 上验证；Linux 服务端使用独立虚拟环境，部署时重新安装已固定版本的 requirements。只更新本服务代码，不动根目录教学程序。

## API 契约

所有路径以 `/api/lab` 开头，JSON 请求/响应。授权头为 `Authorization: Bearer <access_token>`。服务不使用 Cookie，不开放跨域；浏览器通过站点同源的 Nginx 代理访问。前端必须将模型文本视为普通文本，不能插入未转义 HTML。所有响应禁止缓存，PWA 也必须将 `/api/` 排除出离线缓存。

| 方法与路径 | 请求 | 返回 |
| --- | --- | --- |
| `GET /status` | 可选 Bearer | `enabled, scenario_ids, limits, busy`；有授权时另有 `remaining_runs, active_run` |
| `POST /redeem` | `{invite_code}` | `{access_token, token_type:"bearer", expires_at}` |
| `POST /runs` | `{request_id, scenario_id?:"signal-rescue"}` | RunView；默认场景为 signal-rescue |
| `GET /runs/{id}` | Bearer | 最新 RunView，适合请求中断或刷新后恢复 |
| `POST /runs/{id}/step` | `{request_id}` + Bearer | 执行最多一次模型请求后返回 RunView |
| `POST /runs/{id}/cancel` | `{request_id}` + Bearer | 取消后的 RunView |

`request_id` 为客户端生成的 UUID，允许 8–64 个英文字母、数字、下划线和连字符。一次用户动作创建一次 ID；网络重试必须复用同一个 ID。创建实验同 ID 返回已有实验的当前状态，不重复扣额。步骤/取消同 ID 返回首次保存的结果；仍执行中的重复步骤返回 409 `step_in_progress`，可稍后 `GET` 查询或同 ID 重试。一个 ID 不能同时用于步骤和取消，否则返回 `idempotency_conflict`。令牌之间不能读写彼此的实验。

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

错误形状统一为 `{"error":{"code":"..."}}`。401 为邀请码/令牌无效，404 不暴露其他用户实验，409 为并发/状态/幂等冲突，413 为请求太大，422 为参数不符，429 为当天额度耗尽，503 为未配置或存储暂不可用。代理自身的 429/502/504 可能不是 JSON，前端应显示可恢复提示并保留 request_id。

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

默认每邀请码每天 **10 次实验（UTC 日期）**、全局并发 **1 个实验**、每次最多 **8 个模型请求**、从创建起 **120 秒**、模型每次最多 **512 输出 token**。创建后取消、失败、超时仍计一次；忙碌、无配置、幂等重试不计新次数。最大步骤和时限可调低；输出上限可配置 64–2048。设置见 `.env.example`。

SQLite 的 `BEGIN IMMEDIATE` 将额度检查、并发占位、步骤计数和幂等记录放在同一事务。模型请求在事务之外等待。取消优先于迟到的模型响应，后者不能执行工具。取消时已有请求会被中断；并发占位要等请求结束或总时限到达才释放。服务崩溃遗留的实验最多保留到原始 120 秒期限；每 5 秒和每次相关请求都会清理过期占位。步骤在调用前计数，避免异常造成隐形重试。

邀请码是 256 位随机数、单次兑换；Bearer 是 384 位随机数，默认有效 30 天。数据库只保存 SHA-256 摘要，原始邀请码仅由 CLI 输出一次，原始令牌仅兑换时返回。不要将邀请码或令牌写入 Git、公共日志、URL 或长期分析事件。

## VPS 部署模板（尚未执行）

生产推荐布局：只读代码 `/opt/agent-game-lab/releases/<version>`，`/opt/agent-game-lab/current` 指向当前版本；独立 venv `/opt/agent-game-lab/venv`；数据库 `/var/lib/agent-game-lab/lab.sqlite3`；服务配置 `/etc/agent-game-lab.env`，由 root 保存且模式为 0600。

1. 建立专用无登录服务账户 `agent-game-lab`，安装 Python 3.11+ 与 venv，安装 `requirements.txt`。不要发布 `.venv`、测试数据库、本地配置或根项目。
2. 将 `.env.example` 的所需变量写入上述独立 EnvironmentFile。服务配置不读取根项目 `.env`。无真实配置时也可部署，保持实验区关闭。
3. 审阅并安装 `deploy/agent-game-lab.service`。systemd 限制写入状态目录，以单 worker 运行，监听 127.0.0.1:8788；不对公网直接开放端口。
4. 在现有 Nginx 的正确上下文中添加 `deploy/nginx-api.conf.example`，包含严格的兑换速率和请求体限制；先 `nginx -t` 再平滑重载。保留原域名证书、静态站点与其他站点设置。
5. 手动创建邀请码（此项目不会自动执行）：在服务代码目录，以服务用户身份设置同一 `LAB_DATABASE` 后运行 `python -m agent_lab.invites --days 30`。该 CLI 不需要模型密钥；将输出私下交给测试者。
6. 检查 `/api/lab/status`、未授权拒绝、假 Provider 测试、取消/过期释放，再决定是否进行真实模型验收。代码测试不能替代真实接口验证。

备份 SQLite 时使用 SQLite backup API 或在停止服务后复制完整数据库；不要在线只复制主库而遗漏 WAL。回滚代码前确认数据库兼容，保留备份；当前 schema 为第一版，只做建表，不包含破坏性迁移。课程主线和静态站点回滚与该服务分开操作。

本版保留实验事件供用户查看和幂等恢复；尚未加入自动历史删除、账号管理、付费、多租户模型配置或线上分析。若扩大公开邀请范围，应先定义保留时间与运维告警。
