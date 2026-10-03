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
      ?.label.replace(/查看|检查|侦察/, "") ?? target;
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
            {scenario.engineVersion === 2 && <small className="tool-cost">通常消耗 {scenario.limits?.toolCosts?.[id] ?? 1} 能量</small>}
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
          <Zap size={12} /> {scenario.engineVersion === 2 ? `任务余量 ${state.runtime?.missionRemaining ?? scenario.limits?.missionBudget} 能量` : '每个工具请求消耗 1 点'}
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
        <small>{scenario.engineVersion === 2 ? '单次预算只决定何时停下来。任务总能量用完后，须回到整个委托的起点重试。' : '用尽即停止。调低它，观察回声会在哪一步停下。'}</small>
      </label>
      {scenario.goals.length > 1 && scenario.engineVersion === 2 && <div className="goal-order">
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
