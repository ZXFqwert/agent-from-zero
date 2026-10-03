import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterThreeScenarios,chapterThreeWalkthroughs } from '../src/content/chapterThree';
import { createGame,reduceGame,validateGameState,chooseNextCall } from '../src/engine';
import type { GameAction,LoopPolicy } from '../src/engine';
const build={tools:['observe','operate','verify'] as const,feedback:true,verification:true,budget:24,permissions:['*']};
function setup(id:string,policy:LoopPolicy={maxCalls:24,maxRetries:2,permanentFailure:'repair'}) {
  const scenario=chapterThreeScenarios.find(s=>s.id===id)!;let state=createGame(scenario,41);let index=0;
  const act=(data:object)=>{const next=reduceGame(scenario,state,{id:`test-${index++}`,...data} as GameAction);assert.notEqual(next,state,JSON.stringify(data));state=next;return state;};
  act({type:'configure',blueprint:{...build,tools:[...build.tools],loopPolicy:policy}});
  return {scenario,act,get state(){return state;}};
}
for(const route of chapterThreeWalkthroughs)test(`v4 authored route: ${route.id}`,()=>{
  const g=setup(route.scenarioId);let cost=0;
  for(const stage of route.stages){
    if(g.state.status==='running')g.act({type:'pause'});
    g.act({type:'configure',blueprint:{...build,tools:stage.tools,loopPolicy:stage.loopPolicy}});g.act({type:'dispatch',mode:'manual'});
    for(const call of stage.calls){const before=g.state.runtime!.missionRemaining;g.act({type:'tool',call});cost+=before-g.state.runtime!.missionRemaining;}
    for(const [fact,value]of Object.entries(stage.expectWorld??{}))assert.equal(g.state.world[fact],value);
    for(const fact of stage.absentProofs??[])assert.ok(!g.state.verifiedGoals.includes(fact));
  }
  assert.equal(g.state.status,'won');assert.equal(cost,route.expectedCost);assert.ok(validateGameState(g.scenario,g.state));
});
test('short-lived failure stops with zero retries; a new deliberate dispatch uses fresh evidence',()=>{
  const g=setup('cooling-pulse',{maxCalls:8,maxRetries:0,permanentFailure:'stop'});g.act({type:'dispatch',mode:'automatic'});
  for(let i=0;g.state.status==='running'&&i<10;i++)g.act({type:'step',source:'scheduler'});
  assert.equal(g.state.status,'stalled');assert.equal(g.state.control!.stopReason,'retry-limit');assert.equal(g.state.world.coilReady,true);assert.equal(g.state.world.pulseDelivered,false);assert.equal(g.state.observed.coilReady.value,false);
  const stopped=g.state;assert.equal(reduceGame(g.scenario,stopped,{id:'late-timer',type:'step',source:'scheduler'}),stopped);
  g.act({type:'dispatch',mode:'automatic'});for(let i=0;g.state.status==='running'&&i<10;i++)g.act({type:'step',source:'scheduler'});
  assert.equal(g.state.status,'won');assert.ok(validateGameState(g.scenario,g.state));
});
test('one allowed retry completes cooling; two cooling failures with cap one stop deterministically',()=>{
  const g=setup('cooling-pulse',{maxCalls:8,maxRetries:1,permanentFailure:'repair'});g.act({type:'dispatch',mode:'automatic'});
  for(let i=0;g.state.status==='running'&&i<10;i++)g.act({type:'step',source:'scheduler'});
  assert.equal(g.state.status,'won');assert.equal(g.state.events.filter(e=>e.type==='result'&&!e.success).length,1);
  const scenario=structuredClone(g.scenario);scenario.operations[0].retryWindow!.attempts=2;let state=createGame(scenario);
  state=reduceGame(scenario,state,{id:'c',type:'configure',blueprint:{...build,tools:[...build.tools],loopPolicy:{maxCalls:8,maxRetries:1,permanentFailure:'repair'}}});state=reduceGame(scenario,state,{id:'d',type:'dispatch'});
  for(let i=0;state.status==='running'&&i<10;i++)state=reduceGame(scenario,state,{id:`s${i}`,type:'step'});
  assert.equal(state.status,'stalled');assert.equal(state.control!.stopReason,'retry-limit');assert.equal(state.world.pulseDelivered,false);assert.equal(state.runtime!.toolCalls,3);assert.ok(validateGameState(scenario,state));
});
test('call cap, energy cap and pause are separate; a rejected action has no side effect',()=>{
  const g=setup('broken-escapement',{maxCalls:1,maxRetries:2,permanentFailure:'repair'});g.act({type:'dispatch',mode:'automatic'});g.act({type:'step',source:'scheduler'});
  assert.equal(g.state.status,'stalled');assert.equal(g.state.control!.stopReason,'call-limit');assert.equal(g.state.control!.dispatchCalls,1);assert.ok(g.state.runtime!.missionRemaining>0);
  const old=g.state;assert.equal(reduceGame(g.scenario,old,{id:old.processedActionIds[0],type:'reset'}),old);
  assert.equal(reduceGame(g.scenario,old,{id:'bad-c',type:'configure',blueprint:{...build,tools:[...build.tools],loopPolicy:{maxCalls:0,maxRetries:2,permanentFailure:'repair'}}}),old);
  g.act({type:'dispatch',mode:'manual'});g.act({type:'pause'});assert.equal(g.state.world.pinAligned,false);assert.equal(g.state.control!.dispatchCalls,0);assert.ok(validateGameState(g.scenario,g.state));
});
test('permanent failure stops; repairing changes the next action rather than hammering again',()=>{
  const g=setup('broken-escapement',{maxCalls:8,maxRetries:4,permanentFailure:'stop'});g.act({type:'dispatch'});g.act({type:'tool',call:{tool:'operate',operationId:'strike'}});
  assert.equal(g.state.control!.stopReason,'permanent-failure');assert.equal(g.state.world.pinAligned,false);
  g.act({type:'configure',blueprint:{...build,tools:[...build.tools],loopPolicy:{maxCalls:8,maxRetries:4,permanentFailure:'repair'}}});g.act({type:'dispatch'});
  assert.deepEqual(chooseNextCall(g.scenario,g.state),{tool:'observe',observationId:'inspect'});g.act({type:'step'});
  assert.deepEqual(chooseNextCall(g.scenario,g.state),{tool:'operate',operationId:'align-pin'});
  for(let i=0;g.state.status==='running'&&i<10;i++)g.act({type:'step'});
  assert.equal(g.state.status,'won');assert.equal(g.state.events.filter(e=>e.operationId==='strike'&&e.type==='result'&&!e.success).length,1);
});
test('goal order changes resource use; changing control policy cannot replenish mission energy',()=>{
  const wrong=setup('brass-order');wrong.act({type:'dispatch'});for(let i=0;wrong.state.status==='running'&&i<20;i++)wrong.act({type:'step'});assert.equal(wrong.state.status,'exhausted');assert.equal(wrong.state.runtime!.missionRemaining,0);
  wrong.act({type:'configure',blueprint:{...build,tools:[...build.tools],loopPolicy:{maxCalls:24,maxRetries:4,permanentFailure:'repair'}}});assert.equal(wrong.state.runtime!.missionRemaining,0);assert.equal(reduceGame(wrong.scenario,wrong.state,{id:'empty',type:'dispatch'}),wrong.state);
  const right=setup('brass-order');right.act({type:'configure',blueprint:{...build,tools:[...build.tools],goalOrder:['gearsLubricated','balanceTuned','bellReady'],loopPolicy:{maxCalls:8,maxRetries:0,permanentFailure:'repair'}}});right.act({type:'dispatch'});for(let i=0;right.state.status==='running'&&i<20;i++)right.act({type:'step'});assert.equal(right.state.status,'won');assert.equal(right.state.runtime!.missionRemaining,1);
});
test('warden is solvable after one restart; fresh state is never injected into actor context',()=>{
  const g=setup('endless-warden');g.act({type:'dispatch'});for(let i=0;g.state.status==='running'&&i<40;i++)g.act({type:'step'});
  assert.equal(g.state.status,'won');assert.equal(g.state.runtime!.triggeredHookIds.filter(id=>id==='warden-last-wind').length,1);assert.ok(validateGameState(g.scenario,g.state));
  const tampered=structuredClone(g.state);tampered.control!.dispatchCalls--;assert.equal(validateGameState(g.scenario,tampered),false);
});
test('energy exhaustion takes precedence when call cap and final crystal coincide',()=>{
  const g=setup('brass-order',{maxCalls:8,maxRetries:0,permanentFailure:'repair'});g.act({type:'dispatch'});
  for(let i=0;g.state.status==='running'&&i<20;i++)g.act({type:'step'});
  assert.equal(g.state.runtime!.missionRemaining,0);assert.equal(g.state.control!.dispatchCalls,8);assert.equal(g.state.status,'exhausted');assert.ok(validateGameState(g.scenario,g.state));
});
