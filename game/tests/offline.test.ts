import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash,webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';

function worker() {
  const body=new Map([['/play/index.html','game'],['/play/harbor.webp','harbor'],['/play/forge.webp','forge']]);
  const assets=[...body].map(([url,value])=>({url,bytes:Buffer.byteLength(value),sha256:createHash('sha256').update(value).digest('hex')}));
  const manifest={schema:2,version:'fixture-release',basePath:'/play/',assets,totalBytes:14,chapters:[
    {chapterId:'chapter-01',assets:['/play/index.html','/play/harbor.webp'],totalBytes:10},
    {chapterId:'chapter-02',assets:['/play/index.html','/play/forge.webp'],totalBytes:9},
  ]};
  const handlers=new Map<string,(event:any)=>void>(),stores=new Map<string,Map<string,Response>>();
  stores.set('previous-complete-release',new Map());
  let offline=false,corrupt=false,activated=0;
  const fetches:string[]=[];
  const caches={async open(name:string){let cache=stores.get(name);if(!cache){cache=new Map();stores.set(name,cache);}return {
    async match(url:string){return cache!.get(String(url))?.clone();},async put(url:string,response:Response){cache!.set(String(url),response.clone());},async delete(url:string){return cache!.delete(String(url));}};},async delete(name:string){return stores.delete(name);}};
  const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8').replace('null /* ECHO_OFFLINE_MANIFEST */',JSON.stringify(manifest));
  runInNewContext(source,{self:{location:{origin:'https://echo.test'},addEventListener:(type:string,handler:(event:any)=>void)=>handlers.set(type,handler),skipWaiting:async()=>{activated++;}},caches,crypto:webcrypto,URL,Response,Headers,AbortController,setTimeout,clearTimeout,fetch:async(request:any)=>{
    if(offline)throw new Error('offline');const url=new URL(typeof request==='string'?request:request.url);fetches.push(url.pathname);
    if(corrupt&&url.pathname==='/play/forge.webp')return new Response('corrupted');
    return new Response(body.get(url.pathname)??'missing',{status:body.has(url.pathname)?200:404});
  }});
  const message=async(type:string,chapterId='chapter-01')=>{let promise:Promise<void>|undefined;const replies:any[]=[];handlers.get('message')!({data:{type,chapterId},ports:[{postMessage:(value:any)=>replies.push(value)}],waitUntil:(value:Promise<void>)=>{promise=value;}});await promise;return replies.at(-1);};
  const request=async(path:string,mode='navigate')=>{let result:Promise<Response>|undefined;handlers.get('fetch')!({request:{url:'https://echo.test'+path,method:'GET',mode},respondWith:(promise:Promise<Response>)=>{result=promise;}});return result?await result:null;};
  return {message,request,stores,fetches,handlers,get activated(){return activated;},set offline(value:boolean){offline=value;},set corrupt(value:boolean){corrupt=value;}};
}
test('chapter packs independently verify assets and support an offline navigation',async()=>{
  const w=worker();let result=await w.message('DOWNLOAD_CHAPTER','chapter-02');assert.equal(result.status.chapterStatuses['chapter-02'],true);assert.equal(result.status.chapterStatuses['chapter-01'],false);
  assert.deepEqual(w.fetches,['/play/index.html','/play/forge.webp']);
  w.offline=true;assert.equal(await (await w.request('/play/'))!.text(),'game');assert.equal(await (await w.request('/play/forge.webp','cors'))!.text(),'forge');
  assert.equal(await w.request('/play/api/experiments','cors'),null);assert.equal(await w.request('/play/sw.js','cors'),null);
});
test('a corrupted new chapter does not erase another chapter or an older release',async()=>{
  const w=worker();await w.message('DOWNLOAD_CHAPTER');w.corrupt=true;
  assert.equal((await w.message('DOWNLOAD_CHAPTER','chapter-02')).type,'ERROR');
  const status=await w.message('GET_OFFLINE_STATUS');assert.equal(status.status.chapterStatuses['chapter-01'],true);assert.equal(status.status.chapterStatuses['chapter-02'],false);
  assert.ok(w.stores.has('previous-complete-release'));
});
test('browser eviction revokes only the incomplete chapter marker, and install never activates an update',async()=>{
  const w=worker();await w.message('DOWNLOAD_CHAPTER');await w.message('DOWNLOAD_CHAPTER','chapter-02');
  for(const cache of w.stores.values())cache.delete('https://echo.test/play/harbor.webp');
  const status=await w.message('GET_OFFLINE_STATUS');assert.equal(status.status.chapterStatuses['chapter-01'],false);assert.equal(status.status.chapterStatuses['chapter-02'],true);
  let pending:Promise<void>|undefined;w.handlers.get('install')!({waitUntil:(promise:Promise<void>)=>{pending=promise;}});await pending;assert.equal(w.activated,0);
  await w.message('ACTIVATE_UPDATE');assert.equal(w.activated,1);
});
