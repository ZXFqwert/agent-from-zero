"""回声工坊：只修改当前小步，按 lessons/ 的契约编写。无网络调用。"""


def build_context(goal, project_rules, documents):
    """01 返回 Chat Completions messages。资料保留来源、版本、时间且不升级权限。"""
    raise NotImplementedError("01: 实现 build_context；见 lessons/01-context.md")


def describe_tools(registry):
    """02 registry 是 name -> {description, parameters, handler, write}；只公开声明。"""
    raise NotImplementedError("02: 实现 describe_tools；见 lessons/02-schema.md")


def dispatch(call, host, approved=False):
    """03 返回 {id, ok, result} 或 {id, ok:False, error}。04 接入 write_once。"""
    raise NotImplementedError("03: 实现 dispatch；见 lessons/03-dispatch.md")


def write_once(host, path, content, request_id, approved):
    """04 返回工具结果；先批准再执行，host.ledger 保存 ID -> 指纹和结果。"""
    raise NotImplementedError("04: 实现 write_once；见 lessons/04-approval.md")


def run_agent(provider, host, goal, project_rules, documents, max_rounds=8, cancelled=lambda: False):
    """05 返回 {reason, rounds, messages, verified}；provider.complete(messages, tools)。"""
    raise NotImplementedError("05: 实现 run_agent；见 lessons/05-loop.md")


def save_session(path, state):
    """06 state = {version:1, messages:[...], ledger:{...}}；先校验再原子保存。"""
    raise NotImplementedError("06: 实现 save_session；见 lessons/06-session.md")


def load_session(path):
    """06 恢复且验证版本、字段及调用配对；不要从存档恢复凭据或永久批准。"""
    raise NotImplementedError("06: 实现 load_session；见 lessons/06-session.md")


def accept_personal_result(host, final_text):
    """08 用 host.read_note 检查 host.expected 的文件事实，文本自称成功不算完成。"""
    raise NotImplementedError("08: 实现 accept_personal_result；见 lessons/08-personal.md")
