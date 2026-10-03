import { useState } from 'react';
import { Archive, BookOpen, Scissors } from 'lucide-react';
import { reduceGame } from '../engine';
import { contextUnits } from '../engine/v5';
import type { GameAction, GameState, ScenarioDefinition } from '../engine';
import { factLabels } from '../content/scenarios';
import { displayFact } from '../content/presentation';
export type ContextInput=Omit<Extract<GameAction,{type:'context'}>,'id'>;
export default function ContextDeck({state,scenario,busy,onChange}:{state:GameState;scenario:ScenarioDefinition;busy:boolean;onChange:(action:ContextInput)=>Promise<unknown>}) {
  const [error,setError]=useState('');
  if(!state.context)return null;
  const context=state.context;
  const change=(action:ContextInput)=>{
    if(reduceGame(scenario,state,{...action,id:'context-ui-preview'})===state){setError('这个选择超过卷轴容量，或与当前状态不符。请先移出一份资料，或选择保留必要字段的摘要。未改变卷轴，未扣资源。');return;}
    setError('');void onChange(action);
  };
  return <section className="context-deck" aria-label="卷轴台">
    <div className="section-label"><BookOpen size={16}/>当前卷轴 <strong>{contextUnits(scenario,state)} / {context.capacity} 格</strong></div>
    <p className="muted">只把本轮需要的资料交给回声。格数是教学单位；真实模型按 token 计量，字数与 token 不能直接等同。</p>
    {context.records.length===0?<p className="notice">先用观察法器检索资料。它们会进入下面的档案；再由你决定携带什么。</p>:<div className="document-list">{[...context.records].reverse().map(card=>{
      const active=context.activeIds.includes(card.id),definition=scenario.observations.find(o=>o.id===card.observationId)!;
      const summary=definition.document?.summaries?.find(s=>s.id===card.summaryId);
      return <article aria-label={`${card.label} · 读取事件 ${card.eventId.split(':').at(-1)}`} className={`document-card ${active?'in-context':''}`} key={card.id}>
        <div className="document-heading"><Archive size={16}/><strong>{card.label.replace('检索：','')}</strong><span>{summary?.units??card.units} 格</span></div>
        <small>{card.source} · 读取事件 {card.eventId.split(':').at(-1)} · {active?'本轮携带':'仅在档案'}</small>
        <p>{card.text}</p>
        <div className="live-facts">{Object.entries(card.facts).map(([fact,value])=><span className={summary&&!summary.retain.includes(fact)?'omitted':''} key={fact}>{summary&&!summary.retain.includes(fact)?'已省略：':''}{factLabels[fact]??fact}：{displayFact(fact,value)}</span>)}</div>
        <button className={`button ${active?'':'primary'}`} disabled={busy||state.status==='won'} onClick={()=>change({type:'context',recordId:card.id,operation:active?'exclude':'include'})}>{active?'移回档案':'装入卷轴'} · {card.label.replace('检索：','')}</button>
        {definition.document?.summaries&&<details className="summary-options"><summary><Scissors size={13}/> {summary?`当前摘要：${summary.label}`:'压缩这份资料'}</summary>
          {definition.document.summaries.map(s=><button className={`text-button ${s.id===card.summaryId?'chosen-summary':''}`} disabled={busy||s.id===card.summaryId||state.status==='won'} key={s.id} onClick={()=>change({type:'context',recordId:card.id,operation:'summarize',summaryId:s.id})}>{s.label} · {s.units} 格</button>)}
          {summary&&<button className="text-button" disabled={busy||state.status==='won'} onClick={()=>change({type:'context',recordId:card.id,operation:'expand'})}>恢复原文 · {card.units} 格</button>}
          <small>原件保留在档案。被摘要省略的字段不进入本轮上下文；摘要不会创造新事实。</small>
        </details>}
      </article>;
    })}</div>}
    {error&&<p role="alert" className="notice">{error}</p>}
    <details className="working-reply"><summary>最新工具回响 · 独立工作栏</summary><p>只保留最近一条实际收到的工具结果。更早的结果留在事件记录；需要时重新检索原记录。</p>{context.reply?<div className="live-facts">{Object.entries(context.reply.facts).map(([f,v])=><span key={f}>{factLabels[f]??f}：{displayFact(f,v)}</span>)}</div>:<small>尚无工具回响</small>}</details>
  </section>;
}
