import { useState } from 'react';
import { Eye, Wrench, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import { getToolCost } from '../engine';
import { factLabels } from '../content/scenarios';
import { displayActionLabel, displayFact } from '../content/presentation';
import type { FactMap, GameState, ScenarioDefinition, ToolCall, ToolName } from '../engine';
import ParameterEditor from './ParameterEditor';

const abilities = [
  {id:'observe' as const, label:'观察', Icon:Eye},
  {id:'operate' as const, label:'行动', Icon:Wrench},
  {id:'verify' as const, label:'验收', Icon:ShieldCheck},
];
export default function CommandDeck({state, scenario, busy, onCall, onStep, onWorkshop, onReceive}: {
  state:GameState; scenario:ScenarioDefinition; busy:boolean;
  onCall:(call:ToolCall)=>Promise<unknown>; onStep:()=>Promise<unknown>; onWorkshop:()=>void;
  onReceive:(callId:string,receiptId:string)=>Promise<unknown>;
}) {
  const [ability,setAbility] = useState<ToolName>(state.blueprint.tools[0] ?? 'observe');
  const [selected,setSelected] = useState<string>('');
  const [argumentsById,setArgumentsById]=useState<Record<string,FactMap>>({});
  const [keys,setKeys]=useState<Record<string,string>>({});
  const [request,setRequest]=useState('');
  const [receiptId,setReceiptId]=useState('');
  const [receiptError,setReceiptError]=useState('');
  const pending=state.protocol?.receipts.filter(receipt=>!receipt.collected)??[];
  const priorRequests=state.events.filter(event=>event.type==='request'&&event.operationId===selected&&event.requestKey);
  const remembered=priorRequests.filter((event,index)=>priorRequests.findIndex(other=>other.requestKey===event.requestKey)===index);
  const options = ability === 'observe'
    ? scenario.observations.map(o=>({id:o.id, label:o.label, call:{tool:'observe',observationId:o.id} as ToolCall, facts:o.facts}))
    : ability === 'operate'
      ? scenario.operations.map(o=>({id:o.id,label:o.label,call:{tool:'operate',operationId:o.id} as ToolCall,facts:Object.keys(o.effects)}))
      : scenario.goals.map(g=>({id:g.fact,label:g.label,call:{tool:'verify',fact:g.fact} as ToolCall,facts:[g.fact]}));
  const chosen=options.find(o=>o.id === selected);
  const operation=ability==='operate'?scenario.operations.find(o=>o.id===selected):undefined;
  const args=operation?.protocol?(argumentsById[selected]??state.blueprint.toolArguments?.[selected]??operation.protocol.defaults):undefined;
  const requestKey=keys[selected]??(state.blueprint.stableRequestKeys?`auto-order/${scenario.operations.findIndex(operation=>operation.id===selected)+1}`:'');
  const call:ToolCall|undefined=chosen?.call.tool==='operate'&&operation?.protocol?{...chosen.call,arguments:{...args},...(requestKey.trim()?{requestKey:requestKey.trim()}:{})}:chosen?.call;
  const cost=chosen ? getToolCost(scenario,chosen.call) : 0;
  const failureCost=chosen?.call.tool === 'operate' ? scenario.operations.find(o=>o.id === (chosen.call as Extract<ToolCall,{tool:'operate'}>).operationId)?.failureCost : undefined;
  const mission=state.runtime?.missionRemaining ?? Infinity;
  const equipped=state.blueprint.tools.includes(ability);
  const latest=state.events.filter(e=>['observation','result','verified','world-change','exhausted','blocked'].includes(e.type)).at(-1);
  const notice=state.events.filter(event=>event.type==='untrusted-message').at(-1);
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
    {operation?.protocol&&<div className="protocol-form"><h4>填写法器刻度</h4>
      <ParameterEditor protocol={operation.protocol} value={args!} prefix="command" disabled={busy} onChange={value=>setArgumentsById({...argumentsById,[selected]:value})}/>
      <label>业务凭证 <small>同一笔业务重试保留；另一笔业务另填。</small><input aria-label="业务凭证" maxLength={64} value={requestKey} placeholder="可留空，例如 medicine-17" onChange={event=>setKeys({...keys,[selected]:event.target.value})}/></label>
      <code>{JSON.stringify(args)}</code><small>调用编号由系统每次分配。业务凭证由你决定，两者用途不同。</small>
      {remembered.length>0&&<div className="remembered-keys"><small>从你自己的请求记录找回参数。记录本身不证明现场已执行。</small>{remembered.map(event=><button className="text-button" key={event.id} onClick={()=>{setKeys({...keys,[selected]:event.requestKey!});setArgumentsById({...argumentsById,[selected]:{...event.arguments}});}}>找回凭证：{event.requestKey}</button>)}</div>}
    </div>}
    <div className="button-row">
      <button className="button" disabled={busy||state.status==='won'||mission<=0} onClick={()=>void onStep()}>伙伴决定一步</button>
      <button className="button primary" disabled={!chosen||!equipped||busy||mission<cost||state.status==='won'}
        onClick={()=>call&&void onCall(call)}>执行选中法器{chosen?` · ${cost} 点`:''}</button>
    </div>
    {pending.length>0&&<div className="receipt-desk"><h4>风管回执台 · {pending.length} 张待归档</h4><p>回执按到达顺序摆放。把每张回执放回它对应的请求；编号不符就不入卷轴。</p>
      <label>选择原请求<select aria-label="原请求编号" value={request} onChange={event=>{setRequest(event.target.value);setReceiptError('');}}><option value="">先选请求</option>{pending.map(receipt=><option key={receipt.callId} value={receipt.callId}>{scenario.operations.find(o=>o.id===receipt.operationId)?.label} · {receipt.callId.split(':').at(-1)}</option>)}</select></label>
      <div className="receipt-cards">{[...pending].reverse().map(receipt=><button className={`receipt-card ${receiptId===receipt.id?'selected':''}`} key={receipt.id} disabled={busy} onClick={()=>{setReceiptId(receipt.id);setReceiptError('');}}><strong>{receipt.text}</strong><code>{receipt.callId}</code><small>选择这张回执</small></button>)}</div>
      {receiptError&&<p className="notice" role="alert">{receiptError}</p>}
      <button className="button primary full" disabled={!request||!receiptId||busy||!state.blueprint.feedback} onClick={()=>{
        const receipt=pending.find(receipt=>receipt.id===receiptId);
        if(receipt?.callId!==request){setReceiptError('编号不符，回执未入卷轴，未扣资源。请逐字比较请求与回执上的编号。');return;}
        void onReceive(request,receiptId).then(()=>{setRequest('');setReceiptId('');});
      }}>按编号归档 · 不耗能量</button>
      {!state.blueprint.feedback&&<p className="notice">先在工坊接通反馈，回声才能收到这些结果。</p>}
    </div>}
    {latest&&<div className="callout" aria-live="polite"><h4>{latest.type==='world-change'?'现场变化':latest.type==='untrusted-message'?'收到一份外部报告':'最近回响'}</h4><p>{latest.text}</p>{latest.facts&&<div className="live-facts">{Object.entries(latest.facts).map(([fact,value])=><span key={fact}>{factLabels[fact]??fact}：{displayFact(fact,value)}</span>)}</div>}</div>}
    {notice&&<div className="callout untrusted-note"><h4>外部纸条 · 未经核验</h4><p>{notice.text}</p><small>它是资料中的宣称，未替代现场事实，也未进入回声的已知信息。</small></div>}
  </div>;
}
