# 02 · 工具声明不是工具执行

只实现 `describe_tools(registry)`。

注册表格式见 `echo_workshop/runtime.py`：每个名称对应 `{description, parameters, handler, write}`。`handler` 是本机函数，`write` 是宿主策略；它们不进入模型输入。模型只看到声明：`{type: "function", function: {name, description, parameters}}`。

从注册表遍历生成列表，参数对象复制后放入声明，别让模型声明的改动反过来污染注册表。`parameters` 已包含 `type:object`、`properties`、`required` 和 `additionalProperties:false`；此步先理解这些字段，再正确传递它们。schema 能帮助模型生成参数，下一步宿主仍要检查，不相信模型一定遵守。

验收：`python workshop.py check --stage schema --report reports/schema.json`。检查器新增一个之前未见的只读工具，你的函数应该自然公开它的声明；不允许维护固定品牌或三种工具的独立名单。下一步再接执行，不要一次写完整循环。
