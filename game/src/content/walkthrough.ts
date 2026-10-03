import type { GameAction, GameState, ToolCall, TeamBlueprint } from '../engine';
import type { EvaluationAction } from '../engine/evaluation-contract';
import type { LabAction } from '../engine/blueprint-contract';
type WithoutId<T> = T extends {id:string} ? Omit<T,'id'> : never;
export interface AuthoredMessageRef {messageId:string; occurrence?:number;}
type LabStep = Exclude<WithoutId<LabAction>,{operation:'tick'|'cancel'|'approve'}>
  | {type:'lab';operation:'tick';taskFrom:AuthoredMessageRef}
  | {type:'lab';operation:'cancel';taskFrom:AuthoredMessageRef}
  | {type:'lab';operation:'approve';call:ToolCall;taskFrom?:AuthoredMessageRef;moduleId?:string};
export interface AuthoredTaskRef {jobId:string; occurrence?:number;}
type TeamStep = (
  | {type:'team';operation:'configure';actorId:string;blueprint:TeamBlueprint}
  | {type:'team';operation:'enqueue';jobId:string;actorId:string;observations?:string[];results?:AuthoredTaskRef[];boardRefs?:Array<{slotId:string;revision:number}>;afterTasks?:AuthoredTaskRef[]}
  | {type:'team';operation:'tick'}
  | {type:'team';operation:'receive';task:AuthoredTaskRef;wrongResultFrom?:AuthoredTaskRef}
  | {type:'team';operation:'include';task:AuthoredTaskRef}
  | {type:'team';operation:'publish';slotId:string;observationId?:string;resultFrom?:AuthoredTaskRef;expectedRevision:number;fieldKeys:string[]}
  | {type:'team';operation:'merge';task:AuthoredTaskRef;artifactId:string;expectedRevision:number}
  | {type:'team';operation:'cancel';task:AuthoredTaskRef}
) & {expectRejected?:boolean};
export type AuthoredStep = (
  | {type:'tool'; call:ToolCall}
  | {type:'context'; observationId:string; operation:'include'|'exclude'|'summarize'|'expand'; summaryId?:string; origin?:'memory'|'observation'}
  | {type:'memory'; operation:'write'|'revise'|'retire'|'recall'; key:string; observationId?:string}
  | {type:'session'; operation:'fresh'|'fork'|'switch'; branchIndex?:number}
  | {type:'skill'; operation:'save'|'run'|'cancel'; skillId:string}
  | {type:'security';operation:'authenticate';principalId:string;observationId:string}
  | {type:'security';operation:'preview';call:Extract<ToolCall,{tool:'operate'}>}
  | {type:'security';operation:'approve'}
  | {type:'security';operation:'realm';realm:'live'|'sandbox'}
  | TeamStep
  | (WithoutId<EvaluationAction> & {expectRejected?:boolean})
  | LabStep
  | {type:'pause'}
  | {type:'resume';mode:'manual'|'automatic'}
  | {type:'receipt';operationId:string}
  | {type:'step'}) & {expectRejected?:boolean};
/** Resolve only recorded material and known branches; never synthesize facts or completions. */
export function resolveAuthoredStep(state:GameState,authored:AuthoredStep,id:string):GameAction{
  const {expectRejected: _assertion,...step}=authored;
  if(step.type==='lab'){
    if(step.operation==='tick'||step.operation==='cancel'||step.operation==='approve'){
      const ref=step.taskFrom;
      const task=ref?state.lab?.tasks.filter(t=>t.messageId===ref.messageId)[(ref.occurrence??1)-1]:undefined;
      if(ref&&!task)throw new Error('路径引用尚未创建的入口消息任务');
      if(step.operation==='approve')return {id,type:'lab',operation:'approve',call:step.call,...(task?{taskId:task.id}:{}),...(step.moduleId?{moduleId:step.moduleId}:{})};
      if(!task)throw new Error('入口推进需要实际任务实例');
      return {id,type:'lab',operation:step.operation,taskId:task.id};
    }
    return {...step,id};
  }
  if(step.type==='receipt'){
    const receipt=state.protocol?.receipts.find(r=>r.operationId===step.operationId&&!r.collected);
    if(!receipt)throw new Error('路径引用尚未取得的实际回执');
    return {id,type:'receive',callId:receipt.callId,receiptId:receipt.id};
  }
  if(step.type==='pause'||step.type==='resume')return {...step,id};
  if(step.type==='evaluation'){
    return {...step,id};
  }
  if(step.type==='team'){
    const task=(ref:AuthoredTaskRef)=>{const match=state.team?.tasks.filter(t=>t.jobId===ref.jobId)[(ref.occurrence??1)-1];if(!match)throw new Error('路径引用尚未派出的协作任务');return match;};
    const original=(observationId:string)=>{const match=[...(state.context?.records??[])].reverse().find(r=>r.observationId===observationId&&!r.teamOrigin);if(!match)throw new Error('路径引用尚未读取的协作输入');return match;};
    const report=(ref:AuthoredTaskRef)=>{const match=state.context?.records.find(r=>r.teamOrigin?.taskId===task(ref).id);if(!match)throw new Error('路径引用尚未接回的任务报告');return match;};
    if(step.operation==='enqueue')return {id,type:'team',operation:'enqueue',jobId:step.jobId,actorId:step.actorId,inputRecordIds:[...(step.observations??[]).map(o=>original(o).id),...(step.results??[]).map(r=>report(r).id)],boardRefs:step.boardRefs??[],afterTaskIds:(step.afterTasks??[]).map(r=>task(r).id)};
    if(step.operation==='receive'){const owner=task(step.task),source=task(step.wrongResultFrom??step.task);if(!source.resultId)throw new Error('路径接收尚未完成的任务结果');return {id,type:'team',operation:'receive',taskId:owner.id,resultId:source.resultId};}
    if(step.operation==='include')return {id,type:'context',operation:'include',recordId:report(step.task).id};
    if(step.operation==='publish'){const source=step.resultFrom?report(step.resultFrom):step.observationId?original(step.observationId):undefined;if(!source)throw new Error('共享路径需要已取得的资料');return {id,type:'team',operation:'publish',slotId:step.slotId,recordId:source.id,expectedRevision:step.expectedRevision,fieldKeys:step.fieldKeys};}
    if(step.operation==='merge'){const proposal=state.team?.proposals.find(p=>p.taskId===task(step.task).id&&p.artifactId===step.artifactId);if(!proposal)throw new Error('路径合并尚未生成的草稿');return {id,type:'team',operation:'merge',proposalId:proposal.id,expectedRevision:step.expectedRevision};}
    if(step.operation==='cancel')return {id,type:'team',operation:'cancel',taskId:task(step.task).id};
    if(step.operation==='configure')return {id,type:'team',operation:'configure',actorId:step.actorId,blueprint:step.blueprint};
    return {id,type:'team',operation:'tick'};
  }
  if(step.type==='context'){
    const card=[...(state.context?.records??[])].reverse().find(r=>r.observationId===step.observationId&&!r.teamOrigin&&(!step.origin||(step.origin==='memory'?Boolean(r.origin):!r.origin))&&(step.operation!=='exclude'||state.context!.activeIds.includes(r.id)));
    if(!card)throw new Error('路径引用尚未取得的资料');return {id,type:'context',recordId:card.id,operation:step.operation,...(step.summaryId?{summaryId:step.summaryId}:{})};
  }
  if(step.type==='security'&&step.operation==='authenticate'){
    const matches=[...(state.context?.records??[])].reverse().filter(r=>r.observationId===step.observationId);
    const card=matches.find(r=>state.context!.activeIds.includes(r.id))??matches[0];
    if(!card)throw new Error('路径核验尚未读取的身份材料');return {id,type:'security',operation:'authenticate',principalId:step.principalId,recordId:card.id};
  }
  if(step.type==='memory'){
    const card=step.observationId?[...(state.context?.records??[])].reverse().find(r=>r.observationId===step.observationId&&!r.origin):undefined;
    if(step.observationId&&!card)throw new Error('路径保存尚未读取的资料');
    return {id,type:'memory',operation:step.operation,key:step.key,...(card?{recordId:card.id}:{})};
  }
  if(step.type==='session'){
    if(step.operation==='switch'){const branch=state.sessions?.branches[step.branchIndex??0];if(!branch)throw new Error('路径引用未知会话');return {id,type:'session',operation:'switch',branchId:branch.id};}
    return {id,type:'session',operation:step.operation};
  }
  return {...step,id};
}
