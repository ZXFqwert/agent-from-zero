import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

base_url = os.getenv("MODEL_BASE_URL")
model_name = os.getenv("MODEL_NAME")
api_key = os.getenv("MODEL_API_KEY")
print(base_url, model_name, bool(api_key))

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
