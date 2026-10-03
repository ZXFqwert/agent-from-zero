import {useCallback,useEffect,useRef,useState} from 'react';
import {FlaskConical,Play,Square,KeyRound,RefreshCw,WifiOff} from 'lucide-react';
import './lab.css';

export type ExperimentType='same-model-blueprints'|'same-blueprint-models'|'solo-team';
type RunStatus='active'|'completed'|'incomplete'|'budget_exhausted'|'timed_out'|'cancelled'|'failed';
interface Actor {id:string;label:string;tools:string[];known_targets:string[];}
interface Arm {id:'left'|'right';label:string;model_id:'primary'|'secondary';blueprint_id:'feedback-open'|'feedback-hidden'|'solo'|'team';status:RunStatus|'pending';steps_used:number;world:Record<string,unknown>;events:Array<Record<string,unknown>>;actors:Actor[];current_actor?:string;tool_calls:number;denied_calls:number;handoffs:number;}
export interface Run {id:string;status:RunStatus;steps_used:number;max_steps:number;world:Record<string,unknown>;events:Array<Record<string,unknown>>;final_text:string;expires_at:string;step_in_progress:boolean;experiment?:{version:1;type:ExperimentType;current_arm:number;arm_budget:number;arms:Arm[]};}
interface Experiment {id:ExperimentType;label:string;enabled:boolean;reason:string|null;arms:string[];arm_budget:number;}
export interface Status {enabled:boolean;busy:boolean;scenario_ids:string[];limits:{daily_runs:number;max_steps:number;run_seconds:number;max_output_tokens:number;global_concurrency:number;quota_timezone:string};experiments?:Experiment[];remaining_runs?:number;active_run?:Run|null;}
export interface Pending {kind:'create'|'step'|'cancel';requestId:string;runId?:string;experimentType?:ExperimentType;}
interface Session {token:string;expiresAt?:string;lastRunId?:string;pending?:Pending;cancel?:Pending;}
const STORAGE_KEY='echo-lab-session-v1';
const RECORD_KEY='echo-lab-last-record-v1',MAX_RECORD_BYTES=1024*1024;
const LAB_ENABLED=import.meta.env.VITE_LAB_ENABLED==='true';
const CLOSED_STATUS:Status={enabled:false,busy:false,scenario_ids:['signal-rescue'],limits:{daily_runs:10,max_steps:8,run_seconds:120,max_output_tokens:512,global_concurrency:1,quota_timezone:'UTC'}};
const names:Record<RunStatus,string>={active:'实验进行中',completed:'独立验收通过',incomplete:'已停止，尚未验收',budget_exhausted:'请求预算用完',timed_out:'实验时间已到',cancelled:'已停止实验',failed:'模型连接未完成'};
const errors:Record<string,string>={authentication_required:'请先兑换实验通行证。',invalid_token:'通行证已失效，请向维护者领取新的邀请码。',invalid_invite:'邀请码无效、已过期或已被兑换。已兑换的通行证通常保存在原浏览器中。',run_not_found:'没有找到这次实验，请重新检查实验状态。',lab_busy:'另一场实验正在进行，稍后可以再试。本次没有扣除次数。',step_in_progress:'这一轮仍在处理中。你可以查询结果或停止实验。',run_not_active:'这次实验已经停止，请查询最新结果。',step_budget_exhausted:'本次模型请求预算已经用完。',daily_quota_exhausted:'今天的实验次数已用完，UTC 零点后恢复。',lab_unavailable:'实验台尚未配置模型连接，主线仍可继续游玩。',storage_unavailable:'实验记录暂时无法读取，请稍后查询或重试同一请求。',idempotency_conflict:'请求记录发生冲突，请查询最新状态后重试。',invalid_request:'请求格式未通过检查，请刷新页面后重试。',request_too_large:'请求内容超出实验限制。',provider_error:'模型连接未完成，本次实验已经停止。',request_interrupted:'模型请求已中断。',run_timeout:'本次实验的时间已经用完。',verification_missing:'模型已经结束回答，但虚拟世界尚未通过验收。',user_cancelled:'你已停止本次实验。',unknown_tool:'拒绝了实验区之外的工具。',invalid_arguments:'工具参数不符合规则，世界没有因此改变。',connection_not_permitted:'这两个节点之间不允许建立连接。',observe_endpoints_first:'必须先观察连接的两端。',observe_target_first:'必须先观察目标。',upstream_not_ready:'上游尚未连接或激活。'};
const toolNames:Record<string,string>={observe:'观察',connect:'连接',activate:'激活',verify:'验收'};
const nodeNames:Record<string,string>={source:'能源核心',relay:'中继器',beacon:'信号台'};
const experimentTypes:ExperimentType[]=['same-model-blueprints','same-blueprint-models','solo-team'];
const experimentNames:Record<ExperimentType,string>={'same-model-blueprints':'同模型，换反馈构筑','same-blueprint-models':'同构筑，换模型','solo-team':'单伙伴与三岗位协作'};
const experimentDescriptions:Record<ExperimentType,string>={'same-model-blueprints':'同一模型和同样起点，比较完整回执与隐藏回执怎样影响下一步。','same-blueprint-models':'保持工具与反馈构筑相同，用服务端固定模型 A / B 各跑一份独立世界。','solo-team':'比较单伙伴与调查、施工、验收三岗位。伙伴有私有会话，真实工具结果须显式交接。'};
const reasonNames:Record<string,string>={alternate_model_unconfigured:'服务端尚未配置模型 B，不会借模型 A 冒充对照。',alternate_model_matches_primary:'模型 B 与 A 配置相同，无法建立不同模型的对照。',lab_unavailable:'服务端尚未启用模型连接。',comparison_budget_too_small:'总轮数不足以给两组各分配至少一轮。',catalog_unavailable:'当前服务尚未提供对照目录，请查询最新状态。'};
Object.assign(errors,{experiment_unavailable:'所选对照暂不可用，没有扣除次数。请查看目录中的原因。',arm_budget_exhausted:'此组轮数用完，宿主将转到下一组或结束对照。',tool_not_authorized:'当前岗位没有这件法器；其他伙伴有权限不代表自己有。',private_input_missing:'本伙伴尚未实际收到所需观察，不能借全队的世界观察清单。',feedback_hidden:'此构筑隐藏真实回执；隐藏提示不是成功证据。'});
const blueprintNames:Record<Arm['blueprint_id'],string>={'feedback-open':'完整工具反馈','feedback-hidden':'隐藏工具反馈',solo:'单伙伴四法器',team:'调查 → 施工 → 验收，显式交接'};

class LabError extends Error {constructor(message:string,readonly code='',readonly uncertain=false){super(message);}}
function readPending(value:unknown,cancelOnly=false):Pending|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const saved=value as Partial<Pending>;
  if(!['create','step','cancel'].includes(saved.kind??'')||cancelOnly&&saved.kind!=='cancel'||typeof saved.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,64}$/.test(saved.requestId)||saved.kind!=='create'&&(typeof saved.runId!=='string'||!saved.runId||saved.runId.length>100)||saved.experimentType!==undefined&&!experimentTypes.includes(saved.experimentType))return;
  return {kind:saved.kind!,requestId:saved.requestId,...(saved.runId?{runId:saved.runId}:{}),...(saved.experimentType?{experimentType:saved.experimentType}:{})};
}
function readSession():Session|null {
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null') as Session|null;
    if(saved&&typeof saved.token==='string'&&saved.token.length>=16&&saved.token.length<=256){
      if(saved.expiresAt&&(!isDate(saved.expiresAt)||Date.parse(saved.expiresAt)<=Date.now()))return null;
      return {token:saved.token,...(saved.expiresAt?{expiresAt:saved.expiresAt}:{}),...(typeof saved.lastRunId==='string'&&saved.lastRunId.length<=100?{lastRunId:saved.lastRunId}:{}),pending:readPending(saved.pending),cancel:readPending(saved.cancel,true)};
    }
    const previous=sessionStorage.getItem('echo-lab-token');
    if(previous&&previous.length>=16&&previous.length<=256)return {token:previous};
  } catch { /* Storage may be unavailable; this visit can still use a token. */ }
  return null;
}
const isObject=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const isText=(value:unknown,max=16000):value is string=>typeof value==='string'&&value.length<=max;
const isCount=(value:unknown,max=10000):value is number=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=max;
const isList=(value:unknown,max=100):value is string[]=>Array.isArray(value)&&value.length<=max&&value.every(item=>isText(item,200));
const isDate=(value:unknown):value is string=>isText(value,80)&&Number.isFinite(Date.parse(value));
const badResponse=():never=>{throw new LabError('实验台返回了无法识别的记录，请查询最新结果。','invalid_response',true);};
function publicWorld(value:unknown):Record<string,unknown>{
  if(!isObject(value)||!isList(value.observed,3)||!isList(value.active,3)||typeof value.verified!=='boolean'||!Array.isArray(value.connections)||value.connections.length>3||value.connections.some(pair=>!isList(pair,2)||pair.length!==2))return badResponse();
  return {observed:[...value.observed],active:[...value.active],verified:value.verified,connections:value.connections.map(pair=>[...pair as string[]]),...(isText(value.scenario_id,100)?{scenario_id:value.scenario_id}:{})};
}
function publicResult(value:unknown):Record<string,unknown>{
  if(!isObject(value)||typeof value.ok!=='boolean')return badResponse();
  const result:Record<string,unknown>={ok:value.ok};
  for(const key of ['error','target','activated','message'])if(value[key]!==undefined){if(!isText(value[key],key==='message'?16000:200))return badResponse();result[key]=value[key];}
  for(const key of ['active','verified'])if(value[key]!==undefined){if(typeof value[key]!=='boolean')return badResponse();result[key]=value[key];}
  if(value.connection!==undefined){if(!isList(value.connection,2)||value.connection.length!==2)return badResponse();result.connection=[...value.connection];}
  if(value.connections!==undefined){if(!Array.isArray(value.connections)||value.connections.length>3||value.connections.some(pair=>!isList(pair,2)||pair.length!==2))return badResponse();result.connections=value.connections.map(pair=>[...pair as string[]]);}
  return result;
}
function publicEvents(value:unknown):Array<Record<string,unknown>>{
  if(!Array.isArray(value)||value.length>1000)return badResponse();
  return value.map(raw=>{
    if(!isObject(raw)||!['assistant','tool','stop','handoff'].includes(String(raw.kind)))return badResponse();
    const event:Record<string,unknown>={kind:raw.kind};
    for(const key of ['text','code','tool','arguments','call_id','arm_id','actor_id','from_actor','to_actor'])if(raw[key]!==undefined){if(!isText(raw[key],key==='text'?16000:key==='arguments'?4096:200))return badResponse();event[key]=raw[key];}
    if(event.kind==='tool'){if(!event.tool||!event.call_id)return badResponse();event.result=publicResult(raw.result);}
    if(event.kind==='handoff'){
      if(!event.from_actor||!event.to_actor||!Array.isArray(raw.results)||raw.results.length>8)return badResponse();
      event.results=raw.results.map(receipt=>{if(!isObject(receipt)||!isText(receipt.call_id,200)||!isText(receipt.tool,200))return badResponse();return {call_id:receipt.call_id,tool:receipt.tool,result:publicResult(receipt.result)};});
    }
    return event;
  });
}
/** Whitelist public fields; private histories, provider names and connection credentials cannot enter display or cache. */
export function checkedRun(value:unknown):Run {
  if(!isObject(value)||!isText(value.id,100)||!value.id||!Object.prototype.hasOwnProperty.call(names,value.status as string)||!isCount(value.steps_used,64)||!isCount(value.max_steps,64)||value.max_steps<1||value.steps_used>value.max_steps||!isDate(value.expires_at)||typeof value.step_in_progress!=='boolean'||!isText(value.final_text))return badResponse();
  const run:Run={id:value.id,status:value.status as RunStatus,steps_used:value.steps_used,max_steps:value.max_steps,world:publicWorld(value.world),events:publicEvents(value.events),final_text:value.final_text,expires_at:value.expires_at,step_in_progress:value.step_in_progress};
  if(value.experiment!==undefined&&value.experiment!==null){
    const experiment=value.experiment;
    if(!isObject(experiment)||experiment.version!==1||!experimentTypes.includes(experiment.type as ExperimentType)||!isCount(experiment.current_arm,1)||!isCount(experiment.arm_budget,64)||experiment.arm_budget<1||!Array.isArray(experiment.arms)||experiment.arms.length!==2)return badResponse();
    const arms:Arm[]=experiment.arms.map((arm,index)=>{
      if(!isObject(arm)||arm.id!==(index===0?'left':'right')||!isText(arm.label,200)||!['primary','secondary'].includes(String(arm.model_id))||!Object.prototype.hasOwnProperty.call(blueprintNames,arm.blueprint_id as string)||!(arm.status==='pending'||Object.prototype.hasOwnProperty.call(names,arm.status as string))||!isCount(arm.steps_used,experiment.arm_budget as number)||!isCount(arm.tool_calls,256)||!isCount(arm.denied_calls,256)||!isCount(arm.handoffs,256)||!Array.isArray(arm.actors)||arm.actors.length<1||arm.actors.length>3)return badResponse();
      const actors:Actor[]=arm.actors.map(actor=>{if(!isObject(actor)||!isText(actor.id,100)||!isText(actor.label,200)||!isList(actor.tools,4)||!isList(actor.known_targets,3))return badResponse();return {id:actor.id,label:actor.label,tools:[...actor.tools],known_targets:[...actor.known_targets]};});
      if(new Set(actors.map(actor=>actor.id)).size!==actors.length||arm.current_actor!==undefined&&(!isText(arm.current_actor,100)||!actors.some(actor=>actor.id===arm.current_actor)))return badResponse();
      const world=publicWorld(arm.world);if(arm.status==='completed'&&!world.verified)return badResponse();
      return {id:arm.id as Arm['id'],label:arm.label,model_id:arm.model_id as Arm['model_id'],blueprint_id:arm.blueprint_id as Arm['blueprint_id'],status:arm.status as Arm['status'],steps_used:arm.steps_used,world,events:publicEvents(arm.events),actors,tool_calls:arm.tool_calls,denied_calls:arm.denied_calls,handoffs:arm.handoffs,...(arm.current_actor?{current_actor:arm.current_actor as string}:{})};
    });
    if(arms.reduce((total,arm)=>total+arm.steps_used,0)!==run.steps_used)return badResponse();
    run.experiment={version:1,type:experiment.type as ExperimentType,current_arm:experiment.current_arm,arm_budget:experiment.arm_budget,arms};
  }
  if(run.status==='completed'&&(!run.world.verified||run.experiment?.arms.some(arm=>arm.status!=='completed'||!arm.world.verified)))return badResponse();
  return run;
}
export function checkedStatus(value:unknown):Status{
  if(!isObject(value)||typeof value.enabled!=='boolean'||typeof value.busy!=='boolean'||!isList(value.scenario_ids)||!isObject(value.limits))return badResponse();
  const limits=value.limits;if(!isCount(limits.daily_runs)||!isCount(limits.max_steps,64)||!isCount(limits.run_seconds,3600)||!isCount(limits.max_output_tokens,100000)||!isCount(limits.global_concurrency,100)||!isText(limits.quota_timezone,100))return badResponse();
  const status:Status={enabled:value.enabled,busy:value.busy,scenario_ids:[...value.scenario_ids],limits:{daily_runs:limits.daily_runs,max_steps:limits.max_steps,run_seconds:limits.run_seconds,max_output_tokens:limits.max_output_tokens,global_concurrency:limits.global_concurrency,quota_timezone:limits.quota_timezone}};
  if(value.experiments!==undefined){if(!Array.isArray(value.experiments)||value.experiments.length>3)return badResponse();status.experiments=value.experiments.map(item=>{if(!isObject(item)||!experimentTypes.includes(item.id as ExperimentType)||!isText(item.label,200)||typeof item.enabled!=='boolean'||item.reason!==null&&!isText(item.reason,100)||!isList(item.arms,2)||item.arms.length!==2||!isCount(item.arm_budget,64))return badResponse();return {id:item.id as ExperimentType,label:item.label,enabled:item.enabled,reason:item.reason as string|null,arms:[...item.arms],arm_budget:item.arm_budget};});if(new Set(status.experiments.map(item=>item.id)).size!==status.experiments.length)return badResponse();}
  if(value.remaining_runs!==undefined){if(!isCount(value.remaining_runs))return badResponse();status.remaining_runs=value.remaining_runs;}
  if(value.active_run!==undefined)status.active_run=value.active_run===null?null:checkedRun(value.active_run);
  return status;
}
export function preferRun(previous:Run|null,next:Run):Run{
  if(previous?.id===next.id){if(previous.steps_used>next.steps_used||previous.status!=='active'&&(next.status==='active'||previous.status!==next.status))return previous;if(previous.status!=='active'&&!previous.step_in_progress&&next.step_in_progress)return {...next,step_in_progress:false};}
  return next;
}
export function mutationBody(operation:Pending):Record<string,string>{return {request_id:operation.requestId,...(operation.kind==='create'?{scenario_id:'signal-rescue',...(operation.experimentType?{experiment_type:operation.experimentType}:{})}:{})};}
function readRecord():{run:Run;receivedAt:string}|null{try{const raw=localStorage.getItem(RECORD_KEY);if(!raw||new TextEncoder().encode(raw).length>MAX_RECORD_BYTES)return null;const value:unknown=JSON.parse(raw);if(isObject(value)&&value.version===1&&isDate(value.receivedAt))return {run:checkedRun(value.run),receivedAt:value.receivedAt};}catch{/* Local copies are never sent back as server truth. */}return null;}
function WorldReport({world}:{world:Record<string,unknown>}){return <div className="lab-world"><strong>{world.verified===true?'工具独立验收：通过':'工具独立验收：尚未通过'}</strong><dl>{(['observed','connections','active'] as const).map(key=><div key={key}><dt>{{observed:'已观察',connections:'实际连接',active:'实际激活'}[key]}</dt><dd>{Array.isArray(world[key])?(world[key] as unknown[]).map(value=>Array.isArray(value)?value.map(node=>nodeNames[String(node)]??String(node)).join(' → '):nodeNames[String(value)]??String(value)).join(key==='connections'?'；':'、')||'无':'无'}</dd></div>)}</dl></div>;}
function EventList({events,actors=[]}:{events:Array<Record<string,unknown>>;actors?:Actor[]}){
  const actorName=(id:unknown)=>actors.find(actor=>actor.id===id)?.label??String(id??'');
  return events.length?<ol className="lab-events">{events.map((event,index)=>{const result=event.result as Record<string,unknown>|undefined;return <li key={`${index}-${String(event.call_id??event.kind)}`}><small>#{index+1}{event.actor_id?` · ${actorName(event.actor_id)}`:''}</small>
    {event.kind==='assistant'?<><strong>模型文本</strong><p>{String(event.text??'')}</p></>:event.kind==='tool'?<><strong>{toolNames[String(event.tool)]??'未声明工具'} · {result?.ok===true?(event.tool==='verify'&&result.verified===false?'实际验收未通过':'法器执行完成'):errors[String(result?.error)]??'请求被拒绝'}</strong><small>调用编号 <code>{String(event.call_id??'')}</code></small><details><summary>这次参数与实际回执</summary><pre>{JSON.stringify({arguments:event.arguments,result},null,2)}</pre></details></>:event.kind==='handoff'?<><strong>实际交接：{actorName(event.from_actor)} → {actorName(event.to_actor)}</strong><p>只交接已经取得的工具结果，资料不会增加收件岗位的权限。</p><details><summary>已交接的真实结果</summary><pre>{JSON.stringify(event.results,null,2)}</pre></details></>:<><strong>明确停止</strong><p>{errors[String(event.code)]??'此轮已停止，请查看当前状态。'}</p></>}
  </li>;})}</ol>:<p className="lab-note">尚无行动回执。创建和排队不会生成模型回答或验收证据。</p>;
}
export function RunReport({run}:{run:Run}){
  const experiment=run.experiment;
  return <section className="lab-run-report" aria-label="已取得的实验记录"><div className="lab-run-heading"><strong>{experiment?experimentNames[experiment.type]:'旧版单组信号台实验'}</strong><span>{run.status==='completed'?(experiment?'两组均工具验收通过':'独立工具验收通过'):names[run.status]}</span></div><small>记录编号 <code>{run.id}</code></small><p role="status">总模型请求 {run.steps_used} / {run.max_steps} 轮{run.step_in_progress?' · 等待当前回执':''}；每个工具请求另有参数校验。</p>
    {experiment?<><p className="lab-note">同样起点，两份独立虚拟世界，按顺序执行；每组最多 {experiment.arm_budget} 轮。协作是有限岗位调度、私有会话与实际交接，不是同时运行多个模型。</p><div className="lab-arms">{experiment.arms.map((arm,index)=><article key={arm.id} className={`lab-arm ${run.status==='active'&&experiment.current_arm===index?'is-current':''}`}><div className="lab-arm-heading"><span>{index===0?'A':'B'}</span><div><h4>{arm.label}</h4><small>{blueprintNames[arm.blueprint_id]} · {arm.model_id==='secondary'?'服务器固定模型 B':'服务器固定模型 A'}</small></div></div><p>{arm.status==='pending'?'尚未开始':names[arm.status]}{run.status==='active'&&experiment.current_arm===index?' · 当前组':''}</p><div className="lab-counts"><span>请求 <strong>{arm.steps_used}/{experiment.arm_budget}</strong></span><span>工具 <strong>{arm.tool_calls}</strong></span><span>拒绝 <strong>{arm.denied_calls}</strong></span><span>交接 <strong>{arm.handoffs}</strong></span></div><WorldReport world={arm.world}/>
      <details><summary>各岗位真正收到的观察</summary>{arm.actors.map(actor=><div key={actor.id} className="lab-actor"><strong>{actor.label}{arm.current_actor===actor.id?' · 最近发起请求':''}</strong><small>法器：{actor.tools.map(tool=>toolNames[tool]??tool).join('、')||'无'}</small><p>已取得观察：{actor.known_targets.map(node=>nodeNames[node]??node).join('、')||'尚无'}。</p></div>)}<p className="lab-note">这里仅显示服务器公开的已取得目标清单。模型私有历史没有返回网页；共享世界的观察不自动成为每个伙伴的输入。</p></details><details className="lab-arm-events"><summary>此组行动、拒绝与交接 · {arm.events.length} 条</summary><EventList events={arm.events} actors={arm.actors}/></details>
    </article>)}</div><p className="lab-note">这些数字描述本次过程。一次成败不足以推出模型或品牌排名，也不能代替真人学习验收。</p></>:<><WorldReport world={run.world}/><EventList events={run.events}/></>}
    {run.final_text&&<div className="lab-final"><strong>本次结束说明</strong><p>{run.final_text}</p></div>}<details><summary>查看收到的公开结构化记录</summary><pre>{JSON.stringify({id:run.id,status:run.status,steps_used:run.steps_used,experiment:run.experiment,world:run.world,events:run.events,final_text:run.final_text},null,2)}</pre></details>
  </section>;
}

export default function Lab(){
  const [session,setSession]=useState<Session|null>(readSession),[invite,setInvite]=useState(''),[status,setStatus]=useState<Status|null>(LAB_ENABLED?null:CLOSED_STATUS),[record,setRecord]=useState(readRecord),[run,setRun]=useState<Run|null>(record?.run??null);
  const [experimentType,setExperimentType]=useState<ExperimentType>(session?.pending?.experimentType??'same-model-blueprints');
  const [online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine),[confirmed,setConfirmed]=useState(false),[cancelNotice,setCancelNotice]=useState('');
  const [busy,setBusy]=useState<Pending['kind']|'redeem'|null>(null),[cancelling,setCancelling]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState(''),[storageWarning,setStorageWarning]=useState('');
  const sessionRef=useRef(session),runRef=useRef<Run|null>(run),confirmedRef=useRef(false),onlineRef=useRef(online),alive=useRef(false),controllers=useRef(new Set<AbortController>()),operationController=useRef<AbortController|null>(null),working=useRef(false),cancelWorking=useRef(false),refreshing=useRef(false),refreshVersion=useRef(0);
  const token=session?.token??'';

  const remember=useCallback((next:Session|null)=>{
    if(next?.token!==sessionRef.current?.token){confirmedRef.current=false;if(alive.current)setConfirmed(false);}
    sessionRef.current=next;
    if(alive.current)setSession(next);
    try {
      if(next)localStorage.setItem(STORAGE_KEY,JSON.stringify(next));else localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem('echo-lab-token');
    } catch {if(alive.current)setStorageWarning('浏览器不允许保存通行证。本次关闭页面后可能需要领取新的邀请码。');}
  },[]);

  const acceptRun=useCallback((candidate:Run)=>{
    // A local read-only copy never overrides a fresh authenticated server receipt.
    const next=preferRun(confirmedRef.current?runRef.current:null,candidate);
    confirmedRef.current=true;
    runRef.current=next;
    const receivedAt=new Date().toISOString();
    if(alive.current){setRun(next);setConfirmed(true);setRecord({run:next,receivedAt});}
    try{const data=JSON.stringify({version:1,receivedAt,run:next});if(new TextEncoder().encode(data).length>MAX_RECORD_BYTES)throw new Error('bounded record');localStorage.setItem(RECORD_KEY,data);}catch{if(alive.current)setStorageWarning('本浏览器未能保存只读实验副本；本次页面里已取得的记录仍可查看。');}
    if(sessionRef.current&&sessionRef.current.lastRunId!==next.id)remember({...sessionRef.current,lastRunId:next.id});
  },[remember]);

  const request=useCallback(async <T,>(path:string,data?:object,auth=sessionRef.current?.token??'',controller=new AbortController(),timeout=12000):Promise<T>=>{
    if(!LAB_ENABLED)throw new LabError('本阶段尚未启用真实模型实验。','lab_unavailable');
    if(!onlineRef.current)throw new LabError('当前离线，尚未向服务端发送此请求。','offline');
    controllers.current.add(controller);
    const timer=window.setTimeout(()=>controller.abort(),timeout);
    try {
      const response=await fetch(`/api/lab/${path}`,{method:data?'POST':'GET',cache:'no-store',signal:controller.signal,headers:{...(data?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:`Bearer ${auth}`}:{})},...(data?{body:JSON.stringify(data)}:{})});
      const json=await response.json().catch(()=>null) as {error?:{code?:string}}|null;
      if(!response.ok){
        const code=typeof json?.error?.code==='string'?json.error.code:'';
        if(response.status===401&&auth&&sessionRef.current?.token===auth)remember(null);
        const fallback=response.status===429?'实验台请求较多，请稍后再试。':response.status>=500?'实验服务暂时无法连接，请稍后查询结果。':'实验请求未完成，请查询最新状态。';
        throw new LabError(errors[code]??fallback,code,code==='step_in_progress'||response.status>=500&&code!=='lab_unavailable'&&code!=='experiment_unavailable');
      }
      if(!json)throw new LabError('没有收到完整的实验回执，请查询或重试同一请求。','invalid_response',true);
      return json as T;
    } catch(e) {
      if(e instanceof LabError)throw e;
      throw new LabError(controller.signal.aborted?'等待回执已结束，服务端仍可能在处理。请查询结果或重试同一请求。':'网络未能返回回执。请查询结果或重试同一请求，不会重复创建实验。','network_unknown',true);
    } finally {window.clearTimeout(timer);controllers.current.delete(controller);}
  },[remember]);

  const refresh=useCallback(async (showError=true)=>{
    if(!LAB_ENABLED){if(alive.current)setStatus(CLOSED_STATUS);return;}
    if(!onlineRef.current||refreshing.current)return;
    refreshing.current=true;
    const version=++refreshVersion.current;
    if(alive.current){setChecking(true);if(showError)setError('');}
    const auth=sessionRef.current?.token??'';
    try {
      const current=checkedStatus(await request<unknown>('status',undefined,auth));
      if(!alive.current||version!==refreshVersion.current||auth!==(sessionRef.current?.token??''))return;
      setStatus(current);
      const active=current.active_run?checkedRun(current.active_run):null;
      if(active)acceptRun(active);
      else if(auth&&sessionRef.current?.lastRunId){
        const requestedRunId=sessionRef.current.lastRunId;
        try {const receipt=checkedRun(await request<unknown>(`runs/${encodeURIComponent(requestedRunId)}`,undefined,auth));if(alive.current&&version===refreshVersion.current&&auth===(sessionRef.current?.token??'')&&sessionRef.current?.lastRunId===requestedRunId)acceptRun(receipt);}
        catch(e){if(!alive.current||version!==refreshVersion.current||auth!==(sessionRef.current?.token??''))return;if(e instanceof LabError&&e.code==='run_not_found'){confirmedRef.current=false;setConfirmed(false);if(sessionRef.current)remember({...sessionRef.current,lastRunId:undefined});setError('服务端未找到旧记录，下面保留本机已取得的只读副本。');}else throw e;}
      }
    } catch(e){if(alive.current&&version===refreshVersion.current&&showError)setError((e as Error).message);}
    finally {if(version===refreshVersion.current){refreshing.current=false;if(alive.current)setChecking(false);}}
  },[acceptRun,remember,request]);

  useEffect(()=>{
    alive.current=true;
    if(sessionRef.current)remember(sessionRef.current);
    return()=>{alive.current=false;refreshing.current=false;refreshVersion.current++;for(const controller of controllers.current)controller.abort();};
  },[remember]);
  useEffect(()=>{const change=()=>{onlineRef.current=navigator.onLine;setOnline(navigator.onLine);};window.addEventListener('online',change);window.addEventListener('offline',change);return()=>{window.removeEventListener('online',change);window.removeEventListener('offline',change);};},[]);
  useEffect(()=>{refreshing.current=false;refreshVersion.current++;if(online)void refresh();},[token,online,refresh]);
  useEffect(()=>{
    if(!LAB_ENABLED||!online||!token||(!run?.step_in_progress&&run?.status!=='active'))return;
    const timer=window.setInterval(()=>void refresh(false),3000);
    return()=>window.clearInterval(timer);
  },[token,online,run?.id,run?.status,run?.step_in_progress,refresh]);

  function clearOperation(operation:Pending){
    const current=sessionRef.current;
    if(!current)return;
    const field=operation.kind==='cancel'?'cancel':'pending';
    if(current[field]?.requestId===operation.requestId)remember({...current,[field]:undefined});
  }

  async function mutate(kind:Pending['kind']){
    if(!LAB_ENABLED||!sessionRef.current||kind==='cancel'&&cancelWorking.current||kind!=='cancel'&&working.current)return;
    if(!onlineRef.current&&kind!=='cancel'){setError('当前离线，不能创建或推进真实实验。已取得记录仍可查看。');return;}
    const saved=kind==='cancel'?sessionRef.current.cancel:sessionRef.current.pending;
    if(saved&&saved.kind!==kind)return;
    const operation:Pending=saved??{kind,requestId:crypto.randomUUID(),...(kind!=='create'?{runId:runRef.current?.id}:{experimentType})};
    if(kind!=='create'&&!operation.runId)return;
    const field=kind==='cancel'?'cancel':'pending';
    remember({...sessionRef.current,[field]:operation});
    if(!onlineRef.current){setCancelNotice('已在本机记录停止意图，尚未送达服务端。服务器仍可能执行或超时；重连后点击“提交 / 确认停止”，沿用原请求编号。');return;}
    if(kind==='cancel'){cancelWorking.current=true;setCancelling(true);}else{working.current=true;setBusy(kind);}
    setError('');setCancelNotice('');
    const controller=new AbortController();
    const operationAuth=sessionRef.current.token;
    if(kind!=='cancel')operationController.current=controller;
    try {
      const path=kind==='create'?'runs':`runs/${encodeURIComponent(operation.runId!)}/${kind}`;
      const data=mutationBody(operation);
      const result=checkedRun(await request<Run>(path,data,operationAuth,controller,kind==='step'?130000:12000));
      if(!alive.current||operationAuth!==sessionRef.current?.token)return;
      clearOperation(operation);
      if(!alive.current)return;
      acceptRun(result);
      if(kind==='cancel'&&result.status!=='active'){
        const current=sessionRef.current;
        if(current?.pending?.runId===result.id)remember({...current,pending:undefined});
        operationController.current?.abort();
      }
      await refresh(false);
    } catch(e){
      if(!alive.current||operationAuth!==sessionRef.current?.token)return;
      if(!(e instanceof LabError)||!e.uncertain)clearOperation(operation);
      const latest=runRef.current;
      const alreadyStopped=kind==='step'&&latest!==null&&latest.id===operation.runId&&latest.status!=='active';
      if(alive.current&&!alreadyStopped)setError((e as Error).message);
      if(alive.current&&onlineRef.current)void refresh(false);
    } finally {
      if(kind==='cancel'){cancelWorking.current=false;if(alive.current)setCancelling(false);}
      else {working.current=false;operationController.current=null;if(alive.current)setBusy(null);}
    }
  }

  async function redeem(){
    if(!LAB_ENABLED||!onlineRef.current||working.current)return;
    working.current=true;setBusy('redeem');setError('');
    try {
      const result=await request<{access_token:string;expires_at:string}>('redeem',{invite_code:invite.trim()},'');
      if(typeof result.access_token!=='string'||result.access_token.length<16||result.access_token.length>256||!isDate(result.expires_at)||Date.parse(result.expires_at)<=Date.now())throw new LabError('兑换回执不完整，请联系维护者。');
      remember({token:result.access_token,expiresAt:result.expires_at});
      setInvite('');
      await refresh();
    } catch(e){if(alive.current)setError(e instanceof LabError&&e.uncertain?'兑换回执未能确认，邀请码可能已经被使用。请联系维护者确认或领取新邀请码；不要在其他设备重复兑换。':(e as Error).message);}
    finally {working.current=false;if(alive.current)setBusy(null);}
  }

  const pending=session?.pending,pendingCancel=session?.cancel,limits=status?.limits,owned=confirmed||session?.lastRunId===run?.id,active=owned&&run?.status==='active',inProgress=owned&&run?.step_in_progress,selected=status?.experiments?.find(item=>item.id===experimentType);
  return <div className="lab lab-comparison">
    <div className="lab-intro"><FlaskConical size={34}/><h3>让真实模型面对同一个问题。</h3><p>两份独立的信号台，同样的起点。改变反馈、模型或分工，看实际工具回执如何改变下一步。实验仅使用观察、连接、激活和验收四种虚拟法器。</p></div>
    <div className="notice">独立实验 · 不影响主线存档 · 每天 {limits?.daily_runs??10} 次 · 两组共一次额度 · 总计最多 {limits?.max_steps??8} 轮 / {limits?.run_seconds??120} 秒</div>
    {!online&&<div className="lab-offline" role="status"><WifiOff size={19}/><div><strong>当前离线，只读已取得记录</strong><p>创建与推进已停用。断网不暂停服务端计时；停止意图须在重连后提交才能确认。</p></div></div>}
    <fieldset className="lab-experiment-picker" disabled={Boolean(busy)||cancelling||Boolean(pending)||Boolean(pendingCancel)||Boolean(active||inProgress)}><legend>选择要观察的取舍</legend>{experimentTypes.map(id=>{const item=status?.experiments?.find(entry=>entry.id===id);return <label key={id} className={experimentType===id?'is-selected':''}><input type="radio" name="real-lab-experiment" checked={experimentType===id} onChange={()=>setExperimentType(id)}/><span><strong>{item?.label??experimentNames[id]}</strong><p>{experimentDescriptions[id]}</p><small>{item?.arms.length===2?`A：${item.arms[0]}；B：${item.arms[1]}。每组最多 ${item.arm_budget} 轮。`:'A / B 由服务端固定配置，浏览器不能任意指定模型、地址或提示。'}</small>{item&&!item.enabled&&<em>{reasonNames[item.reason??'']??'此实验暂不可用。'}</em>}{!item&&status?.enabled&&<em>{reasonNames.catalog_unavailable}</em>}</span></label>;})}</fieldset>
    {status===null?<div className="empty"><KeyRound/><h3>{checking?'正在检查实验台…':'暂时连接不到实验台'}</h3><p>真实实验需要网络连接，已取得记录仍在下面。</p><button className="button" disabled={checking||!online} onClick={()=>void refresh()}><RefreshCw size={16}/>重新检查</button></div>
    :!status.enabled?<div className="empty"><KeyRound/><h3>{LAB_ENABLED?'实验台尚未启用':'本阶段尚未启用'}</h3><p>{LAB_ENABLED?'服务端模型连接准备好后，这里会开放邀请码入口。':'真实模型服务尚未完成上线验收，当前可以继续主线与现实蓝图试炼。'}已取得记录可只读查看。</p>{LAB_ENABLED&&<button className="button" disabled={checking||!online} onClick={()=>void refresh()}><RefreshCw size={16}/>检查开放状态</button>}</div>
    :!token?<form onSubmit={e=>{e.preventDefault();void redeem();}}><label>实验邀请码<input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={invite} onChange={e=>setInvite(e.target.value)} placeholder="输入私有邀请码" maxLength={128} required disabled={!online}/></label><button disabled={Boolean(busy)||!invite.trim()||!online} className="button primary full">{busy==='redeem'?'正在兑换…':'兑换实验通行证'}</button><p className="fine-print">邀请码仅可兑换一次。通行证保存在当前浏览器，不包含模型密钥；请在自己的设备上兑换。</p></form>
    :<>
      <p>今日剩余 {status.remaining_runs??'—'} 次 · 按 {limits?.quota_timezone??'UTC'} 日期重置</p>
      <p className="fine-print">两组共用一次额度与服务端计时。失败、停止或超时仍计一次；查询与重试同一请求不额外扣次。</p>
      <div className="button-row">
        <button className="button primary" disabled={!online||Boolean(busy)||cancelling||Boolean(pendingCancel)||Boolean(pending&&pending.kind!=='create')||(!pending&&(!selected?.enabled||Boolean(active||inProgress||status.busy||status.remaining_runs===0)))} onClick={()=>void mutate('create')}><FlaskConical size={16}/>{pending?.kind==='create'?'确认上次创建结果':'创建两组对照'}</button>
        {(active||pending?.kind==='step')&&<button className="button" disabled={!online||Boolean(busy)||cancelling||Boolean(pendingCancel)||Boolean(pending&&pending.kind!=='step')||Boolean(inProgress&&!pending)} onClick={()=>void mutate('step')}><Play size={15}/>{pending?.kind==='step'?'查询 / 重试这一轮':run?.experiment?`请求${run.experiment.current_arm===0?' A':' B'}组下一轮`:'请求一轮'}</button>}
        {(active||inProgress||pendingCancel)&&<button className="button" disabled={cancelling} onClick={()=>void mutate('cancel')}><Square size={14}/>{cancelling?'正在停止…':!online?'记录停止意图':pendingCancel?'提交 / 确认停止':'停止整个对照'}</button>}
        <button className="button" disabled={checking||!online} onClick={()=>void refresh()}><RefreshCw size={15}/>{checking?'查询中…':'查询最新结果'}</button>
      </div>
      {status.busy&&!active&&!run?.step_in_progress&&!pending&&<p className="fine-print">实验台正在处理另一场实验，请稍后查询。</p>}
      {(pending||pendingCancel)&&!busy&&!cancelling&&<p className="notice">上次请求还没有确定回执。请使用上方的确认 / 重试按钮；它会沿用原请求编号。</p>}
      {pending?.kind==='create'&&<p className="lab-note">待确认的是{pending.experimentType?experimentNames[pending.experimentType]:'旧版单组实验'}；重试保留当时的类型和编号，不会另开一场。</p>}
      <p className="fine-print">通行证保存在本浏览器{session?.expiresAt?`，有效至 ${new Date(session.expiresAt).toLocaleDateString('zh-CN')}`:''}，不包含模型密钥。</p>
    </>}
    {run&&<><p className="lab-record-time">已取得记录 · {record?.receivedAt?new Date(record.receivedAt).toLocaleString('zh-CN'):'本次页面'}{!online?' · 离线副本，当前服务端状态未知':!confirmed?' · 本机只读副本，尚未查询确认':''}</p>{run.status==='active'&&<p className="fine-print">服务端期限：{new Date(run.expires_at).toLocaleTimeString('zh-CN')}。关闭或断网不会暂停计时。</p>}<RunReport run={run}/></>}
    {!online&&LAB_ENABLED&&token&&status?.enabled!==true&&(active||inProgress||pendingCancel)&&<button className="button" onClick={()=>void mutate('cancel')}><Square size={14}/>记录停止意图，重连后确认</button>}
    {(busy||cancelling)&&<p role="status">{cancelling?'正在终止实验…':busy==='step'?'模型正在尝试行动，你随时可以停止实验。':busy==='create'?'正在创建实验…':'正在兑换通行证…'}</p>}
    {storageWarning&&<p className="notice" role="status">{storageWarning}</p>}
    {cancelNotice&&<p className="notice" role="status">{cancelNotice}</p>}
    {error&&<p role="alert" className="error-message">{error}</p>}
  </div>;
}
