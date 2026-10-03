import type { FactMap, GameEvent, GameState, OperationDefinition, ProtocolReceipt, ScenarioDefinition, ToolCall } from './types';

type Emit = (state: GameState, event: Omit<GameEvent,'id'|'sequence'|'attempt'>) => GameEvent;
type Supply = (state: GameState, facts: FactMap, source: 'observation'|'receipt'|'verification', eventId: string) => void;
const record = (value: unknown): value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value,key);
export function fingerprint(operation: string, args: FactMap): string {
  return JSON.stringify([operation,Object.entries(args).sort(([a],[b])=>a.localeCompare(b))]);
}
export function validateArguments(operation: OperationDefinition, args: FactMap): string[] {
  const fields=operation.protocol!.parameters, errors:string[]=[];
  for(const key of Object.keys(args))if(!fields.some(f=>f.name===key))errors.push(`未声明字段「${key}」`);
  for(const f of fields){
    if(!own(args,f.name)){if(f.required)errors.push(`缺少「${f.label}」`);continue;}
    const value=args[f.name];
    if(f.type==='integer' ? !Number.isSafeInteger(value) : typeof value!==f.type){errors.push(`「${f.label}」需要${f.type==='integer'?'整数':f.type==='boolean'?'明确的是/否':'文字'}，不能只凭外观相似`);continue;}
    if(f.enum&&!f.enum.includes(value))errors.push(`「${f.label}」不在法器允许的值中`);
    if(typeof value==='number'&&((f.minimum!==undefined&&value<f.minimum)||(f.maximum!==undefined&&value>f.maximum)))errors.push(`「${f.label}」超出允许范围`);
  }
  return errors;
}
export function validateProtocol(scenario: ScenarioDefinition): string[] {
  const errors:string[]=[];
  const facts=(map:FactMap|undefined,label:string)=>{if(map)for(const [key,value] of Object.entries(map))if(!own(scenario.initialWorld,key)||typeof value!==typeof scenario.initialWorld[key])errors.push(`${label} 引用了未知或类型不同的事实 ${key}`);};
  for(const operation of scenario.operations){
    const p=operation.protocol;if(!p)continue;
    if(!Array.isArray(p.parameters)||p.parameters.length>12||!record(p.defaults)||!Array.isArray(p.variants)||!p.variants.length){errors.push(`${operation.id} 协议不完整`);continue;}
    const names=new Set<string>();
    for(const f of p.parameters){
      if(!f||!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(f.name)||['constructor','prototype','__proto__'].includes(f.name)||names.has(f.name)||!['string','integer','boolean'].includes(f.type)||typeof f.required!=='boolean'||!Array.isArray(f.choices)||!f.choices.length||f.choices.some(c=>typeof c.label!=='string'||!['string','number','boolean'].includes(typeof c.value)))errors.push(`${operation.id} 参数定义无效`);
      names.add(f.name);
      if(f.minimum!==undefined&&(!Number.isSafeInteger(f.minimum)))errors.push('参数下限须为整数');
      if(f.maximum!==undefined&&(!Number.isSafeInteger(f.maximum)||(f.minimum!==undefined&&f.maximum<f.minimum)))errors.push('参数上下限无效');
    }
    if(p.delivery&&!['immediate','deferred','lost-once'].includes(p.delivery))errors.push('未知回执传递方式');
    facts(p.receiptEffects,'回执登记');
    for(const v of p.variants){
      if(!record(v.when)||Object.keys(v.when).some(key=>!names.has(key)))errors.push('参数分支引用未知字段');
      facts(v.effects,'参数效果');
      for(const [fact,delta] of Object.entries(v.deltas??{}))if(typeof scenario.initialWorld[fact]!=='number'||!Number.isSafeInteger(delta))errors.push('数量变更须引用整数库存');
      for(const guard of v.guards??[])if(typeof scenario.initialWorld[guard.fact]!=='number'||!Number.isSafeInteger(guard.atLeast))errors.push('库存前置条件无效');
    }
  }
  if(scenario.transferRequirement?.receiptCount!==undefined&&(!Number.isInteger(scenario.transferRequirement.receiptCount)||scenario.transferRequirement.receiptCount<1))errors.push('回执证据数量无效');
  return errors;
}
export function receiveReceipt(state: GameState, receipt: ProtocolReceipt, emit: Emit, supply: Supply): void {
  receipt.collected=true;
  Object.assign(state.world,receipt.receiptEffects);
  state.verifiedGoals=state.verifiedGoals.filter(fact=>!own(receipt.receiptEffects,fact));
  const event=emit(state,{type:'result',tool:'operate',operationId:receipt.operationId,callId:receipt.callId,receiptId:receipt.id,actionId:state.runtime!.actionHistory.at(-1)!.id,text:`回执已按请求编号归位。${receipt.text}`,facts:{...receipt.facts,...receipt.receiptEffects},success:receipt.success,delivered:true});
  supply(state,event.facts!,'receipt',event.id);
}
export function executeProtocol(state: GameState,operation: OperationDefinition,call: Extract<ToolCall,{tool:'operate'}>,callId:string,actionId:string,emit:Emit,supply:Supply): void {
  const args=call.arguments??{}, p=operation.protocol!, runtime=state.protocol!;
  const error=(text:string)=>{emit(state,{type:'result',tool:'operate',operationId:operation.id,callId,actionId,text,facts:{},success:false,delivered:state.blueprint.feedback});state.status='stalled';state.runtime!.executionMode='manual';};
  const invalid=validateArguments(operation,args);
  if(invalid.length){error(`法器拒绝参数，现场未执行：${invalid.join('；')}。请按刻度重新填写。`);return;}
  const signature=fingerprint(operation.id,args);
  const remembered=call.requestKey?runtime.ledger.find(entry=>entry.key===call.requestKey):undefined;
  let receipt:ProtocolReceipt;
  let replayed=false;
  if(remembered){
    if(remembered.fingerprint!==signature){error('同一交接凭证对应了不同请求。法器拒绝改写旧凭证，现场未执行；改正参数或使用新的业务凭证。');return;}
    replayed=true;receipt={...structuredClone(remembered.receipt),id:`receipt/${callId}`,callId,collected:false};
  }else{
    const variant=p.variants.find(v=>Object.entries(v.when).every(([key,value])=>args[key]===value));
    if(!variant){error('参数格式正确，但这个组合不符合此法器的业务约定。现场未执行。');return;}
    const missing=Object.entries(operation.requires??{}).filter(([fact,value])=>state.world[fact]!==value);
    const short=(variant.guards??[]).filter(g=>Number(state.world[g.fact])<g.atLeast);
    const changes={...operation.effects,...variant.effects};
    for(const [fact,delta] of Object.entries(variant.deltas??{}))changes[fact]=Number(state.world[fact])+delta;
    const invalidQuantity=Object.entries(variant.deltas??{}).some(([fact])=>!Number.isSafeInteger(changes[fact])||Number(changes[fact])<0);
    const success=!missing.length&&!short.length&&!invalidQuantity;
    const facts=success?changes:Object.fromEntries([...missing.map(([fact])=>[fact,state.world[fact]]),...short.map(g=>[g.fact,state.world[g.fact]])]);
    if(success){Object.assign(state.world,changes);state.verifiedGoals=state.verifiedGoals.filter(fact=>!own(changes,fact));}
    receipt={id:`receipt/${callId}`,callId,operationId:operation.id,success,text:success?(variant.text??operation.successText):operation.failureText,facts,receiptEffects:success?{...p.receiptEffects}:{},collected:false};
    if(success&&call.requestKey)runtime.ledger.push({key:call.requestKey,fingerprint:signature,receipt:structuredClone(receipt)});
  }
  const lost=receipt.success&&!replayed&&p.delivery==='lost-once'&&!runtime.droppedOperations.includes(operation.id);
  if(lost)runtime.droppedOperations.push(operation.id);
  const immediate=replayed||p.delivery===undefined||p.delivery==='immediate'||p.delivery==='lost-once'||!receipt.success;
  emit(state,{type:'result',tool:'operate',operationId:operation.id,callId,actionId,success:receipt.success,delivered:!lost&&immediate&&state.blueprint.feedback,replayed,...(call.requestKey?{requestKey:call.requestKey}:{}),
    text:lost?'法器请求已送出，但回执在途中丢失。回声不知道执行是否发生；沉默不等于未执行。':replayed?'同一业务凭证已执行。只重送原回执，没有再次扣库存。':!immediate?'请求已经执行，回执还在途中；需要按请求编号归档。':receipt.text,
    ...(!lost&&immediate?{facts:receipt.facts}:{})});
  if(lost)return;
  if(immediate&&state.blueprint.feedback){Object.assign(state.world,receipt.receiptEffects);state.verifiedGoals=state.verifiedGoals.filter(f=>!own(receipt.receiptEffects,f));const last=state.events.at(-1)!;last.facts={...receipt.facts,...receipt.receiptEffects};supply(state,last.facts,'receipt',last.id);}
  else {runtime.receipts.push(receipt);if(!state.blueprint.feedback){state.status='stalled';state.runtime!.executionMode='manual';}}
}
