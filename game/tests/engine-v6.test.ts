import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterFiveScenarios,chapterFiveWalkthroughs } from '../src/content/chapterFive';
import { resolveAuthoredStep } from '../src/content/walkthrough';
import { createGame,reduceGame,validateGameState,replayGame,chooseNextCall } from '../src/engine';
import type { GameAction,GameState } from '../src/engine';
function setup(id:string){const scenario=chapterFiveScenarios.find(s=>s.id===id)!;let state=createGame(scenario,39),i=0;const act=(input:object)=>{const next=reduceGame(scenario,state,{id:`v6-${i++}`,...input} as GameAction);assert.notEqual(next,state,JSON.stringify(input));state=next;return state;};const running=()=>{if(state.status==='paused')act({type:'resume',mode:'manual'});else if(state.status!=='running')act({type:'dispatch',mode:'manual'});};act({type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:scenario.limits!.maxBudget!,permissions:['*'],loopPolicy:{maxCalls:64,maxRetries:0,permanentFailure:'repair'}}});return {scenario,act,running,get state(){return state;},card:(id:string)=>[...state.context!.records].reverse().find(r=>r.observationId===id)!};}
for(const route of chapterFiveWalkthroughs)test(`v6 authored route: ${route.id}`,()=>{
 const g=setup(route.scenarioId);let cost=0;
 for(const stage of route.stages){if(g.state.status==='running')g.act({type:'pause'});g.act({type:'configure',blueprint:{...g.state.blueprint,loopPolicy:stage.loopPolicy!}});g.running();
  for(const step of stage.steps!){if(step.type==='tool'||step.type==='step'||step.type==='skill'&&step.operation==='run')g.running();const before=g.state.runtime!.missionRemaining;g.act(resolveAuthoredStep(g.state,step,`resolved-${g.state.processedActionIds.length}`));cost+=before-g.state.runtime!.missionRemaining;}
  for(const [f,v]of Object.entries(stage.expectWorld??{}))assert.equal(g.state.world[f],v);
 }
 assert.equal(g.state.status,'won');assert.equal(cost,route.expectedCost);assert.ok(validateGameState(g.scenario,g.state));assert.deepEqual(replayGame(g.scenario,39,g.state.runtime!.actionHistory),g.state);
 if(route.scenarioId==='flooded-scriptorium')assert.equal(g.state.learningEvidence[0].level,'independent-transfer');
});
test('write and recall are external storage operations; neither supplies active facts or executes a tool',()=>{
 const g=setup('night-handoff');g.running();g.act({type:'tool',call:{tool:'observe',observationId:'shift-letter'}});const before=g.state.runtime!.missionRemaining;
 g.act({type:'memory',operation:'write',key:'night-code',recordId:g.card('shift-letter').id});assert.equal(g.state.observed.nightCode,undefined);g.act({type:'memory',operation:'recall',key:'night-code'});assert.equal(g.state.observed.nightCode,undefined);assert.equal(g.state.runtime!.missionRemaining,before);assert.equal(g.state.world.nightDoorOpen,false);
 g.act({type:'context',operation:'include',recordId:g.card('shift-letter').id});assert.equal(g.state.observed.nightCode.source,'memory');
});
test('fresh conversation loses current input but not vault, world, spent energy or identity permissions',()=>{
 const g=setup('night-handoff');g.running();g.act({type:'tool',call:{tool:'observe',observationId:'shift-letter'}});g.act({type:'memory',operation:'write',key:'night-code',recordId:g.card('shift-letter').id});g.act({type:'tool',call:{tool:'operate',operationId:'seal-letter'}});const before=structuredClone(g.state);
 g.act({type:'session',operation:'fresh'});assert.deepEqual(g.state.observed,{});assert.equal(g.state.context!.records.length,0);assert.deepEqual(g.state.world,before.world);assert.deepEqual(g.state.memory,before.memory);assert.equal(g.state.runtime!.missionRemaining,before.runtime!.missionRemaining);assert.deepEqual(g.state.blueprint,before.blueprint);
 g.running();g.act({type:'tool',call:{tool:'observe',observationId:'shift-letter'}});assert.deepEqual(g.state.events.filter(e=>e.type==='observation').at(-1)!.facts,{});assert.equal(g.state.context!.records.length,0);assert.equal(g.state.observed.nightCode,undefined);
});
test('revision keeps retired history and does not magically replace a loaded old snapshot',()=>{
 const g=setup('dusty-route');g.running();g.act({type:'memory',operation:'recall',key:'route'});g.act({type:'context',operation:'include',recordId:g.card('route-survey').id});g.act({type:'tool',call:{tool:'observe',observationId:'route-survey'}});g.act({type:'memory',operation:'revise',key:'route',recordId:g.card('route-survey').id});
 assert.equal(g.state.memory!.entries[0].status,'retired');assert.equal(g.state.memory!.entries[1].revision,2);assert.equal(g.state.observed.safeRoute.value,'north');g.act({type:'tool',call:{tool:'operate',operationId:'walk-route'}});assert.equal(g.state.world.routePassed,false);assert.deepEqual(g.state.events.filter(e=>e.type==='result').at(-1)!.facts,{});
 const altered=structuredClone(g.state);altered.world.safeRoute='secret';assert.deepEqual(chooseNextCall(g.scenario,altered),chooseNextCall(g.scenario,g.state));
});
test('retirement revokes active citation, without deleting its already retrieved context copy',()=>{
 const g=setup('bad-experience');g.running();g.act({type:'tool',call:{tool:'observe',observationId:'counterexample'}});g.act({type:'memory',operation:'revise',key:'acceptance',recordId:g.card('counterexample').id});g.act({type:'memory',operation:'recall',key:'acceptance'});g.act({type:'context',operation:'include',recordId:g.card('counterexample').id});g.act({type:'memory',operation:'retire',key:'acceptance'});
 assert.equal(g.state.observed.acceptanceRule.value,'check-each-batch');const before=g.state;assert.equal(reduceGame(g.scenario,before,{id:'recall-retired',type:'memory',operation:'recall',key:'acceptance'}),before);g.act({type:'tool',call:{tool:'operate',operationId:'check-batch'}});assert.equal(g.state.world.batchDelivered,false);
});
test('session branches share one real warehouse, and returning does not replay or refund shipment',()=>{
 const g=setup('forked-courier');g.running();g.act({type:'tool',call:{tool:'observe',observationId:'parcel-manifest'}});g.act({type:'context',operation:'include',recordId:g.card('parcel-manifest').id});g.act({type:'session',operation:'fork'});g.running();g.act({type:'tool',call:{tool:'operate',operationId:'send-parcel'}});const energy=g.state.runtime!.missionRemaining;g.act({type:'session',operation:'switch',branchId:'session-1'});
 assert.equal(g.state.world.stock,1);assert.equal(g.state.observed.stock.value,2);assert.equal(g.state.runtime!.missionRemaining,energy);g.running();g.act({type:'tool',call:{tool:'operate',operationId:'send-parcel'}});assert.equal(g.state.world.stock,1);assert.equal(g.state.events.filter(e=>e.type==='result'&&e.operationId==='send-parcel'&&e.success).length,1);
});
test('having once created a fresh conversation does not make the original session the new shift',()=>{
 const g=setup('night-handoff');g.running();g.act({type:'tool',call:{tool:'observe',observationId:'shift-letter'}});g.act({type:'memory',operation:'write',key:'night-code',recordId:g.card('shift-letter').id});g.act({type:'tool',call:{tool:'operate',operationId:'seal-letter'}});g.act({type:'session',operation:'fresh'});g.act({type:'session',operation:'switch',branchId:'session-1'});g.act({type:'memory',operation:'recall',key:'night-code'});g.act({type:'context',operation:'include',recordId:g.card('shift-letter').id});g.running();g.act({type:'tool',call:{tool:'operate',operationId:'open-night-door'}});assert.equal(g.state.world.nightDoorOpen,false);assert.deepEqual(g.state.events.filter(e=>e.type==='result').at(-1)!.facts,{});
});
test('skill requires actual successful ordered requests, then advances only through separately charged steps',()=>{
 const g=setup('saved-procedure');g.running();let before=g.state;assert.equal(reduceGame(g.scenario,before,{id:'fake-skill',type:'skill',operation:'save',skillId:'pump-service'}),before);
 g.act({type:'tool',call:{tool:'observe',observationId:'pump-card'}});g.act({type:'context',operation:'include',recordId:g.card('pump-card').id});for(const call of g.scenario.memory!.skills[0].steps)g.act({type:'tool',call});const count=g.state.runtime!.toolCalls;
 g.act({type:'skill',operation:'save',skillId:'pump-service'});assert.equal(g.state.runtime!.toolCalls,count);g.act({type:'tool',call:{tool:'operate',operationId:'reset-bench'}});const energy=g.state.runtime!.missionRemaining;g.act({type:'skill',operation:'run',skillId:'pump-service'});assert.equal(g.state.world.waterReady,false);assert.equal(g.state.runtime!.missionRemaining,energy);
 g.act({type:'step'});assert.equal(g.state.memory!.queue!.cursor,1);assert.equal(g.state.world.clampFixed,true);assert.equal(g.state.world.waterReady,false);assert.equal(g.state.runtime!.missionRemaining,energy-1);g.act({type:'pause'});assert.ok(validateGameState(g.scenario,g.state));const paused=JSON.parse(JSON.stringify(g.state)) as GameState;assert.ok(validateGameState(g.scenario,paused));g.act({type:'resume',mode:'manual'});g.act({type:'step'});g.act({type:'step'});assert.equal(g.state.memory!.queue,undefined);assert.equal(g.state.memory!.runs.length,1);assert.equal(g.state.runtime!.missionRemaining,energy-3);
});
test('old workflow failure stops the queue and does not execute the remaining work or reveal missing inputs',()=>{
 const g=setup('palimpsest-keeper');g.running();g.act({type:'memory',operation:'recall',key:'furnace-rule'});g.act({type:'context',operation:'include',recordId:g.card('furnace-rule').id});g.act({type:'skill',operation:'run',skillId:'rush-open'});g.act({type:'step'});assert.equal(g.state.memory!.queue!.status,'failed');assert.equal(g.state.memory!.queue!.cursor,0);assert.equal(g.state.status,'stalled');assert.equal(g.state.world.workersSafe,false);assert.equal(g.state.memory!.runs.length,0);assert.deepEqual(g.state.events.filter(e=>e.type==='result').at(-1)!.facts,{});
});
test('invalid memory references, unknown branches and excessive sessions are atomic; reset retains proven memory',()=>{
 const g=setup('night-handoff');const invalid:GameAction[]=[{id:'bad-ref',type:'memory',operation:'write',key:'night-code',recordId:'invented'},{id:'bad-key',type:'memory',operation:'recall',key:'invented'},{id:'bad-branch',type:'session',operation:'switch',branchId:'invented'},{id:'bad-extra',type:'session',operation:'fresh',label:'',}];
 for(const a of invalid)assert.equal(reduceGame(g.scenario,g.state,a),g.state);g.running();g.act({type:'tool',call:{tool:'observe',observationId:'shift-letter'}});g.act({type:'memory',operation:'write',key:'night-code',recordId:g.card('shift-letter').id});const entries=structuredClone(g.state.memory!.entries);for(let i=0;i<7;i++)g.act({type:'session',operation:'fresh'});const full=g.state;assert.equal(reduceGame(g.scenario,full,{id:'ninth',type:'session',operation:'fresh'}),full);
 g.act({type:'reset'});assert.deepEqual(g.state.memory!.entries,entries);assert.equal(g.state.sessions!.branches.length,1);assert.equal(g.state.context!.records.length,0);assert.ok(validateGameState(g.scenario,g.state));
 const poison=structuredClone(g.state);poison.memory!.entries[0].facts.nightCode='fake';assert.equal(validateGameState(g.scenario,poison),false);
});
