import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transpileModule,ModuleKind,ScriptTarget} from 'typescript';

function client(online:boolean,active=true) {
 const chapterStatuses=Object.fromEntries(Array.from({length:9},(_,i)=>[`chapter-${String(i+1).padStart(2,'0')}`,true]));
 let registrations=0,updates=0,listeners=0,requests=0;
 const worker={postMessage(message:{type:string},ports:Array<{deliver:(data:unknown)=>void}>){
  assert.equal(message.type,'GET_OFFLINE_STATUS');requests++;
  queueMicrotask(()=>ports[0].deliver({type:'OFFLINE_STATUS',status:{version:'installed-release',chapterAvailable:true,bytes:100,totalAssets:40,chapterStatuses}}));
 }};
 const registration={scope:'https://echo.test/play/',active:active?worker:null,waiting:null,
  addEventListener(){listeners++;},update(){updates++;return Promise.reject(new Error('update fetch failed'));}};
 class Channel {
  port1={onmessage:undefined as ((event:{data:unknown})=>void)|undefined,onmessageerror:undefined,close(){}};
  port2={deliver:(data:unknown)=>this.port1.onmessage?.({data})};
 }
 const exports:Record<string,unknown>={};
 const source=readFileSync(new URL('../src/offline.ts',import.meta.url),'utf8').replaceAll('import.meta.env.PROD','true');
 const compiled=transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2020}}).outputText;
 runInNewContext(compiled,{exports,window:{isSecureContext:true},navigator:{onLine:online,serviceWorker:{
  getRegistration:async()=>registration,register:async()=>{registrations++;throw new Error('network unavailable');},
 }},MessageChannel:Channel,setTimeout,clearTimeout,WeakSet,Set,Promise,Error});
 return {register:exports.registerOffline as ()=>Promise<{registered:boolean;chapterStatuses:Record<string,boolean>;error?:string}>,
  status:exports.getOfflineStatus as ()=>Promise<{registered:boolean;chapterStatuses:Record<string,boolean>;error?:string}>,
  expected:chapterStatuses,get counts(){return {registrations,updates,listeners,requests};}};
}

test('offline cold start reads all installed chapter statuses without fetching or registering sw.js',async()=>{
 const c=client(false),status=await c.register();
 assert.equal(status.registered,true);assert.equal(status.error,undefined);assert.deepEqual(status.chapterStatuses,c.expected);
 assert.deepEqual(c.counts,{registrations:0,updates:0,listeners:1,requests:1});
 const again=await c.register();assert.deepEqual(again.chapterStatuses,c.expected);assert.equal(c.counts.registrations,0);assert.equal(c.counts.listeners,1);
});

test('an online update failure cannot discard the active worker or its real pack status',async()=>{
 const c=client(true),status=await c.register();
 assert.equal(status.registered,true);assert.equal(status.error,undefined);assert.deepEqual(status.chapterStatuses,c.expected);
 assert.deepEqual(c.counts,{registrations:0,updates:1,listeners:1,requests:1});
 assert.deepEqual((await c.status()).chapterStatuses,c.expected);
});

test('without an active worker a failed first installation reports an error rather than invented downloads',async()=>{
 const c=client(false,false),status=await c.register();
 assert.equal(status.registered,false);assert.match(status.error!,/network unavailable/);assert.equal(Object.keys(status.chapterStatuses).length,0);
 assert.equal(c.counts.registrations,1);assert.equal(c.counts.requests,0);
});
