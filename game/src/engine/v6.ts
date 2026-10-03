import type { AgentBlueprint, FactMap, GameAction, GameEvent, GameState, OperationDefinition, ScenarioDefinition, ToolCall, ToolName } from './types';
import { initializeMemory, validateMemoryScenario, validArchiveAction, applyArchiveAction, archivePrerequisites, finishSkillCall } from './memory';
import { defaultBlueprint } from './legacy-v1';
import { validateScenario as validateOldScenario } from './v2';
import { validateBlueprint as validateProtocolBlueprint } from './v3';
import { validateProtocol, receiveReceipt, executeProtocol } from './protocol';

const tools:ToolName[]=['observe','operate','verify'];
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const same=(left:unknown,right:unknown):boolean=>{
  if(Object.is(left,right))return true;
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>same(item,right[index]));
  if(record(left)&&record(right))return Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>own(right,key)&&same(left[key],right[key]));
  return false;
};
export const getRemainingBudget=(state:GameState):number=>Math.min(state.budgetRemaining,state.runtime?.missionRemaining??Infinity);

function targetOf(scenario:ScenarioDefinition,call:ToolCall):string|undefined {
  if(call.tool==='observe')return scenario.observations.find(item=>item.id===call.observationId)?.target;
  if(call.tool==='operate')return scenario.operations.find(item=>item.id===call.operationId)?.target;
  const goal=scenario.goals.find(item=>item.fact===call.fact);
  return scenario.operations.find(item=>item.id===goal?.operationId)?.target;
}
export function getToolCost(scenario:ScenarioDefinition,call:ToolCall):number {
  if(!targetOf(scenario,call))return Infinity;
  const specific=call.tool==='observe'?scenario.observations.find(item=>item.id===call.observationId)?.cost:call.tool==='operate'?scenario.operations.find(item=>item.id===call.operationId)?.cost:scenario.goals.find(item=>item.fact===call.fact)?.verifyCost;
  return specific??scenario.limits?.toolCosts?.[call.tool]??1;
}
/** Execution cost may depend on real preconditions; it is never supplied to the policy. */
function executionCost(scenario:ScenarioDefinition,state:GameState,call:ToolCall):number {
  if(call.tool==='operate'){
    const operation=scenario.operations.find(item=>item.id===call.operationId);
    if(operation?.failureCost!==undefined&&Object.entries(operation.requires??{}).some(([fact,value])=>state.world[fact]!==value))return operation.failureCost;
  }
  return getToolCost(scenario,call);
}
export function validateBlueprint(scenario:ScenarioDefinition,blueprint:AgentBlueprint):string[]{
  const {loopPolicy,...base}=blueprint;
  const errors=validateProtocolBlueprint({...scenario,engineVersion:3},base);
  if(loopPolicy!==undefined&&(!record(loopPolicy)||Object.keys(loopPolicy).some(key=>!['maxCalls','maxRetries','permanentFailure'].includes(key))||!Number.isInteger(loopPolicy.maxCalls)||loopPolicy.maxCalls<1||loopPolicy.maxCalls>64||!Number.isInteger(loopPolicy.maxRetries)||loopPolicy.maxRetries<0||loopPolicy.maxRetries>8||!['stop','repair'].includes(loopPolicy.permanentFailure)))errors.push('回路限制需要 1–64 次调用、0–8 次重试，以及明确的永久故障策略。');
  return errors;
}
export function validateScenario(scenario:ScenarioDefinition):string[]{
  // Project declared parameter effects for the fixed-effect v2 validator only.
  // Execution still applies exactly the chosen v3 branch and its guards.
  const compatible={...scenario,engineVersion:2 as const,operations:scenario.operations.map(operation=>{
    if(!operation.protocol)return operation;
    const effects={...operation.effects,...operation.protocol.receiptEffects};
    for(const variant of operation.protocol.variants??[]){
      Object.assign(effects,variant.effects);
      for(const [fact,delta] of Object.entries(variant.deltas??{}))effects[fact]=Number(scenario.initialWorld[fact])+delta;
    }
    for(const goal of scenario.goals.filter(goal=>goal.operationId===operation.id)) {
      if(operation.protocol.variants?.some(variant=>variant.effects?.[goal.fact]===goal.equals || (typeof goal.equals==='number'&&variant.deltas?.[goal.fact]!==undefined)))effects[goal.fact]=goal.equals;
    }
    return {...operation,effects};
  })};
  if(compatible.transferRequirement?.receiptCount&&!compatible.transferRequirement.operationIds?.length&&!compatible.transferRequirement.reconfiguration)delete compatible.transferRequirement;
  return [...validateOldScenario(compatible),...validateContextScenario(scenario),...validateMemoryScenario(scenario),...(scenario.engineVersion!==6?['卷轴关卡必须使用内核 6。']:[]),...validateProtocol(scenario),...scenario.operations.flatMap(operation=>{
    const errors:string[]=[];
    if(operation.failureKind!==undefined&&!['temporary','permanent'].includes(operation.failureKind))errors.push('未知故障分类。');
    if(operation.retryWindow&&(operation.failureKind!=='temporary'||operation.protocol||!Number.isInteger(operation.retryWindow.attempts)||operation.retryWindow.attempts<1||operation.retryWindow.attempts>8||scenario.initialWorld[operation.retryWindow.readyFact]!==false||operation.requires?.[operation.retryWindow.readyFact]!==true))errors.push('冷却窗口必须声明短暂故障、1–8 次尝试、初始未就绪的实际前置条件。');
    return errors;
  })];
}
export function createGame(scenario:ScenarioDefinition,seed=1):GameState {
  const errors=validateScenario(scenario);if(errors.length)throw new Error(errors.join('；'));
  if(!Number.isSafeInteger(seed))throw new Error('种子必须是安全整数');
  const missionRemaining=scenario.limits?.missionBudget??64,budget=Math.min(defaultBlueprint.budget,scenario.limits?.maxBudget??64,missionRemaining);
  const state:GameState = {kernelVersion:6,context:{records:[],activeIds:[],capacity:scenario.contextCapacity!},control:{dispatchCalls:0,failures:{},attempts:{}},protocol:{receipts:[],ledger:[],droppedOperations:[]},scenarioId:scenario.id,scenarioVersion:scenario.version??1,seed,world:{...scenario.initialWorld},observed:{},blueprint:{...structuredClone(defaultBlueprint),budget,loopPolicy:{maxCalls:8,maxRetries:0,permanentFailure:'stop'}},status:'ready',budgetRemaining:budget,attempt:0,events:[],verifiedGoals:[],processedActionIds:[],learningEvidence:[],hintUsed:false,runtime:{missionRemaining,toolCalls:0,triggeredHookIds:[],executionMode:'manual',actionHistory:[]}};
  initializeMemory(scenario,state);return state;
}
function emit(state:GameState,event:Omit<GameEvent,'id'|'sequence'|'attempt'>):GameEvent {
  const sequence=state.events.length+1,value={...event,id:`${state.scenarioId}:event:${sequence}`,sequence,attempt:state.attempt};state.events.push(value);return value;
}
export const contextUnits=(scenario:ScenarioDefinition,state:GameState):number=>state.context?.activeIds.reduce((sum,id)=>{const card=state.context!.records.find(r=>r.id===id)!;const summary=scenario.observations.find(o=>o.id===card.observationId)?.document?.summaries?.find(s=>s.id===card.summaryId);return sum+(summary?.units??card.units);},0)??0;
function rebuildContext(scenario:ScenarioDefinition,state:GameState):void {
  state.observed={};
  for(const id of state.context!.activeIds){
    const card=state.context!.records.find(r=>r.id===id)!;
    const summary=scenario.observations.find(o=>o.id===card.observationId)?.document?.summaries?.find(s=>s.id===card.summaryId);
    for(const [fact,value] of Object.entries(card.facts))if(!summary||summary.retain.includes(fact))state.observed[fact]={value,source:card.origin?'memory':'observation',eventId:card.eventId};
  }
  const reply=state.context!.reply;
  if(reply)for(const [fact,value] of Object.entries(reply.facts))state.observed[fact]={value,source:reply.source,eventId:reply.eventId};
}
// One bounded working reply is reserved separately from the finite document deck.
// Older replies remain in the log, not silently in the actor's active context.
function supply(state:GameState,facts:FactMap,source:'observation'|'receipt'|'verification',eventId:string):void {
  state.context!.reply={facts:structuredClone(facts),source,eventId};
  // Rebuilding needs authored summary metadata; execute() performs it before the next decision.
}
function validateContextScenario(scenario:ScenarioDefinition):string[]{
  const errors:string[]=[];
  if(!Number.isInteger(scenario.contextCapacity)||scenario.contextCapacity!<1||scenario.contextCapacity!>16)errors.push('资料卷轴容量必须为 1–16 格。');
  if(scenario.operations.some(o=>o.protocol))errors.push('内核 6 的文档关卡暂不组合延迟协议。');
  for(const o of scenario.observations){
    if(!o.document||!Number.isInteger(o.document.units)||o.document.units<1||o.document.units>16||typeof o.document.source!=='string'||!o.document.source.trim())errors.push(`资料须有容量与来源：${o.id}`);
    const ids=new Set<string>();
    for(const summary of o.document?.summaries??[]){
      if(!/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(summary.id)||ids.has(summary.id)||!summary.label||!Number.isInteger(summary.units)||summary.units<1||summary.units>=o.document!.units||!Array.isArray(summary.retain)||!summary.retain.length||new Set(summary.retain).size!==summary.retain.length||summary.retain.some(f=>!o.facts.includes(f)))errors.push(`摘要必须保留原资料中的明确字段：${o.id}`);
      ids.add(summary.id);
    }
  }
  for(const operation of scenario.operations)for(const [fact,value] of Object.entries(operation.contextRequires??{}))if(!own(scenario.initialWorld,fact)||!['boolean','number','string'].includes(typeof value)||!scenario.observations.some(o=>o.facts.includes(fact)))errors.push(`行动输入缺少可检索来源：${operation.id}/${fact}`);
  for(const operation of scenario.operations)if(operation.contextMatches?.some(f=>!own(scenario.initialWorld,f)||!scenario.observations.some(o=>o.facts.includes(f))))errors.push('动态行动输入缺少资料来源。');
  for(const id of scenario.transferRequirement?.contextIds??[])if(!scenario.observations.some(o=>o.id===id))errors.push('迁移要求未知资料。');
  for(const id of scenario.transferRequirement?.summaryIds??[])if(!scenario.observations.some(o=>o.document?.summaries?.some(s=>s.id===id)))errors.push('迁移要求未知摘要。');
  return errors;
}
function permitted(state:GameState,tool:ToolName,target:string):boolean {const values=state.blueprint.toolPermissions?.[tool]??state.blueprint.permissions;return values.includes('*')||values.includes(target);}

/** The strategy projects away the world and only follows received facts and selected goals. */
function choosePlannedCall(scenario:ScenarioDefinition,state:GameState):ToolCall|null {
  const {observed,blueprint,verifiedGoals}=state,order=blueprint.goalOrder??scenario.goals.map(goal=>goal.fact);
  const goal=scenario.goals.find(goal=>goal.fact===order.find(fact=>!verifiedGoals.includes(fact)));if(!goal)return null;
  const known=(fact:string)=>own(observed,fact)?observed[fact].value:undefined;
  if(known(goal.fact)===goal.equals)return blueprint.verification&&blueprint.tools.includes('verify')?{tool:'verify',fact:goal.fact}:null;
  if(known(goal.fact)===undefined&&blueprint.tools.includes('observe')){const observation=scenario.observations.find(item=>item.facts.includes(goal.fact));if(observation&&!state.context!.records.some(r=>r.observationId===observation.id))return {tool:'observe',observationId:observation.id};}
  if(!blueprint.tools.includes('operate'))return null;
  const resolve=(operation:OperationDefinition,visited=new Set<string>()):OperationDefinition|null=>{
    if(visited.has(operation.id))return null;visited.add(operation.id);
    if(Object.entries(operation.contextRequires??{}).some(([fact,value])=>known(fact)!==value))return null;
    if(operation.contextMatches?.some(fact=>known(fact)===undefined))return null;
    for(const [fact,expected]of Object.entries(operation.requires??{}))if(known(fact)!==undefined&&known(fact)!==expected){const repair=scenario.operations.find(item=>item.effects[fact]===expected);return repair?resolve(repair,visited):null;}
    return operation;
  };
  const requested=scenario.operations.find(item=>item.id===goal.operationId),next=requested?resolve(requested):null;
  return next?{tool:'operate',operationId:next.id,...(next.protocol?{arguments:structuredClone(blueprint.toolArguments?.[next.id]??next.protocol.defaults),...(blueprint.stableRequestKeys?{requestKey:`auto-order/${scenario.operations.indexOf(next)+1}`}:{})}:{})}:null;
}
export const loopPolicy=(state:GameState)=>state.blueprint.loopPolicy??{maxCalls:8,maxRetries:0,permanentFailure:'stop' as const};
export function chooseNextCall(scenario:ScenarioDefinition,state:GameState):ToolCall|null {
  const queue=state.memory?.queue;
  if(queue?.status==='running')return structuredClone(scenario.memory!.skills.find(s=>s.id===queue.skillId)!.steps[queue.cursor]);
  if(queue?.status==='failed')return null;
  const failed=state.control?.lastFailure;
  if(failed?.kind==='temporary' && (state.control!.failures[failed.operationId]??0)<=loopPolicy(state).maxRetries)return structuredClone(failed.call);
  const planned=choosePlannedCall(scenario,state);
  if(planned)return planned;
  const order=state.blueprint.goalOrder??scenario.goals.map(goal=>goal.fact),goal=scenario.goals.find(g=>g.fact===order.find(fact=>!state.verifiedGoals.includes(fact)));
  const operation=scenario.operations.find(op=>op.id===goal?.operationId);
  // A known cooling device may be probed; its received error determines whether to retry.
  return operation?.failureKind==='temporary' && state.blueprint.tools.includes('operate') ? {tool:'operate',operationId:operation.id} : null;
}
function stopPolicy(state:GameState,reason:NonNullable<GameState['control']>['stopReason'],text:string):void {
  state.control!.stopReason=reason;state.status='stalled';state.runtime!.executionMode='manual';
  emit(state,{type:'policy-stop',text,success:false});
}
function applyHooks(scenario:ScenarioDefinition,state:GameState,operationId?:string):void {
  for(const hook of scenario.hooks??[]){
    if(state.runtime!.triggeredHookIds.includes(hook.id))continue;
    if(hook.trigger.type==='after-call'?state.runtime!.toolCalls!==hook.trigger.call:hook.trigger.operationId!==operationId)continue;
    if(Object.entries(hook.when??{}).some(([fact,value])=>state.world[fact]!==value))continue;
    state.runtime!.triggeredHookIds.push(hook.id);
    if(hook.effects){Object.assign(state.world,hook.effects);state.verifiedGoals=state.verifiedGoals.filter(fact=>!own(hook.effects!,fact));emit(state,{type:'world-change',hookId:hook.id,text:hook.notice?.text??'环境发生了变化，先前收到的信息没有自动更新。',facts:{...hook.effects},delivered:false});}
    if(hook.notice)emit(state,{type:hook.notice.trust==='untrusted'?'untrusted-message':'environment',hookId:hook.id,text:hook.notice.text,delivered:false,...(hook.notice.reportedFacts?{reportedFacts:{...hook.notice.reportedFacts}}:{})});
  }
}
function hasTransferEvidence(scenario:ScenarioDefinition,state:GameState):boolean {
  const requirement=scenario.transferRequirement;if(scenario.kind!=='transfer'||state.hintUsed||!requirement)return false;
  let start=0;const history=state.runtime!.actionHistory;history.forEach((action,index)=>{if(action.type==='reset')start=index+1;});
  const current=history.slice(start);
  if(requirement.operationIds?.some(id=>!current.some(action=>action.type==='tool'&&action.call.tool==='operate'&&action.call.operationId===id&&state.events.some(event=>event.type==='result'&&event.actionId===action.id&&event.success))))return false;
  if(requirement.receiptCount && new Set(current.filter(action=>action.type==='receive').flatMap(action=>state.events.filter(e=>e.actionId===action.id&&e.receiptId&&e.success&&e.delivered).map(e=>e.operationId))).size<requirement.receiptCount)return false;
  if(requirement.reconfiguration){
    const builds=current.map((action,index)=>({action,index})).filter((item):item is {action:Extract<GameAction,{type:'configure'}>;index:number}=>item.action.type==='configure');
    const realSwap=builds.some((earlier,index)=>builds.slice(index+1).some(later=>[...earlier.action.blueprint.tools].sort().join(',')!==[...later.action.blueprint.tools].sort().join(',')&&current.slice(earlier.index+1,later.index).some(action=>state.events.some(event=>event.type==='request'&&event.actionId===action.id))));
    if(!realSwap)return false;
  }
  if(requirement.contextIds?.some(id=>!current.some(a=>a.type==='context'&&a.operation==='include'&&state.context!.records.find(r=>r.id===a.recordId)?.observationId===id)))return false;
  if(requirement.summaryIds?.some(id=>!current.some(a=>a.type==='context'&&a.operation==='summarize'&&a.summaryId===id)))return false;
  if(requirement.memoryKeys?.some(key=>!current.some(a=>a.type==='memory'&&a.key===key&&['write','revise'].includes(a.operation))||!current.some(a=>a.type==='memory'&&a.key===key&&a.operation==='recall')))return false;
  if(requirement.skillIds?.some(id=>!current.some(a=>a.type==='skill'&&a.skillId===id&&a.operation==='save')||!state.memory!.runs.some(r=>r.skillId===id)))return false;
  if(requirement.freshSessions && state.sessions!.fresh<requirement.freshSessions)return false;
  return Boolean(requirement.memoryKeys?.length||requirement.skillIds?.length||requirement.freshSessions||requirement.operationIds?.length||requirement.reconfiguration||requirement.receiptCount||requirement.contextIds?.length);
}
function win(scenario:ScenarioDefinition,state:GameState):void {
  if(!scenario.goals.every(goal=>state.world[goal.fact]===goal.equals&&state.verifiedGoals.includes(goal.fact)))return;
  state.status='won';state.runtime!.executionMode='manual';
  const event=emit(state,{type:'victory',text:'每一项完成条件都有仍然有效的实际证据。契约履行了。',success:true});
  state.learningEvidence=scenario.concepts.map(concept=>({concept,scenarioId:scenario.id,level:hasTransferEvidence(scenario,state)?'independent-transfer':'guided',eventIds:[...state.events.filter(item=>item.type==='verified'&&item.success).map(item=>item.id),event.id]}));
}
function exhausted(state:GameState,cost=1):void {
  state.status='exhausted';state.runtime!.executionMode='manual';
  emit(state,{type:'exhausted',text:state.runtime!.missionRemaining===0?'委托晶石已经耗尽。换装和重新派遣不会补充资源；请复盘后重置整个委托。':`剩余预算不足以支付下一次请求（需要 ${cost} 点）。可调整派遣预算、尝试更低成本的策略，或重置委托。`});
}
function validCall(scenario:ScenarioDefinition,state:GameState,call:ToolCall):boolean {
  if(!call||!tools.includes(call.tool)||!state.blueprint.tools.includes(call.tool))return false;
  const keys=call.tool==='observe'?['tool','observationId']:call.tool==='operate'?['tool','operationId','arguments','requestKey']:['tool','fact'];
  if(call.tool==='operate'&&!scenario.operations.find(operation=>operation.id===call.operationId)?.protocol&&(call.arguments!==undefined||call.requestKey!==undefined))return false;
  if(call.tool==='operate'&&((call.arguments!==undefined&&(!record(call.arguments)||Object.keys(call.arguments).length>20||Object.values(call.arguments).some(value=>!['string','number','boolean'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value))||(typeof value==='string'&&value.length>200))))||(call.requestKey!==undefined&&(typeof call.requestKey!=='string'||!call.requestKey.trim()||call.requestKey.length>64))))return false;
  return Object.keys(call).every(key=>keys.includes(key))&&targetOf(scenario,call)!==undefined;
}
function execute(scenario:ScenarioDefinition,state:GameState,call:ToolCall):void {
  const cost=executionCost(scenario,state,call),target=targetOf(scenario,call)!;
  if(!permitted(state,call.tool,target)){emit(state,{type:'blocked',tool:call.tool,target,text:'契约没有授权这个目标。未执行、未扣资源。请调整该法器的访问范围。',success:false,delivered:false});state.status='stalled';state.runtime!.executionMode='manual';return;}
  if(getRemainingBudget(state)<cost){exhausted(state,cost);return;}
  const callId=`${scenario.id}:call:${state.runtime!.toolCalls+1}`;
  state.budgetRemaining-=cost;state.runtime!.missionRemaining-=cost;state.runtime!.toolCalls++;
  const actionId=state.runtime!.actionHistory.at(-1)!.id;
  emit(state,{type:'request',tool:call.tool,target,callId,cost,actionId,...(call.tool==='operate'?{...(call.arguments!==undefined?{arguments:call.arguments}:{}),...(call.requestKey!==undefined?{requestKey:call.requestKey}:{})}:{}),text:`回声请求${call.tool==='observe'?'观察':call.tool==='verify'?'验收':'操作'}，消耗 ${cost} 点晶石。`,...(call.tool==='operate'?{operationId:call.operationId}:{})});
  let successfulOperation:string|undefined;
  if(call.tool==='observe'){
    const definition=scenario.observations.find(item=>item.id===call.observationId)!,available=Object.entries(definition.availableWhen??{}).every(([f,v])=>state.world[f]===v),facts=available?Object.fromEntries(definition.facts.map(fact=>[fact,state.world[fact]])):{};
    const event=emit(state,{type:'observation',tool:'observe',target,callId,text:available?definition.text:'资料柜已经关闭，未读到新内容。可以回到现场重新开启，或检索你之前保存的档案。',facts,success:available,delivered:false});
    if(available)state.context!.records.push({id:event.id,observationId:definition.id,label:definition.label,source:definition.document!.source,text:definition.text,eventId:event.id,facts:structuredClone(facts),units:definition.document!.units});
    if(available)emit(state,{type:'context-change',text:'资料已进档案，尚未装入当前卷轴。打开卷轴台选择携带，回声才能使用它。',delivered:false});
  }else if(call.tool==='operate'&&scenario.operations.find(o=>o.id===call.operationId)?.protocol){
    const operation=scenario.operations.find(o=>o.id===call.operationId)!;
    executeProtocol(state,operation,call,callId,actionId,emit,supply);
    if(state.events.some(e=>e.actionId===actionId&&e.type==='result'&&e.success&&!e.replayed))successfulOperation=operation.id;
  }else if(call.tool==='operate'){
    const operation=scenario.operations.find(item=>item.id===call.operationId)!,contextMissing=[...Object.entries(operation.contextRequires??{}).filter(([fact,value])=>state.observed[fact]?.value!==value),...(operation.contextMatches??[]).filter(fact=>state.observed[fact]?.value!==state.world[fact]).map(fact=>[fact,state.world[fact]])],missing=Object.entries(operation.requires??{}).filter(([fact,value])=>state.world[fact]!==value),archiveMissing=!archivePrerequisites(scenario,state,operation.id),success=missing.length===0&&contextMissing.length===0&&!archiveMissing;
    const facts=success?{...operation.effects}:contextMissing.length||archiveMissing?{}:Object.fromEntries(missing.map(([fact])=>[fact,state.world[fact]]));
    if(success){Object.assign(state.world,operation.effects);state.verifiedGoals=state.verifiedGoals.filter(fact=>!own(operation.effects,fact));successfulOperation=operation.id;}
    const event=emit(state,{type:'result',tool:'operate',operationId:operation.id,target,callId,actionId,text:success?operation.successText:archiveMissing?'缺少当前有效档案的装卷、会话交接或已执行流程的证据。档案、会话和技能不会代替实际动作；现场未改变。':contextMissing.length?'请求没有携带契约所需的资料字段，或字段与要求不符。装置拒绝执行，现场没有改变。请检索、装卷或检查摘要保留内容。':operation.failureText,facts,success,delivered:state.blueprint.feedback});
    if(state.blueprint.feedback)supply(state,facts,'receipt',event.id);
    else {emit(state,{type:'claim',text:'法器给出了结果，但反馈未接通。回声不能使用没有收到的回执继续决定。',success:false});state.status='stalled';state.runtime!.executionMode='manual';}
  }else{
    const goal=scenario.goals.find(item=>item.fact===call.fact)!,success=state.world[goal.fact]===goal.equals,facts={[goal.fact]:state.world[goal.fact]};
    const event=emit(state,{type:'verified',tool:'verify',target,callId,text:success?`状态检查通过：${goal.label}。`:`状态检查未通过：${goal.label}还没有实现。`,facts,success,delivered:true});supply(state,facts,'verification',event.id);
    if(success&&!state.verifiedGoals.includes(goal.fact))state.verifiedGoals.push(goal.fact);
    if(!success)state.verifiedGoals=state.verifiedGoals.filter(fact=>fact!==goal.fact);
  }
  rebuildContext(scenario,state);
  state.control!.dispatchCalls++;
  if(call.tool==='operate') {
    const operation=scenario.operations.find(op=>op.id===call.operationId)!;
    state.control!.attempts[operation.id]=(state.control!.attempts[operation.id]??0)+1;
    const result=[...state.events].reverse().find(event=>event.type==='result'&&event.actionId===actionId);
    if(result?.delivered && !result.success) {
      const kind=operation.failureKind??'permanent';result.failureKind=kind;
      state.control!.failures[operation.id]=(state.control!.failures[operation.id]??0)+1;
      state.control!.lastFailure={operationId:operation.id,call:structuredClone(call),kind,eventId:result.id};
    }else if(result?.delivered&&result.success) {delete state.control!.lastFailure;delete state.control!.failures[operation.id];}
    const window=operation.retryWindow;
    if(window && state.control!.attempts[operation.id]===window.attempts && state.world[window.readyFact]===false) {
      state.world[window.readyFact]=true;
      emit(state,{type:'world-change',text:'冷却窗口已经结束，装置在现场恢复就绪。旧回执没有自动更新；再次请求或观察才会收到新证据。',facts:{[window.readyFact]:true},delivered:false});
    }
  }
  applyHooks(scenario,state,successfulOperation);finishSkillCall(scenario,state,call,emit);win(scenario,state);
  if(state.status==='running'&&getRemainingBudget(state)>0) {
    const policy=loopPolicy(state),failed=state.control!.lastFailure;
    if(failed?.kind==='permanent'&&policy.permanentFailure==='stop')stopPolicy(state,'permanent-failure','回路停止：这是需要改方案的故障。先修复前置条件，再继续；原样重试不会解决它。');
    else if(failed?.kind==='temporary'&&(state.control!.failures[failed.operationId]??0)>policy.maxRetries)stopPolicy(state,'retry-limit',`回路停止：短暂故障的额外重试上限 ${policy.maxRetries} 次已经用尽。失败回执与世界保留，等待你的介入。`);
    else if(state.control!.dispatchCalls>=policy.maxCalls)stopPolicy(state,'call-limit',`回路停止：本次派遣已到 ${policy.maxCalls} 次调用上限。增加晶石不会自动提高这个限制。`);
  }
  if(state.status==='running'&&getRemainingBudget(state)===0)exhausted(state);
}
function actionShape(action:GameAction):boolean {
  if(!action||typeof action.id!=='string'||!action.id.trim()||action.id.length>200)return false;
  const keys=action.type==='memory'?['id','type','operation','key','recordId']:action.type==='session'?['id','type','operation','branchId','label']:action.type==='skill'?['id','type','operation','skillId']:action.type==='context'?['id','type','operation','recordId','summaryId']:action.type==='receive'?['id','type','callId','receiptId']:action.type==='configure'?['id','type','blueprint']:action.type==='tool'?['id','type','call']:action.type==='reset'?['id','type','preserveBlueprint']:action.type==='dispatch'||action.type==='resume'?['id','type','mode']:action.type==='step'?['id','type','source']:['id','type'];
  if(Object.keys(action).some(key=>!keys.includes(key)))return false;
  if((action.type==='dispatch'||action.type==='resume')&&action.mode!==undefined&&!['manual','automatic'].includes(action.mode))return false;
  if(action.type==='step'&&action.source!==undefined&&!['player','scheduler'].includes(action.source))return false;
  if(action.type==='reset'&&action.preserveBlueprint!==undefined&&typeof action.preserveBlueprint!=='boolean')return false;
  return true;
}
function validContextAction(scenario:ScenarioDefinition,state:GameState,action:Extract<GameAction,{type:'context'}>):boolean {
  if(state.status==='won'||!['include','exclude','summarize','expand'].includes(action.operation)||typeof action.recordId!=='string')return false;
  const card=state.context!.records.find(r=>r.id===action.recordId);if(!card)return false;
  const active=state.context!.activeIds.includes(card.id);
  if(action.operation==='include'&&active||action.operation==='exclude'&&!active)return false;
  if(action.operation!=='summarize'&&action.summaryId!==undefined)return false;
  if(action.operation==='expand'&&!card.summaryId)return false;
  if(action.operation==='summarize'&&(typeof action.summaryId!=='string'||card.summaryId===action.summaryId||!scenario.observations.find(o=>o.id===card.observationId)?.document?.summaries?.some(s=>s.id===action.summaryId)))return false;
  const candidate=structuredClone(state);
  const changed=candidate.context!.records.find(r=>r.id===card.id)!;
  if(action.operation==='include')candidate.context!.activeIds.push(card.id);
  if(action.operation==='exclude')candidate.context!.activeIds=candidate.context!.activeIds.filter(id=>id!==card.id);
  if(action.operation==='summarize')changed.summaryId=action.summaryId;
  if(action.operation==='expand')delete changed.summaryId;
  return contextUnits(scenario,candidate)<=candidate.context!.capacity;
}
function applyContextAction(scenario:ScenarioDefinition,state:GameState,action:Extract<GameAction,{type:'context'}>):void {
  const card=state.context!.records.find(r=>r.id===action.recordId)!;
  if(action.operation==='include')state.context!.activeIds.push(card.id);
  if(action.operation==='exclude')state.context!.activeIds=state.context!.activeIds.filter(id=>id!==card.id);
  if(action.operation==='summarize')card.summaryId=action.summaryId;
  if(action.operation==='expand')delete card.summaryId;
  rebuildContext(scenario,state);state.runtime!.executionMode='manual';
  emit(state,{type:'context-change',actionId:action.id,text:`${card.label}：${{include:'已装入当前卷轴',exclude:'已移回档案',summarize:'改用选定摘要',expand:'恢复完整原文'}[action.operation]}。卷轴 ${contextUnits(scenario,state)}/${state.context!.capacity} 格；现场与任务资源未改变。`,delivered:true,facts:Object.fromEntries(Object.entries(state.observed).map(([fact,r])=>[fact,r.value]))});
}
export function reduceGame(scenario:ScenarioDefinition,previous:GameState,action:GameAction):GameState {
  if(previous.kernelVersion!==6||!previous.context||!previous.control||!previous.runtime||previous.scenarioId!==scenario.id||previous.scenarioVersion!==(scenario.version??1)||!actionShape(action)||previous.processedActionIds.includes(action.id))return previous;
  switch(action.type){
    case 'memory':case 'session':case 'skill':if(!validArchiveAction(scenario,previous,action))return previous;break;
    case 'context':if(!validContextAction(scenario,previous,action))return previous;break;
    case 'configure':if(!['ready','paused','stalled','exhausted'].includes(previous.status)||validateBlueprint(scenario,action.blueprint).length)return previous;break;
    case 'dispatch':if(!['ready','stalled','exhausted'].includes(previous.status)||previous.runtime.missionRemaining<=0)return previous;break;
    case 'step':if(previous.status!=='running'||getRemainingBudget(previous)<=0||(action.source==='scheduler'&&previous.runtime.executionMode!=='automatic'))return previous;break;
    case 'tool':if(previous.status!=='running'||!validCall(scenario,previous,action.call)||!permitted(previous,action.call.tool,targetOf(scenario,action.call)!)||getRemainingBudget(previous)<executionCost(scenario,previous,action.call))return previous;break;
    case 'receive':if(!['ready','running','paused','stalled','exhausted'].includes(previous.status)||!previous.blueprint.feedback||!previous.protocol?.receipts.some(r=>r.id===action.receiptId&&r.callId===action.callId&&!r.collected))return previous;break;
    case 'pause':if(previous.status!=='running')return previous;break;
    case 'resume':if(previous.status!=='paused'||getRemainingBudget(previous)<=0)return previous;break;
    case 'hint':if(previous.hintUsed||previous.status==='won')return previous;break;
    case 'reset':break;
    default:return previous;
  }
  let state:GameState;
  if(action.type==='reset'){
    state=createGame(scenario,previous.seed);state.hintUsed=previous.hintUsed;
    state.memory={entries:structuredClone(previous.memory!.entries),skills:structuredClone(previous.memory!.skills),runs:[]};
    if(action.preserveBlueprint!==false)state.blueprint=structuredClone(previous.blueprint);
    state.budgetRemaining=Math.min(state.blueprint.budget,state.runtime!.missionRemaining);state.processedActionIds=[...previous.processedActionIds];state.runtime!.actionHistory=structuredClone(previous.runtime.actionHistory);
    emit(state,{type:'reset',text:'世界与晶石一起回到委托起点。持久档案与已学流程保留；当前会话、流程执行证据重新开始。历史通关和提示使用记录保留。'});
  }else state=structuredClone(previous);
  state.processedActionIds.push(action.id);state.runtime!.actionHistory.push(structuredClone(action));
  if(action.type==='memory'||action.type==='session'||action.type==='skill'){applyArchiveAction(scenario,state,action,emit,()=>rebuildContext(scenario,state));}
  else if(action.type==='context'){applyContextAction(scenario,state,action);}
  else if(action.type==='configure'){
    state.blueprint=structuredClone(action.blueprint);delete state.control!.stopReason;state.budgetRemaining=Math.min(state.blueprint.budget,state.runtime!.missionRemaining);state.status='ready';state.runtime!.executionMode='manual';
    emit(state,{type:'configured',text:`构筑已改变，世界与上下文保留。委托仍剩 ${state.runtime!.missionRemaining} 点晶石，换装不会补充。`});
  }else if(action.type==='dispatch'){
    state.control!.dispatchCalls=0;state.control!.failures={};delete state.control!.stopReason;state.attempt++;state.status='running';state.runtime!.executionMode=action.mode??'automatic';state.budgetRemaining=Math.min(state.blueprint.budget,state.runtime!.missionRemaining);
    const event=emit(state,{type:'dispatched',text:`回声开始${state.runtime!.executionMode==='automatic'?'自动行动':'等待逐步指挥'}。委托剩余 ${state.runtime!.missionRemaining} 点晶石。`});
    if(!state.learningEvidence.length)state.learningEvidence=scenario.concepts.map(concept=>({concept,scenarioId:scenario.id,level:'seen',eventIds:[event.id]}));
  }else if(action.type==='step'){
    if(action.source!=='scheduler')state.runtime!.executionMode='manual';
    const pending=state.protocol!.receipts.find(r=>!r.collected);
    if(pending&&state.blueprint.feedback){receiveReceipt(state,pending,emit,supply);win(scenario,state);return state;}
    const call=chooseNextCall(scenario,state);if(call)execute(scenario,state,call);
    else {emit(state,{type:'claim',text:state.blueprint.tools.includes('operate')?'当前卷轴缺少可用的行动输入。检索资料并装入卷轴，或检查是否被摘要丢掉；档案中读过的资料不会自动进入本轮上下文。':'“已经完成了。”——语言没有执行任何法器，完成条件仍需要实际证据。',success:false});state.status='stalled';state.runtime!.executionMode='manual';}
  }else if(action.type==='tool'){delete state.memory!.queue;state.runtime!.executionMode='manual';execute(scenario,state,action.call);}
  else if(action.type==='receive'){const receipt=state.protocol!.receipts.find(r=>r.id===action.receiptId)!;receiveReceipt(state,receipt,emit,supply);win(scenario,state);}
  else if(action.type==='pause'){state.status='paused';emit(state,{type:'paused',text:'行动已暂停。环境不会因为停留或切换页面而继续推进。'});}
  else if(action.type==='resume'){state.status='running';if(action.mode)state.runtime!.executionMode=action.mode;emit(state,{type:'resumed',text:`从已保存状态恢复${state.runtime!.executionMode==='automatic'?'自动行动':'逐步指挥'}。`});}
  else if(action.type==='hint')state.hintUsed=true;
  return state;
}
/** Single replay pass. Reducing actions never recursively validates their history. */
export function replayGame(scenario:ScenarioDefinition,seed:number,actions:readonly GameAction[]):GameState|null {
  if(!Array.isArray(actions)||actions.length>10000)return null;
  try{let state=createGame(scenario,seed);for(const action of actions){const next=reduceGame(scenario,state,action);if(next===state)return null;state=next;}return state;}catch{return null;}
}
export function validateGameState(scenario:ScenarioDefinition,input:unknown):input is GameState {
  try{
    if(!record(input)||input.kernelVersion!==6||!record(input.context)||!record(input.runtime)||!Array.isArray(input.runtime.actionHistory)||input.runtime.actionHistory.length>10000||!Array.isArray(input.events)||input.events.length>20000||!Array.isArray(input.processedActionIds)||input.processedActionIds.length!==input.runtime.actionHistory.length)return false;
    const state=input as unknown as GameState;if(validateBlueprint(scenario,state.blueprint).length||!Number.isSafeInteger(state.seed))return false;
    const replayed=replayGame(scenario,state.seed,state.runtime!.actionHistory);return replayed!==null&&same(replayed,state);
  }catch{return false;}
}
