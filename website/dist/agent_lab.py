"""Agent 实验局：标准库教学模拟，不联网，不调用真实模型。

python agent_lab.py --budget 2
python agent_lab.py --budget 1

首次运行仅创建脚本旁专用样例目录中的缺失样例；不覆盖已有内容。
policy 是确定规则的模型替身，用于理解控制流，不代表真实模型能力。
"""
import argparse
import json
from pathlib import Path


def read_file(root: Path, relative_path: str) -> str:
    """解析真实路径，再检查读取范围；不给工具任意文件访问权。"""
    path = (root / relative_path).resolve()
    if not path.is_relative_to(root.resolve()):
        raise PermissionError("路径超出本实验的样例目录")
    if path.stat().st_size > 16_384:
        raise ValueError("教学工具只读取不超过 16 KiB 的文件")
    return path.read_text(encoding="utf-8")


def policy(messages: list[dict]) -> dict:
    """模型替身：返回结构化动作，自己不读取文件。"""
    results = [m for m in messages if m["role"] == "tool"]
    if not results:
        return {"role": "assistant", "tool_call": {
            "id": "call_1", "name": "read_file", "path": "archive.txt"}}
    latest = results[-1]
    if latest.get("error"):
        return {"role": "assistant", "status": "failed", "content":
                "读取失败，不能确认地址：" + latest["content"]}
    if latest["tool_call_id"] == "call_1":
        if "current.txt" not in latest["content"]:
            return {"role": "assistant", "status": "partial", "content":
                    "第一份资料没有提供本示例预期的当前资料指引，停止并请求帮助。"}
        return {"role": "assistant", "tool_call": {
            "id": "call_2", "name": "read_file", "path": "current.txt"}}
    return {"role": "assistant", "status": "complete", "content":
            f"依据 current.txt：{latest['content']}（仅核查样例资料，未验证真实地址）"}


def run(root: Path, budget: int) -> str:
    messages = [{"role": "user", "content": "找到当前生效地址，并注明来源。"}]
    calls = 0
    # 最多 budget 次工具调用，外加一次生成最终报告的机会。
    for _ in range(budget + 1):
        response = policy(messages)
        messages.append(response)
        call = response.get("tool_call")
        if not call:
            print(f"[{response['status']}] {response['content']}")
            return response["status"]
        print("[模型请求]", json.dumps(call, ensure_ascii=False))
        if calls >= budget:
            print("[partial] 工具预算耗尽；尚未读取当前资料，不能确认最新地址。")
            return "partial"
        calls += 1
        try:
            if call["name"] != "read_file":
                raise PermissionError("工具不在允许列表中")
            content = read_file(root, call["path"])
            result = {"role": "tool", "tool_call_id": call["id"], "content": content}
        except (OSError, ValueError) as exc:
            result = {"role": "tool", "tool_call_id": call["id"],
                      "content": str(exc), "error": True}
        print("[工具结果]", json.dumps(result, ensure_ascii=False))
        messages.append(result)  # 没有这一步，下一轮就没有新观察。
    return "partial"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--budget", type=int, choices=range(1, 11), default=2)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent / "agent_lab_files"
    if root.is_symlink():
        raise SystemExit("样例目录不能是指向其他位置的符号链接")
    root.mkdir(exist_ok=True)
    samples = {
        "archive.txt": "旧址：松林路 8 号。新址请查 current.txt。",
        "current.txt": "当前生效地址：银杏路 21 号。",
    }
    for name, content in samples.items():
        path = root / name
        if not path.exists():
            with path.open("x", encoding="utf-8") as file:
                file.write(content)
    print("[教学模拟] 样例目录：", root)
    run(root, args.budget)


if __name__ == "__main__":
    main()
