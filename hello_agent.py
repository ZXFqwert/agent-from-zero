import os
import json
from dotenv import load_dotenv
from openai import OpenAI
from pathlib import Path

load_dotenv()
workspace = Path.cwd().resolve()
base_url = os.getenv("MODEL_BASE_URL")
model_name = os.getenv("MODEL_NAME")
api_key = os.getenv("MODEL_API_KEY")
if not base_url or not model_name or not api_key:
    raise RuntimeError("缺少模型配置，请检查 .env 中的 MODEL_BASE_URL、MODEL_NAME、MODEL_API_KEY")
client = OpenAI(
    # api_key 参数填你读到的密钥变量
    api_key=api_key,
    # base_url 参数填你读到的地址变量
    base_url=base_url
)
tools = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取工作目录中的文本文件",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "相对于工作目录的文件路径"
                    }
                },
                "required": ["path"],
                "additionalProperties": False
            }
        }
    }
]

def read_file(path):
    requested_path = Path(path)

    # 1. 如果 requested_path 是绝对路径，抛出 ValueError
    if requested_path.is_absolute():
        raise ValueError("只允许访问工作目录中的文件")

    # 2. 用 workspace / requested_path 拼接，并调用 resolve()
    target_path = (workspace / requested_path).resolve()
    # 3. 确认解析后的路径仍然位于 workspace 内，否则抛出 ValueError
    if not target_path.is_relative_to(workspace):
        raise ValueError("只允许访问工作目录中的文件")

    # 4. 用 UTF-8 读取并返回文本
    with open(target_path, "r", encoding="utf-8") as f:
        return f.read()


messages = [
    {"role": "system", "content": "你是一个耐心的 Python 助教。"}
]
while True:
    text = input("你：").strip()

    if text == "/exit":
        # 退出循环
        break
    elif text == "/history":
        # 把你之前的打印历史循环搬到这里
        for message in messages:
            print(message["role"], ":", message["content"])
    elif text == "/clear":
        # 只保留 messages 的第一条
        messages = [messages[0]]
    elif text == "":
        # 跳过这一轮
        continue
    else:
        # 把你之前的 append 搬到这里
        messages.append({
            "role": "user",
            "content": text
        })
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            tools=tools,
        )
        assistant_message = response.choices[0].message
        tool_call = assistant_message.tool_calls[0]
        arguments = json.loads(tool_call.function.arguments)

        if tool_call.function.name == "read_file":
            result = read_file(arguments["path"])
        else:
            raise ValueError(f"未知工具：{tool_call.function.name}")
        messages.append({
            "role": "assistant",
            "content": assistant_message.content,
            "tool_calls": [tool_call.model_dump()]
        })

        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": result
        })
        final_response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            tools=tools,
        )

        final_message = final_response.choices[0].message
        final_text = final_message.content.strip()

        messages.append({
            "role": "assistant",
            "content": final_text
        })
        print("助手：", final_text)