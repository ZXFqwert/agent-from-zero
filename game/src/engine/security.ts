import type { FactMap, GameAction, GameEvent, GameState, ScenarioDefinition, SecurityPreview, SourceProvenance, ToolCall } from './types';
type SecurityAction=Extract<GameAction,{type:'security'}>;
type Emit=(state:GameState,event:Omit<GameEvent,'id'|'sequence'|'attempt'>)=>GameEvent;
const own=(o:object,k:string)=>Object.hasOwn(o,k);
export const executionWorld=(state:GameState):FactMap=>state.security!.realm==='sandbox'?state.security!.sandboxWorld:state.world;
export const executionRevision=(state:GameState):number=>state.security!.realm==='sandbox'?state.security!.sandboxRevision:state.security!.revision;
export function documentProvenance(s:ScenarioDefinition,id:string,realm:'live'|'sandbox'):SourceProvenance{
 const o=s.observations.find(x=>x.id===id)!;
 return {observationId:id,trust:o.provenance??'external',realm,...(o.directiveOperationId?{directiveOperationId:o.directiveOperationId}:{})};
}
export function initializeSecurity(s:ScenarioDefinition,state:GameState):void{
 state.security={realm:'live',sandboxWorld:structuredClone(s.initialWorld),sandboxVerifiedGoals:[],revision:0,sandboxRevision:0,permits:[],followedRecordIds:[]};
}
export function currentIdentity(s:ScenarioDefinition,state:GameState):boolean{
 const identity=state.security!.identity,principal=s.security!.principals.find(p=>p.id===identity?.principalId);
 return Boolean(principal&&identity&&state.world[principal.credentialFact]===identity.credential);
}
const matchesPreview=(state:GameState,p:SecurityPreview)=>p.realm===state.security!.realm&&p.revision===executionRevision(state)&&p.principalId===state.security!.identity?.principalId&&p.credential===state.security!.identity?.credential;
export function matchingPermit(s:ScenarioDefinition,state:GameState,call:Extract<ToolCall,{tool:'operate'}>){
 return currentIdentity(s,state)?state.security!.permits.find(p=>!p.consumed&&matchesPreview(state,p)&&p.call.operationId===call.operationId):undefined;
}
/** Preflight is shared by manual calls and the automatic executor. It never mutates state. */
export function securityDenial(s:ScenarioDefinition,state:GameState,call:ToolCall):string|undefined{
 if(call.tool!=='operate')return;
 const operation=s.operations.find(o=>o.id===call.operationId)!,access=operation.security;
 if(!access)return;
 if(access.liveOnly&&state.security!.realm!=='live')return '这项交付只能作用于现场，镜砂沙箱没有现场交付权限。';
 if(access.principalIds?.length||access.approval){
  const p=s.security!.principals.find(p=>p.id===state.security!.identity?.principalId);
  if(!currentIdentity(s,state))return '身份凭证缺失或已经失效。先携带现行登记，重新核验请求者。';
  if(!p?.grants.includes(operation.id)||(access.principalIds?.length&&!access.principalIds.includes(p.id)))return '身份核验通过也不授予这项职权。该身份的岗位范围没有此操作。';
 }
 if(access.trustedInputs?.some(f=>state.observed[f]?.provenance?.trust!=='registry'||state.observed[f]?.provenance?.realm!==state.security!.realm))return '这次请求选用的字段没有对应环境的登记来源。其他可信卷轴不能替这个字段证明来历。';
 if(access.sandboxRequires?.some(id=>!state.events.some(e=>e.type==='result'&&e.realm==='sandbox'&&e.operationId===id&&e.success)))return '交付缺少本次委托的沙箱试验回执。实验记录不代替现场执行。';
 if(access.approval&&!matchingPermit(s,state,call))return '缺少与这一个请求、身份、环境和当前版本一致的未使用批准。先预览，再签一次门令。';
}
export function validSecurityAction(s:ScenarioDefinition,state:GameState,a:SecurityAction):boolean{
 if(!state.security||state.status==='won')return false;
 const base=['id','type','operation'];
 const keys=a.operation==='authenticate'?[...base,'principalId','recordId']:a.operation==='preview'?[...base,'call']:a.operation==='realm'?[...base,'realm']:base;
 if(Object.keys(a).some(k=>!keys.includes(k)))return false;
 if(a.operation==='authenticate')return typeof a.recordId==='string'&&s.security!.principals.some(p=>p.id===a.principalId)&&state.context!.records.some(r=>r.id===a.recordId);
 if(a.operation==='preview')return Boolean(a.call&&a.call.tool==='operate'&&Object.keys(a.call).every(k=>['tool','operationId'].includes(k))&&s.operations.some(o=>o.id===a.call.operationId));
 if(a.operation==='approve')return Boolean(state.security.preview);
 if(a.operation==='realm')return ['live','sandbox'].includes(a.realm)&&a.realm!==state.security.realm&&(a.realm==='live'||s.security!.sandbox===true);
 return false;
}
export function applySecurityAction(s:ScenarioDefinition,state:GameState,a:SecurityAction,emit:Emit,rebuild:()=>void):void{
 const sec=state.security!;state.runtime!.executionMode='manual';
 if(a.operation==='realm'){
  sec.realm=a.realm;delete sec.preview;delete state.memory!.queue;delete state.context!.reply;delete state.control!.lastFailure;
  if(state.status==='running')state.status='paused';rebuild();
  emit(state,{type:'security-change',actionId:a.id,realm:sec.realm,success:true,text:`已切到${sec.realm==='live'?'现场':'镜砂沙箱'}。现场和沙箱各有自己的状态与验收；切换不复制结果、不补充资源。会话分支仍共享现场。`});return;
 }
 if(a.operation==='authenticate'){
  const p=s.security!.principals.find(p=>p.id===a.principalId)!,card=state.context!.records.find(r=>r.id===a.recordId)!;
  const summary=s.observations.find(o=>o.id===card.observationId)?.document?.summaries?.find(x=>x.id===card.summaryId);
  const success=!card.origin&&state.context!.activeIds.includes(card.id)&&card.observationId===p.registryObservationId&&card.provenance?.trust==='registry'&&card.provenance.realm==='live'&&own(card.facts,p.credentialFact)&&(!summary||summary.retain.includes(p.credentialFact))&&card.facts[p.credentialFact]===state.world[p.credentialFact];
  delete sec.preview;
  if(success)sec.identity={principalId:p.id,credential:card.facts[p.credentialFact],recordId:card.id};else delete sec.identity;
  emit(state,{type:'security-change',actionId:a.id,principalId:p.id,realm:sec.realm,success,text:success?`已核验「${p.label}」的现行登记。身份只证明是谁；职权、单次批准与实际结果仍须分别检查。`:'身份未通过：需要本次读到并携带的现场登记原件、保留的凭证字段，以及仍有效的凭证。自称、旧副本与存储位置不会生成身份。'});return;
 }
 if(a.operation==='preview'){
  const id=sec.identity,p=s.security!.principals.find(p=>p.id===id?.principalId),operation=s.operations.find(o=>o.id===a.call.operationId)!;
  sec.preview={call:structuredClone(a.call),realm:sec.realm,principalId:id?.principalId??'',credential:id?.credential??'',revision:executionRevision(state)};
  emit(state,{type:'security-change',actionId:a.id,operationId:operation.id,realm:sec.realm,text:`请求预览：${p?.label??'未核验身份'} → ${operation.label} → ${sec.realm==='live'?'现场':'沙箱'}，环境版本 ${executionRevision(state)}。这是预计写入，尚未执行，也尚未批准。`,success:true});return;
 }
 const preview=sec.preview!,p=s.security!.principals.find(p=>p.id===preview.principalId),operation=s.operations.find(o=>o.id===preview.call.operationId)!;
 const success=currentIdentity(s,state)&&matchesPreview(state,preview)&&Boolean(p?.grants.includes(operation.id))&&(!operation.security?.principalIds?.length||operation.security.principalIds.includes(p!.id))&&!(operation.security?.liveOnly&&sec.realm==='sandbox')&&!sec.permits.some(x=>!x.consumed&&matchesPreview(state,x)&&x.call.operationId===preview.call.operationId);
 if(success)sec.permits.push({...structuredClone(preview),id:a.id,consumed:false});
 emit(state,{type:'security-change',actionId:a.id,operationId:operation.id,realm:sec.realm,principalId:preview.principalId,success,...(success?{permitId:a.id}:{}),text:success?'已签一张单次门令。仅批准所展示的请求；执行尝试会使用它，身份、目标、环境或环境版本改变后须重新预览。':'门令未签发：身份、职权、预览环境或版本不符，或已有相同未使用门令。现场未改变。'});
}
export function validateSecurityScenario(s:ScenarioDefinition):string[]{
 const errors:string[]=[];const config=s.security;
 if(!config||!Array.isArray(config.principals)||config.principals.length>8)return ['信任关卡必须声明有限的身份与岗位。'];
 if(config.sandbox!==undefined&&typeof config.sandbox!=='boolean')errors.push('沙箱开关须为布尔值。');
 const ids=config.principals.map(p=>p.id);
 if(new Set(ids).size!==ids.length||ids.some(id=>!/^\w[\w.-]{0,79}$/.test(id)))errors.push('身份标识重复或无效。');
 for(const p of config.principals){const o=s.observations.find(o=>o.id===p.registryObservationId);if(!p.label||!o||o.provenance!=='registry'||!o.facts.includes(p.credentialFact)||!own(s.initialWorld,p.credentialFact)||!Array.isArray(p.grants)||new Set(p.grants).size!==p.grants.length||p.grants.some(id=>!s.operations.some(o=>o.id===id)))errors.push('身份必须对应登记原件、凭证字段和明确岗位操作。');}
 for(const o of s.observations){
  if(o.provenance!==undefined&&!['registry','external'].includes(o.provenance))errors.push('资料来源级别无效。');
  if(o.directiveOperationId&&!s.operations.some(x=>x.id===o.directiveOperationId))errors.push('资料指令引用未知操作。');
  if(o.reportedFacts&&Object.entries(o.reportedFacts).some(([f,v])=>!o.facts.includes(f)||!own(s.initialWorld,f)||!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)))errors.push('外部宣称须是声明字段中的有限值。');
 }
 for(const o of s.operations){const a=o.security;if(!a)continue;
  if(a.principalIds?.some(id=>!ids.includes(id))||a.principalIds&&new Set(a.principalIds).size!==a.principalIds.length)errors.push('操作引用未知或重复身份。');
  if(a.trustedInputs?.some(f=>!own(s.initialWorld,f)||!s.observations.some(d=>d.provenance==='registry'&&d.facts.includes(f))))errors.push('可信输入缺少登记来源。');
  if(a.sandboxRequires?.some(id=>!config.sandbox||!s.operations.some(o=>o.id===id)))errors.push('沙箱试验前置引用无效。');
  if(a.approval!==undefined&&typeof a.approval!=='boolean'||a.liveOnly!==undefined&&typeof a.liveOnly!=='boolean')errors.push('审批/环境开关须为布尔值。');
 }
 const req=s.transferRequirement?.security;
 if(req&&(req.authenticatedPrincipalIds?.some(id=>!ids.includes(id))||req.approvedOperationIds?.some(id=>!s.operations.some(o=>o.id===id&&o.security?.approval))||req.sandboxOperationIds?.some(id=>!config.sandbox||!s.operations.some(o=>o.id===id))||req.dataOnly!==undefined&&typeof req.dataOnly!=='boolean'))errors.push('安全迁移条件引用无效。');
 return errors;
}
