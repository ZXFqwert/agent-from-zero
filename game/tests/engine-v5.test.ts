import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterFourScenarios,chapterFourWalkthroughs } from '../src/content/chapterFour';
import { createGame,reduceGame,validateGameState,chooseNextCall,replayGame } from '../src/engine';
import { contextUnits } from '../src/engine/v5';
import type { GameAction,GameState } from '../src/engine';
const blueprint={tools:['observe','operate','verify'] as const,feedback:true,verification:true,budget:24,permissions:['*'],loopPolicy:{maxCalls:24,maxRetries:0,permanentFailure:'repair' as const}};
function setup(id:string){const scenario=chapterFourScenarios.find(s=>s.id===id)!;let state=createGame(scenario,71),index=0;const act=(data:object)=>{const next=reduceGame(scenario,state,{id:`a${index++}`,...data} as GameAction);assert.notEqual(next,state,JSON.stringify(data));state=next;return state;};act({type:'configure',blueprint:{...blueprint,tools:[...blueprint.tools]}});return {scenario,act,get state(){return state;},card:(id:string)=>[...state.context!.records].reverse().find(r=>r.observationId===id)!};}
for(const route of chapterFourWalkthroughs)test(`v5 authored route: ${route.id}`,()=>{
 const g=setup(route.scenarioId);let cost=0;
 for(const stage of route.stages){
  if(g.state.status==='running')g.act({type:'pause'});
  g.act({type:'configure',blueprint:{...blueprint,tools:stage.tools}});g.act({type:'dispatch',mode:'manual'});
  for(const c of stage.contextChanges??[])g.act({type:'context',recordId:g.card(c.observationId).id,operation:c.operation,...(c.summaryId?{summaryId:c.summaryId}:{})});
  for(const call of stage.calls){const before=g.state.runtime!.missionRemaining;g.act({type:'tool',call});cost+=before-g.state.runtime!.missionRemaining;}
  for(const [fact,value]of Object.entries(stage.expectWorld??{}))assert.equal(g.state.world[fact],value);
  assert.ok(contextUnits(g.scenario,g.state)<=g.state.context!.capacity);
 }
 assert.equal(g.state.status,'won');assert.equal(cost,route.expectedCost);assert.ok(validateGameState(g.scenario,g.state));
 assert.deepEqual(replayGame(g.scenario,g.state.seed,g.state.runtime!.actionHistory),g.state);
 if(route.scenarioId==='field-hospital')assert.equal(g.state.learningEvidence[0].level,'independent-transfer');
});
test('archived facts are not in the actor context; missing input fails without revealing expected values',()=>{
 const g=setup('folded-map');g.act({type:'dispatch',mode:'manual'});g.act({type:'tool',call:{tool:'observe',observationId:'route-map'}});
 assert.equal(g.state.observed.route,undefined);assert.equal(g.state.context!.records[0].facts.route,'east');
 assert.equal(chooseNextCall(g.scenario,g.state),null);
 g.act({type:'tool',call:{tool:'operate',operationId:'open-corridor'}});assert.equal(g.state.world.corridorOpen,false);assert.deepEqual(g.state.events.filter(e=>e.type==='result').at(-1)!.facts,{});assert.equal(g.state.observed.route,undefined);
 g.act({type:'context',recordId:g.card('route-map').id,operation:'include'});assert.equal(g.state.observed.route.value,'east');
});
test('capacity rejects whole action; compression drops fields and expanding cannot overflow',()=>{
 const g=setup('narrow-satchel');g.act({type:'dispatch',mode:'manual'});for(const id of ['wide-map','seal-card'])g.act({type:'tool',call:{tool:'observe',observationId:id}});
 g.act({type:'context',recordId:g.card('wide-map').id,operation:'include'});const before=g.state;
 assert.equal(reduceGame(g.scenario,before,{id:'overflow',type:'context',recordId:g.card('seal-card').id,operation:'include'}),before);
 g.act({type:'context',recordId:g.card('wide-map').id,operation:'summarize',summaryId:'route-only'});assert.equal(g.state.observed.cycle,undefined);assert.equal(g.state.observed.route.value,'west');
 g.act({type:'context',recordId:g.card('seal-card').id,operation:'include'});const full=g.state;
 assert.equal(reduceGame(g.scenario,full,{id:'expand-overflow',type:'context',recordId:g.card('wide-map').id,operation:'expand'}),full);
 assert.equal(full.runtime!.missionRemaining,10);assert.ok(validateGameState(g.scenario,full));
});
test('source snapshot survives world change and the strategy never inspects the changed cipher',()=>{
 const g=setup('many-faced-archivist');g.act({type:'dispatch',mode:'manual'});g.act({type:'tool',call:{tool:'observe',observationId:'live-cipher'}});const old=g.card('live-cipher');g.act({type:'context',recordId:old.id,operation:'summarize',summaryId:'cipher-proof'});g.act({type:'context',recordId:old.id,operation:'include'});
 g.act({type:'tool',call:{tool:'operate',operationId:'write-seal'}});
 assert.equal(g.state.world.currentCipher,'铜');assert.equal(g.state.observed.currentCipher.value,'银');assert.equal(old.facts.currentCipher,'银');
 const altered=structuredClone(g.state);altered.world.currentCipher='秘密';assert.deepEqual(chooseNextCall(g.scenario,altered),chooseNextCall(g.scenario,g.state));
 g.act({type:'tool',call:{tool:'operate',operationId:'write-seal'}});assert.equal(g.state.world.sealRestored,false);assert.equal(g.state.observed.currentCipher.value,'银');
 g.act({type:'tool',call:{tool:'observe',observationId:'live-cipher'}});assert.equal(g.card('live-cipher').facts.currentCipher,'铜');assert.equal(g.state.observed.currentCipher.value,'银');assert.ok(validateGameState(g.scenario,g.state));
});
test('the working reply replaces older replies; exclusion removes document facts, not the archive',()=>{
 const g=setup('receipt-drawer');g.act({type:'dispatch',mode:'manual'});g.act({type:'tool',call:{tool:'operate',operationId:'issue-ticket'}});assert.equal(g.state.observed.ticket.value,'T17');g.act({type:'tool',call:{tool:'verify',fact:'deliveryReady'}});assert.equal(g.state.observed.ticket,undefined);
 g.act({type:'tool',call:{tool:'observe',observationId:'ticket-register'}});const id=g.card('ticket-register').id;g.act({type:'context',recordId:id,operation:'include'});assert.equal(g.state.observed.ticket.value,'T17');g.act({type:'context',recordId:id,operation:'exclude'});assert.equal(g.state.observed.ticket,undefined);assert.equal(g.card('ticket-register').facts.ticket,'T17');assert.ok(validateGameState(g.scenario,g.state));
});
test('summary cannot invent facts; poisoned save and invalid actions are rejected atomically',()=>{
 const g=setup('absent-margin');g.act({type:'dispatch',mode:'manual'});g.act({type:'tool',call:{tool:'observe',observationId:'recipe'}});const before=g.state;
 for(const input of [{type:'context',recordId:g.card('recipe').id,operation:'summarize',summaryId:'invented'},{type:'context',recordId:'not-read',operation:'include'},{type:'context',recordId:g.card('recipe').id,operation:'include',summaryId:'clinical-summary'},{type:'context',recordId:g.card('recipe').id,operation:'include',cheat:true}])assert.equal(reduceGame(g.scenario,before,{id:'bad',...input} as GameAction),before);
 const poisoned=structuredClone(before);poisoned.context!.records[0].facts.dose=999;assert.equal(validateGameState(g.scenario,poisoned),false);
 const scenario=structuredClone(g.scenario);scenario.observations[0].document!.summaries![0].retain.push('patientStable');assert.throws(()=>createGame(scenario));
 g.act({type:'pause'});assert.equal(reduceGame(g.scenario,g.state,{id:'late',type:'step',source:'scheduler'}),g.state);assert.ok(validateGameState(g.scenario,g.state));
});
