import {useCallback,useEffect,useRef,useState} from 'react';
import {FlaskConical,Play,Square,KeyRound,RefreshCw} from 'lucide-react';

type RunStatus='active'|'completed'|'incomplete'|'budget_exhausted'|'timed_out'|'cancelled'|'failed';
interface Run {id:string;status:RunStatus;steps_used:number;max_steps:number;world:Record<string,unknown>;events:Array<Record<string,unknown>>;final_text:string;expires_at:string;step_in_progress:boolean;}
interface Status {enabled:boolean;busy:boolean;scenario_ids:string[];limits:{daily_runs:number;max_steps:number;run_seconds:number;max_output_tokens:number;global_concurrency:number;quota_timezone:string};remaining_runs?:number;active_run?:Run|null;}
interface Pending {kind:'create'|'step'|'cancel';requestId:string;runId?:string;}
interface Session {token:string;expiresAt?:string;lastRunId?:string;pending?:Pending;cancel?:Pending;}
const STORAGE_KEY='echo-lab-session-v1';
const LAB_ENABLED=import.meta.env.VITE_LAB_ENABLED==='true';
const CLOSED_STATUS:Status={enabled:false,busy:false,scenario_ids:['signal-rescue'],limits:{daily_runs:10,max_steps:8,run_seconds:120,max_output_tokens:512,global_concurrency:1,quota_timezone:'UTC'}};
const names:Record<RunStatus,string>={active:'实验进行中',completed:'独立验收通过',incomplete:'已停止，尚未验收',budget_exhausted:'请求预算用完',timed_out:'实验时间已到',cancelled:'已停止实验',failed:'模型连接未完成'};
const errors:Record<string,string>={authentication_required:'请先兑换实验通行证。',invalid_token:'通行证已失效，请向维护者领取新的邀请码。',invalid_invite:'邀请码无效、已过期或已被兑换。已兑换的通行证通常保存在原浏览器中。',run_not_found:'没有找到这次实验，请重新检查实验状态。',lab_busy:'另一场实验正在进行，稍后可以再试。本次没有扣除次数。',step_in_progress:'这一轮仍在处理中。你可以查询结果或停止实验。',run_not_active:'这次实验已经停止，请查询最新结果。',step_budget_exhausted:'本次模型请求预算已经用完。',daily_quota_exhausted:'今天的实验次数已用完，UTC 零点后恢复。',lab_unavailable:'实验台尚未配置模型连接，主线仍可继续游玩。',storage_unavailable:'实验记录暂时无法读取，请稍后查询或重试同一请求。',idempotency_conflict:'请求记录发生冲突，请查询最新状态后重试。',invalid_request:'请求格式未通过检查，请刷新页面后重试。',request_too_large:'请求内容超出实验限制。',provider_error:'模型连接未完成，本次实验已经停止。',request_interrupted:'模型请求已中断。',run_timeout:'本次实验的时间已经用完。',verification_missing:'模型已经结束回答，但虚拟世界尚未通过验收。',user_cancelled:'你已停止本次实验。',unknown_tool:'拒绝了实验区之外的工具。',invalid_arguments:'工具参数不符合规则，世界没有因此改变。',connection_not_permitted:'这两个节点之间不允许建立连接。',observe_endpoints_first:'必须先观察连接的两端。',observe_target_first:'必须先观察目标。',upstream_not_ready:'上游尚未连接或激活。'};
const toolNames:Record<string,string>={observe:'观察',connect:'连接',activate:'激活',verify:'验收'};
const nodeNames:Record<string,string>={source:'能源核心',relay:'中继器',beacon:'信号台'};

class LabError extends Error {constructor(message:string,readonly code='',readonly uncertain=false){super(message);}}
function readSession():Session|null {
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null') as Session|null;
    if(saved&&typeof saved.token==='string'&&saved.token.length>=16&&saved.token.length<=256){
      if(saved.expiresAt&&Date.parse(saved.expiresAt)<=Date.now())return null;
      return saved;
    }
    const previous=sessionStorage.getItem('echo-lab-token');
    if(previous)return {token:previous};
  } catch { /* Storage may be unavailable; this visit can still use a token. */ }
  return null;
}
function checkedRun(value:unknown):Run {
  const run=value as Run;
  if(!run||typeof run.id!=='string'||!Object.prototype.hasOwnProperty.call(names,run.status)||!Array.isArray(run.events)||!run.world||typeof run.world!=='object'||typeof run.steps_used!=='number'||typeof run.max_steps!=='number'||typeof run.expires_at!=='string')throw new LabError('实验台返回了无法识别的记录，请查询最新结果。','invalid_response',true);
  return run;
}

export default function Lab(){
  const [session,setSession]=useState<Session|null>(readSession),[invite,setInvite]=useState(''),[status,setStatus]=useState<Status|null>(LAB_ENABLED?null:CLOSED_STATUS),[run,setRun]=useState<Run|null>(null);
  const [busy,setBusy]=useState<Pending['kind']|'redeem'|null>(null),[cancelling,setCancelling]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState(''),[storageWarning,setStorageWarning]=useState('');
  const sessionRef=useRef(session),runRef=useRef<Run|null>(null),alive=useRef(false),controllers=useRef(new Set<AbortController>()),operationController=useRef<AbortController|null>(null),working=useRef(false),cancelWorking=useRef(false),refreshing=useRef(false),refreshVersion=useRef(0);
  const token=session?.token??'';

  const remember=useCallback((next:Session|null)=>{
    sessionRef.current=next;
    if(alive.current)setSession(next);
    try {
      if(next)localStorage.setItem(STORAGE_KEY,JSON.stringify(next));else localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem('echo-lab-token');
    } catch {if(alive.current)setStorageWarning('浏览器不允许保存通行证。本次关闭页面后可能需要领取新的邀请码。');}
  },[]);

  const acceptRun=useCallback((next:Run)=>{
    const previous=runRef.current;
    // A late step reply must not resurrect a run after confirmed cancellation.
    if(previous?.id===next.id&&(previous.steps_used>next.steps_used||(previous.status!=='active'&&next.status==='active')))return;
    if(previous?.id===next.id&&previous.status!=='active'&&!previous.step_in_progress&&next.status!=='active')next={...next,step_in_progress:false};
    runRef.current=next;
    if(alive.current)setRun(next);
    if(sessionRef.current&&sessionRef.current.lastRunId!==next.id)remember({...sessionRef.current,lastRunId:next.id});
  },[remember]);

  const request=useCallback(async <T,>(path:string,data?:object,auth=sessionRef.current?.token??'',controller=new AbortController(),timeout=12000):Promise<T>=>{
    if(!LAB_ENABLED)throw new LabError('本阶段尚未启用真实模型实验。','lab_unavailable');
    controllers.current.add(controller);
    const timer=window.setTimeout(()=>controller.abort(),timeout);
    try {
      const response=await fetch(`/api/lab/${path}`,{method:data?'POST':'GET',cache:'no-store',signal:controller.signal,headers:{...(data?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:`Bearer ${auth}`}:{})},...(data?{body:JSON.stringify(data)}:{})});
      const json=await response.json().catch(()=>null) as {error?:{code?:string}}|null;
      if(!response.ok){
        const code=typeof json?.error?.code==='string'?json.error.code:'';
        if(response.status===401&&auth&&sessionRef.current?.token===auth)remember(null);
        const fallback=response.status===429?'实验台请求较多，请稍后再试。':response.status>=500?'实验服务暂时无法连接，请稍后查询结果。':'实验请求未完成，请查询最新状态。';
        throw new LabError(errors[code]??fallback,code,code==='step_in_progress'||response.status>=500);
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
    if(refreshing.current)return;
    refreshing.current=true;
    const version=++refreshVersion.current;
    if(alive.current){setChecking(true);if(showError)setError('');}
    const auth=sessionRef.current?.token??'';
    try {
      const current=await request<Status>('status',undefined,auth);
      if(typeof current.enabled!=='boolean'||!current.limits)throw new LabError('实验台状态暂时无法识别，请稍后重试。');
      if(!alive.current||version!==refreshVersion.current||auth!==(sessionRef.current?.token??''))return;
      setStatus(current);
      const active=current.active_run?checkedRun(current.active_run):null;
      if(active)acceptRun(active);
      else if(auth&&sessionRef.current?.lastRunId){
        try {acceptRun(checkedRun(await request<Run>(`runs/${sessionRef.current.lastRunId}`,undefined,auth)));}
        catch(e){if(e instanceof LabError&&e.code==='run_not_found'){runRef.current=null;setRun(null);if(sessionRef.current)remember({...sessionRef.current,lastRunId:undefined});}else throw e;}
      }
    } catch(e){if(alive.current&&version===refreshVersion.current&&showError)setError((e as Error).message);}
    finally {if(version===refreshVersion.current){refreshing.current=false;if(alive.current)setChecking(false);}}
  },[acceptRun,remember,request]);

  useEffect(()=>{
    alive.current=true;
    if(sessionRef.current)remember(sessionRef.current);
    return()=>{alive.current=false;refreshing.current=false;refreshVersion.current++;for(const controller of controllers.current)controller.abort();};
  },[remember]);
  useEffect(()=>{refreshing.current=false;refreshVersion.current++;void refresh();},[token,refresh]);
  useEffect(()=>{
    if(!token||(!run?.step_in_progress&&run?.status!=='active'))return;
    const timer=window.setInterval(()=>void refresh(false),3000);
    return()=>window.clearInterval(timer);
  },[token,run?.id,run?.status,run?.step_in_progress,refresh]);

  function clearOperation(operation:Pending){
    const current=sessionRef.current;
    if(!current)return;
    const field=operation.kind==='cancel'?'cancel':'pending';
    if(current[field]?.requestId===operation.requestId)remember({...current,[field]:undefined});
  }

  async function mutate(kind:Pending['kind']){
    if(!LAB_ENABLED||!sessionRef.current||kind==='cancel'&&cancelWorking.current||kind!=='cancel'&&working.current)return;
    const saved=kind==='cancel'?sessionRef.current.cancel:sessionRef.current.pending;
    if(saved&&saved.kind!==kind)return;
    const operation:Pending=saved??{kind,requestId:crypto.randomUUID(),...(kind!=='create'?{runId:runRef.current?.id}:{})};
    if(kind!=='create'&&!operation.runId)return;
    const field=kind==='cancel'?'cancel':'pending';
    remember({...sessionRef.current,[field]:operation});
    if(kind==='cancel'){cancelWorking.current=true;setCancelling(true);}else{working.current=true;setBusy(kind);}
    setError('');
    const controller=new AbortController();
    if(kind!=='cancel')operationController.current=controller;
    try {
      const path=kind==='create'?'runs':`runs/${operation.runId}/${kind}`;
      const data={request_id:operation.requestId,...(kind==='create'?{scenario_id:'signal-rescue'}:{})};
      const result=checkedRun(await request<Run>(path,data,sessionRef.current.token,controller,kind==='step'?130000:12000));
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
      if(!(e instanceof LabError)||!e.uncertain)clearOperation(operation);
      const latest=runRef.current;
      const alreadyStopped=kind==='step'&&latest!==null&&latest.id===operation.runId&&latest.status!=='active';
      if(alive.current&&!alreadyStopped)setError((e as Error).message);
      if(alive.current)void refresh(false);
    } finally {
      if(kind==='cancel'){cancelWorking.current=false;if(alive.current)setCancelling(false);}
      else {working.current=false;operationController.current=null;if(alive.current)setBusy(null);}
    }
  }

  async function redeem(){
    if(!LAB_ENABLED||working.current)return;
    working.current=true;setBusy('redeem');setError('');
    try {
      const result=await request<{access_token:string;expires_at:string}>('redeem',{invite_code:invite.trim()},'');
      if(typeof result.access_token!=='string'||!result.expires_at)throw new LabError('兑换回执不完整，请联系维护者。');
      remember({token:result.access_token,expiresAt:result.expires_at});
      setInvite('');
      await refresh();
    } catch(e){if(alive.current)setError(e instanceof LabError&&e.uncertain?'兑换回执未能确认，邀请码可能已经被使用。请联系维护者确认或领取新邀请码；不要在其他设备重复兑换。':(e as Error).message);}
    finally {working.current=false;if(alive.current)setBusy(null);}
  }

  const pending=session?.pending,pendingCancel=session?.cancel,limits=status?.limits,active=run?.status==='active';
  return <div className="lab">
    <div className="lab-intro"><FlaskConical size={34}/><h3>让真实模型试着接通回路。</h3><p>主线由确定规则驱动。在这里，真实语言模型只能通过观察、连接、激活和验收四种虚拟法器修复信号台。它可能走出不同的路径，也可能失败。</p></div>
    <div className="notice">独立实验 · 不影响主线存档 · 每天 {limits?.daily_runs??10} 次 · 每次最多 {limits?.max_steps??8} 轮 / {limits?.run_seconds??120} 秒</div>
    {status===null?<div className="empty"><KeyRound/><h3>{checking?'正在检查实验台…':'暂时连接不到实验台'}</h3><p>真实实验需要网络连接，主线冒险仍可继续。</p><button className="button" disabled={checking} onClick={()=>void refresh()}><RefreshCw size={16}/>重新检查</button></div>
    :!status.enabled?<div className="empty"><KeyRound/><h3>{LAB_ENABLED?'实验台尚未启用':'本阶段尚未启用'}</h3><p>{LAB_ENABLED?'服务端模型连接准备好后，这里会开放邀请码入口。':'真实模型实验会在后续阶段开放，当前先体验伙伴构筑与主线冒险。'}主线可以完整离线游玩。</p>{LAB_ENABLED&&<button className="button" disabled={checking} onClick={()=>void refresh()}><RefreshCw size={16}/>检查开放状态</button>}</div>
    :!token?<form onSubmit={e=>{e.preventDefault();void redeem();}}><label>实验邀请码<input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={invite} onChange={e=>setInvite(e.target.value)} placeholder="输入私有邀请码" maxLength={128} required/></label><button disabled={Boolean(busy)||!invite.trim()} className="button primary full">{busy==='redeem'?'正在兑换…':'兑换实验通行证'}</button><p className="fine-print">邀请码仅可兑换一次。通行证会保存在当前浏览器，关闭再打开仍可使用；请在自己的设备上兑换。</p></form>
    :<>
      <p>今日剩余 {status.remaining_runs??'—'} 次 · 按 {limits?.quota_timezone??'UTC'} 日期重置</p>
      <p className="fine-print">实验从创建起计时。失败、停止或超时仍计一次；查询结果与重试同一请求不额外扣次。</p>
      <div className="button-row">
        <button className="button primary" disabled={Boolean(busy)||cancelling||Boolean(pendingCancel)||Boolean(pending&&pending.kind!=='create')||(!pending&&Boolean(active||run?.step_in_progress||status.busy||status.remaining_runs===0))} onClick={()=>void mutate('create')}><FlaskConical size={16}/>{pending?.kind==='create'?'确认上次创建结果':'创建实验'}</button>
        {(active||pending?.kind==='step')&&<button className="button" disabled={Boolean(busy)||cancelling||Boolean(pendingCancel)||Boolean(pending&&pending.kind!=='step')||Boolean(run?.step_in_progress&&!pending)} onClick={()=>void mutate('step')}><Play size={15}/>{pending?.kind==='step'?'查询 / 重试这一轮':'请求一轮'}</button>}
        {(active||run?.step_in_progress||pendingCancel)&&<button className="button" disabled={cancelling} onClick={()=>void mutate('cancel')}><Square size={14}/>{cancelling?'正在停止…':pendingCancel?'确认停止结果':'停止实验'}</button>}
        <button className="button" disabled={checking} onClick={()=>void refresh()}><RefreshCw size={15}/>{checking?'查询中…':'查询最新结果'}</button>
      </div>
      {status.busy&&!active&&!run?.step_in_progress&&!pending&&<p className="fine-print">实验台正在处理另一场实验，请稍后查询。</p>}
      {(pending||pendingCancel)&&!busy&&!cancelling&&<p className="notice">上次请求还没有确定回执。请使用上方的确认 / 重试按钮；它会沿用原请求编号。</p>}
      {run&&<>
        <p role="status">{names[run.status]} · 已请求 {run.steps_used} / {run.max_steps} 轮{run.step_in_progress?' · 等待这一轮回执':''}</p>
        {active&&<p className="fine-print">本次期限：{new Date(run.expires_at).toLocaleTimeString('zh-CN')}。关闭实验台不会暂停服务端计时。</p>}
        <div className="callout"><h4>虚拟世界的验收结果</h4><p>{run.world.verified===true?'信号链路已由工具独立验收。':'尚未取得通过验收的证据。模型的成功声明不会改变这个结果。'}</p>{Array.isArray(run.world.active)&&<p>已激活：{run.world.active.map(value=>nodeNames[String(value)]??String(value)).join('、')||'无'}</p>}{run.final_text&&<p>{run.final_text}</p>}</div>
        <div className="section-label">行动回执 · {run.events.length} 条</div>
        {run.events.length===0?<p className="muted">创建实验后，请求一轮，看看模型先采取什么行动。</p>:<ol>{run.events.map((event,index)=><li key={index}>{event.kind==='assistant'?<p>模型：{String(event.text??'')}</p>:event.kind==='tool'?<p>{toolNames[String(event.tool)]??'未知工具'} · {(event.result as {ok?:boolean})?.ok===true?'执行完成':errors[String((event.result as {error?:string})?.error)]??'请求被拒绝'}</p>:<p>{errors[String(event.code)]??'本次实验已停止。'}</p>}</li>)}</ol>}
        <details><summary>查看结构化回执</summary><pre className="code-view">{JSON.stringify({world:run.world,events:run.events,final_text:run.final_text},null,2)}</pre></details>
      </>}
      <p className="fine-print">通行证保存在本浏览器{session?.expiresAt?`，有效至 ${new Date(session.expiresAt).toLocaleDateString('zh-CN')}`:''}，不包含模型密钥。</p>
    </>}
    {(busy||cancelling)&&<p role="status">{cancelling?'正在终止实验…':busy==='step'?'模型正在尝试行动，你随时可以停止实验。':busy==='create'?'正在创建实验…':'正在兑换通行证…'}</p>}
    {storageWarning&&<p className="notice" role="status">{storageWarning}</p>}
    {error&&<p role="alert" className="error-message">{error}</p>}
  </div>;
}
