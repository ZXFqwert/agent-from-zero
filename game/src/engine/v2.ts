import type { AgentBlueprint, FactMap, GameAction, GameEvent, GameState, OperationDefinition, ScenarioDefinition, ToolCall, ToolName } from './types';
import { defaultBlueprint, validateScenario as legacyValidation } from './legacy-v1';

const tools:ToolName[]=['observe','operate','verify'];
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const whole=(value:unknown,max=64):value is number=>Number.isInteger(value)&&Number(value)>0&&Number(value)<=max;
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
function targetsFor(scenario:ScenarioDefinition,tool:ToolName):string[]{
  if(tool==='observe')return [...new Set(scenario.observations.map(item=>item.target))];
  if(tool==='operate')return [...new Set(scenario.operations.map(item=>item.target))];
  return [...new Set(scenario.goals.map(goal=>scenario.operations.find(item=>item.id===goal.operationId)!.target))];
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
  const errors:string[]=[];
  if(!record(blueprint))return ['伙伴构筑必须是一个对象。'];
  if(Object.keys(blueprint).some(key=>!['tools','feedback','verification','budget','permissions','goalOrder','toolPermissions'].includes(key)))errors.push('构筑包含未知配置项。');
  if(!Array.isArray(blueprint.tools)||new Set(blueprint.tools).size!==blueprint.tools.length||blueprint.tools.some(tool=>!tools.includes(tool)))errors.push('法器类型无效或重复。');
  else if(blueprint.tools.length>(scenario.limits?.toolCapacity??3))errors.push(`最多同时装备 ${scenario.limits?.toolCapacity??3} 件法器。`);
  if(typeof blueprint.feedback!=='boolean'||typeof blueprint.verification!=='boolean')errors.push('反馈和验收开关必须明确开启或关闭。');
  if(!whole(blueprint.budget)||blueprint.budget>(scenario.limits?.maxBudget??64))errors.push(`派遣预算必须在 1–${scenario.limits?.maxBudget??64} 之间。`);
  const allTargets=new Set([...scenario.observations.map(item=>item.target),...scenario.operations.map(item=>item.target)]);
  const targets=(items:unknown):items is string[]=>Array.isArray(items)&&items.length<=100&&new Set(items).size===items.length&&items.every(item=>typeof item==='string'&&(item==='*'||allTargets.has(item)));
  if(!targets(blueprint.permissions))errors.push('访问权限包含重复或不存在的目标。');
  if(blueprint.toolPermissions!==undefined){
    if(!record(blueprint.toolPermissions)||Object.keys(blueprint.toolPermissions).some(key=>!tools.includes(key as ToolName)))errors.push('法器权限配置无效。');
    else for(const tool of tools)if(blueprint.toolPermissions[tool]!==undefined&&!targets(blueprint.toolPermissions[tool]))errors.push(`${tool} 的访问目标无效。`);
  }
  if(blueprint.goalOrder!==undefined&&(!Array.isArray(blueprint.goalOrder)||blueprint.goalOrder.length!==scenario.goals.length||new Set(blueprint.goalOrder).size!==blueprint.goalOrder.length||blueprint.goalOrder.some(fact=>!scenario.goals.some(goal=>goal.fact===fact))))errors.push('委托顺序必须恰好包含每个完成条件。');
  if(!errors.length)for(const tool of blueprint.tools){
    const cap=scenario.limits?.maxPermissionTargets?.[tool],permissions=blueprint.toolPermissions?.[tool]??blueprint.permissions;
    const expanded=permissions.includes('*')?targetsFor(scenario,tool):permissions.filter(target=>targetsFor(scenario,tool).includes(target));
    if(cap!==undefined&&expanded.length>cap)errors.push(`${tool} 每次最多授权 ${cap} 个目标。`);
  }
  return errors;
}
export function validateScenario(scenario:ScenarioDefinition):string[]{
  const errors=legacyValidation(scenario),limits=scenario.limits??{};
  if(scenario.engineVersion!==2)errors.push('新关卡必须使用 engineVersion: 2。');
  if(limits.toolCapacity!==undefined&&![1,2,3].includes(limits.toolCapacity))errors.push('法器容量必须为 1、2 或 3。');
  if(limits.maxBudget!==undefined&&!whole(limits.maxBudget))errors.push('最大预算必须在 1–64 之间。');
  if(limits.missionBudget!==undefined&&!whole(limits.missionBudget,256))errors.push('任务资源必须在 1–256 之间。');
  for(const [tool,cost]of Object.entries(limits.toolCosts??{}))if(!tools.includes(tool as ToolName)||!whole(cost))errors.push(`成本无效：${tool}`);
  for(const [tool,cap]of Object.entries(limits.maxPermissionTargets??{}))if(!tools.includes(tool as ToolName)||!Number.isInteger(cap)||cap<0||cap>100)errors.push(`授权容量无效：${tool}`);
  for(const item of [...scenario.observations,...scenario.operations])if(item.cost!==undefined&&!whole(item.cost))errors.push(`成本无效：${item.id}`);
  for(const operation of scenario.operations)if(operation.failureCost!==undefined&&!whole(operation.failureCost))errors.push(`失败成本无效：${operation.id}`);
  for(const goal of scenario.goals)if(goal.verifyCost!==undefined&&!whole(goal.verifyCost))errors.push(`验收成本无效：${goal.fact}`);
  const ids=new Set<string>();
  for(const hook of scenario.hooks??[]){
    if(!hook||typeof hook.id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(hook.id)||ids.has(hook.id)){errors.push('世界事件 ID 无效或重复。');continue;}ids.add(hook.id);
    if(hook.trigger?.type==='after-call'){if(!whole(hook.trigger.call,10000))errors.push(`事件时机无效：${hook.id}`);}
    else if(hook.trigger?.type==='after-operation'){const operationId=hook.trigger.operationId;if(!scenario.operations.some(item=>item.id===operationId))errors.push(`事件操作无效：${hook.id}`);}
    else errors.push(`缺少事件触发器：${hook.id}`);
    if(!hook.effects&&!hook.notice)errors.push(`空的世界事件：${hook.id}`);
    for(const map of [hook.when,hook.effects,hook.notice?.reportedFacts])if(map)for(const [fact,value]of Object.entries(map))if(!own(scenario.initialWorld,fact)||!['string','number','boolean'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value)))errors.push(`事件事实无效：${hook.id}/${fact}`);
    if(hook.notice&&(!['environment','untrusted'].includes(hook.notice.trust)||typeof hook.notice.text!=='string'||hook.notice.text.length>5000))errors.push(`事件通知无效：${hook.id}`);
  }
  const requirement=scenario.transferRequirement;
  if(requirement){
    if(!requirement.reconfiguration&&!requirement.operationIds?.length)errors.push('迁移证据要求不能为空。');
    if(requirement.operationIds?.some(id=>!scenario.operations.some(item=>item.id===id)))errors.push('迁移要求引用了未知操作。');
    if(requirement.reconfiguration!==undefined&&typeof requirement.reconfiguration!=='boolean')errors.push('换装证据要求必须为布尔值。');
  }
  return errors;
}
export function createGame(scenario:ScenarioDefinition,seed=1):GameState {
  const errors=validateScenario(scenario);if(errors.length)throw new Error(errors.join('；'));
  if(!Number.isSafeInteger(seed))throw new Error('种子必须是安全整数');
  const missionRemaining=scenario.limits?.missionBudget??64,budget=Math.min(defaultBlueprint.budget,scenario.limits?.maxBudget??64,missionRemaining);
  return {kernelVersion:2,scenarioId:scenario.id,scenarioVersion:scenario.version??1,seed,world:{...scenario.initialWorld},observed:{},blueprint:{...structuredClone(defaultBlueprint),budget},status:'ready',budgetRemaining:budget,attempt:0,events:[],verifiedGoals:[],processedActionIds:[],learningEvidence:[],hintUsed:false,runtime:{missionRemaining,toolCalls:0,triggeredHookIds:[],executionMode:'manual',actionHistory:[]}};
}
function emit(state:GameState,event:Omit<GameEvent,'id'|'sequence'|'attempt'>):GameEvent {
  const sequence=state.events.length+1,value={...event,id:`${state.scenarioId}:event:${sequence}`,sequence,attempt:state.attempt};state.events.push(value);return value;
}
function supply(state:GameState,facts:FactMap,source:'observation'|'receipt'|'verification',eventId:string):void {for(const [fact,value]of Object.entries(facts))state.observed[fact]={value,source,eventId};}
function permitted(state:GameState,tool:ToolName,target:string):boolean {const values=state.blueprint.toolPermissions?.[tool]??state.blueprint.permissions;return values.includes('*')||values.includes(target);}

/** The strategy projects away the world and only follows received facts and selected goals. */
export function chooseNextCall(scenario:ScenarioDefinition,state:GameState):ToolCall|null {
  const {observed,blueprint,verifiedGoals}=state,order=blueprint.goalOrder??scenario.goals.map(goal=>goal.fact);
  const goal=scenario.goals.find(goal=>goal.fact===order.find(fact=>!verifiedGoals.includes(fact)));if(!goal)return null;
  const known=(fact:string)=>own(observed,fact)?observed[fact].value:undefined;
  if(known(goal.fact)===goal.equals)return blueprint.verification&&blueprint.tools.includes('verify')?{tool:'verify',fact:goal.fact}:null;
  if(known(goal.fact)===undefined&&blueprint.tools.includes('observe')){const observation=scenario.observations.find(item=>item.facts.includes(goal.fact));if(observation)return {tool:'observe',observationId:observation.id};}
  if(!blueprint.tools.includes('operate'))return null;
  const resolve=(operation:OperationDefinition,visited=new Set<string>()):OperationDefinition|null=>{
    if(visited.has(operation.id))return null;visited.add(operation.id);
    for(const [fact,expected]of Object.entries(operation.requires??{}))if(known(fact)!==undefined&&known(fact)!==expected){const repair=scenario.operations.find(item=>item.effects[fact]===expected);return repair?resolve(repair,visited):null;}
    return operation;
  };
  const requested=scenario.operations.find(item=>item.id===goal.operationId),next=requested?resolve(requested):null;
  return next?{tool:'operate',operationId:next.id}:null;
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
  if(requirement.reconfiguration){
    const builds=current.map((action,index)=>({action,index})).filter((item):item is {action:Extract<GameAction,{type:'configure'}>;index:number}=>item.action.type==='configure');
    const realSwap=builds.some((earlier,index)=>builds.slice(index+1).some(later=>[...earlier.action.blueprint.tools].sort().join(',')!==[...later.action.blueprint.tools].sort().join(',')&&current.slice(earlier.index+1,later.index).some(action=>state.events.some(event=>event.type==='request'&&event.actionId===action.id))));
    if(!realSwap)return false;
  }
  return Boolean(requirement.operationIds?.length||requirement.reconfiguration);
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
  const keys=call.tool==='observe'?['tool','observationId']:call.tool==='operate'?['tool','operationId']:['tool','fact'];
  return Object.keys(call).every(key=>keys.includes(key))&&targetOf(scenario,call)!==undefined;
}
function execute(scenario:ScenarioDefinition,state:GameState,call:ToolCall):void {
  const cost=executionCost(scenario,state,call),target=targetOf(scenario,call)!;
  if(!permitted(state,call.tool,target)){emit(state,{type:'blocked',tool:call.tool,target,text:'契约没有授权这个目标。未执行、未扣资源。请调整该法器的访问范围。',success:false,delivered:false});state.status='stalled';state.runtime!.executionMode='manual';return;}
  if(getRemainingBudget(state)<cost){exhausted(state,cost);return;}
  const callId=`${scenario.id}:call:${state.runtime!.toolCalls+1}`;
  state.budgetRemaining-=cost;state.runtime!.missionRemaining-=cost;state.runtime!.toolCalls++;
  const actionId=state.runtime!.actionHistory.at(-1)!.id;
  emit(state,{type:'request',tool:call.tool,target,callId,cost,actionId,text:`回声请求${call.tool==='observe'?'观察':call.tool==='verify'?'验收':'操作'}，消耗 ${cost} 点晶石。`,...(call.tool==='operate'?{operationId:call.operationId}:{})});
  let successfulOperation:string|undefined;
  if(call.tool==='observe'){
    const definition=scenario.observations.find(item=>item.id===call.observationId)!,facts=Object.fromEntries(definition.facts.map(fact=>[fact,state.world[fact]]));
    const event=emit(state,{type:'observation',tool:'observe',target,callId,text:definition.text,facts,success:true,delivered:true});supply(state,facts,'observation',event.id);
  }else if(call.tool==='operate'){
    const operation=scenario.operations.find(item=>item.id===call.operationId)!,missing=Object.entries(operation.requires??{}).filter(([fact,value])=>state.world[fact]!==value),success=missing.length===0;
    const facts=success?{...operation.effects}:Object.fromEntries(missing.map(([fact])=>[fact,state.world[fact]]));
    if(success){Object.assign(state.world,operation.effects);state.verifiedGoals=state.verifiedGoals.filter(fact=>!own(operation.effects,fact));successfulOperation=operation.id;}
    const event=emit(state,{type:'result',tool:'operate',operationId:operation.id,target,callId,actionId,text:success?operation.successText:operation.failureText,facts,success,delivered:state.blueprint.feedback});
    if(state.blueprint.feedback)supply(state,facts,'receipt',event.id);
    else {emit(state,{type:'claim',text:'法器给出了结果，但反馈未接通。回声不能使用没有收到的回执继续决定。',success:false});state.status='stalled';state.runtime!.executionMode='manual';}
  }else{
    const goal=scenario.goals.find(item=>item.fact===call.fact)!,success=state.world[goal.fact]===goal.equals,facts={[goal.fact]:state.world[goal.fact]};
    const event=emit(state,{type:'verified',tool:'verify',target,callId,text:success?`状态检查通过：${goal.label}。`:`状态检查未通过：${goal.label}还没有实现。`,facts,success,delivered:true});supply(state,facts,'verification',event.id);
    if(success&&!state.verifiedGoals.includes(goal.fact))state.verifiedGoals.push(goal.fact);
    if(!success)state.verifiedGoals=state.verifiedGoals.filter(fact=>fact!==goal.fact);
  }
  applyHooks(scenario,state,successfulOperation);win(scenario,state);
  if(state.status==='running'&&getRemainingBudget(state)===0)exhausted(state);
}
function actionShape(action:GameAction):boolean {
  if(!action||typeof action.id!=='string'||!action.id.trim()||action.id.length>200)return false;
  const keys=action.type==='configure'?['id','type','blueprint']:action.type==='tool'?['id','type','call']:action.type==='reset'?['id','type','preserveBlueprint']:action.type==='dispatch'||action.type==='resume'?['id','type','mode']:action.type==='step'?['id','type','source']:['id','type'];
  if(Object.keys(action).some(key=>!keys.includes(key)))return false;
  if((action.type==='dispatch'||action.type==='resume')&&action.mode!==undefined&&!['manual','automatic'].includes(action.mode))return false;
  if(action.type==='step'&&action.source!==undefined&&!['player','scheduler'].includes(action.source))return false;
  if(action.type==='reset'&&action.preserveBlueprint!==undefined&&typeof action.preserveBlueprint!=='boolean')return false;
  return true;
}
export function reduceGame(scenario:ScenarioDefinition,previous:GameState,action:GameAction):GameState {
  if(previous.kernelVersion!==2||!previous.runtime||previous.scenarioId!==scenario.id||previous.scenarioVersion!==(scenario.version??1)||!actionShape(action)||previous.processedActionIds.includes(action.id))return previous;
  switch(action.type){
    case 'configure':if(!['ready','paused','stalled','exhausted'].includes(previous.status)||validateBlueprint(scenario,action.blueprint).length)return previous;break;
    case 'dispatch':if(!['ready','stalled','exhausted'].includes(previous.status)||previous.runtime.missionRemaining<=0)return previous;break;
    case 'step':if(previous.status!=='running'||getRemainingBudget(previous)<=0||(action.source==='scheduler'&&previous.runtime.executionMode!=='automatic'))return previous;break;
    case 'tool':if(previous.status!=='running'||!validCall(scenario,previous,action.call)||!permitted(previous,action.call.tool,targetOf(scenario,action.call)!)||getRemainingBudget(previous)<executionCost(scenario,previous,action.call))return previous;break;
    case 'pause':if(previous.status!=='running')return previous;break;
    case 'resume':if(previous.status!=='paused'||getRemainingBudget(previous)<=0)return previous;break;
    case 'hint':if(previous.hintUsed||previous.status==='won')return previous;break;
    case 'reset':break;
    default:return previous;
  }
  let state:GameState;
  if(action.type==='reset'){
    state=createGame(scenario,previous.seed);state.hintUsed=previous.hintUsed;
    if(action.preserveBlueprint!==false)state.blueprint=structuredClone(previous.blueprint);
    state.budgetRemaining=Math.min(state.blueprint.budget,state.runtime!.missionRemaining);state.processedActionIds=[...previous.processedActionIds];state.runtime!.actionHistory=structuredClone(previous.runtime.actionHistory);
    emit(state,{type:'reset',text:'世界与晶石一起回到委托起点。历史通关和提示使用记录保留。'});
  }else state=structuredClone(previous);
  state.processedActionIds.push(action.id);state.runtime!.actionHistory.push(structuredClone(action));
  if(action.type==='configure'){
    state.blueprint=structuredClone(action.blueprint);state.budgetRemaining=Math.min(state.blueprint.budget,state.runtime!.missionRemaining);state.status='ready';state.runtime!.executionMode='manual';
    emit(state,{type:'configured',text:`构筑已改变，世界与上下文保留。委托仍剩 ${state.runtime!.missionRemaining} 点晶石，换装不会补充。`});
  }else if(action.type==='dispatch'){
    state.attempt++;state.status='running';state.runtime!.executionMode=action.mode??'automatic';state.budgetRemaining=Math.min(state.blueprint.budget,state.runtime!.missionRemaining);
    const event=emit(state,{type:'dispatched',text:`回声开始${state.runtime!.executionMode==='automatic'?'自动行动':'等待逐步指挥'}。委托剩余 ${state.runtime!.missionRemaining} 点晶石。`});
    if(!state.learningEvidence.length)state.learningEvidence=scenario.concepts.map(concept=>({concept,scenarioId:scenario.id,level:'seen',eventIds:[event.id]}));
  }else if(action.type==='step'){
    if(action.source!=='scheduler')state.runtime!.executionMode='manual';
    const call=chooseNextCall(scenario,state);if(call)execute(scenario,state,call);
    else {emit(state,{type:'claim',text:state.blueprint.tools.includes('operate')?'当前构筑无法完成下一环。已有世界变化与收到的信息保留，请检查验收法器、目标顺序或已知条件。':'“已经完成了。”——语言没有执行任何法器，完成条件仍需要实际证据。',success:false});state.status='stalled';state.runtime!.executionMode='manual';}
  }else if(action.type==='tool'){state.runtime!.executionMode='manual';execute(scenario,state,action.call);}
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
    if(!record(input)||input.kernelVersion!==2||!record(input.runtime)||!Array.isArray(input.runtime.actionHistory)||input.runtime.actionHistory.length>10000||!Array.isArray(input.events)||input.events.length>20000||!Array.isArray(input.processedActionIds)||input.processedActionIds.length!==input.runtime.actionHistory.length)return false;
    const state=input as unknown as GameState;if(validateBlueprint(scenario,state.blueprint).length||!Number.isSafeInteger(state.seed))return false;
    const replayed=replayGame(scenario,state.seed,state.runtime!.actionHistory);return replayed!==null&&same(replayed,state);
  }catch{return false;}
}
