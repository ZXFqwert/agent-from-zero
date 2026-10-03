import type { GameAction, GameState, ToolCall } from '../engine';
export type AuthoredStep =
  | {type:'tool'; call:ToolCall}
  | {type:'context'; observationId:string; operation:'include'|'exclude'; origin?:'memory'|'observation'}
  | {type:'memory'; operation:'write'|'revise'|'retire'|'recall'; key:string; observationId?:string}
  | {type:'session'; operation:'fresh'|'fork'|'switch'; branchIndex?:number}
  | {type:'skill'; operation:'save'|'run'|'cancel'; skillId:string}
  | {type:'step'};
/** Resolve only recorded material and known branches; never synthesize facts or completions. */
export function resolveAuthoredStep(state:GameState,step:AuthoredStep,id:string):GameAction{
  if(step.type==='context'){
    const card=[...(state.context?.records??[])].reverse().find(r=>r.observationId===step.observationId&&(!step.origin||(step.origin==='memory'?Boolean(r.origin):!r.origin))&&(step.operation!=='exclude'||state.context!.activeIds.includes(r.id)));
    if(!card)throw new Error('路径引用尚未取得的资料');return {id,type:'context',recordId:card.id,operation:step.operation};
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
