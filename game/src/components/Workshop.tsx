import { useState } from "react";
import {
  Eye,
  Wrench,
  ShieldCheck,
  Repeat2,
  Check,
  ArrowRight,
  Zap,
} from "lucide-react";
import type {
  AgentBlueprint,
  GameState,
  ScenarioDefinition,
  ToolName,
} from "../engine/types";
import { validateBlueprint } from "../engine";
import ParameterEditor from "./ParameterEditor";
const tools = [
  {
    id: "observe" as ToolName,
    name: "观测之镜",
    label: "观察法器",
    Icon: Eye,
    text: "读取目标的实际状态，将观察送入回声的卷轴。",
  },
  {
    id: "operate" as ToolName,
    name: "塑形之手",
    label: "行动法器",
    Icon: Wrench,
    text: "提出操作请求，由法器执行。只有执行才能改变世界。",
  },
  {
    id: "verify" as ToolName,
    name: "求真之印",
    label: "验收法器",
    Icon: ShieldCheck,
    text: "独立复查完成条件。一次成功回执不等于整件事已完成。",
  },
];
export default function Workshop({
  state,
  scenario,
  onApply,
  initialBuild,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  onApply: (build: AgentBlueprint) => void;
  initialBuild?: AgentBlueprint;
}) {
  const [build, setBuild] = useState<AgentBlueprint>(
    structuredClone(initialBuild ?? state.blueprint),
  );
  const capacity = scenario.limits?.toolCapacity ?? 3;
  const errors = validateBlueprint(scenario, build);
  const order = build.goalOrder ?? scenario.goals.map(g => g.fact);
  const targets = [
    ...new Set(
      [...scenario.observations, ...scenario.operations].map((x) => x.target),
    ),
  ];
  const targetName = (target: string) =>
    scenario.observations
      .find((o) => o.target === target)
      ?.label.replace(/查看|检查|侦察/, "") ?? scenario.operations.find(o=>o.target===target)?.label ?? target;
  return (
    <div className="workshop">
      <div className="workshop-banner">
        <img
          src={`${import.meta.env.BASE_URL}art/echo-companion.webp`}
          alt="回声：石头魔像与发光的心灯"
        />
        <div>
          <span className="eyebrow">ECHO · 你的言灵伙伴</span>
          <h3>
            它能走多远，
            <br />
            取决于你如何构筑。
          </h3>
          <p>装配法器，把一次回复变成一段行动。</p>
        </div>
      </div>
      <div className="section-label">
        <span>01 / 选择法器</span>
        <span>{build.tools.length} / {capacity} 已装备</span>
      </div>
      <div className="tool-grid">
        {tools.map(({ id, name, label, Icon, text }) => (
          <button
            key={id}
            aria-pressed={build.tools.includes(id)}
            disabled={!build.tools.includes(id) && build.tools.length >= capacity}
            className={`tool-card ${build.tools.includes(id) ? "equipped" : ""}`}
            onClick={() =>
              setBuild({
                ...build,
                tools: build.tools.includes(id)
                  ? build.tools.filter((x) => x !== id)
                  : [...build.tools, id],
              })
            }
          >
            <span className="tool-rune">
              <Icon size={25} />
            </span>
            <span className="tool-title">{name}</span>
            <small>{label}</small>
            {(scenario.engineVersion ?? 1) >= 2 && <small className="tool-cost">通常消耗 {scenario.limits?.toolCosts?.[id] ?? 1} 能量</small>}
            <p>{text}</p>
            <span className="equip-state">
              {build.tools.includes(id) ? (
                <>
                  <Check size={13} />
                  已装备
                </>
              ) : (
                "＋ 装备"
              )}
            </span>
          </button>
        ))}
      </div>
      {capacity < 3 && <p className="notice">这次背包只有 {capacity} 个槽位。可以暂停换装，现场与卷轴会保留；换装不会补充任务能量。</p>}
      <div className="section-label">
        <span>02 / 接通行动回路</span>
      </div>
      <button
        role="switch"
        aria-checked={build.feedback}
        className="switch-row"
        onClick={() => setBuild({ ...build, feedback: !build.feedback })}
      >
        <Repeat2 />
        <span>
          <strong>把回执交给回声</strong>
          <small>每次动作之后，依据成功或失败的结果继续决策。</small>
        </span>
        <i className={build.feedback ? "switch on" : "switch"} />
      </button>
      <button
        role="switch"
        aria-checked={build.verification}
        className="switch-row"
        onClick={() =>
          setBuild({ ...build, verification: !build.verification })
        }
      >
        <ShieldCheck />
        <span>
          <strong>结束前独立验收</strong>
          <small>使用求真之印，检查委托里的每个完成条件。</small>
        </span>
        <i className={build.verification ? "switch on" : "switch"} />
      </button>
      <div className="section-label">
        <span>03 / 行动契约</span>
        <span>
          <Zap size={12} /> {(scenario.engineVersion ?? 1) >= 2 ? `任务余量 ${state.runtime?.missionRemaining ?? scenario.limits?.missionBudget} 能量` : '每个工具请求消耗 1 点'}
        </span>
      </div>
      <label className="budget-control">
        单次派遣预算 <strong>{build.budget} 点</strong>
        <input
          aria-label="行动预算"
          type="range"
          min="2"
          max={scenario.limits?.maxBudget ?? 20}
          value={build.budget}
          onChange={(e) =>
            setBuild({ ...build, budget: Number(e.target.value) })
          }
        />
        <small>{(scenario.engineVersion ?? 1) >= 2 ? '单次预算只决定何时停下来。任务总能量用完后，须回到整个委托的起点重试。' : '用尽即停止。调低它，观察回声会在哪一步停下。'}</small>
      </label>
      {scenario.goals.length > 1 && (scenario.engineVersion ?? 1) >= 2 && <div className="goal-order">
        <div className="section-label">04 / 伙伴先处理哪个目标？</div>
        {order.map((fact, index) => <div key={fact}>
          <span>{index + 1}. {scenario.goals.find(g => g.fact === fact)?.label}</span>
          <button className="text-button" disabled={index === 0} onClick={() => {
            const next = [...order]; [next[index - 1], next[index]] = [next[index], next[index - 1]];
            setBuild({...build, goalOrder: next});
          }}>提前</button>
        </div>)}
        <small>顺序会改变资源消耗；完成条件仍须全部验收。</small>
      </div>}
      {(scenario.engineVersion ?? 1) >= 3 && scenario.operations.some(operation=>operation.protocol) && <div className="protocol-presets">
        <div className="section-label">{scenario.goals.length>1?"05":"04"} / 保存法器刻度</div>
        <p className="muted">伙伴自动决定行动时，会使用这里保存的实际参数。错误预设仍会产生真实的参数错误。</p>
        {scenario.operations.filter(operation=>operation.protocol?.parameters.length).map(operation=><details key={operation.id}><summary>{operation.label} · 参数预设</summary>
          <ParameterEditor protocol={operation.protocol!} value={build.toolArguments?.[operation.id]??operation.protocol!.defaults} prefix={`preset-${operation.id}`}
            onChange={value=>setBuild({...build,toolArguments:{...build.toolArguments,[operation.id]:value}})}/>
        </details>)}
        <button role="switch" aria-checked={build.stableRequestKeys??false} className="switch-row" onClick={()=>setBuild({...build,stableRequestKeys:!build.stableRequestKeys})}>
          <Repeat2/><span><strong>重试保留同一业务凭证</strong><small>当前每种操作代表一笔业务。自动重试保留凭证；参数改变会触发冲突，需要你介入。</small></span><i className={build.stableRequestKeys?'switch on':'switch'}/>
        </button>
      </div>}
      {(scenario.engineVersion??1)>=4&&<div className="loop-controls">
        <div className="section-label">回路保险 · 决定什么时候停</div>
        <label>每次派遣最多调用 <strong>{build.loopPolicy?.maxCalls??8} 次</strong><input aria-label="调用次数上限" type="range" min="1" max="24" value={build.loopPolicy?.maxCalls??8} onChange={event=>setBuild({...build,loopPolicy:{maxCalls:Number(event.target.value),maxRetries:build.loopPolicy?.maxRetries??0,permanentFailure:build.loopPolicy?.permanentFailure??'stop'}})}/></label>
        <label>短暂故障的额外重试 <select aria-label="短暂故障重试上限" value={build.loopPolicy?.maxRetries??0} onChange={event=>setBuild({...build,loopPolicy:{maxCalls:build.loopPolicy?.maxCalls??8,maxRetries:Number(event.target.value),permanentFailure:build.loopPolicy?.permanentFailure??'stop'}})}>{[0,1,2,3,4].map(number=><option key={number} value={number}>{number} 次</option>)}</select></label>
        <label>需要改方案的故障 <select aria-label="永久故障处理" value={build.loopPolicy?.permanentFailure??'stop'} onChange={event=>setBuild({...build,loopPolicy:{maxCalls:build.loopPolicy?.maxCalls??8,maxRetries:build.loopPolicy?.maxRetries??0,permanentFailure:event.target.value as 'stop'|'repair'}})}><option value="stop">停下来，交给我</option><option value="repair">依据已收到的条件寻找修复步骤</option></select></label>
        <p className="muted">调用上限、能量预算与重试次数分别约束不同的成本。暂停和换装会保留现场；不会退回已经消耗的能量。</p>
      </div>}
      {scenario.engineVersion===7&&<div className="loop-controls">
        <div className="section-label">资料边界 · 谁能提出命令？</div>
        <label>资料中的指令 <select aria-label="资料指令策略" value={build.instructionPolicy??'data-only'} onChange={e=>setBuild({...build,instructionPolicy:e.target.value as 'data-only'|'follow-documents'})}><option value="data-only">只提取任务数据</option><option value="follow-documents">实验：遵从资料附带的指令</option></select></label>
        <p className="muted">提取地址不必服从页脚的命令。这是可观察的教学策略；执行器的权限检查始终独立。</p>
        <details className="permissions"><summary>逐件法器权限</summary>{tools.map(({id,name})=>{const choices=[...new Set((id==='observe'?scenario.observations:scenario.operations).map(o=>o.target))];const allowed=build.toolPermissions?.[id]??build.permissions;return <fieldset key={id}><legend>{name}</legend>{choices.map(t=><label key={t}><input type="checkbox" aria-label={`${name}访问：${targetName(t)}`} checked={allowed.includes('*')||allowed.includes(t)} onChange={e=>{const prior=allowed.includes('*')?choices:allowed;setBuild({...build,toolPermissions:{...build.toolPermissions,[id]:e.target.checked?[...prior,t]:prior.filter(x=>x!==t)}});}}/>{targetName(t)}</label>)}</fieldset>;})}</details>
      </div>}
      <details className="permissions">
        <summary>
          访问范围 ·{" "}
          {build.permissions.includes("*")
            ? "本委托所有虚拟目标"
            : `${build.permissions.length} 个目标`}
        </summary>
        <p>契约只允许操作当前游戏世界，不涉及设备文件。</p>
        {targets.map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={
                build.permissions.includes("*") || build.permissions.includes(t)
              }
              onChange={(e) => {
                const current = build.permissions.includes("*")
                  ? targets
                  : build.permissions;
                setBuild({
                  ...build,
                  permissions: e.target.checked
                    ? [...current, t]
                    : current.filter((x) => x !== t),
                });
              }}
            />
            {targetName(t)}
          </label>
        ))}
      </details>
      <div className="build-flow">
        <span>委托</span>
        <ArrowRight />
        <span>观察</span>
        <ArrowRight />
        <span>行动</span>
        <ArrowRight />
        <span className={build.feedback ? "connected" : ""}>回执</span>
        <ArrowRight />
        <span className={build.verification ? "connected" : ""}>验收</span>
      </div>
      {errors.length > 0 && <div className="notice" role="alert">{errors.join('；')}</div>}
      <button className="button primary full" disabled={errors.length > 0} onClick={() => onApply(build)}>
        签订契约，返回冒险 <ArrowRight size={17} />
      </button>
      <p className="fine-print">
        教学策略模拟 · 装配影响实际执行规则，不会提升隐藏的“智力数值”。
      </p>
    </div>
  );
}
