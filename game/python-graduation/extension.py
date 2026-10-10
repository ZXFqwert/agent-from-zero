"""07：新工具只接入注册表；不要给核心循环增加工具名称分支。"""


def register_extensions(host):
    """在 host.tools 注册 list_notes，参数为 {prefix:string}，只读。

    宿主已有 host.list_notes(prefix)，处理器接收 dict，返回 JSON 可序列化结果。
    注册表项格式见 echo_workshop/runtime.py 中 BASE_TOOL_DEFINITIONS。
    """
    raise NotImplementedError("07: 实现 register_extensions；见 lessons/07-extension.md")
