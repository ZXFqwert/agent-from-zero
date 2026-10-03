import { useMemo, useState } from "react";
import { CheckCircle2, Eye, FileText, Link2, ShieldCheck } from "lucide-react";
import { createGame, reduceGame } from "../engine";
import { factLabels } from "../content/scenarios";
import { chapterOneStory } from "../content/chapterOneStory";
import { displayFact } from "../content/presentation";
import type {
  GameAction,
  GameState,
  ScenarioDefinition,
} from "../engine/types";
export default function Journal({
  state,
  scenario,
  actions,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  actions: GameAction[];
}) {
  const [layer, setLayer] = useState<"story" | "system" | "code">("story"),
    [cursor, setCursor] = useState(actions.length);
  const replay = useMemo(
    () =>
      actions
        .slice(0, cursor)
        .reduce(
          (s, a) => reduceGame(scenario, s, a),
          createGame(scenario, state.seed),
        ),
    [actions, cursor, scenario, state.seed],
  );
  const types: Record<string, string> = {
    configured: "构筑",
    dispatched: "派遣",
    request: "请求",
    observation: "观察",
    result: "回执",
    claim: "宣称",
    verified: "验收",
    victory: "完成",
    paused: "暂停",
    resumed: "继续",
    exhausted: "停止",
    blocked: "拦截",
    reset: "重试",
    "world-change": "现场变化",
    "untrusted-message": "外部报告",
    environment: "环境告知",
  };
  return (
    <div>
      <div className="segmented">
        {(["story", "system", "code"] as const).map((l) => (
          <button
            key={l}
            className={layer === l ? "active" : ""}
            onClick={() => setLayer(l)}
          >
            {l === "story"
              ? "故事视图"
              : l === "system"
                ? "系统视图"
                : "技术视图"}
          </button>
        ))}
      </div>
      <div className="callout recap-note"><p>{layer === 'story' ? chapterOneStory[scenario.id]?.recap.story : layer === 'system' ? chapterOneStory[scenario.id]?.recap.system : chapterOneStory[scenario.id]?.recap.technical}</p></div>
      <div className="replay-control">
        <label>
          回放行动{" "}
          <strong>
            {cursor} / {actions.length}
          </strong>
          <input
            aria-label="回放行动位置"
            type="range"
            min="0"
            max={actions.length}
            value={cursor}
            onChange={(e) => setCursor(Number(e.target.value))}
          />
        </label>
        <small>只重放已记录的确定行动，不重新执行、不消耗资源。</small>
      </div>
      {layer === "system" && (
        <>
          <div className="flow-diagram">
            <span>
              <FileText />
              委托
            </span>
            <span>→</span>
            <span>
              <Eye />
              观察
            </span>
            <span>→</span>
            <span>
              <Link2 />
              执行 / 回执
            </span>
            <span>→</span>
            <span>
              <ShieldCheck />
              验收
            </span>
          </div>
          <div className="evidence-grid">
            <div>
              <h4>世界实际状态</h4>
              {Object.entries(replay.world).map(([k, v]) => (
                <p key={k}>
                  <span>{factLabels[k] ?? k}</span>
                  <b>
                    {v === true ? "已实现" : v === false ? "未实现" : String(v)}
                  </b>
                </p>
              ))}
            </div>
            <div>
              <h4>回声收到的信息</h4>
              {!Object.keys(replay.observed).length && (
                <p>卷轴还是空的。世界事实不会自动进入上下文。</p>
              )}
              {Object.entries(replay.observed).map(([k, v]) => (
                <p key={k}>
                  <span>{factLabels[k] ?? k}</span>
                  <b>
                    {v.value === true
                      ? "已实现"
                      : v.value === false
                        ? "未实现"
                        : String(v.value)}
                    <small>
                      {v.source === "receipt"
                        ? "行动回执"
                        : v.source === "verification"
                          ? "独立验收"
                          : "观测"}
                    </small>
                  </b>
                </p>
              ))}
            </div>
          </div>
        </>
      )}
      {layer === "code" ? (
        <>
          <p className="muted">
            这些是模拟内核的可观察消息，不能视为模型内部思考。
          </p>
          <pre className="code-view">
            {JSON.stringify(
              {
                blueprint: replay.blueprint,
                context: replay.observed,
                events: replay.events.slice(-8),
              },
              null,
              2,
            )}
          </pre>
        </>
      ) : (
        <ol className="event-list">
          {replay.events
            .filter((e) => layer === "system" || e.type !== "request")
            .map((e) => (
              <li key={e.id} className={`event-${e.type}`}>
                <div className="event-mark">
                  {e.success ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <span>{e.sequence.toString().padStart(2, "0")}</span>
                  )}
                </div>
                <div>
                  <div className="event-meta">
                    <b>{types[e.type]}</b>
                    {e.tool && <span>{e.tool}</span>}
                    {e.delivered === false && (
                      <span className="warning">未送入回声上下文</span>
                    )}
                  </div>
                  <p>{e.text}</p>
                  {layer === "system" && e.facts && (
                    <div className="live-facts">{Object.entries(e.facts).map(([fact, value]) => <span key={fact}>{factLabels[fact] ?? fact}：{displayFact(fact, value)}</span>)}</div>
                  )}
                </div>
              </li>
            ))}
        </ol>
      )}
      {!replay.events.length && (
        <div className="empty">
          <FileText />
          <h3>卷轴上还没有行动。</h3>
          <p>派遣回声后，每个请求与结果都会留在这里。</p>
        </div>
      )}
    </div>
  );
}
