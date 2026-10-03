import { documentProvenance } from './security';
import type { ContextRecord, FactMap, GameEvent, GameState, ObservationRecord, ScenarioDefinition, SourceProvenance, TeamAction, TeamBlueprint, TeamJobDefinition, TeamTask, ToolCall, ToolName } from './types';

type Emit = (state: GameState, event: Omit<GameEvent, 'id'|'sequence'|'attempt'>) => GameEvent;
const tools: ToolName[] = ['observe','operate','verify'];
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const keys = (v: object, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const ids = (values: unknown, max=32): values is string[] => Array.isArray(values) && values.length <= max && values.every(v => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(v)) && new Set(values).size === values.length;
const list = (values: unknown, max=32): values is string[] => Array.isArray(values) && values.length<=max && values.every(v=>typeof v==='string'&&v.length>0&&v.length<=200)&&new Set(values).size===values.length;
const sameProvenance=(a:SourceProvenance|undefined,b:SourceProvenance|undefined)=>a===undefined?b===undefined:Boolean(b&&a.observationId===b.observationId&&a.trust===b.trust&&a.realm===b.realm&&a.directiveOperationId===b.directiveOperationId);
const busy = (task: TeamTask) => ['queued','waiting','running'].includes(task.status);
export function teamTarget(s: ScenarioDefinition, call: ToolCall): string | undefined {
 return call.tool==='observe'?s.observations.find(o=>o.id===call.observationId)?.target:call.tool==='operate'?s.operations.find(o=>o.id===call.operationId)?.target:s.operations.find(o=>o.id===s.goals.find(g=>g.fact===call.fact)?.operationId)?.target;
}
const permits = (b: TeamBlueprint, tool: ToolName, target: string) => b.tools.includes(tool) && (b.toolPermissions?.[tool]??b.permissions).some(t=>t==='*'||t===target);
export function validateTeamBlueprint(s: ScenarioDefinition, actorId: string, b: TeamBlueprint): string[] {
 const a=s.team?.actors.find(x=>x.id===actorId),targets=new Set([...s.observations.map(o=>o.target),...s.operations.map(o=>o.target)]);
 if(!a||!object(b)||!keys(b,['tools','permissions','toolPermissions','budget'])||!Array.isArray(b.tools)||!b.tools.length||new Set(b.tools).size!==b.tools.length||b.tools.some(t=>!a.tools.includes(t))||!Number.isInteger(b.budget)||b.budget<1||b.budget>a.budget||!list(b.permissions)||!b.permissions.length||b.permissions.some(t=>t!=='*'&&!targets.has(t)||!a.permissions.includes('*')&&!a.permissions.includes(t)))return ['伙伴构筑超出其有限法器、岗位范围或预算。'];
 if(b.toolPermissions!==undefined&&(!object(b.toolPermissions)||!keys(b.toolPermissions,tools)||Object.values(b.toolPermissions).some(v=>!list(v)||v.some(t=>t!=='*'&&!targets.has(t)||!a.permissions.includes('*')&&!a.permissions.includes(t)))))return ['伙伴逐件法器范围无效。'];
 return [];
}
export function validateTeamScenario(s: ScenarioDefinition): string[] {
 try { return validateTeamScenarioInner(s); } catch { return ['协作内容结构无效。']; }
}
function validateTeamScenarioInner(s: ScenarioDefinition): string[] {
 const errors:string[]=[],t=s.team;if(!object(t)||!keys(t,['actors','jobs','board','artifacts'])||!Array.isArray(t.actors)||!t.actors.length||t.actors.length>2||!Array.isArray(t.jobs)||!t.jobs.length||t.jobs.length>8||!Array.isArray(t.board)||t.board.length>6||!Array.isArray(t.artifacts)||t.artifacts.length>3)return ['协作关卡须声明有限伙伴、任务、共享板与成果槽。'];
 if(!ids(t.actors.map(a=>a.id),2)||!ids(t.jobs.map(j=>j.id),8)||!ids(t.board.map(b=>b.id),6)||!ids(t.artifacts.map(a=>a.id),3))errors.push('伙伴、任务、共享板或成果标识无效。');
 const targetSet=new Set([...s.observations.map(o=>o.target),...s.operations.map(o=>o.target)]),fact=(f:string)=>Object.hasOwn(s.initialWorld,f);
 for(const a of t.actors){if(!object(a)||!keys(a,['id','label','description','contextCapacity','tools','permissions','budget'])||!a.label||!a.description||!Number.isInteger(a.contextCapacity)||a.contextCapacity<1||a.contextCapacity>24||!Array.isArray(a.tools)||!a.tools.length||a.tools.some(x=>!tools.includes(x))||new Set(a.tools).size!==a.tools.length||!list(a.permissions)||!a.permissions.length||a.permissions.some(x=>x!=='*'&&!targetSet.has(x))||!Number.isInteger(a.budget)||a.budget<1||a.budget>64)errors.push('伙伴必须有有限容量、工具范围与预算。');}
 for(const a of t.artifacts)if(!object(a)||!keys(a,['id','label','fields','initialRevision'])||!a.label||!ids(a.fields)||!a.fields.length||a.fields.some(f=>!fact(f))||!Number.isSafeInteger(a.initialRevision)||a.initialRevision<1)errors.push('成果槽须声明已有文档字段与正整数版本。');
 const artifactFields=t.artifacts.flatMap(a=>a.fields);if(new Set(artifactFields).size!==artifactFields.length||artifactFields.some(f=>s.goals.some(g=>g.fact===f)))errors.push('成果槽字段不能重叠或直接作为现场完成目标。');
 for(const b of t.board)if(!object(b)||!keys(b,['id','label','allowedFacts'])||!b.label||!ids(b.allowedFacts)||!b.allowedFacts.length||b.allowedFacts.some(f=>!fact(f)))errors.push('共享板须有明确可发布字段白名单。');
 for(const o of s.operations)if(!o.collaboration?.draftArtifactId&&Object.keys(o.effects).some(f=>artifactFields.includes(f)))errors.push('设计文档字段只能由成功草稿合并写入，不能绕过槽版本。');
 for(const h of s.hooks??[])if(Object.keys(h.effects??{}).some(f=>artifactFields.includes(f)))errors.push('环境钩子不能绕过成果槽版本改写总图。');
 for(const o of s.observations)if(o.artifactId&&(o.reportedFacts!==undefined||!t.artifacts.some(a=>a.id===o.artifactId&&o.facts.every(f=>a.fields.includes(f)))))errors.push('总图观察必须只读取对应成果槽的文档字段。');
 for(const o of s.operations)if(o.collaboration){const c=o.collaboration;if(!object(c)||!keys(c,['draftArtifactId','actorIds'])||!c.draftArtifactId&&!c.actorIds?.length||c.actorIds!==undefined&&(!ids(c.actorIds,2)||!c.actorIds.length||c.actorIds.some(id=>!t.actors.some(a=>a.id===id)))||c.draftArtifactId!==undefined&&(!t.artifacts.some(a=>a.id===c.draftArtifactId&&Object.keys(o.effects).every(f=>a.fields.includes(f)))||o.protocol||o.security||o.memoryRequires||o.sessionRequires||o.skillRequires||o.retryWindow))errors.push('草稿操作只能生成成果槽字段；执行岗位须来自声明伙伴。');}
 for(const j of t.jobs){if(!object(j)||!keys(j,['id','label','actorIds','steps','inputObservationIds','inputJobIds','requiredInputFacts','exportFacts'])||!j.label||!ids(j.actorIds,2)||!j.actorIds.length||j.actorIds.some(id=>!t.actors.some(a=>a.id===id))||!Array.isArray(j.steps)||!j.steps.length||j.steps.length>6||!ids(j.inputObservationIds)||j.inputObservationIds.some(id=>!s.observations.some(o=>o.id===id))||j.inputJobIds!==undefined&&(!ids(j.inputJobIds,8)||j.inputJobIds.some(id=>!t.jobs.some(x=>x.id===id)))||j.requiredInputFacts!==undefined&&(!ids(j.requiredInputFacts)||j.requiredInputFacts.some(f=>!fact(f)))||!ids(j.exportFacts)||j.exportFacts.some(f=>!fact(f)))errors.push('任务模板、输入范围或导出白名单无效。');
  for(const c of j.steps??[])if(!object(c)||!tools.includes(c.tool)||!keys(c,c.tool==='observe'?['tool','observationId']:c.tool==='operate'?['tool','operationId']:['tool','fact'])||!teamTarget(s,c))errors.push('协作步骤必须是已声明的有限工具调用。');
 }
 const r=s.transferRequirement?.team;
 if(r&&(!object(r)||!Object.values(r).some(value=>Array.isArray(value)?value.length>0:value===true)||!keys(r,['actorIds','receivedJobs','dependency','mergedArtifactIds','observedSourceIds','echoVerified'])||r.actorIds!==undefined&&(!ids(r.actorIds,2)||r.actorIds.some(id=>!t.actors.some(a=>a.id===id)))||r.receivedJobs!==undefined&&(!ids(r.receivedJobs,8)||r.receivedJobs.some(id=>!t.jobs.some(j=>j.id===id)))||r.mergedArtifactIds!==undefined&&(!ids(r.mergedArtifactIds,3)||r.mergedArtifactIds.some(id=>!t.artifacts.some(a=>a.id===id)))||r.observedSourceIds!==undefined&&(!ids(r.observedSourceIds)||r.observedSourceIds.some(id=>!s.observations.some(o=>o.id===id)))||r.dependency!==undefined&&typeof r.dependency!=='boolean'||r.echoVerified!==undefined&&typeof r.echoVerified!=='boolean'))errors.push('协作迁移要求引用无效。');
 return errors;
}
export function initializeTeam(s:ScenarioDefinition,state:GameState,generation=1):void {
 state.team={actors:s.team!.actors.map(a=>({id:a.id,blueprint:{tools:[...a.tools],permissions:[...a.permissions],budget:a.budget}})),tasks:[],results:[],proposals:[],board:s.team!.board.map(b=>({id:b.id,revision:0})),artifacts:s.team!.artifacts.map(a=>({id:a.id,revision:a.initialRevision,fields:Object.fromEntries(a.fields.map(f=>[f,state.world[f]])),mergeEventIds:[]})),scheduler:{round:0,nextActor:0,nextTask:1,generation}};
}
function effectiveCard(s:ScenarioDefinition,card:ContextRecord):ContextRecord {
 const copy=structuredClone(card),summary=s.observations.find(o=>o.id===card.observationId)?.document?.summaries?.find(x=>x.id===card.summaryId);
 if(summary){copy.facts=Object.fromEntries(Object.entries(copy.facts).filter(([f])=>summary.retain.includes(f)));copy.units=summary.units;if(copy.fieldProvenance)copy.fieldProvenance=Object.fromEntries(Object.entries(copy.fieldProvenance).filter(([f])=>summary.retain.includes(f)));}
 delete copy.summaryId;return copy;
}
export function teamInputs(s:ScenarioDefinition,state:GameState,a:Extract<TeamAction,{operation:'enqueue'}>):ContextRecord[] {
 return [...a.inputRecordIds.map(id=>effectiveCard(s,state.context!.records.find(r=>r.id===id)!)),...a.boardRefs.map(ref=>structuredClone(state.team!.board.find(b=>b.id===ref.slotId)!.record!))];
}
function sourcesAllowed(s:ScenarioDefinition,state:GameState,j:TeamJobDefinition,c:ContextRecord):boolean {
 if(c.teamOrigin){const source=state.team!.results.find(r=>r.id===c.teamOrigin!.resultId&&r.received);return Boolean(source&&(j.inputJobIds??[]).includes(source.jobId));}
 return j.inputObservationIds.includes(c.observationId);
}
function dependenciesReady(state:GameState,task:TeamTask):boolean {
 return task.afterTaskIds.every(id=>{const t=state.team!.tasks.find(x=>x.id===id)!;return t.status==='succeeded'&&state.team!.results.some(r=>r.taskId===id&&r.received);});
}
/** Queue state follows known task outcomes immediately; no polling action is needed. */
function refreshDependencies(state:GameState,emit:Emit,actionId:string):void {
 for(const task of state.team!.tasks){
  if(!busy(task)||!task.afterTaskIds.length)continue;
  if(dependenciesReady(state,task)){if(task.status==='waiting')task.status='queued';delete task.waitingReason;continue;}
  const failedDependency=task.afterTaskIds.some(id=>['failed','cancelled'].includes(state.team!.tasks.find(t=>t.id===id)!.status));
  const reason=failedDependency?'等待失败或取消的原任务；新建同名任务不会替换依赖编号。':'等待前置任务实际成功并被正确接回。';
  if(task.status!=='waiting'||task.waitingReason!==reason){task.status='waiting';task.waitingReason=reason;event(emit,state,task,'waiting',reason,{actionId,cost:0});}
 }
}
export function validTeamAction(s:ScenarioDefinition,state:GameState,a:TeamAction):boolean {
 if(!state.team||state.status==='won'||!object(a))return false;
 const base=['id','type','operation'],fields=a.operation==='configure'?['actorId','blueprint']:a.operation==='enqueue'?['jobId','actorId','inputRecordIds','boardRefs','afterTaskIds']:a.operation==='receive'?['taskId','resultId']:a.operation==='publish'?['slotId','recordId','expectedRevision','fieldKeys']:a.operation==='merge'?['proposalId','expectedRevision']:a.operation==='cancel'?['taskId']:[];
 if(!keys(a,[...base,...fields]))return false;
 if(a.operation==='configure')return !validateTeamBlueprint(s,a.actorId,a.blueprint).length&&!state.team.tasks.some(t=>t.actorId===a.actorId&&busy(t));
 if(a.operation==='enqueue'){
  const j=s.team!.jobs.find(j=>j.id===a.jobId),actor=state.team.actors.find(x=>x.id===a.actorId),definition=s.team!.actors.find(x=>x.id===a.actorId);
  if(!j||!actor||!definition||!j.actorIds.includes(a.actorId)||state.team.tasks.length>=16||!list(a.inputRecordIds,16)||a.inputRecordIds.some(id=>!state.context!.records.some(r=>r.id===id))||!Array.isArray(a.boardRefs)||a.boardRefs.length>6||new Set(a.boardRefs.map(r=>r.slotId)).size!==a.boardRefs.length||a.boardRefs.some(ref=>!object(ref)||!keys(ref,['slotId','revision'])||!Number.isSafeInteger(ref.revision)||!state.team!.board.some(b=>b.id===ref.slotId&&b.revision===ref.revision&&b.record))||!list(a.afterTaskIds,16)||a.afterTaskIds.some(id=>!state.team!.tasks.some(t=>t.id===id)))return false;
  const input=teamInputs(s,state,a),artifactVersions=new Map<string,number>();
  for(const c of input)if(c.artifactOrigin){const prior=artifactVersions.get(c.artifactOrigin.artifactId);if(prior!==undefined&&prior!==c.artifactOrigin.revision)return false;artifactVersions.set(c.artifactOrigin.artifactId,c.artifactOrigin.revision);}
  return input.reduce((sum,c)=>sum+c.units,0)<=definition.contextCapacity&&input.every(c=>sourcesAllowed(s,state,j,c)&&(!c.provenance||c.provenance.realm==='live')&&Object.values(c.fieldProvenance??{}).every(p=>p.realm==='live'));
 }
 if(a.operation==='tick')return state.security!.realm==='live'&&state.status!=='paused'&&state.runtime!.missionRemaining>0&&state.team.actors.some(actor=>{const head=state.team!.tasks.find(t=>t.actorId===actor.id&&busy(t));return Boolean(head&&dependenciesReady(state,head));});
 if(a.operation==='receive')return state.team.results.some(r=>r.id===a.resultId&&r.taskId===a.taskId&&!r.received);
 if(a.operation==='cancel')return state.team.tasks.some(t=>t.id===a.taskId&&busy(t));
 if(a.operation==='publish'){
  const b=state.team.board.find(b=>b.id===a.slotId),definition=s.team!.board.find(b=>b.id===a.slotId),c=state.context!.records.find(r=>r.id===a.recordId);if(!b||!definition||!c||!Number.isSafeInteger(a.expectedRevision)||b.revision!==a.expectedRevision||!ids(a.fieldKeys)||!a.fieldKeys.length)return false;
  const card=effectiveCard(s,c);return a.fieldKeys.every(f=>definition.allowedFacts.includes(f)&&Object.hasOwn(card.facts,f));
 }
 if(a.operation==='merge'){
  const p=state.team.proposals.find(p=>p.id===a.proposalId),slot=p&&state.team.artifacts.find(x=>x.id===p.artifactId),task=p&&state.team.tasks.find(x=>x.id===p.taskId),definition=p&&s.team!.artifacts.find(x=>x.id===p.artifactId);
  return Boolean(state.security!.realm==='live'&&p&&!p.merged&&slot&&task?.status==='succeeded'&&state.team.results.some(r=>r.taskId===task.id&&r.received)&&Number.isSafeInteger(a.expectedRevision)&&a.expectedRevision===slot.revision&&p.baseRevision===slot.revision&&definition&&Object.keys(p.fields).every(f=>definition.fields.includes(f))&&state.events.some(e=>e.id===p.sourceEventId&&e.type==='result'&&e.success&&e.taskId===task.id));
 }
 return false;
}
function provenanceFor(card:ContextRecord,fact:string):SourceProvenance|undefined{return card.fieldProvenance?.[fact]??card.provenance;}
function ingest(task:TeamTask,card:ContextRecord):void {
 for(const [f,value] of Object.entries(card.facts))task.observed[f]={value,source:'observation',eventId:card.eventId,...(provenanceFor(card,f)?{provenance:structuredClone(provenanceFor(card,f))}:{})};
}
const event=(emit:Emit,state:GameState,task:TeamTask,phase:NonNullable<GameEvent['teamPhase']>,text:string,extra:Partial<GameEvent>={})=>emit(state,{type:'team-change',teamPhase:phase,actorId:task.actorId,taskId:task.id,text,realm:'live',...extra});
function failed(state:GameState,task:TeamTask,emit:Emit,text:string):void {task.status='failed';task.failureReason=text;delete task.waitingReason;event(emit,state,task,'failed',text,{success:false});}
function completed(s:ScenarioDefinition,state:GameState,task:TeamTask,emit:Emit):void {
 task.status='succeeded';delete task.waitingReason;const j=s.team!.jobs.find(j=>j.id===task.jobId)!,facts:FactMap={},fieldProvenance:Record<string,SourceProvenance>={};
 for(const f of j.exportFacts)if(Object.hasOwn(task.observed,f)){facts[f]=task.observed[f].value;if(task.observed[f].provenance)fieldProvenance[f]=structuredClone(task.observed[f].provenance!);}
 const resultId=`${task.id}:result`,artifactInputs=task.inputs.filter(c=>c.artifactOrigin),artifactOrigin=artifactInputs.length===1&&Object.keys(facts).every(f=>Object.hasOwn(artifactInputs[0].facts,f)&&facts[f]===artifactInputs[0].facts[f]&&sameProvenance(fieldProvenance[f],provenanceFor(artifactInputs[0],f)))?structuredClone(artifactInputs[0].artifactOrigin):undefined;
 state.team!.results.push({id:resultId,taskId:task.id,actorId:task.actorId,jobId:task.jobId,facts,fieldProvenance,sourceEventIds:[...task.eventIds],received:false,...(artifactOrigin?{artifactOrigin}:{})});task.resultId=resultId;
 event(emit,state,task,'completed','子任务完成，回信已到结果台。尚未接回，也不表示主委托完成。',{resultId,success:true,sourceRecordIds:[...task.sourceRecordIds]});
}
function costOf(s:ScenarioDefinition,call:ToolCall,state:GameState):number {
 const op=call.tool==='operate'?s.operations.find(o=>o.id===call.operationId):undefined;
 if(op?.failureCost!==undefined&&Object.entries(op.requires??{}).some(([f,v])=>state.world[f]!==v))return op.failureCost;
 return (call.tool==='observe'?s.observations.find(o=>o.id===call.observationId)?.cost:op?.cost??(call.tool==='verify'?s.goals.find(g=>g.fact===call.fact)?.verifyCost:undefined))??s.limits?.toolCosts?.[call.tool]??1;
}
function teamCall(s:ScenarioDefinition,state:GameState,task:TeamTask,call:ToolCall,emit:Emit,afterCall:(operationId?:string)=>void):void {
 const target=teamTarget(s,call)!,op=call.tool==='operate'?s.operations.find(o=>o.id===call.operationId):undefined;
 if(op?.collaboration?.actorIds?.length&&!op.collaboration.actorIds.includes(task.actorId)){failed(state,task,emit,'这项现场法器只适配指定执行岗位，宽泛权限不能代替岗位能力。没有执行、没有扣晶石。');return;}
 if(!permits(task.blueprint,call.tool,target)){failed(state,task,emit,'岗位没有这个法器或目标的权限。没有执行，也没有扣晶石。');return;}
 if(op&&(op.security?.principalIds?.length||op.security?.approval||op.security?.sandboxRequires?.length||op.memoryRequires?.length||op.sessionRequires||op.skillRequires||op.protocol||op.retryWindow)){failed(state,task,emit,'伙伴没有继承回声的身份、门令、沙箱试验、会话或流程；这项请求须交给有相应配置的执行者。没有执行、没有扣晶石。');return;}
 if(op?.security?.trustedInputs?.some(f=>task.observed[f]?.provenance?.trust!=='registry'||task.observed[f]?.provenance?.realm!=='live')){failed(state,task,emit,'伙伴收到的具体字段缺少现场登记来源。没有执行、没有扣晶石。');return;}
 const cost=costOf(s,call,state);if(cost>task.remainingBudget||cost>state.runtime!.missionRemaining){failed(state,task,emit,'伙伴的有限预算或整项委托晶石不足。重派不会给委托补晶石。');return;}
 const callId=`${s.id}:call:${state.runtime!.toolCalls+1}`,actionId=state.runtime!.actionHistory.at(-1)!.id,actor=s.team!.actors.find(a=>a.id===task.actorId)!;
 task.remainingBudget-=cost;state.runtime!.missionRemaining-=cost;state.runtime!.toolCalls++;state.budgetRemaining=Math.min(state.budgetRemaining,state.runtime!.missionRemaining);
 emit(state,{type:'request',actorId:task.actorId,taskId:task.id,realm:'live',tool:call.tool,target,callId,actionId,cost,...(op?{operationId:op.id}:{}),text:`${actor.label} 按有限任务步骤请求法器，消耗 ${cost} 点晶石。`});
 let success=false,successfulOperation:string|undefined,changed=false;
 if(call.tool==='observe'){
  const o=s.observations.find(o=>o.id===call.observationId)!,available=Object.entries(o.availableWhen??{}).every(([f,v])=>state.world[f]===v),facts=available?Object.fromEntries(o.facts.map(f=>[f,o.reportedFacts&&Object.hasOwn(o.reportedFacts,f)?o.reportedFacts[f]:state.world[f]])):{};
  const e=emit(state,{type:'observation',actorId:task.actorId,taskId:task.id,realm:'live',tool:'observe',target,callId,actionId,facts,success:available,delivered:true,text:available?o.text:'资料入口未开放；没有获得新资料。'});task.eventIds.push(e.id);success=available;
  if(available){const artifact=o.artifactId?state.team!.artifacts.find(a=>a.id===o.artifactId):undefined;const c:ContextRecord={id:e.id,observationId:o.id,label:o.label,source:o.document!.source,text:o.text,eventId:e.id,facts:structuredClone(facts),units:o.document!.units,provenance:documentProvenance(s,o.id,'live'),...(artifact?{artifactOrigin:{artifactId:artifact.id,revision:artifact.revision}}:{})};
   if(c.artifactOrigin&&Object.hasOwn(task.artifactRevisions,c.artifactOrigin.artifactId)&&task.artifactRevisions[c.artifactOrigin.artifactId]!==c.artifactOrigin.revision){failed(state,task,emit,'任务已经携带另一版总图，不能用新读版本给旧字段升级基准。观察成本保留；请以一致版本重新派出任务。');afterCall();return;}
   if(task.records.reduce((sum,c)=>sum+c.units,task.inputs.reduce((sum,c)=>sum+c.units,0))+c.units>s.team!.actors.find(a=>a.id===task.actorId)!.contextCapacity){failed(state,task,emit,'伙伴的私有卷轴空间不足；已发生的观察与晶石成本保留，没有把资料悄悄塞进去。');afterCall();return;}task.records.push(c);ingest(task,c);if(c.artifactOrigin)task.artifactRevisions[c.artifactOrigin.artifactId]=c.artifactOrigin.revision;
  }
 }else if(call.tool==='operate'){
  const j=s.team!.jobs.find(j=>j.id===task.jobId)!,contextMissing=Object.entries(op!.contextRequires??{}).some(([f,v])=>task.observed[f]?.value!==v)||(op!.contextMatches??[]).some(f=>task.observed[f]?.value!==state.world[f])||(j.requiredInputFacts??[]).some(f=>!task.inputs.some(c=>Object.hasOwn(c.facts,f))),physicalMissing=Object.entries(op!.requires??{}).filter(([f,v])=>state.world[f]!==v),artifact=op!.collaboration?state.team!.artifacts.find(a=>a.id===op!.collaboration!.draftArtifactId):undefined,draftMissing=Boolean(artifact&&!Object.hasOwn(task.artifactRevisions,artifact.id));
  success=!contextMissing&&!physicalMissing.length&&!draftMissing;const facts=success?structuredClone(op!.effects):contextMissing||draftMissing?{}:Object.fromEntries(physicalMissing.map(([f])=>[f,state.world[f]]));
  const e=emit(state,{type:'result',actorId:task.actorId,taskId:task.id,realm:'live',tool:'operate',operationId:op!.id,target,callId,actionId,facts,success,delivered:true,text:success?(artifact?'草稿已经生成；尚未合并总图，也没有改变现场。 '+op!.successText:op!.successText):draftMissing?'没有携带成果槽的实际版本快照，不能虚构草稿基准。':contextMissing?'缺少派遣时交付的资料字段，或资料与要求不符；现场未改变。':op!.failureText});task.eventIds.push(e.id);
  if(success&&artifact){state.team!.proposals.push({id:`${task.id}:proposal:${task.cursor+1}`,taskId:task.id,actorId:task.actorId,artifactId:artifact.id,baseRevision:task.artifactRevisions[artifact.id],fields:structuredClone(op!.effects),sourceEventId:e.id,merged:false});}
  else if(success){Object.assign(state.world,op!.effects);state.verifiedGoals=state.verifiedGoals.filter(f=>!Object.hasOwn(op!.effects,f));changed=true;successfulOperation=op!.id;}
  for(const [f,value]of Object.entries(facts))task.observed[f]={value,source:'receipt',eventId:e.id,provenance:{observationId:e.id,trust:'executor',realm:'live'}};
 }else{
  const g=s.goals.find(g=>g.fact===call.fact)!,facts={[g.fact]:state.world[g.fact]};success=state.world[g.fact]===g.equals;const e=emit(state,{type:'verified',actorId:task.actorId,taskId:task.id,realm:'live',tool:'verify',target,callId,actionId,facts,success,delivered:true,text:success?'伙伴的现场测试通过。此结果仍需交接，回声仍负责主委托验收。':'伙伴的现场测试未通过。'});task.eventIds.push(e.id);task.observed[g.fact]={value:state.world[g.fact],source:'verification',eventId:e.id,provenance:{observationId:e.id,trust:'executor',realm:'live'}};
 }
 if(changed)state.security!.revision++;afterCall(successfulOperation);
 if(!success){failed(state,task,emit,'实际工具返回失败，剩余任务步骤停止。已发生的费用与世界变化保留。');return;}
 task.cursor++;if(task.cursor===s.team!.jobs.find(j=>j.id===task.jobId)!.steps.length)completed(s,state,task,emit);
}
export function applyTeamAction(s:ScenarioDefinition,state:GameState,a:TeamAction,emit:Emit,afterCall:(operationId?:string)=>void):void {
 const team=state.team!;state.runtime!.executionMode='manual';
 if(a.operation==='configure'){team.actors.find(x=>x.id===a.actorId)!.blueprint=structuredClone(a.blueprint);emit(state,{type:'team-change',teamPhase:'configured',actorId:a.actorId,actionId:a.id,realm:'live',text:'空闲伙伴的岗位契约已调整；不修改已有任务快照，不恢复已用晶石。',success:true});return;}
 if(a.operation==='enqueue'){
  const actor=team.actors.find(x=>x.id===a.actorId)!,inputs=teamInputs(s,state,a),sequence=team.scheduler.nextTask++,task:TeamTask={id:`${s.id}:team:${team.scheduler.generation}:task:${sequence}`,jobId:a.jobId,actorId:a.actorId,sequence,blueprint:structuredClone(actor.blueprint),inputs,sourceRecordIds:inputs.map(c=>c.id),afterTaskIds:[...a.afterTaskIds],observed:{},records:[],artifactRevisions:{},cursor:0,status:'queued',remainingBudget:actor.blueprint.budget,eventIds:[]};
  if(task.afterTaskIds.length){task.status='waiting';task.waitingReason='等待前置任务实际成功并被正确接回。';}
  inputs.forEach(c=>{ingest(task,c);if(c.artifactOrigin)task.artifactRevisions[c.artifactOrigin.artifactId]=c.artifactOrigin.revision;});team.tasks.push(task);event(emit,state,task,'queued','委托已入队。输入是这一刻的有限快照；任务还没有执行。',{actionId:a.id,sourceRecordIds:[...task.sourceRecordIds]});refreshDependencies(state,emit,a.id);return;
 }
 if(a.operation==='tick'){
  team.scheduler.round++;const actors=team.actors,start=team.scheduler.nextActor;team.scheduler.nextActor=(start+1)%actors.length;
  for(let offset=0;offset<actors.length;offset++){const actor=actors[(start+offset)%actors.length],task=team.tasks.find(t=>t.actorId===actor.id&&busy(t));if(!task)continue;
   if(!dependenciesReady(state,task)){const failedDependency=task.afterTaskIds.some(id=>['failed','cancelled'].includes(team.tasks.find(t=>t.id===id)!.status));task.status='waiting';task.waitingReason=failedDependency?'等待失败或取消的原任务；新建同名任务不会替换依赖编号。':'等待前置任务实际成功并被正确接回。';event(emit,state,task,'waiting',task.waitingReason,{actionId:a.id,cost:0});continue;}
   if(task.status!=='running'){task.status='running';delete task.waitingReason;event(emit,state,task,'started','前置任务已经正确接回，伙伴开始执行有限步骤。',{actionId:a.id,sourceRecordIds:[...task.sourceRecordIds]});}
   teamCall(s,state,task,s.team!.jobs.find(j=>j.id===task.jobId)!.steps[task.cursor],emit,afterCall);
  }
  refreshDependencies(state,emit,a.id);
  if(state.runtime!.missionRemaining===0){state.status='exhausted';emit(state,{type:'exhausted',realm:'live',text:'全队共用的委托晶石已经耗尽。等待不会扣费，重派也不会补充；可查看已发生记录或重置整个委托。'});}
  return;
 }
 if(a.operation==='receive'){
  const r=team.results.find(r=>r.id===a.resultId)!,task=team.tasks.find(t=>t.id===r.taskId)!,sources=Object.values(r.fieldProvenance),common=sources.length&&sources.every(p=>sameProvenance(p,sources[0]))?sources[0]:undefined;
  const e=event(emit,state,task,'received','已按原任务编号接回实际结果；回声仍需明确装卷或转交，城市不会因报告改变。',{actionId:a.id,resultId:r.id,facts:structuredClone(r.facts),success:true,delivered:false});
  const card:ContextRecord={id:e.id,observationId:`team-${r.jobId}`,label:`回信：${s.team!.jobs.find(j=>j.id===r.jobId)!.label}`,source:s.team!.actors.find(x=>x.id===r.actorId)!.label,text:'有限子任务的实际交接；字段保留原来源。',eventId:e.id,facts:structuredClone(r.facts),units:Math.max(1,Math.ceil(Object.keys(r.facts).length/3)),fieldProvenance:structuredClone(r.fieldProvenance),teamOrigin:{taskId:task.id,resultId:r.id},...(common?{provenance:structuredClone(common)}:{}),...(r.artifactOrigin?{artifactOrigin:structuredClone(r.artifactOrigin)}:{})};state.context!.records.push(card);r.received=true;r.recordId=card.id;refreshDependencies(state,emit,a.id);return;
 }
 if(a.operation==='publish'){
  const b=team.board.find(b=>b.id===a.slotId)!,card=effectiveCard(s,state.context!.records.find(r=>r.id===a.recordId)!),fields=new Set(a.fieldKeys);card.facts=Object.fromEntries(Object.entries(card.facts).filter(([f])=>fields.has(f)));if(card.fieldProvenance)card.fieldProvenance=Object.fromEntries(Object.entries(card.fieldProvenance).filter(([f])=>fields.has(f)));card.units=Math.max(1,Math.ceil(a.fieldKeys.length/3));b.revision++;
  const e=emit(state,{type:'team-change',teamPhase:'published',slotId:b.id,actionId:a.id,realm:'live',revision:b.revision,sourceRecordIds:[a.recordId],facts:structuredClone(card.facts),text:'已把实际资料的指定字段发布到共享板。原来源保持；已经派出的任务不会自动更新。',success:true});card.id=e.id;card.eventId=e.id;b.record=card;b.publishedEventId=e.id;return;
 }
 if(a.operation==='merge'){
  const p=team.proposals.find(p=>p.id===a.proposalId)!,slot=team.artifacts.find(x=>x.id===p.artifactId)!;Object.assign(slot.fields,p.fields);Object.assign(state.world,p.fields);state.security!.revision++;state.verifiedGoals=state.verifiedGoals.filter(f=>!Object.hasOwn(p.fields,f));slot.revision++;p.merged=true;
  const e=emit(state,{type:'team-change',teamPhase:'merged',actorId:p.actorId,taskId:p.taskId,proposalId:p.id,slotId:slot.id,actionId:a.id,realm:'live',baseRevision:p.baseRevision,revision:slot.revision,facts:structuredClone(p.fields),sourceRecordIds:[p.sourceEventId],text:'当前版本草稿已原子合并进总图。它改变设计文档，实际施工和现场验收仍须分别执行。',success:true});slot.mergeEventIds.push(e.id);return;
 }
 const task=team.tasks.find(t=>t.id===a.taskId)!;task.status='cancelled';delete task.waitingReason;event(emit,state,task,'cancelled','剩余步骤已经取消；实际费用、已发生的现场变化和原任务编号保留。',{actionId:a.id,success:true});refreshDependencies(state,emit,a.id);
}
export function hasTeamTransferEvidence(s:ScenarioDefinition,state:GameState):boolean {
 const r=s.transferRequirement?.team;if(!r||state.hintUsed)return false;const team=state.team!;
 const successful=(actorId:string)=>state.events.some(e=>e.actorId===actorId&&e.taskId&&['observation','result','verified'].includes(e.type)&&e.success&&e.callId);
 if(r.actorIds?.some(id=>!successful(id)))return false;
 if(r.receivedJobs?.some(id=>!team.results.some(result=>result.jobId===id&&result.received&&state.events.some(e=>e.teamPhase==='received'&&e.resultId===result.id&&e.taskId===result.taskId&&e.success))))return false;
 if(r.dependency&&!team.tasks.some(t=>t.status==='succeeded'&&t.afterTaskIds.length&&state.events.some(e=>e.teamPhase==='started'&&e.taskId===t.id&&t.afterTaskIds.every(id=>state.events.some(source=>source.teamPhase==='received'&&source.taskId===id&&source.sequence<e.sequence)))))return false;
 if(r.mergedArtifactIds?.some(id=>!team.artifacts.some(a=>a.id===id&&a.mergeEventIds.some(eventId=>state.events.some(e=>e.id===eventId&&e.teamPhase==='merged'&&e.success)))))return false;
 if(r.observedSourceIds?.some(id=>!team.tasks.some(t=>t.status==='succeeded'&&t.records.some(card=>card.observationId===id&&t.eventIds.includes(card.eventId)&&state.events.some(e=>e.id===card.eventId&&e.type==='observation'&&e.success)))))return false;
 if(r.echoVerified&&!s.goals.every(g=>state.events.some(e=>e.type==='verified'&&!e.actorId&&e.realm==='live'&&e.success&&e.facts?.[g.fact]===g.equals)))return false;
 // Input transfer must actually have fed a successful job, not merely fill a queue.
 return team.tasks.some(t=>t.status==='succeeded'&&t.inputs.length&&t.sourceRecordIds.length&&t.eventIds.some(id=>state.events.some(e=>e.id===id&&e.success)));
}
