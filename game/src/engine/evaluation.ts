import type { FactMap, GameEvent, GameState, OperationDefinition, ScenarioDefinition, ToolCall } from './types';
import type { EvaluationAction, EvaluationDefinition, EvaluationEventFields, EvaluationEventType, EvaluationRun, EvaluationState } from './evaluation-contract';
import { documentProvenance } from './security';

export type EvaluationScenario = ScenarioDefinition;
export type EvaluationHost = GameState & {evaluation?: EvaluationState};
export type EvaluationEvent = Omit<GameEvent,'type'> & EvaluationEventFields & {type: GameEvent['type'] | EvaluationEventType};
export type EvaluationEmit = (state: EvaluationHost, event: Omit<EvaluationEvent,'id'|'sequence'|'attempt'>) => EvaluationEvent;
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:object,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
const identifiers=(v:unknown,max=32):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(x=>typeof x==='string'&&/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(x))&&new Set(v).size===v.length;
const map=(v:unknown,known:FactMap):v is FactMap=>object(v)&&Object.entries(v).every(([k,x])=>Object.hasOwn(known,k)&&['boolean','number','string'].includes(typeof x)&&(typeof x!=='number'||Number.isFinite(x))&&(typeof x!=='string'||x.length<=1000));
const target=(s:ScenarioDefinition,c:ToolCall)=>c.tool==='observe'?s.observations.find(o=>o.id===c.observationId)?.target:c.tool==='operate'?s.operations.find(o=>o.id===c.operationId)?.target:s.operations.find(o=>o.id===s.goals.find(g=>g.fact===c.fact)?.operationId)?.target;
export function validateEvaluationScenario(s:EvaluationScenario):string[] {
 try{return validateEvaluationInner(s);}catch{return ['评价内容结构无效。'];}
}
function validateEvaluationInner(s:EvaluationScenario):string[] {
 const e=s.evaluation,errors:string[]=[];
 if(!object(e)||!keys(e,['candidateFact','candidates','cases','metrics','criteria','gate'])||!Object.hasOwn(s.initialWorld,e.candidateFact)||typeof s.initialWorld[e.candidateFact]!=='string'||s.goals.some(g=>g.fact===e.candidateFact)||!Array.isArray(e.candidates)||!e.candidates.length||e.candidates.length>6||!Array.isArray(e.cases)||!e.cases.length||e.cases.length>8||!Array.isArray(e.metrics)||!e.metrics.length||e.metrics.length>8||!Array.isArray(e.criteria)||!e.criteria.length||e.criteria.length>8)return ['评价关卡须有设计配置事实、有限候选、案例、量测和验收条件。'];
 if(!identifiers(e.candidates.map(c=>c.id),6)||!identifiers(e.cases.map(c=>c.id),8)||!identifiers(e.metrics.map(m=>m.id),8)||!identifiers(e.criteria.map(c=>c.id),8))errors.push('评价标识重复或无效。');
 const targets=new Set([...s.observations.map(o=>o.target),...s.operations.map(o=>o.target)]);
 for(const c of e.candidates){if(!object(c)||!keys(c,['id','label','description','steps','tools','permissions'])||!c.label||!c.description||!Array.isArray(c.steps)||!c.steps.length||c.steps.length>8||!Array.isArray(c.tools)||!c.tools.length||new Set(c.tools).size!==c.tools.length||c.tools.some(t=>!['observe','operate','verify'].includes(t))||!Array.isArray(c.permissions)||!c.permissions.length||new Set(c.permissions).size!==c.permissions.length||c.permissions.some(t=>typeof t!=='string'||t!=='*'&&!targets.has(t)))errors.push('候选策略需要有限步骤和明确的工具能力边界。');
  for(const step of c.steps??[])if(!object(step)||!keys(step,['call','whenKnown'])||!object(step.call)||!['observe','operate','verify'].includes(step.call.tool)||!keys(step.call,step.call.tool==='observe'?['tool','observationId']:step.call.tool==='operate'?['tool','operationId']:['tool','fact'])||!target(s,step.call)||step.whenKnown!==undefined&&(!map(step.whenKnown,s.initialWorld)||!Object.keys(step.whenKnown).length))errors.push('测试策略步骤须是已声明工具与只基于已知字段的有限分支。');
 }
 for(const c of e.cases)if(!object(c)||!keys(c,['id','label','description','initialOverrides','category'])||!c.label||!c.description||!['normal','boundary','exception','holdout'].includes(c.category)||!map(c.initialOverrides,s.initialWorld)||Object.hasOwn(c.initialOverrides,e.candidateFact))errors.push('案例须是声明事实的隔离场景，不能改写候选版本。');
 for(const m of e.metrics){const o=s.observations.find(o=>o.id===m.observationId);if(!object(m)||!keys(m,['id','label','observationId','fact'])||!m.label||!o||!o.facts.includes(m.fact))errors.push('量测必须对应真实观察入口及其明确字段。');}
 for(const c of e.criteria){const numeric=c.atLeast!==undefined||c.atMost!==undefined;if(!object(c)||!keys(c,['id','label','metricId','equals','atLeast','atMost'])||!c.label||!e.metrics.some(m=>m.id===c.metricId)||(c.equals!==undefined)===numeric||c.equals!==undefined&&!['boolean','number','string'].includes(typeof c.equals)||typeof c.equals==='number'&&!Number.isFinite(c.equals)||c.atLeast!==undefined&&!Number.isFinite(c.atLeast)||c.atMost!==undefined&&!Number.isFinite(c.atMost)||c.atLeast!==undefined&&c.atMost!==undefined&&c.atLeast>c.atMost)errors.push('验收条件须引用量测，并明确相等值或有限数值边界。');}
 if(!object(e.gate)||!keys(e.gate,['caseIds','criterionIds','requireAll'])||!identifiers(e.gate.caseIds,8)||!e.gate.caseIds.length||e.gate.caseIds.some(id=>!e.cases.some(c=>c.id===id))||!identifiers(e.gate.criterionIds,8)||!e.gate.criterionIds.length||e.gate.criterionIds.some(id=>!e.criteria.some(c=>c.id===id))||e.gate.requireAll!==undefined&&typeof e.gate.requireAll!=='boolean')errors.push('正式验收必须有明确案例范围与同时成立的硬条件。');
 for(const o of s.operations){if([o.effects,o.protocol?.receiptEffects,...(o.protocol?.variants??[]).flatMap(v=>[v.effects,v.deltas])].some(effects=>effects&&Object.hasOwn(effects,e.candidateFact)))errors.push('候选设计事实只能由版本化评价配置改变。');if(o.evaluationRequires!==undefined&&typeof o.evaluationRequires!=='boolean')errors.push('现场评价门槛须为布尔值。');}
 for(const h of s.hooks??[])if(Object.hasOwn(h.effects??{},e.candidateFact))errors.push('环境钩子不能绕过候选配置版本。');
 return errors;
}
export function initializeEvaluation(state:EvaluationHost,generation=1,seenCaseIds:string[]=[]):void {
 state.evaluation={criterionIds:[],aggregation:'all',candidateRevision:0,contractRevision:0,runs:[],nextRun:1,generation,seenCaseIds:[...seenCaseIds].sort()};
}
const active=(state:EvaluationHost)=>state.evaluation!.runs.find(r=>r.id===state.evaluation!.activeRunId);
const sameCriteria=(a:string[],b:string[])=>[...a].sort().join('|')===[...b].sort().join('|');
export function currentEvaluationRuns(s:EvaluationScenario,state:EvaluationHost):EvaluationRun[] {
 const e=state.evaluation!;return e.runs.filter(r=>r.status==='completed'&&r.candidateId===e.candidateId&&r.candidateRevision===e.candidateRevision&&r.contractRevision===e.contractRevision);
}
export function evaluationGateDenial(s:EvaluationScenario,state:EvaluationHost):string|undefined {
 const e=state.evaluation;if(!e?.candidateId)return '还没有明确当前候选构筑与验收条件。';
 if(s.evaluation!.gate.requireAll&&e.aggregation!=='all')return '这份委托要求硬条件同时成立；至少一项成功不能代替全部硬条件。';
 if(s.evaluation!.gate.criterionIds.some(id=>!e.criterionIds.includes(id)))return '当前验收没有覆盖委托声明的全部硬条件。代理指标再绿也不能省略它们。';
 const runs=currentEvaluationRuns(s,state);
 for(const id of s.evaluation!.gate.caseIds){const r=[...runs].reverse().find(r=>r.caseId===id);if(!r)return '当前构筑与验收版本仍有要求案例未实际测完。旧版本绿色报告不能代替本次测试。';if(r.report!=='pass')return '本次所选验收契约仍有失败或未知的要求案例。证书不能背书尚未通过的契约；可补证或明确改变验收版本后重测。';if(s.evaluation!.gate.criterionIds.some(criterionId=>r.checks.find(c=>c.criterionId===criterionId)?.status!=='pass'))return '本次要求案例还有失败或未知硬条件。未知没有变成成功；可补测量入口或改变候选策略后重测。';}
}
export function currentEvaluationSeal(state:EvaluationHost):boolean {const e=state.evaluation,seal=e?.seal;return Boolean(e&&seal&&seal.candidateId===e.candidateId&&seal.candidateRevision===e.candidateRevision&&seal.contractRevision===e.contractRevision);}
export function currentCertificate(state:EvaluationHost):boolean {
 const e=state.evaluation,c=e?.certificate;return Boolean(e&&c&&e.candidateId===c.candidateId&&e.candidateRevision===c.candidateRevision&&e.contractRevision===c.contractRevision);
}
export function evaluationDeliveryDenial(s:EvaluationScenario,state:EvaluationHost,call:ToolCall):string|undefined {
 if(call.tool!=='operate'||!(s.operations.find(o=>o.id===call.operationId) as OperationDefinition&{evaluationRequires?:boolean})?.evaluationRequires)return;
 if(state.security!.realm!=='live')return '正式交付必须作用于城市现场。案例或镜砂的成功不改变现场，也不接收正式交付。';
 return evaluationGateDenial(s,state)??(!currentCertificate(state)?'案例报告不会自己签发交付证明。先核对本次验收，再申请证书；证书也不代替现场施工。':undefined);
}
export function validEvaluationAction(s:EvaluationScenario,state:EvaluationHost,a:EvaluationAction):boolean {
 if(!state.evaluation||state.status==='won'||!object(a))return false;
 const extra=a.operation==='configure'?['candidateId','criterionIds','aggregation']:a.operation==='run'?['caseId']:a.operation==='mark-seen'?['caseIds']:[];
 if(!keys(a,['id','type','operation',...extra]))return false;
 const e=state.evaluation;
 if(a.operation==='configure')return state.security!.realm==='live'&&!active(state)&&s.evaluation!.candidates.some(c=>c.id===a.candidateId)&&identifiers(a.criterionIds,8)&&a.criterionIds.length>0&&a.criterionIds.every(id=>s.evaluation!.criteria.some(c=>c.id===id))&&['all','any'].includes(a.aggregation)&&(a.candidateId!==e.candidateId||!sameCriteria(a.criterionIds,e.criterionIds)||a.aggregation!==e.aggregation);
 if(a.operation==='seal')return state.security!.realm==='live'&&!active(state)&&Boolean(e.candidateId)&&!currentEvaluationSeal(state);
 if(a.operation==='run')return !active(state)&&Boolean(e.candidateId)&&e.criterionIds.length>0&&e.runs.length<32&&state.security!.realm==='live'&&state.runtime!.missionRemaining>0&&s.evaluation!.cases.some(c=>c.id===a.caseId&&(c.category!=='holdout'||currentEvaluationSeal(state)));
 if(a.operation==='tick')return Boolean(active(state)&&state.status!=='paused'&&state.security!.realm==='live'&&state.runtime!.missionRemaining>0);
 if(a.operation==='cancel')return Boolean(active(state));
 if(a.operation==='certify')return state.security!.realm==='live'&&!active(state)&&!currentCertificate(state);
 if(a.operation==='mark-seen')return identifiers(a.caseIds,8)&&a.caseIds.length>0&&a.caseIds.every(id=>s.evaluation!.cases.some(c=>c.id===id))&&a.caseIds.some(id=>!e.seenCaseIds.includes(id)||active(state)?.caseId===id&&active(state)?.firstSeen);
 return false;
}
function notice(state:EvaluationHost,emit:EvaluationEmit,phase:NonNullable<EvaluationEventFields['evaluationPhase']>,text:string,fields:Partial<EvaluationEvent>={}):EvaluationEvent {
 const e=state.evaluation!,run=active(state);return emit(state,{type:'evaluation-change',evaluationPhase:phase,candidateRevision:e.candidateRevision,contractRevision:e.contractRevision,...(run?{evaluationRunId:run.id,evaluationCaseId:run.caseId,evaluationCandidateId:run.candidateId}:{}),text,...fields});
}
/** City actions share the mission pool; they cannot leave a runnable case after final stop. */
export function synchronizeEvaluation(state:EvaluationHost,emit:EvaluationEmit):void {
 const run=active(state);if(!run)return;
 if(state.status==='won'){run.status='cancelled';notice(state,emit,'cancelled','城市任务已完成，尚未完成的可选试验已取消。已发生的费用、案例回执与曝光保留，未完成试验不产生新证据。',{success:true});delete state.evaluation!.activeRunId;}
 else if(state.runtime!.missionRemaining===0){run.status='exhausted';notice(state,emit,'rejected','现场动作耗尽了共同委托晶石，当前试验也明确停止。未完成的报告不能自动通过。',{success:false});delete state.evaluation!.activeRunId;}
}
function selectedMetrics(s:EvaluationScenario,run:EvaluationRun){const wanted=new Set(s.evaluation!.criteria.filter(c=>run.criterionIds.includes(c.id)).map(c=>c.metricId));return s.evaluation!.metrics.filter(m=>wanted.has(m.id));}
function complete(s:EvaluationScenario,state:EvaluationHost,run:EvaluationRun,emit:EvaluationEmit):void {
 run.checks=run.criterionIds.map(id=>{const c=s.evaluation!.criteria.find(c=>c.id===id)!,m=run.measurements.find(m=>m.metricId===c.metricId);let status:'pass'|'fail'|'unknown'='unknown';if(m?.known){const pass=c.equals!==undefined?m.value===c.equals:typeof m.value==='number'&&(c.atLeast===undefined||m.value>=c.atLeast)&&(c.atMost===undefined||m.value<=c.atMost);status=pass?'pass':'fail';}return {criterionId:id,status};});
 run.report=run.aggregation==='all'?(run.checks.some(c=>c.status==='fail')?'fail':run.checks.some(c=>c.status==='unknown')?'unknown':'pass'):(run.checks.some(c=>c.status==='pass')?'pass':run.checks.some(c=>c.status==='unknown')?'unknown':'fail');run.status='completed';
 const ev=notice(state,emit,'completed',`样本测量完成：${run.report==='pass'?'这份所选规则显示通过':run.report==='fail'?'这份所选规则显示未通过':'仍有未知，不能声称已经证实'}。它只覆盖这项案例与所选条件，不改变现场，也不自动证明整个任务完成。`,{success:run.report==='pass',firstSeen:run.firstSeen});run.eventIds.push(ev.id);delete state.evaluation!.activeRunId;
}
function callCost(s:EvaluationScenario,run:EvaluationRun,call:ToolCall):number {
 const o=call.tool==='operate'?s.operations.find(o=>o.id===call.operationId):undefined;if(o?.failureCost!==undefined&&Object.entries(o.requires??{}).some(([f,v])=>run.world[f]!==v))return o.failureCost;
 return (call.tool==='observe'?s.observations.find(o=>o.id===call.observationId)?.cost:o?.cost??(call.tool==='verify'?s.goals.find(g=>g.fact===call.fact)?.verifyCost:undefined))??s.limits?.toolCosts?.[call.tool]??1;
}
function charge(s:EvaluationScenario,state:EvaluationHost,run:EvaluationRun,call:ToolCall,emit:EvaluationEmit):string|undefined {
 const cost=callCost(s,run,call);if(state.runtime!.missionRemaining<cost){run.status='exhausted';state.status='exhausted';notice(state,emit,'rejected','整项委托晶石不足，样本停止；换构筑不会补充资源。',{success:false});delete state.evaluation!.activeRunId;return;}
 state.runtime!.missionRemaining-=cost;state.runtime!.toolCalls++;state.budgetRemaining=Math.min(state.budgetRemaining,state.runtime!.missionRemaining);const callId=`${s.id}:evaluation-call:${state.runtime!.toolCalls}`;
 const e=emit(state,{type:'evaluation-request',evaluationRunId:run.id,evaluationCaseId:run.caseId,evaluationCandidateId:run.candidateId,candidateRevision:run.candidateRevision,contractRevision:run.contractRevision,realm:'sandbox',tool:call.tool,target:target(s,call),callId,cost,text:'在隔离案例中请求实际虚拟法器。成本计入整项委托；它不会替现场执行。',...(call.tool==='operate'?{operationId:call.operationId}:{})});run.eventIds.push(e.id);return callId;
}
function exercise(s:EvaluationScenario,state:EvaluationHost,run:EvaluationRun,call:ToolCall,emit:EvaluationEmit):void {
 const candidate=s.evaluation!.candidates.find(c=>c.id===run.candidateId)!,t=target(s,call)!,op=call.tool==='operate'?s.operations.find(o=>o.id===call.operationId):undefined;
 if(!candidate.tools.includes(call.tool)||!candidate.permissions.some(p=>p==='*'||p===t)||op&&((op as OperationDefinition&{evaluationRequires?:boolean}).evaluationRequires||op.security||op.memoryRequires?.length||op.sessionRequires||op.skillRequires||op.protocol||op.retryWindow||op.collaboration)){run.toolFailed=true;run.cursor=candidate.steps.length;run.status='measuring';notice(state,emit,'rejected','候选没有这件法器/目标权限，或试图借用现场身份、门令、会话、流程与协作岗位。未执行、未扣资源；改测量真实结果。',{success:false});return;}
 const callId=charge(s,state,run,call,emit);if(!callId)return;let success=false;
 const fields={evaluationRunId:run.id,evaluationCaseId:run.caseId,evaluationCandidateId:run.candidateId,candidateRevision:run.candidateRevision,contractRevision:run.contractRevision,realm:'sandbox' as const,tool:call.tool,target:t,callId};
 if(call.tool==='observe'){
  const o=s.observations.find(o=>o.id===call.observationId)!,known=Object.entries(o.availableWhen??{}).every(([f,v])=>run.world[f]===v),facts=known?Object.fromEntries(o.facts.map(f=>[f,o.reportedFacts&&Object.hasOwn(o.reportedFacts,f)?o.reportedFacts[f]:run.world[f]])):{};const e=emit(state,{...fields,type:'evaluation-observation',text:known?o.text:'观察入口不可用。没有得到这些字段，未知不能默认为正常。',facts,success:known,delivered:true});run.eventIds.push(e.id);for(const [f,value]of Object.entries(facts))run.observed[f]={value,source:'observation',eventId:e.id,provenance:documentProvenance(s,o.id,'sandbox')};
  // Missing observation is information, not a fabricated false value; the finite policy may take a safe known-only branch.
  success=true;
 }else if(call.tool==='operate'){
  const missing=Object.entries(op!.requires??{}).filter(([f,v])=>run.world[f]!==v),contextMissing=Object.entries(op!.contextRequires??{}).some(([f,v])=>run.observed[f]?.value!==v)||(op!.contextMatches??[]).some(f=>run.observed[f]?.value!==run.world[f]);success=!missing.length&&!contextMissing;const facts=success?structuredClone(op!.effects):contextMissing?{}:Object.fromEntries(missing.map(([f])=>[f,run.world[f]]));if(success)Object.assign(run.world,op!.effects);
  const e=emit(state,{...fields,type:'evaluation-result',operationId:op!.id,text:success?op!.successText:contextMissing?'候选没有实际收到所需字段；案例现场没有改变。':op!.failureText,facts,success,delivered:true});run.eventIds.push(e.id);for(const [f,value]of Object.entries(facts))run.observed[f]={value,source:'receipt',eventId:e.id,provenance:{observationId:e.id,trust:'executor',realm:'sandbox'}};
 }else{
  const g=s.goals.find(g=>g.fact===call.fact)!,facts={[g.fact]:run.world[g.fact]};success=run.world[g.fact]===g.equals;const e=emit(state,{...fields,type:'evaluation-verified',text:success?'案例中的实际状态检查通过。它不是城市现场验收。':'案例中的状态检查失败。',facts,success,delivered:true});run.eventIds.push(e.id);run.observed[g.fact]={value:run.world[g.fact],source:'verification',eventId:e.id,provenance:{observationId:e.id,trust:'executor',realm:'sandbox'}};
 }
 run.cursor++;if(!success){run.toolFailed=true;run.cursor=candidate.steps.length;}if(run.cursor===candidate.steps.length)run.status='measuring';
}
function measure(s:EvaluationScenario,state:EvaluationHost,run:EvaluationRun,emit:EvaluationEmit):void {
 const metrics=selectedMetrics(s,run),m=metrics[run.metricCursor],o=s.observations.find(o=>o.id===m.observationId)!,call:ToolCall={tool:'observe',observationId:o.id};const callId=charge(s,state,run,call,emit);if(!callId)return;
 const known=Object.entries(o.availableWhen??{}).every(([f,v])=>run.world[f]===v),value=known?(o.reportedFacts&&Object.hasOwn(o.reportedFacts,m.fact)?o.reportedFacts[m.fact]:run.world[m.fact]):undefined;
 const e=emit(state,{type:'evaluation-observation',evaluationRunId:run.id,evaluationCaseId:run.caseId,evaluationCandidateId:run.candidateId,candidateRevision:run.candidateRevision,contractRevision:run.contractRevision,metricId:m.id,realm:'sandbox',tool:'observe',target:o.target,callId,text:known?`已实际量测：${m.label}。这个入口只证明它给出的字段。`:`${m.label}的观察入口不可用，这项测量仍未知。`,facts:known?{[m.fact]:value!}:{},success:known,delivered:true});run.eventIds.push(e.id);run.measurements.push({metricId:m.id,known,...(known?{value}:{}),eventId:e.id,provenance:documentProvenance(s,o.id,'sandbox')});run.metricCursor++;if(run.metricCursor===metrics.length)complete(s,state,run,emit);
}
export function applyEvaluationAction(s:EvaluationScenario,state:EvaluationHost,a:EvaluationAction,emit:EvaluationEmit):void {
 const e=state.evaluation!;state.runtime!.executionMode='manual';
 if(a.operation==='configure'){
  if(a.candidateId!==e.candidateId){e.candidateId=a.candidateId;e.candidateRevision++;state.world[s.evaluation!.candidateFact]=a.candidateId;state.security!.revision++;}
  if(!sameCriteria(a.criterionIds,e.criterionIds)||a.aggregation!==e.aggregation){e.criterionIds=[...a.criterionIds].sort();e.aggregation=a.aggregation;e.contractRevision++;}
  delete e.certificate;delete e.seal;notice(state,emit,'configured','候选设计与验收规则已明确，现场还没有施工。旧版本报告保留供对比，不能继续为本版本背书。',{success:true});return;
 }
 if(a.operation==='seal'){e.seal={candidateId:e.candidateId!,candidateRevision:e.candidateRevision,contractRevision:e.contractRevision};notice(state,emit,'sealed','本次候选与验收版本已封存，可以打开留出样本。改构筑仍然允许，但会使这次封存与旧报告失效，已见记录继续保留。',{success:true});return;}
 if(a.operation==='run'){
  const c=s.evaluation!.cases.find(c=>c.id===a.caseId)!,firstSeen=!e.seenCaseIds.includes(c.id),run:EvaluationRun={id:`${s.id}:evaluation:${e.generation}:run:${e.nextRun++}`,caseId:c.id,candidateId:e.candidateId!,candidateRevision:e.candidateRevision,contractRevision:e.contractRevision,criterionIds:[...e.criterionIds],aggregation:e.aggregation,firstSeen,world:{...structuredClone(s.initialWorld),...structuredClone(c.initialOverrides),[s.evaluation!.candidateFact]:e.candidateId!},observed:{},cursor:0,metricCursor:0,status:'queued',toolFailed:false,measurements:[],checks:[],eventIds:[]};
  if(firstSeen)e.seenCaseIds.push(c.id);e.seenCaseIds.sort();e.runs.push(run);e.activeRunId=run.id;notice(state,emit,'queued',c.category==='holdout'?'封存样本已绑定当前构筑与验收版本，打开后会留下曝光记录。尚未执行任何测试。':'样本已经排入试验台。它有自己的现场，候选还没有看到未观察的字段。',{firstSeen,success:true});return;
 }
 if(a.operation==='tick'){
  const run=active(state)!,candidate=s.evaluation!.candidates.find(c=>c.id===run.candidateId)!;
  if(run.status==='queued'){run.status='running';notice(state,emit,'started','按有限教学策略推进样本。分支只看本案例已实际收到的字段，不读取隐藏世界。',{success:true});}
  if(run.status==='measuring')measure(s,state,run,emit);
  else{const step=candidate.steps[run.cursor];if(step.whenKnown&&Object.entries(step.whenKnown).some(([f,v])=>run.observed[f]?.value!==v)){run.cursor++;notice(state,emit,'skipped','这一分支没有获得所需已知条件，因此跳过。未知没有被当成真或假；没有请求工具、没有扣晶石。',{success:true});if(run.cursor===candidate.steps.length)run.status='measuring';}else exercise(s,state,run,step.call,emit);}
  if(state.runtime!.missionRemaining===0){state.status='exhausted';if(run.status!=='completed'){run.status='exhausted';notice(state,emit,'rejected','整项委托晶石已经耗尽，试验明确停止。',{success:false});delete e.activeRunId;}}return;
 }
 if(a.operation==='cancel'){const run=active(state)!;run.status='cancelled';notice(state,emit,'cancelled','剩余试验步骤已取消。已发生的工具费用、案例变化与曝光记录保留；城市现场没有随之回滚。',{success:true});delete e.activeRunId;return;}
 if(a.operation==='mark-seen'){
  for(const id of a.caseIds){if(!e.seenCaseIds.includes(id))e.seenCaseIds.push(id);const run=active(state);if(run?.caseId===id)run.firstSeen=false;}e.seenCaseIds.sort();notice(state,emit,'exposed','已经见过的样本记录已保守保留。它只降低初见资格，不执行工具、不产生证书或奖励。',{success:true});return;
 }
 const denial=evaluationGateDenial(s,state);
 if(denial){notice(state,emit,'rejected',denial,{success:false});return;}
 const current=currentEvaluationRuns(s,state),runIds=s.evaluation!.gate.caseIds.map(id=>[...current].reverse().find(r=>r.caseId===id)!.id);
 const ev=notice(state,emit,'certified','本版本的要求案例与硬条件已有实际测试证据。证书只覆盖这些案例；现场交付、实际验收与未测情形仍须另外处理。',{success:true});e.certificate={id:a.id,candidateId:e.candidateId!,candidateRevision:e.candidateRevision,contractRevision:e.contractRevision,runIds,eventId:ev.id};
}
export function hasEvaluationTransferEvidence(s:EvaluationScenario,state:EvaluationHost,requirements:{caseIds?:string[];freshCaseIds?:string[];certified?:boolean}):boolean {
 const runs=currentEvaluationRuns(s,state);if(requirements.certified&&!currentCertificate(state))return false;
 if(requirements.caseIds?.some(id=>!runs.some(r=>r.caseId===id&&r.report==='pass')))return false;
 if(requirements.freshCaseIds?.some(id=>!runs.some(r=>r.caseId===id&&r.firstSeen&&r.report==='pass')))return false;
 return Boolean(requirements.certified||requirements.caseIds?.length||requirements.freshCaseIds?.length);
}
