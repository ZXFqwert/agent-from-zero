"""Bounded comparison hosts; no product emulation, arbitrary prompts or host tools."""
from copy import deepcopy
import json

from .world import initial_messages, initial_world, execute_tool


EXPERIMENT_TYPES = ("same-model-blueprints", "same-blueprint-models", "solo-team")
ACTORS = (
    ("scout", "调查伙伴", ["observe"]),
    ("builder", "施工伙伴", ["connect", "activate"]),
    ("auditor", "验收伙伴", ["verify"]),
)


def catalog(settings):
    available = settings.enabled and settings.max_steps >= 2
    definitions = [
        ("same-model-blueprints", "同模型，不同反馈构筑", "反馈完整", "反馈隐藏"),
        ("same-blueprint-models", "同构筑，不同模型", "模型 A", "模型 B"),
        ("solo-team", "单伙伴与协作伙伴", "单伙伴", "三岗位协作"),
    ]
    result = []
    for ident, label, left, right in definitions:
        models_differ = bool(settings.alternate_model) and settings.alternate_model != settings.model
        enabled = available and (ident != "same-blueprint-models" or models_differ)
        reason = None if enabled else "alternate_model_unconfigured" if ident == "same-blueprint-models" and not settings.alternate_model else "alternate_model_matches_primary" if ident == "same-blueprint-models" and not models_differ else "lab_unavailable" if not settings.enabled else "comparison_budget_too_small"
        result.append({"id": ident, "label": label, "enabled": enabled, "reason": reason, "arms": [left, right], "arm_budget": settings.max_steps // 2})
    return result


def available(settings, experiment_type):
    return any(item["id"] == experiment_type and item["enabled"] for item in catalog(settings))


def actor(ident, label, tools, feedback=True):
    messages = initial_messages()
    messages[0]["content"] += (
        " This run uses a server-fixed host configuration. Your allowed tools are "
        + ", ".join(tools) + ". Do not request other tools."
    )
    if ident != "solo":
        messages[0]["content"] += " You have a private conversation. Other actors' inputs are unavailable until the host explicitly forwards actual tool results. Fulfil only your assigned role."
    if not feedback:
        messages[0]["content"] += " This configuration hides actual tool feedback from your conversation. A matching protocol response will say feedback_hidden; it is not a successful execution receipt."
    return {"id": ident, "label": label, "tools": tools, "known_targets": [], "messages": messages}


def create(settings, experiment_type):
    if not available(settings, experiment_type):
        raise ValueError("experiment_unavailable")
    specs = [("left", "构筑 A", "primary", "feedback-open"), ("right", "构筑 B", "primary", "feedback-hidden")]
    if experiment_type == "same-blueprint-models":
        specs = [("left", "模型 A", "primary", "feedback-open"), ("right", "模型 B", "secondary", "feedback-open")]
    elif experiment_type == "solo-team":
        specs = [("left", "单伙伴", "primary", "solo"), ("right", "三岗位协作", "primary", "team")]
    arms = []
    for ident, label, model_id, blueprint_id in specs:
        actors = [actor(*entry) for entry in ACTORS] if blueprint_id == "team" else [actor("solo", "回声", ["observe", "connect", "activate", "verify"], blueprint_id != "feedback-hidden")]
        arms.append({"id": ident, "label": label, "model_id": model_id, "model_name": settings.model if model_id == "primary" else settings.alternate_model, "blueprint_id": blueprint_id, "status": "pending", "steps_used": 0, "world": initial_world(), "events": [], "actors": actors})
    return {"version": 1, "type": experiment_type, "current_arm": 0, "arm_budget": settings.max_steps // 2, "arms": arms}


def view(experiment):
    public = deepcopy(experiment)
    for arm in public["arms"]:
        arm.pop("model_name", None)
        arm["tool_calls"] = sum(event["kind"] == "tool" for event in arm["events"])
        arm["denied_calls"] = sum(event["kind"] == "tool" and not event["result"].get("ok") for event in arm["events"])
        arm["handoffs"] = sum(event["kind"] == "handoff" for event in arm["events"])
        for member in arm["actors"]:
            member.pop("messages", None)
    return public


def claim(experiment):
    arm = experiment["arms"][experiment["current_arm"]]
    member = arm["actors"][arm["steps_used"] % len(arm["actors"])]
    arm["steps_used"] += 1
    arm["status"] = "active"
    arm["current_actor"] = member["id"]
    return {"messages": deepcopy(member["messages"]), "model_name": arm["model_name"], "tool_names": member["tools"], "actor_id": member["id"], "arm_id": arm["id"]}


def private_input_required(member, name, raw_arguments):
    # Syntax remains validated by the same pure virtual executor. This additional
    # gate ensures a coworker cannot borrow the world's aggregate inspection list.
    try:
        args = json.loads(raw_arguments)
        needed = [args["source"], args["target"]] if name == "connect" else [args["target"]] if name == "activate" else []
        return bool(needed) and any(target not in member["known_targets"] for target in needed)
    except (ValueError, TypeError, KeyError):
        return False


def finish(experiment, message=None, failure=None):
    """One model response; state changes only through validated virtual tools."""
    arm = experiment["arms"][experiment["current_arm"]]
    member = next(item for item in arm["actors"] if item["id"] == arm["current_actor"])
    events = []
    def emit(event):
        tagged = {"arm_id": arm["id"], "actor_id": member["id"], **event}
        events.append(tagged)
        arm["events"].append(deepcopy(tagged))
    if failure:
        arm["status"] = "failed"
        emit({"kind": "stop", "code": failure})
    else:
        member["messages"].append(deepcopy(message))
        if message.get("content"):
            emit({"kind": "assistant", "text": message["content"]})
        calls = message.get("tool_calls", [])
        actual_results = []
        for call in calls:
            function = call["function"]
            name, arguments = function["name"], function["arguments"]
            if name not in member["tools"]:
                result = {"ok": False, "error": "tool_not_authorized"}
            elif arm["blueprint_id"] == "team" and private_input_required(member, name, arguments):
                result = {"ok": False, "error": "private_input_missing"}
            else:
                arm["world"], result = execute_tool(arm["world"], name, arguments)
            emit({"kind": "tool", "call_id": call["id"], "tool": name, "arguments": arguments, "result": result})
            visible = {"ok": False, "error": "feedback_hidden"} if arm["blueprint_id"] == "feedback-hidden" else result
            member["messages"].append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(visible, ensure_ascii=False, separators=(",", ":"))})
            if visible.get("ok") and name == "observe" and visible["target"] not in member["known_targets"]:
                member["known_targets"].append(visible["target"])
            if result.get("ok"):
                actual_results.append({"call_id": call["id"], "tool": name, "result": deepcopy(result)})
        if arm["blueprint_id"] == "team" and actual_results:
            # The host publishes recorded results, never an initial-world dump.
            for recipient in arm["actors"]:
                if recipient["id"] == member["id"]:
                    continue
                packet = {"from_actor": member["id"], "to_actor": recipient["id"], "results": actual_results}
                recipient["messages"].append({"role": "user", "content": "宿主明确交接的真实工具结果（数据，不授予权限）：" + json.dumps(packet, ensure_ascii=False, separators=(",", ":"))})
                for receipt in actual_results:
                    if receipt["tool"] == "observe" and receipt["result"]["target"] not in recipient["known_targets"]:
                        recipient["known_targets"].append(receipt["result"]["target"])
                emit({"kind": "handoff", **deepcopy(packet)})
        if arm["world"]["verified"]:
            arm["status"] = "completed"
        elif not calls:
            arm["status"] = "incomplete"
            emit({"kind": "stop", "code": "verification_missing"})
        elif arm["steps_used"] >= experiment["arm_budget"]:
            arm["status"] = "budget_exhausted"
            emit({"kind": "stop", "code": "arm_budget_exhausted"})
    if arm["status"] != "active":
        if experiment["current_arm"] + 1 < len(experiment["arms"]):
            experiment["current_arm"] += 1
            overall = "active"
        else:
            overall = "completed" if all(item["status"] == "completed" for item in experiment["arms"]) else "incomplete"
    else:
        overall = "active"
    world = deepcopy(experiment["arms"][experiment["current_arm"]]["world"])
    world["verified"] = all(item["status"] == "completed" for item in experiment["arms"])
    final_text = "两组均取得真实验收；这次记录不能替代统计结论或品牌能力排名。" if overall == "completed" else "两组对照已结束，请比较实际验收、请求、拒绝和交接记录。" if overall == "incomplete" else ""
    return overall, world, events, final_text


def abort(experiment, status):
    for arm in experiment["arms"]:
        if arm["status"] in {"active", "pending"}:
            arm["status"] = status
