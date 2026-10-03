import { useMemo, useState } from "react";
import { CheckCircle2, Eye, FileText, Link2, ShieldCheck } from "lucide-react";
import { createGame, reduceGame } from "../engine";
import { factLabels } from "../content/scenarios";
import { uiStories } from "../content/stories";
import { displayFact } from "../content/presentation";
import {exportBlueprintPython,type PythonLearningStage} from '../exports/pythonBlueprint';
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
  const [pythonStage,setPythonStage]=useState<PythonLearningStage>('messages');
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
    "lab-change":"宿主配置", "lab-request":"宿主请求", "lab-observation":"宿主观测", "lab-result":"宿主回执", "lab-verified":"宿主检查",
    "evaluation-change":"试验契约",
    "evaluation-request":"试验请求",
    "evaluation-observation":"试验量测",
    "evaluation-result":"试验回执",
    "evaluation-verified":"试验检查",
    "team-change":"协作交接",
    "security-change":"信任与门令",
    "memory-change":"持久档案",
    "session-change":"会话树",
    "skill-change":"执行流程",
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
    "policy-stop": "回路保险",
    "context-change": "卷轴装配",
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
      <div className="callout recap-note"><p>{layer === 'story' ? uiStories[scenario.id]?.recap.story : layer === 'system' ? uiStories[scenario.id]?.recap.system : uiStories[scenario.id]?.recap.technical}</p></div>
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
              <h4>{replay.security ? "城市现场实际状态" : "世界实际状态"}</h4>
              {Object.entries(replay.world).map(([k, v]) => (
                <p key={k}>
                  <span>{factLabels[k] ?? k}</span>
                  <b>
                    {v === true ? "已实现" : v === false ? "未实现" : String(v)}
                  </b>
                </p>
              ))}
              {replay.security && scenario.security?.sandbox && <>
                <h4>镜砂沙箱状态 · 不替代现场</h4>
                {Object.entries(replay.security.sandboxWorld).map(([k, v]) => <p key={`sandbox-${k}`}><span>{factLabels[k] ?? k}</span><b>{displayFact(k, v)}</b></p>)}
              </>}
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
                      {v.provenance && `${v.provenance.realm === 'sandbox' ? '镜砂沙箱' : '城市现场'} · `}
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
          <details className="callout"><summary>把这次构筑带进 Python</summary>
            <p>从当前回放位置的已知资料导出学习骨架。你选择本次只练哪一层；工具实现保留给你亲手完成。</p>
            <label>这一步练什么<select value={pythonStage} onChange={event=>setPythonStage(event.target.value as PythonLearningStage)}>
              <option value="messages">01 · 一个消息来回</option><option value="tools">02 · 一件工具与精确回执</option><option value="loop">03 · 有限反馈循环</option>
            </select></label>
            <p>{exportBlueprintPython({scenario,blueprint:replay.blueprint,observed:replay.observed,stage:pythonStage}).learningTasks.at(-1)?.principle}</p>
            <button className="button" onClick={()=>{const result=exportBlueprintPython({scenario,blueprint:replay.blueprint,observed:replay.observed,stage:pythonStage});const url=URL.createObjectURL(new Blob([result.source],{type:'text/x-python;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>下载本步 Python 骨架</button>
            <small>使用 OpenAI SDK 的 Chat Completions；本次下载不连接模型。配置和真实工具由你在独立练习目录中填写。</small>
          </details>
          <pre className="code-view">
            {JSON.stringify(
              {
                blueprint: replay.blueprint,
                context: replay.observed,
                events: replay.events.slice(-8),
                ...(replay.lab ? {host:replay.lab} : {}),
                ...(replay.team ? {team:replay.team} : {}),
                ...(replay.evaluation ? {evaluation:replay.evaluation} : {}),
              },
              null,
              2,
            )}
          </pre>
        </>
      ) : (
        <ol className="event-list">
          {replay.events
            .filter((e) => layer === "system" || !["request","evaluation-request","lab-request"].includes(e.type))
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
                    {e.realm && <span>{e.realm === 'sandbox' ? '镜砂沙箱' : '城市现场'}</span>}
                    {e.actorId && <span>{scenario.team?.actors.find(actor=>actor.id===e.actorId)?.label??'回声'}</span>}
                    {e.taskId && <span>任务 {e.taskId.split(':').at(-1)}</span>}
                    {e.evaluationCaseId && <span>试验：{scenario.evaluation?.cases.find(c=>c.id===e.evaluationCaseId)?.label??e.evaluationCaseId}</span>}
                    {e.evaluationRunId && <span>试验世界 · {e.evaluationRunId.split(':').at(-1)}</span>}
                    {e.labTaskId&&<span>入口任务 {e.labTaskId.split(':').at(-1)}</span>}
                    {e.labSource&&<span>真实入口 {e.labSource.channelId} / {e.labSource.senderId}</span>}
                    {e.labModuleId&&<span>模块 {e.labModuleId}</span>}
                    {e.labModelId&&<span>适配 {e.labModelId}</span>}
                    {e.tool && <span>{e.tool}</span>}
                    {e.delivered === false && (
                      <span className="warning">未送入回声上下文</span>
                    )}
                  </div>
                  <p>{e.text}</p>
                  {layer === 'system' && e.callId && <code className="event-protocol">调用 {e.callId}{e.requestKey?`\n业务凭证 ${e.requestKey}`:''}{e.arguments?`\n参数 ${JSON.stringify(e.arguments)}`:''}{e.replayed?'\n复用已执行结果':''}</code>}

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
