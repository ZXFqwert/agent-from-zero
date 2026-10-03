import { useState } from 'react';
import { Archive, GitBranch, ScrollText } from 'lucide-react';
import { reduceGame } from '../engine';
import { savedSkillEvidence } from '../engine/memory';
import type { GameAction, GameState, ScenarioDefinition } from '../engine';
import { factLabels } from '../content/scenarios';
import { displayFact,displaySource } from '../content/presentation';
export type ArchiveInput=Omit<Extract<GameAction,{type:'memory'}>,'id'>|Omit<Extract<GameAction,{type:'session'}>,'id'>|Omit<Extract<GameAction,{type:'skill'}>,'id'>;
export default function ArchiveDeck({state,scenario,busy,onChange}:{state:GameState;scenario:ScenarioDefinition;busy:boolean;onChange:(input:ArchiveInput)=>Promise<unknown>}){
  const [selected,setSelected]=useState<Record<string,string>>({}),[error,setError]=useState('');
  if(!state.memory||!state.sessions||!scenario.memory)return null;
  const disabled=busy||state.status==='won';
  const change=(input:ArchiveInput)=>{
    // Running a skill may first resume the saved controller through the parent.
    if(!(input.type==='skill'&&input.operation==='run')&&reduceGame(scenario,state,{...input,id:'archive-preview'})===state){setError('当前材料或记录不支持这个动作。保存要选择实际读取的原资料；技能要先成功执行对应步骤；会话最多八段。未扣资源，未改变现场。');return;}
    setError('');void onChange(input);
  };
  const memory=state.memory,sessions=state.sessions;
  return <section className="archive-deck" aria-label="记忆与会话工坊">
    <div className="section-label"><GitBranch size={16}/>会话树 <strong>{sessions.branches.find(b=>b.id===sessions.activeId)!.label}</strong></div>
    <p className="muted">会话只保存材料。换会话不会撤销发货、重置能量、修改权限。持久档案仍留在柜里。</p>
    <div className="button-row"><button className="button" disabled={disabled||sessions.branches.length>=8} onClick={()=>change({type:'session',operation:'fresh'})}>打开空白会话</button><button className="button" disabled={disabled||sessions.branches.length>=8} onClick={()=>change({type:'session',operation:'fork'})}>分出会话</button></div>
    <div className="session-list">{sessions.branches.map((b,i)=><button key={b.id} className={`text-button ${b.id===sessions.activeId?'chosen-summary':''}`} disabled={disabled||b.id===sessions.activeId} onClick={()=>change({type:'session',operation:'switch',branchId:b.id})}>{b.id===sessions.activeId?'当前':'恢复'}：{b.label} · {i+1}</button>)}</div>
    {scenario.memory.slots.length>0&&<><div className="section-label"><Archive size={16}/>持久档案 <small>本冒险保存 · 跨会话留存</small></div><p className="muted">保存不会改变当前卷轴或模型权重。修订保留旧版，检索仍须装卷；过期内容也可能被完整保存。</p>
    {scenario.memory.slots.map(slot=>{
      const entries=memory.entries.filter(e=>e.key===slot.key),active=entries.find(e=>e.status==='active');
      const cards=state.context!.records.filter(r=>!r.origin&&slot.observationIds.includes(r.observationId));
      const recordId=cards.find(c=>c.id===selected[slot.key])?.id??cards.at(-1)?.id??'';
      return <article className="document-card" aria-label={`档案：${slot.label}`} key={slot.key}><h4>{slot.label}</h4>
        <label>保存来源<select aria-label={`保存来源：${slot.label}`} value={recordId} disabled={disabled} onChange={e=>setSelected({...selected,[slot.key]:e.target.value})}><option value="">先读取现场资料</option>{[...cards].reverse().map(r=><option key={r.id} value={r.id}>{r.label} · 读取 {r.eventId.split(':').at(-1)}</option>)}</select></label>
        <div className="button-row"><button className="button" disabled={disabled||!recordId} onClick={()=>change({type:'memory',operation:active?'revise':'write',key:slot.key,recordId})}>{active?'修订档案':'保存档案'} · {slot.label}</button><button className="button primary" disabled={disabled||!active} onClick={()=>change({type:'memory',operation:'recall',key:slot.key})}>检索记忆 · {slot.label}</button></div>
        {[...entries].reverse().map(e=><div className={`memory-version ${e.status==='retired'?'retired':''}`} key={e.id}><strong>v{e.revision} · {e.status==='active'?'可检索':'已停用'}</strong><small>{displaySource(e.source)}</small><div className="live-facts">{Object.entries(e.facts).map(([f,v])=><span key={f}>{factLabels[f]??f}：{displayFact(f,v)}</span>)}</div>{e.status==='active'&&<button className="text-button" disabled={disabled} onClick={()=>change({type:'memory',operation:'retire',key:slot.key})}>停用记忆 · {slot.label}</button>}</div>)}
      </article>;
    })}</>}
    {scenario.memory.skills.length>0&&<><div className="section-label"><ScrollText size={16}/>流程书 <small>指令复用 · 每次实际执行</small></div>{scenario.memory.skills.map(skill=>{
      const saved=memory.skills.find(s=>s.id===skill.id),queue=memory.queue?.skillId===skill.id?memory.queue:undefined;
      const applicable=Object.entries(skill.applicability).every(([f,v])=>state.observed[f]?.value===v);
      const equipped=skill.steps.every(c=>state.blueprint.tools.includes(c.tool))&&state.blueprint.feedback;
      return <article className="document-card" aria-label={`流程：${skill.label}`} key={skill.id}><h4>{skill.label} {saved&&<span>· 已保存</span>}</h4><p>{skill.description}</p><div className="live-facts">{Object.entries(skill.applicability).map(([f,v])=><span key={f}>适用：{factLabels[f]??f} = {displayFact(f,v)}</span>)}</div>
        <ol className="skill-steps">{skill.steps.map((call,i)=><li key={i}>{call.tool==='operate'?scenario.operations.find(o=>o.id===call.operationId)!.label:call.tool==='observe'?scenario.observations.find(o=>o.id===call.observationId)!.label:`验收：${scenario.goals.find(g=>g.fact===call.fact)!.label}`}</li>)}</ol>
        {saved?<small>{saved.source}</small>:<small>先按顺序成功执行这些实际调用，再保存。本章使用固定配方，不能把一段宣称当作成功流程。</small>}
        <div className="button-row">{!saved&&<button className="button" disabled={disabled||!savedSkillEvidence(scenario,state,skill.id)} onClick={()=>change({type:'skill',operation:'save',skillId:skill.id})}>保存流程 · {skill.label}</button>}{saved&&!queue&&<button className="button primary" disabled={disabled||!applicable||!equipped||Boolean(memory.queue)} onClick={()=>change({type:'skill',operation:'run',skillId:skill.id})}>执行流程 · {skill.label}</button>}{queue&&<button className="button" disabled={disabled} onClick={()=>change({type:'skill',operation:'cancel',skillId:skill.id})}>取消剩余流程 · {skill.label}</button>}</div>
        {saved&&!applicable&&<p className="notice">当前卷轴不满足这个流程的适用条件。先取得并携带输入。</p>}
        {queue&&<p className="notice" aria-live="polite">{queue.status==='failed'?'失败停止':'等待下一步'}：已执行 {queue.cursor} / {skill.steps.length} 步。点击“伙伴决定一步”实际推进；暂停与刷新保留位置。</p>}
      </article>;
    })}</>}
    {error&&<p className="notice" role="alert">{error}</p>}
  </section>;
}
