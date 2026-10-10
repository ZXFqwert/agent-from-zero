import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,type ViteDevServer} from 'vite';
import {AccessError,LAB_SESSION_KEY,WORKSHOP_ACCESS_KEY,canonicalWorkshopTarget,checkedAccess,checkedSession,hasWorkshopAccess,persistAccess,readActiveSession,saveWorkshopAccess,verifyAccess,verifyAndPersistAccess} from '../src/access';

const NOW=Date.parse('2026-10-10T08:00:00Z');
const TOKEN='opaque-session-token-without-model-key';
const receipt=()=>({access_token:TOKEN,token_type:'bearer',expires_at:'2099-10-10T08:00:00Z'});
function memory(initial:Record<string,string>={}){
  const values=new Map(Object.entries(initial));
  return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
}
let server:ViteDevServer,gate:typeof import('../src/components/AccessGate');
before(async()=>{server=await createServer({root:process.cwd(),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error'});gate=await server.ssrLoadModule('/src/components/AccessGate.tsx');});
after(async()=>{await server?.close();});

test('access calls only the server gate and stores neither passphrase nor returned private fields',async()=>{
  const captured:Array<{url:string;options:RequestInit|undefined}>=[];
  const answer={...receipt(),api_key:'PRIVATE_PROVIDER',passphrase:'PRIVATE_INPUT',lastRunId:'OLD_RUN',pending:{kind:'step'}};
  const fetcher=(async(url:string|URL|Request,options?:RequestInit)=>{captured.push({url:String(url),options});return new Response(JSON.stringify(answer),{status:200});}) as typeof fetch;
  const result=await verifyAccess('user entered secret',undefined,fetcher);
  assert.deepEqual(result,{token:TOKEN,expiresAt:answer.expires_at});
  assert.equal(captured.length,1);assert.equal(captured[0].url,'/api/lab/access');
  assert.equal(captured[0].options?.cache,'no-store');assert.equal(captured[0].options?.method,'POST');
  assert.deepEqual(JSON.parse(String(captured[0].options?.body)),{passphrase:'user entered secret'});
  assert.deepEqual(captured[0].options?.headers,{'Content-Type':'application/json'});
  const store=memory({'echo-lab-last-record-v1':'OLD_READONLY_RECORD'});
  assert.equal(persistAccess(result,store),true);
  assert.doesNotMatch(JSON.stringify([...store.values]),/user entered secret|PRIVATE_PROVIDER|PRIVATE_INPUT|OLD_RUN/);
  assert.equal(store.values.get('echo-lab-last-record-v1'),'OLD_READONLY_RECORD');
});

test('malformed, expired or wrong token-type success receipts never grant access',()=>{
  const samples:unknown[]=[null,[],{}, {...receipt(),access_token:'short'},{...receipt(),token_type:'api_key'},{...receipt(),token_type:undefined},{...receipt(),expires_at:'2026-10-09T00:00:00Z'},{...receipt(),expires_at:'never'},{...receipt(),access_token:'x'.repeat(257)}];
  for(const sample of samples)assert.throws(()=>checkedAccess(sample,NOW),AccessError);
  assert.deepEqual(checkedAccess(receipt(),NOW),{token:TOKEN,expiresAt:receipt().expires_at});
});

test('failed access and rate limits expose safe messages instead of arbitrary server text',async()=>{
  for(const [status,code,expected] of [[403,'invalid_access',/口令不正确/],[503,'access_unavailable',/暂时无法验证/],[429,'rate_limited',/请求较多/],[500,'private-provider-text',/暂时未完成/]] as const){
    const fetcher=(async()=>new Response(JSON.stringify({error:{code,message:'DO_NOT_ECHO_SECRET'}}),{status})) as typeof fetch;
    await assert.rejects(()=>verifyAccess('secret',undefined,fetcher),(error:unknown)=>{assert.ok(error instanceof AccessError);assert.match(error.message,expected);assert.doesNotMatch(error.message,/DO_NOT_ECHO_SECRET|secret/);return true;});
  }
  await assert.rejects(()=>verifyAccess('secret',undefined,(async()=>{throw new Error('DO_NOT_ECHO_SECRET');}) as typeof fetch),/连接网络后重试/);
});

test('independent unlock survives model-token expiration and leaves old game and experiment records untouched',()=>{
  const store=memory({[LAB_SESSION_KEY]:JSON.stringify({token:TOKEN,expiresAt:'2026-10-09T08:00:00Z'}),'main-save':'MAIN_PROGRESS','echo-lab-last-record-v1':'REAL_RESULT'});
  assert.equal(readActiveSession(store,memory(),NOW),null);assert.equal(hasWorkshopAccess(store),false);
  assert.equal(saveWorkshopAccess(store,'2026-10-10T08:00:00Z'),true);
  assert.equal(hasWorkshopAccess(store),true);assert.equal(readActiveSession(store,memory(),NOW),null);
  assert.equal(store.values.get('main-save'),'MAIN_PROGRESS');assert.equal(store.values.get('echo-lab-last-record-v1'),'REAL_RESULT');
  assert.equal(JSON.parse(store.values.get(WORKSHOP_ACCESS_KEY)!).token,undefined);
});

test('new access replaces only session ownership, preserving the old read-only record',()=>{
  const store=memory({[LAB_SESSION_KEY]:JSON.stringify({token:'old-valid-opaque-token',expiresAt:'2099-10-10T08:00:00Z',lastRunId:'old-run',pending:{kind:'step',requestId:'old-step-request',runId:'old-run'},cancel:{kind:'cancel',requestId:'old-stop-request',runId:'old-run'}}),'echo-lab-last-record-v1':'original-public-result'});
  persistAccess(checkedAccess(receipt(),NOW),store);
  assert.deepEqual(readActiveSession(store,memory(),NOW),{token:TOKEN,expiresAt:receipt().expires_at,pending:undefined,cancel:undefined});
  assert.equal(store.values.get('echo-lab-last-record-v1'),'original-public-result');
});

test('existing legacy token resumes exact pending identities; malformed operations are discarded',()=>{
  const pending={kind:'create',requestId:'original-request-001',experimentType:'solo-team'};
  const cancel={kind:'cancel',requestId:'original-stop-001',runId:'previous-run'};
  const store=memory({[LAB_SESSION_KEY]:JSON.stringify({token:TOKEN,lastRunId:'previous-run',pending,cancel,api_key:'FORBIDDEN'})});
  const session=readActiveSession(store,memory(),NOW);
  assert.deepEqual(session,{token:TOKEN,lastRunId:'previous-run',pending,cancel});
  assert.deepEqual(readActiveSession(memory(),memory({'echo-lab-token':TOKEN}),NOW),{token:TOKEN});
  assert.equal(checkedSession({token:TOKEN,pending:{...pending,requestId:'bad'},cancel:{...cancel,kind:'step'}},NOW)?.pending,undefined);
  assert.equal(checkedSession({token:TOKEN,pending,cancel:{...cancel,kind:'step'}},NOW)?.cancel,undefined);
  assert.equal(store.values.has(WORKSHOP_ACCESS_KEY),false);
});

test('bad markers and inaccessible local storage do not fabricate permanent access',()=>{
  for(const saved of ['not json',JSON.stringify({version:2,unlocked:true,grantedAt:'2026-10-10'}),JSON.stringify({version:1,unlocked:'true',grantedAt:'2026-10-10'}),JSON.stringify({version:1,unlocked:true,grantedAt:'not-date'}),' '.repeat(257)])assert.equal(hasWorkshopAccess(memory({[WORKSHOP_ACCESS_KEY]:saved})),false);
  const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  assert.equal(hasWorkshopAccess(broken),false);assert.equal(readActiveSession(broken,memory()),null);assert.equal(saveWorkshopAccess(broken),false);assert.equal(persistAccess(checkedAccess(receipt(),NOW),broken),false);
});

test('successful verification with failed persistence rejects entry before root can redirect',async()=>{
  const fetcher=(async()=>new Response(JSON.stringify(receipt()),{status:200})) as typeof fetch;
  const existing=memory({'echo-lab-last-record-v1':'UNCHANGED_REAL_RESULT','main-save':'UNCHANGED_MAIN_PROGRESS'});
  const denied={getItem:existing.getItem,setItem(){throw new Error('browser storage denied');}};
  let unlocked=false;
  await assert.rejects(async()=>{await verifyAndPersistAccess('test passphrase',undefined,fetcher,denied);unlocked=true;},(error:unknown)=>{assert.ok(error instanceof AccessError);assert.equal(error.code,'storage_unavailable');assert.match(error.message,/允许本网站保存本机数据/);return true;});
  assert.equal(unlocked,false);assert.equal(canonicalWorkshopTarget('/',true,unlocked),null);
  assert.equal(hasWorkshopAccess(existing),false);assert.equal(readActiveSession(existing,memory()),null);
  assert.equal(existing.getItem('main-save'),'UNCHANGED_MAIN_PROGRESS');assert.equal(existing.getItem('echo-lab-last-record-v1'),'UNCHANGED_REAL_RESULT');
  const allowed=memory();assert.deepEqual(await verifyAndPersistAccess('test passphrase',undefined,fetcher,allowed),{token:TOKEN,expiresAt:receipt().expires_at});assert.equal(hasWorkshopAccess(allowed),true);
});

test('canonical root navigation occurs only after unlock, before the game mounts',()=>{
  for(const path of ['/','/index.html']){
    assert.equal(canonicalWorkshopTarget(path,true,true),'/play/');
    assert.equal(canonicalWorkshopTarget(path,true,false),null);
    assert.equal(canonicalWorkshopTarget(path,false,true),null);
  }
  for(const path of ['/play/','/archive/v1/','/other'])assert.equal(canonicalWorkshopTarget(path,true,true),null);
});

test('unverified offline gate renders a clear form and never renders the game child',()=>{
  const previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:false}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:memory()});
  let childRenders=0;function Child(){childRenders++;return createElement('p',null,'GAME_STATE_INITIALIZED');}
  try{
    const markup=renderToStaticMarkup(createElement(gate.default,{enabled:true,children:createElement(Child)}));
    assert.match(markup,/工坊口令/);assert.match(markup,/进入工坊/);assert.match(markup,/首次进入请联网验证/);
    assert.doesNotMatch(markup,/邀请码|兑换|GAME_STATE_INITIALIZED/);assert.equal(childRenders,0);
    const localMarkup=renderToStaticMarkup(createElement(gate.default,{enabled:false,children:createElement(Child)}));
    assert.match(localMarkup,/GAME_STATE_INITIALIZED/);assert.equal(childRenders,1);
  }finally{
    if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else Reflect.deleteProperty(globalThis,'navigator');
    if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage');
  }
});

test('remembered root waits for canonical navigation instead of rendering or initializing game state',()=>{
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const store=memory();saveWorkshopAccess(store,'2026-10-10T08:00:00Z');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{pathname:'/'}}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:store});
  let childRenders=0;function Child(){childRenders++;return createElement('p',null,'GAME_STATE_INITIALIZED');}
  try{
    const markup=renderToStaticMarkup(createElement(gate.default,{enabled:true,children:createElement(Child)}));
    assert.match(markup,/工坊已解锁/);assert.doesNotMatch(markup,/GAME_STATE_INITIALIZED/);assert.equal(childRenders,0);
  }finally{
    if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else Reflect.deleteProperty(globalThis,'localStorage');
  }
});
