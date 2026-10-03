import { documentProvenance } from './security';
import type { FactMap, GameAction, GameEvent, GameState, ScenarioDefinition, ToolCall } from './types';
type Emit=(state:GameState,event:Omit<GameEvent,'id'|'sequence'|'attempt'>)=>GameEvent;
export type ArchiveAction=Extract<GameAction,{type:'memory'|'session'|'skill'}>;
const sameCall=(a:ToolCall,b:ToolCall)=>JSON.stringify(a)===JSON.stringify(b);
const factsValid=(facts:FactMap,known:FactMap)=>Boolean(facts)&&typeof facts==='object'&&!Array.isArray(facts)&&Object.entries(facts).every(([key,value])=>Object.hasOwn(known,key)&&['string','number','boolean'].includes(typeof value)&&(typeof value!=='number'||Number.isFinite(value))&&(typeof value!=='string'||value.length<=1000));
export function validateMemoryScenario(s:ScenarioDefinition):string[]{
  const errors:string[]=[];const config=s.memory;
  if(!config||!Array.isArray(config.slots)||!Array.isArray(config.initial)||!Array.isArray(config.skills))return ['记忆关卡须声明档案槽、旧记忆与技能配方。'];
  const ids=(values:string[])=>new Set(values).size===values.length&&values.every(v=>/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(v));
  if(config.slots.length>16||!ids(config.slots.map(x=>x.key)))errors.push('档案槽标识重复或过多。');
  for(const slot of config.slots)if(!slot.label||!Array.isArray(slot.observationIds)||!slot.observationIds.length||slot.observationIds.some(id=>!s.observations.some(o=>o.id===id)))errors.push('档案槽缺少来源范围。');
  if(!ids(config.initial.map(x=>x.key)))errors.push('旧记忆重复。');
  for(const seed of config.initial){const source=s.observations.find(o=>o.id===seed.observationId);if(!source||!config.slots.some(slot=>slot.key===seed.key&&slot.observationIds.includes(seed.observationId))||!seed.source||!factsValid(seed.facts,s.initialWorld)||Object.keys(seed.facts).some(f=>!source.facts.includes(f)))errors.push('旧记忆必须有可追溯资料与合法字段。');}
  if(!ids(config.skills.map(x=>x.id))||config.skills.length>8)errors.push('技能标识重复或过多。');
  for(const skill of config.skills){
    if(!skill.label||!skill.description||!factsValid(skill.applicability,s.initialWorld)||!Array.isArray(skill.steps)||!skill.steps.length||skill.steps.length>16)errors.push('技能必须声明适用条件和有限步骤。');
    for(const call of skill.steps??[]){const valid=call.tool==='operate'?s.operations.some(o=>o.id===call.operationId):call.tool==='observe'?s.observations.some(o=>o.id===call.observationId):call.tool==='verify'?s.goals.some(g=>g.fact===call.fact):false;if(!valid||Object.keys(call).some(k=>!['tool','operationId','observationId','fact'].includes(k)))errors.push('技能步骤须为已声明的虚拟工具调用。');}
  }
  if(config.initialSkills?.some(id=>!config.skills.some(x=>x.id===id)))errors.push('未知初始技能。');
  for(const o of s.observations)if(o.availableWhen&&!factsValid(o.availableWhen,s.initialWorld))errors.push('资料开放条件引用未知事实。');
  for(const o of s.operations){
    if(o.memoryRequires?.some(key=>!config.slots.some(x=>x.key===key)))errors.push('操作引用未知档案槽。');
    if(o.sessionRequires&&Object.entries(o.sessionRequires).some(([k,v])=>k==='activeId'?v!=='session-1':k==='activeKind'?!['fresh','fork','initial'].includes(String(v)):!['fresh','restored','forks'].includes(k)||!Number.isInteger(v)||Number(v)<1||Number(v)>7))errors.push('会话条件须为真实变换次数、初始会话身份或明确的会话来源。');
    if(o.skillRequires&&(!config.skills.some(x=>x.id===o.skillRequires!.skillId)||(o.skillRequires.afterOperationId&&!s.operations.some(x=>x.id===o.skillRequires!.afterOperationId))))errors.push('操作引用未知技能或试验起点。');
  }
  if(s.transferRequirement?.memoryKeys?.some(key=>!config.slots.some(x=>x.key===key))||s.transferRequirement?.skillIds?.some(id=>!config.skills.some(x=>x.id===id))||(s.transferRequirement?.freshSessions!==undefined&&(!Number.isInteger(s.transferRequirement.freshSessions)||s.transferRequirement.freshSessions<1||s.transferRequirement.freshSessions>7)))errors.push('记忆迁移要求不正确。');
  return errors;
}
export function initializeMemory(s:ScenarioDefinition,state:GameState):void{
  state.memory={entries:s.memory!.initial.map(seed=>{const o=s.observations.find(x=>x.id===seed.observationId)!;return {...structuredClone(seed),id:`${s.id}:legacy:${seed.key}`,label:s.memory!.slots.find(x=>x.key===seed.key)!.label,units:o.document!.units,revision:1,status:'active',provenance:documentProvenance(s,seed.observationId,'live')};}),skills:(s.memory!.initialSkills??[]).map(id=>({id,source:'阿芙保存的旧流程 · 尚未在本任务验证',actionIds:[]})),runs:[]};
  state.sessions={activeId:'session-1',branches:[{id:'session-1',label:'初始会话',context:structuredClone(state.context!)}],fresh:0,restored:0,forks:0};
}
export function savedSkillEvidence(s:ScenarioDefinition,state:GameState,skillId:string):string[]|null{
  const skill=s.memory!.skills.find(x=>x.id===skillId);if(!skill)return null;
  const requests=state.events.filter(e=>e.type==='request').slice(-skill.steps.length);
  if(requests.length!==skill.steps.length||requests.some(e=>e.realm!==state.security!.realm))return null;
  const ids:string[]=[];
  for(const [i,e]of requests.entries()){
    const call:ToolCall=e.tool==='observe'?{tool:'observe',observationId:s.observations.find(o=>o.target===e.target)!.id}:e.tool==='operate'?{tool:'operate',operationId:e.operationId!}:{tool:'verify',fact:skill.steps[i].tool==='verify'?skill.steps[i].fact:''};
    if(!sameCall(call,skill.steps[i])||!state.events.some(r=>r.callId===e.callId&&['observation','result','verified'].includes(r.type)&&r.success))return null;
    // Verify the exact authored goal rather than inferring it from an arbitrary call target.
    if(e.tool==='verify'&&!state.events.some(r=>r.callId===e.callId&&r.type==='verified'&&r.facts&&Object.hasOwn(r.facts,(skill.steps[i] as Extract<ToolCall,{tool:'verify'}>).fact)))return null;
    ids.push(e.actionId!);
  }return ids;
}
export function validArchiveAction(s:ScenarioDefinition,state:GameState,a:ArchiveAction):boolean{
  if(!state.memory||!state.sessions||state.status==='won')return false;
  if(a.type==='memory'){
    if(!['write','revise','retire','recall'].includes(a.operation)||typeof a.key!=='string')return false;
    const slot=s.memory!.slots.find(x=>x.key===a.key),entry=state.memory.entries.find(x=>x.key===a.key&&x.status==='active');if(!slot)return false;
    if(a.operation==='retire'||a.operation==='recall')return Boolean(entry)&&a.recordId===undefined;
    const card=state.context!.records.find(r=>r.id===a.recordId);
    return Boolean(card&&!card.origin&&slot.observationIds.includes(card.observationId)&&(a.operation==='revise'?entry:!entry));
  }
  if(a.type==='session'){
    if(!['fresh','fork','switch'].includes(a.operation))return false;
    if(a.operation==='switch')return a.label===undefined&&typeof a.branchId==='string'&&a.branchId!==state.sessions.activeId&&state.sessions.branches.some(b=>b.id===a.branchId);
    return a.branchId===undefined&&state.sessions.branches.length<8&&(a.label===undefined||(typeof a.label==='string'&&Boolean(a.label.trim())&&a.label.length<=40));
  }
  const skill=s.memory!.skills.find(x=>x.id===a.skillId);if(!skill||!['save','run','cancel'].includes(a.operation))return false;
  if(a.operation==='save')return !state.memory.skills.some(x=>x.id===a.skillId)&&savedSkillEvidence(s,state,a.skillId)!==null;
  if(a.operation==='cancel')return state.memory.queue?.skillId===a.skillId;
  return state.status==='running'&&getBudget(state)>0&&!state.memory.queue&&state.memory.skills.some(x=>x.id===a.skillId)&&state.blueprint.feedback&&skill.steps.every(c=>state.blueprint.tools.includes(c.tool))&&Object.entries(skill.applicability).every(([f,v])=>state.observed[f]?.value===v);
}
const getBudget=(state:GameState)=>Math.min(state.budgetRemaining,state.runtime!.missionRemaining);
export function applyArchiveAction(s:ScenarioDefinition,state:GameState,a:ArchiveAction,emit:Emit,rebuild:()=>void):void{
  state.runtime!.executionMode='manual';
  if(a.type==='memory'){
    const entry=state.memory!.entries.find(x=>x.key===a.key&&x.status==='active');
    if(a.operation==='recall'){
      const e=emit(state,{type:'memory-change',actionId:a.id,text:`检索到「${entry!.label}」第 ${entry!.revision} 版。它仍需装入卷轴，且可能已经过期。`,delivered:false});
      state.context!.records.push({id:e.id,observationId:entry!.observationId,label:`记忆：${entry!.label} · v${entry!.revision}`,source:entry!.source,text:'这是保存时的资料快照。检索不更新内容、不执行动作，也不改变模型权重。',eventId:e.id,facts:structuredClone(entry!.facts),units:entry!.units,origin:{kind:'memory',memoryId:entry!.id,revision:entry!.revision},provenance:structuredClone(entry!.provenance!)});
    }else if(a.operation==='retire'){
      entry!.status='retired';emit(state,{type:'memory-change',actionId:a.id,text:`「${entry!.label}」第 ${entry!.revision} 版已停用，来历保留。已经携带的旧副本不会自动删掉。`,delivered:false});
    }else{
      const card=state.context!.records.find(r=>r.id===a.recordId)!,summary=s.observations.find(o=>o.id===card.observationId)!.document!.summaries?.find(x=>x.id===card.summaryId);
      if(entry)entry.status='retired';
      const revision=Math.max(0,...state.memory!.entries.filter(x=>x.key===a.key).map(x=>x.revision))+1;
      state.memory!.entries.push({id:a.id,key:a.key,label:s.memory!.slots.find(x=>x.key===a.key)!.label,observationId:card.observationId,facts:Object.fromEntries(Object.entries(card.facts).filter(([f])=>!summary||summary.retain.includes(f))),units:summary?.units??card.units,source:`${card.source} · ${card.eventId}`,sourceActionId:a.id,revision,status:'active',provenance:structuredClone(card.provenance!)});
      emit(state,{type:'memory-change',actionId:a.id,text:`保存「${s.memory!.slots.find(x=>x.key===a.key)!.label}」第 ${revision} 版。它留在持久档案，未自动加入当前会话。`,delivered:false});
    }
  }else if(a.type==='session'){
    const sessions=state.sessions!,old=sessions.branches.find(b=>b.id===sessions.activeId)!;
    old.context=structuredClone(state.context!);delete state.memory!.queue;
    if(a.operation==='switch'){
      const next=sessions.branches.find(b=>b.id===a.branchId)!;sessions.activeId=next.id;state.context=structuredClone(next.context);sessions.restored++;
    }else{
      const id=`session-${sessions.branches.length+1}`,context=a.operation==='fork'?structuredClone(state.context!):{records:[],activeIds:[],capacity:state.context!.capacity};
      sessions.branches.push({id,label:a.label??(a.operation==='fork'?'分支会话':'空白会话'),parentId:old.id,context:structuredClone(context)});sessions.activeId=id;state.context=context;sessions[a.operation==='fork'?'forks':'fresh']++;
    }
    if(state.status==='running')state.status='paused';rebuild();
    emit(state,{type:'session-change',actionId:a.id,text:`${a.operation==='switch'?'恢复':a.operation==='fork'?'分出':'打开'}「${sessions.branches.find(b=>b.id===sessions.activeId)!.label}」。现场、权限、已用资源与调用次数保持；这不是世界回滚或沙箱。`,delivered:true});
  }else{
    const skill=s.memory!.skills.find(x=>x.id===a.skillId)!;
    if(a.operation==='save')state.memory!.skills.push({id:skill.id,source:'由你刚才成功执行的实际调用记录编成',actionIds:savedSkillEvidence(s,state,skill.id)!});
    if(a.operation==='run'){state.memory!.queue={skillId:skill.id,cursor:0,status:'running'};delete state.control!.lastFailure;}
    if(a.operation==='cancel')delete state.memory!.queue;
    emit(state,{type:'skill-change',actionId:a.id,text:`「${skill.label}」${a.operation==='save'?'已经保存；保存没有再次执行，也没有训练模型':a.operation==='run'?'进入执行队列；每一步仍需工具、权限、回执和预算':'已取消剩余步骤；已发生的动作保留'}。`,delivered:false});
  }
}
export function archivePrerequisites(s:ScenarioDefinition,state:GameState,operationId:string):boolean{
  const op=s.operations.find(o=>o.id===operationId)!;
  if(op.memoryRequires?.some(key=>{const entry=state.memory!.entries.find(e=>e.key===key&&e.status==='active');return !entry||!state.context!.activeIds.some(id=>{const c=state.context!.records.find(x=>x.id===id)!;return c.origin?.memoryId===entry.id&&c.origin.revision===entry.revision;});}))return false;
  const index=state.sessions!.branches.findIndex(b=>b.id===state.sessions!.activeId),history=state.runtime!.actionHistory;
  let start=0;history.forEach((a,i)=>{if(a.type==='reset')start=i+1;});
  const births=history.slice(start).filter(a=>a.type==='session'&&a.operation!=='switch') as Array<Extract<GameAction,{type:'session'}>>;
  const kind=index===0?'initial':births[index-1]?.operation;
  if(Object.entries(op.sessionRequires??{}).some(([k,n])=>k==='activeId'?state.sessions!.activeId!==n:k==='activeKind'?kind!==n:state.sessions![k as 'fresh'|'restored'|'forks']<Number(n)))return false;
  if(op.skillRequires){const after=op.skillRequires.afterOperationId?Math.max(0,...state.events.filter(e=>e.type==='result'&&e.operationId===op.skillRequires!.afterOperationId&&e.success&&e.realm===state.security!.realm).map(e=>e.sequence)):0;if(!state.memory!.runs.some(r=>r.skillId===op.skillRequires!.skillId&&r.sequence>after&&r.realm===state.security!.realm))return false;}
  return true;
}
export function finishSkillCall(s:ScenarioDefinition,state:GameState,call:ToolCall,emit:Emit):void{
  const queue=state.memory!.queue;if(!queue||queue.status!=='running')return;
  const expected=s.memory!.skills.find(x=>x.id===queue.skillId)!.steps[queue.cursor];if(!sameCall(call,expected))return;
  const result=[...state.events].reverse().find(e=>['result','verified','observation'].includes(e.type)&&e.callId===`${s.id}:call:${state.runtime!.toolCalls}`);
  if(!result?.success){queue.status='failed';state.status='stalled';state.runtime!.executionMode='manual';emit(state,{type:'skill-change',text:'流程遇到失败，剩余步骤停止。已发生的现场变化保留，先检查输入与适用条件。',success:false});return;}
  queue.cursor++;
  if(queue.cursor===s.memory!.skills.find(x=>x.id===queue.skillId)!.steps.length){const e=emit(state,{type:'skill-change',actionId:state.runtime!.actionHistory.at(-1)!.id,text:'保存的流程已逐步执行完毕。每一步都有本轮工具回执；仍需核验最终委托。',success:true});state.memory!.runs.push({skillId:queue.skillId,actionId:e.actionId!,sequence:e.sequence,realm:state.security!.realm});delete state.memory!.queue;}
}
