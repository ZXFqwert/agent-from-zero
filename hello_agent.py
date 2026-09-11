messages = [
    {"role": "system", "content": "你是一个耐心的 Python 助教。"},
    {"role": "user", "content": "什么是 Python 列表？"},
    {"role": "assistant", "content": "列表是按顺序存放多个元素的容器。"}
]

for message in messages:
    print(message["role"], ":", message["content"])