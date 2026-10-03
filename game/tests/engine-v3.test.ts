import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterTwoScenarios,chapterTwoWalkthroughs } from '../src/content/chapterTwo';
import { createGame,reduceGame,replayGame,validateGameState,chooseNextCall } from '../src/engine';
import type { GameAction,ToolCall,GameState } from '../src/engine';
import { fingerprint } from '../src/engine/protocol';

const blueprint={tools:['observe','operate','verify'] as const,feedback:true,verification:true,budget:20,permissions:['*']};
function run(id:string) {
  const scenario=chapterTwoScenarios.find(s=>s.id===id)!;
  let state=createGame(scenario),sequence=0;
  const action=(input:object)=>{
    const next=reduceGame(scenario,state,{id:`test-${sequence++}`,...input} as GameAction);
    assert.notEqual(next,state,JSON.stringify(input));state=next;return state;
  };
  action({type:'configure',blueprint:{...blueprint,tools:[...blueprint.tools]}});
  action({type:'dispatch',mode:'manual'});
  const call=(call:ToolCall)=>action({type:'tool',call});
  return {scenario,action,call,get state(){return state;}};
}
const ship=(key?:string,quantity:number=1):ToolCall=>({tool:'operate',operationId:'ship',arguments:{quantity},...(key?{requestKey:key}:{})});

test('v3 typed schema errors charge communication but never execute the world',()=>{
  for(const args of [{door:'front',quantity:'1'},{door:'front'},{door:'front',quantity:3},{door:'front',quantity:1,authority:'king'}]){
    const r=run('etched-door'),world=structuredClone(r.state.world);
    r.call({tool:'operate',operationId:'open-door',arguments:args});
    assert.deepEqual(r.state.world,world);assert.equal(r.state.runtime!.missionRemaining,19);
    assert.equal(r.state.events.at(-1)!.success,false);assert.deepEqual(r.state.observed,{});
    assert.ok(validateGameState(r.scenario,JSON.parse(JSON.stringify(r.state))));
  }
});
test('v3 a valid parameter does not bypass execution preconditions',()=>{
  const r=run('cooling-furnace');r.call({tool:'operate',operationId:'release-heat',arguments:{confirmed:true}});
  assert.equal(r.state.world.furnaceSafe,false);assert.equal(r.state.observed.coolantReady.value,false);
  assert.equal(r.state.runtime!.missionRemaining,19);
});
test('v3 lost receipts leave physical effects while withholding facts from context',()=>{
  const r=run('missing-crate');r.call(ship('order-1'));
  assert.equal(r.state.world.clinicCrates,1);assert.equal(r.state.world.depotCrates,2);
  assert.deepEqual(r.state.observed,{});assert.equal(r.state.protocol!.receipts.length,0);
  assert.equal(r.state.events.at(-1)!.delivered,false);
  const projected=structuredClone(r.state);projected.world.clinicCrates=999;
  assert.deepEqual(chooseNextCall(r.scenario,projected),chooseNextCall(r.scenario,r.state));
});
test('v3 each retry has a new call ID but a stable business key suppresses extra inventory effects',()=>{
  const r=run('missing-crate');r.call(ship('order-1'));r.call(ship('order-1'));
  assert.equal(r.state.world.clinicCrates,1);assert.equal(r.state.world.depotCrates,2);assert.equal(r.state.world.orderReceipt,true);
  const requests=r.state.events.filter(e=>e.type==='request');assert.notEqual(requests[0].callId,requests[1].callId);
  assert.equal(requests[0].requestKey,requests[1].requestKey);assert.equal(r.state.events.at(-1)!.replayed,true);
  assert.equal(r.state.runtime!.missionRemaining,18);
  assert.deepEqual(replayGame(r.scenario,r.state.seed,JSON.parse(JSON.stringify(r.state.runtime!.actionHistory))),r.state);
});
test('v3 same-key different parameters fail atomically, while unkeyed retries really duplicate',()=>{
  const keyed=run('missing-crate');keyed.call(ship('one'));const world=structuredClone(keyed.state.world);keyed.call(ship('one',2));
  assert.deepEqual(keyed.state.world,world);assert.equal(keyed.state.events.at(-1)!.success,false);
  const bare=run('missing-crate');bare.call(ship());bare.call(ship());
  assert.equal(bare.state.world.clinicCrates,2);assert.equal(bare.state.world.depotCrates,1);
  bare.call({tool:'operate',operationId:'return-extra',arguments:{}});
  assert.equal(bare.state.world.clinicCrates,1);assert.equal(bare.state.world.depotCrates,2);
});
test('v3 deferred requests require the matching receipt and reject duplicate or crossed identities without side effects',()=>{
  const r=run('paired-valves');for(const operationId of ['north-valve','south-valve'])r.call({tool:'operate',operationId,arguments:{direction:'open'}});
  assert.equal(r.state.world.northValve,true);assert.deepEqual(r.state.observed,{});
  const [north,south]=r.state.protocol!.receipts;
  const before=r.state;
  assert.equal(reduceGame(r.scenario,before,{id:'crossed',type:'receive',callId:north.callId,receiptId:south.id}),before);
  r.action({type:'receive',callId:south.callId,receiptId:south.id});
  assert.equal(r.state.observed.southValve.value,true);assert.equal(r.state.observed.northValve,undefined);
  assert.equal(r.state.runtime!.missionRemaining,18);
  assert.equal(reduceGame(r.scenario,r.state,{id:'duplicate',type:'receive',callId:south.callId,receiptId:south.id}),r.state);
  r.action({type:'receive',callId:north.callId,receiptId:north.id});
  assert.ok(validateGameState(r.scenario,JSON.parse(JSON.stringify(r.state))));
});
test('v3 business identity also includes operation identity and parameter field order is irrelevant',()=>{
  const r=run('courier-lock');r.call({tool:'operate',operationId:'left-parcel',arguments:{accepted:true},requestKey:'same'});
  r.call({tool:'operate',operationId:'right-parcel',arguments:{accepted:true},requestKey:'same'});
  assert.equal(r.state.world.rightParcel,false);assert.equal(r.state.protocol!.ledger.length,1);
  assert.equal(fingerprint('x',{a:1,b:true}),fingerprint('x',{b:true,a:1}));
  assert.notEqual(fingerprint('x',{a:1}),fingerprint('x',{a:'1'}));
});
test('v3 malformed calls, unsupported parameters and repeated action IDs are rejected unchanged',()=>{
  const r=run('cooling-furnace');const before=r.state;
  for(const call of [{tool:'operate',operationId:'open-coolant',arguments:{}},{tool:'operate',operationId:'release-heat',arguments:{confirmed:{}}},{tool:'operate',operationId:'release-heat',arguments:{confirmed:true},requestKey:' '}])assert.equal(reduceGame(r.scenario,before,{id:'malformed',type:'tool',call} as GameAction),before);
  const action:GameAction={id:'once',type:'tool',call:{tool:'operate',operationId:'open-coolant'}};
  const after=reduceGame(r.scenario,before,action);assert.equal(reduceGame(r.scenario,after,action),after);
  assert.deepEqual(before.world,r.scenario.initialWorld);
});
test('v3 automatic receipt collection can complete a task but never claims independent pairing',()=>{
  const r=run('courier-lock');r.action({type:'pause'});r.action({type:'resume',mode:'automatic'});
  for(let step=0;r.state.status==='running'&&step<30;step++)r.action({type:'step',source:'scheduler'});
  assert.equal(r.state.status,'won');assert.ok(r.state.learningEvidence.every(evidence=>evidence.level==='guided'));
  assert.ok(validateGameState(r.scenario,JSON.parse(JSON.stringify(r.state))));
});
test('v3 hints survive reset, protocol ledgers do not, and cached receipts cannot forge fresh proof',()=>{
  const r=run('missing-crate');r.action({type:'hint'});r.call(ship('one'));r.call(ship('one'));
  const invalid=structuredClone(r.state);invalid.protocol!.ledger[0].receipt.facts.clinicCrates=99;
  assert.equal(validateGameState(r.scenario,invalid),false);
  r.action({type:'reset'});assert.equal(r.state.hintUsed,true);assert.equal(r.state.protocol!.ledger.length,0);assert.equal(r.state.world.depotCrates,3);
  assert.ok(validateGameState(r.scenario,JSON.parse(JSON.stringify(r.state))));
});
test('v3 configuring stable business identity enables an autonomous boss solution',()=>{
  const r=run('doubled-clerk');r.action({type:'pause'});
  r.action({type:'configure',blueprint:{...blueprint,tools:[...blueprint.tools],stableRequestKeys:true}});
  r.action({type:'dispatch',mode:'automatic'});
  for(let step=0;r.state.status==='running'&&step<30;step++)r.action({type:'step',source:'scheduler'});
  assert.equal(r.state.status,'won');assert.equal(r.state.world.clinicCrates,1);assert.equal(r.state.world.depotCrates,2);
  assert.ok(r.state.events.some(event=>event.replayed));assert.ok(validateGameState(r.scenario,JSON.parse(JSON.stringify(r.state))));
});
test('v3 inventory remains conserved across bounded shipping, retries, conflicts and returns',()=>{
  const inputs=[ship(),ship('a'),ship('b'),ship('a',2),ship('b',2),{tool:'operate',operationId:'return-extra',arguments:{}} as ToolCall];
  const scenario=chapterTwoScenarios.find(q=>q.id==='missing-crate')!;
  let frontier:GameState[]=[run('missing-crate').state];let checked=0;
  for(let depth=0;depth<4;depth++){
    const next:GameState[]=[];
    for(let state of frontier){
      if(state.status==='stalled')state=reduceGame(scenario,state,{id:`resume-${depth}`,type:'dispatch',mode:'manual'});
      for(const call of inputs){const result=reduceGame(scenario,state,{id:`operation-${depth}`,type:'tool',call});
        assert.equal(Number(result.world.clinicCrates)+Number(result.world.depotCrates),3);
        assert.ok(Number(result.world.depotCrates)>=0&&Number(result.world.clinicCrates)>=0);next.push(result);checked++;}
    }frontier=next;
  }assert.ok(checked>1000);
});

for(const route of chapterTwoWalkthroughs)test(`v3 authored path: ${route.id}`,()=>{
  const r=run(route.scenarioId);let first=true;
  for(const stage of route.stages){
    if(!first){if(r.state.status==='running')r.action({type:'pause'});r.action({type:'configure',blueprint:{...blueprint,tools:stage.tools}});r.action({type:'dispatch',mode:'manual'});}first=false;
    for(const call of stage.calls)r.call(call);
    if(stage.collectReceipts)for(const receipt of r.state.protocol!.receipts.filter(receipt=>!receipt.collected))r.action({type:'receive',callId:receipt.callId,receiptId:receipt.id});
    for(const [fact,value] of Object.entries(stage.expectWorld??{}))assert.equal(r.state.world[fact],value);
  }
  assert.equal(r.state.status,'won');assert.equal(20-r.state.runtime!.missionRemaining,route.expectedCost);
  assert.ok(validateGameState(r.scenario,JSON.parse(JSON.stringify(r.state))));
  if(route.scenarioId==='courier-lock')assert.ok(r.state.learningEvidence.every(e=>e.level==='independent-transfer'));
});
