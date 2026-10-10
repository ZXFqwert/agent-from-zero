/** Shared access is verified by the server. No passphrase is stored or bundled here. */
export const LAB_SESSION_KEY = 'echo-lab-session-v1';
export const WORKSHOP_ACCESS_KEY = 'echo-workshop-access-v1';
export function canonicalWorkshopTarget(pathname:string,enabled:boolean,unlocked:boolean):'/play/'|null {
  return enabled&&unlocked&&(pathname==='/'||pathname==='/index.html')?'/play/':null;
}
export type ExperimentType = 'same-model-blueprints' | 'same-blueprint-models' | 'solo-team';
export interface Pending {kind:'create'|'step'|'cancel';requestId:string;runId?:string;experimentType?:ExperimentType;}
export interface AccessSession {token:string;expiresAt?:string;lastRunId?:string;pending?:Pending;cancel?:Pending;}
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
const experiments:ExperimentType[] = ['same-model-blueprints','same-blueprint-models','solo-team'];
const date = (value:unknown):value is string => typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value));
const object = (value:unknown):value is Record<string,unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function pending(value:unknown,cancelOnly=false):Pending|undefined {
  if(!object(value)||!['create','step','cancel'].includes(String(value.kind))||cancelOnly&&value.kind!=='cancel'||typeof value.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,64}$/.test(value.requestId)||value.kind!=='create'&&(typeof value.runId!=='string'||!value.runId||value.runId.length>100)||value.experimentType!==undefined&&!experiments.includes(value.experimentType as ExperimentType))return;
  return {kind:value.kind as Pending['kind'],requestId:value.requestId,...(typeof value.runId==='string'?{runId:value.runId}:{}),...(typeof value.experimentType==='string'?{experimentType:value.experimentType as ExperimentType}:{})};
}
export function checkedSession(value:unknown,now=Date.now()):AccessSession|null {
  if(!object(value)||typeof value.token!=='string'||value.token.length<16||value.token.length>256||value.expiresAt!==undefined&&(!date(value.expiresAt)||Date.parse(value.expiresAt)<=now))return null;
  return {token:value.token,...(value.expiresAt?{expiresAt:value.expiresAt as string}:{}),...(typeof value.lastRunId==='string'&&value.lastRunId.length>0&&value.lastRunId.length<=100?{lastRunId:value.lastRunId}:{}),pending:pending(value.pending),cancel:pending(value.cancel,true)};
}
export function readActiveSession(storage?:Reader,legacy?:Reader,now=Date.now()):AccessSession|null {
  try {
    const local=storage??globalThis.localStorage;
    const raw=local?.getItem(LAB_SESSION_KEY);
    if(raw&&raw.length<=8192){const active=checkedSession(JSON.parse(raw),now);if(active)return active;}
    const previous=(legacy??globalThis.sessionStorage)?.getItem('echo-lab-token');
    if(previous&&previous.length>=16&&previous.length<=256)return {token:previous};
  } catch { /* Unavailable storage does not modify main progress or local records. */ }
  return null;
}
export function hasWorkshopAccess(storage?:Reader):boolean {
  try {
    const raw=(storage??globalThis.localStorage)?.getItem(WORKSHOP_ACCESS_KEY);
    if(!raw||raw.length>256)return false;
    const value:unknown=JSON.parse(raw);
    return object(value)&&value.version===1&&value.unlocked===true&&date(value.grantedAt);
  } catch {return false;}
}
export function saveWorkshopAccess(storage?:Writer,now=new Date().toISOString()):boolean {
  try{(storage??globalThis.localStorage).setItem(WORKSHOP_ACCESS_KEY,JSON.stringify({version:1,unlocked:true,grantedAt:now}));return true;}catch{return false;}
}
export class AccessError extends Error {
  constructor(message:string,readonly code:string){super(message);}
}
export function checkedAccess(value:unknown,now=Date.now()):AccessSession {
  if(!object(value)||typeof value.access_token!=='string'||value.access_token.length<16||value.access_token.length>256||value.token_type!=='bearer'||!date(value.expires_at)||Date.parse(value.expires_at)<=now)throw new AccessError('没有收到完整的进入凭证，请重新验证口令。','invalid_response');
  // New credentials never inherit operations or run ownership from a previous session.
  return {token:value.access_token,expiresAt:value.expires_at};
}
export async function verifyAccess(passphrase:string,signal?:AbortSignal,fetcher:typeof fetch=globalThis.fetch):Promise<AccessSession> {
  try {
    const response=await fetcher('/api/lab/access',{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({passphrase})});
    const value:unknown=await response.json().catch(()=>null);
    if(!response.ok){
      const code=object(value)&&object(value.error)&&typeof value.error.code==='string'?value.error.code:'';
      const message=code==='invalid_access'?'工坊口令不正确，请再试一次。':code==='access_unavailable'?'工坊入口暂时无法验证，请稍后再试。':response.status===429?'验证请求较多，请稍后再试。':'口令验证暂时未完成，请重新连接后再试。';
      throw new AccessError(message,code||'access_failed');
    }
    return checkedAccess(value);
  } catch(error){if(error instanceof AccessError)throw error;throw new AccessError('网络未能返回验证结果，请连接网络后重试。','network_unknown');}
}
export function persistAccess(session:AccessSession,storage?:Writer):boolean {
  try {
    (storage??globalThis.localStorage).setItem(LAB_SESSION_KEY,JSON.stringify({token:session.token,expiresAt:session.expiresAt}));
    return saveWorkshopAccess(storage);
  }catch{return false;}
}
export async function verifyAndPersistAccess(passphrase:string,signal?:AbortSignal,fetcher:typeof fetch=globalThis.fetch,storage?:Writer):Promise<AccessSession> {
  const session=await verifyAccess(passphrase,signal,fetcher);
  if(!persistAccess(session,storage))throw new AccessError('浏览器未能保存进入凭证。请允许本网站保存本机数据后再试，已有存档没有改动。','storage_unavailable');
  return session;
}
