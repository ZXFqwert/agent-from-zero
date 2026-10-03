import { useState } from 'react';
import { Eye, Wrench, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import { getToolCost } from '../engine';
import { factLabels } from '../content/scenarios';
import { displayActionLabel, displayFact } from '../content/presentation';
import type { GameState, ScenarioDefinition, ToolCall, ToolName } from '../engine';

const abilities = [
  {id:'observe' as const, label:'观察', Icon:Eye},
  {id:'operate' as const, label:'行动', Icon:Wrench},
  {id:'verify' as const, label:'验收', Icon:ShieldCheck},
];
export default function CommandDeck({state, scenario, busy, onCall, onStep, onWorkshop}: {
  state:GameState; scenario:ScenarioDefinition; busy:boolean;
  onCall:(call:ToolCall)=>Promise<unknown>; onStep:()=>Promise<unknown>; onWorkshop:()=>void;
}) {
  const [ability,setAbility] = useState<ToolName>(state.blueprint.tools[0] ?? 'observe');
  const [selected,setSelected] = useState<string>('');
  const options = ability === 'observe'
    ? scenario.observations.map(o=>({id:o.id, label:o.label, call:{tool:'observe',observationId:o.id} as ToolCall, facts:o.facts}))
    : ability === 'operate'
      ? scenario.operations.map(o=>({id:o.id,label:o.label,call:{tool:'operate',operationId:o.id} as ToolCall,facts:Object.keys(o.effects)}))
      : scenario.goals.map(g=>({id:g.fact,label:g.label,call:{tool:'verify',fact:g.fact} as ToolCall,facts:[g.fact]}));
  const chosen=options.find(o=>o.id === selected);
  const cost=chosen ? getToolCost(scenario,chosen.call) : 0;
  const failureCost=chosen?.call.tool === 'operate' ? scenario.operations.find(o=>o.id === (chosen.call as Extract<ToolCall,{tool:'operate'}>).operationId)?.failureCost : undefined;
  const mission=state.runtime?.missionRemaining ?? Infinity;
  const equipped=state.blueprint.tools.includes(ability);
  const latest=state.events.filter(e=>['observation','result','verified','world-change','untrusted-message','exhausted','blocked'].includes(e.type)).at(-1);
  return <div className="command-deck">
    <p className="muted">你来决定下一步，回声只携带已经收到的信息。先选能力，再选现场目标。</p>
    <div className="segmented ability-tabs">
      {abilities.map(({id,label,Icon})=><button key={id} className={ability===id?'active':''}
        onClick={()=>{setAbility(id);setSelected('');}}><Icon size={17}/>{label}{!state.blueprint.tools.includes(id)&&<small>未装备</small>}</button>)}
    </div>
    {!equipped&&<div className="notice">回声没有携带这件法器。<button className="text-button" onClick={onWorkshop}>去工坊换装 <ArrowRight size={14}/></button></div>}
    <div className="target-grid">
      {options.map(o=><button key={o.id} className={`target-card ${selected===o.id?'selected':''}`}
        disabled={!equipped||busy} onClick={()=>setSelected(o.id)}>
        <strong>{displayActionLabel(o.label)}</strong><span><Zap size={12}/>{getToolCost(scenario,o.call)} 能量</span>
        <small>{o.facts.some(f=>state.observed[f])?'卷轴中已有相关信息':'卷轴中尚无相关信息'}</small>
      </button>)}
    </div>
    {chosen&&<div className="action-preview"><span>{displayActionLabel(chosen.label)}</span><strong>{failureCost?`成功 ${cost} / 失败 ${failureCost}`:`${cost} 能量`}</strong>
      <small>任务剩余 {Number.isFinite(mission)?mission:state.budgetRemaining}；当前派遣剩余 {state.budgetRemaining}</small></div>}
    <div className="button-row">
      <button className="button" disabled={busy||state.status==='won'||mission<=0} onClick={()=>void onStep()}>伙伴决定一步</button>
      <button className="button primary" disabled={!chosen||!equipped||busy||mission<cost||state.status==='won'}
        onClick={()=>chosen&&void onCall(chosen.call)}>执行选中法器{chosen?` · ${cost} 点`:''}</button>
    </div>
    {latest&&<div className="callout" aria-live="polite"><h4>{latest.type==='world-change'?'现场变化':latest.type==='untrusted-message'?'收到一份外部报告':'最近回响'}</h4><p>{latest.text}</p>{latest.facts&&<div className="live-facts">{Object.entries(latest.facts).map(([fact,value])=><span key={fact}>{factLabels[fact]??fact}：{displayFact(fact,value)}</span>)}</div>}</div>}
  </div>;
}
