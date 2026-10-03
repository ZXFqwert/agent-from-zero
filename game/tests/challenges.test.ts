import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scenarios} from '../src/content/scenarios';
import {createGame,validateGameState} from '../src/engine';
import {
 canonical,challengeTemplates,generateChallenge,validateChallenge,replayChallengeRoute,
 createExpedition,scenarioForExpedition,reduceExpedition,validateExpedition,deriveCapabilityGrowth,deriveUnlockedTemplateIds,
 type ChallengeInstance,type ChallengeRecord,type ExpeditionState,
} from '../src/challenges';

const spec=(templateId:string,seed:number)=>({factoryVersion:1 as const,templateId,seed});
const reference=(x:ChallengeInstance)=>x.routes.filter(r=>r.purpose!=='recovery').sort((a,b)=>a.expectedCost-b.expectedCost)[0];
const proof=(x:ChallengeInstance)=>replayChallengeRoute(x,reference(x));
const liveDecisions=(x:ChallengeInstance)=>{
 const p=replayChallengeRoute(x,x.routes.find(r=>r.purpose==='reference')!);
 // Fees, event IDs and presentation order do not turn a copied decision into a new one.
 return p.state.events.filter(e=>['request','lab-request','evaluation-request'].includes(e.type)||e.type==='lab-change'&&e.labPhase==='approved')
  .map(e=>({type:e.type,tool:e.tool,target:e.target,operationId:e.operationId,arguments:e.arguments,approved:e.labPhase==='approved'}));
};

test('24 templates have distinct real primary mechanisms and leave frozen sources untouched',()=>{
 const before=canonical(scenarios);assert.equal(challengeTemplates.length,24);assert.equal(new Set(challengeTemplates.map(t=>t.mechanism)).size,24);
 for(const t of challengeTemplates)for(const seed of [70,71])generateChallenge(spec(t.id,seed));assert.equal(canonical(scenarios),before);
});
for(const t of challengeTemplates)test(`${t.id}: both finite decisions execute reference, fault and recovery with real costs`,()=>{
 const a=generateChallenge(spec(t.id,70)),b=generateChallenge(spec(t.id,71));
 assert.notEqual(a.decisionVariantKey,b.decisionVariantKey);assert.notDeepEqual(liveDecisions(a),liveDecisions(b),'actual tool calls or exact approvals must change, not only fees/order');
 for(const x of [a,b]){
  assert.equal(validateChallenge(x).valid,true);assert.deepEqual(generateChallenge(x.spec),x);
  const initial=createGame(x.scenario,x.spec.seed);assert.equal(initial.observed.challengeWeather,undefined);assert.equal(initial.context?.records.some(c=>Object.hasOwn(c.facts,'challengeWeather'))??false,false);
  for(const route of x.routes){const p=replayChallengeRoute(x,route);assert.equal(p.state.status,'won');assert.equal(p.cost,x.scenario.limits!.missionBudget!-p.state.runtime!.missionRemaining);assert.equal(p.cost,route.expectedCost);assert.equal(validateGameState(x.scenario,JSON.parse(JSON.stringify(p.state))),true);assert.ok(p.state.learningEvidence.every(e=>e.level!=='independent-transfer'));
   if(route.purpose==='recovery')assert.ok(p.rejected>0||p.faultEventIds.length>0,'recovery must have an actual failed result, bad physical outcome or unchanged rejection');
  }
 }
});

test('fee/shuffle seeds retain the finite decision key and returned clones cannot poison the cache',()=>{
 for(const t of challengeTemplates){const a=generateChallenge(spec(t.id,70)),b=generateChallenge(spec(t.id,72));assert.equal(a.decisionVariantKey,b.decisionVariantKey);}
 const x=generateChallenge(spec('typed-schema',71)),original=structuredClone(x);x.scenario.initialWorld.rearOpen=true;x.routes[0].expectedCost=0;x.decisionVariantKey='invented-unknown';assert.deepEqual(generateChallenge(original.spec),original);assert.equal(validateChallenge(x).valid,false);
});
test('malformed generator credentials and forged definition/routes are rejected',()=>{
 for(const bad of [{factoryVersion:2,templateId:'typed-schema',seed:1},{factoryVersion:1,templateId:'unknown',seed:1},{factoryVersion:1,templateId:'typed-schema',seed:-1},{factoryVersion:1,templateId:'typed-schema',seed:4294967296},{factoryVersion:1,templateId:'typed-schema',seed:1,firstEncounter:true}])assert.throws(()=>generateChallenge(bad as never));
 for(const mutate of [(x:ChallengeInstance)=>{x.referenceCost=0;},(x:ChallengeInstance)=>{x.routes[0].stages[0].calls=[];},(x:ChallengeInstance)=>{x.scenario.observations[0].facts.push('rearOpen');}]){const x=generateChallenge(spec('typed-schema',71));mutate(x);assert.equal(validateChallenge(x).valid,false);}
});
test('known authored variants only earn practice; caller firstEncounter and copied independent flags never upgrade',()=>{
 const instances=[71,73,70].map(seed=>generateChallenge(spec('typed-schema',seed))),records:ChallengeRecord[]=instances.map(x=>({spec:x.spec,game:proof(x).state,firstEncounter:true}));
 records.unshift({spec:instances[0].spec,game:createGame(instances[0].scenario,71),firstEncounter:false});records.push(structuredClone(records[1]));
 const g=deriveCapabilityGrowth(records).find(g=>g.mechanism==='schema-types')!;assert.equal(g.level,'guided');assert.equal(g.freshWins,0);assert.equal(g.practiceWins,3);assert.equal(g.variantKeys.length,2);
 const forged=structuredClone(records[1]);forged.game.learningEvidence[0].level='independent-transfer';assert.equal(deriveCapabilityGrowth([forged]).find(g=>g.mechanism==='schema-types')!.level,'unseen');
 assert.deepEqual(deriveCapabilityGrowth(records.map(r=>({...r,firstEncounter:false}))),deriveCapabilityGrowth(records));
});
test('practice unlocks only from a strictly replayed official source victory',()=>{
 const x=generateChallenge(spec('typed-schema',70)),source=scenarios.find(s=>s.id===x.template.sourceScenarioId)!;x.scenario=structuredClone(source);const won=proof(x).state;
 assert.deepEqual(deriveUnlockedTemplateIds([won]),['typed-schema']);assert.deepEqual(deriveUnlockedTemplateIds([createGame(source,70)]),[]);
 const forged=structuredClone(won);forged.world.rearOpen=true;assert.deepEqual(deriveUnlockedTemplateIds([forged]),[]);
 assert.deepEqual(deriveUnlockedTemplateIds([proof(generateChallenge(spec('typed-schema',70))).state]),[],'copied challenge victory cannot impersonate its official source');
});

function completeFloor(previous:ExpeditionState):ExpeditionState {
 let next=previous;const x=generateChallenge(next.definition.floors[next.floor]);x.scenario=scenarioForExpedition(next);const p=proof(x);
 for(const action of p.actions){const current=reduceExpedition(next,{type:'game',action});assert.notEqual(current,next);next=current;}
 assert.equal(next.game.status,'won');assert.equal(previous.remaining-next.remaining,p.cost);const advanced=reduceExpedition(next,{type:'advance'});assert.notEqual(advanced,next);return advanced;
}
test('three actual floors share one finite pool and strictly replay after every advance',()=>{
 for(const seed of [0,77,2026]){let state=createExpedition({factoryVersion:1,seed});const initial=state.remaining;assert.equal(state.definition.floors.length,3);assert.equal(new Set(state.definition.floors.map(f=>f.templateId)).size,3);
  for(let floor=0;floor<3;floor++){assert.equal(state.floor,floor);state=completeFloor(state);assert.equal(validateExpedition(JSON.parse(JSON.stringify(state))),true);}
  assert.equal(state.status,'cleared');assert.equal(state.finished.length,3);assert.equal(initial-state.remaining,state.finished.reduce((n,f)=>n+f.cost,0));assert.equal(initial-state.remaining,state.definition.referenceCost);assert.equal(reduceExpedition(state,{type:'advance'}),state);
 }
});
test('floor retry charges prior attempts, rejects inner reset/refunds and keeps actual history',()=>{
 let state=createExpedition({factoryVersion:1,seed:11});const s=scenarioForExpedition(state);let n=0;
 for(const action of [
  {id:`retry-${n++}`,type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,permissions:['*'],budget:s.limits!.maxBudget!}},
  {id:`retry-${n++}`,type:'dispatch',mode:'manual'},
  {id:`retry-${n++}`,type:'tool',call:{tool:'observe',observationId:s.observations.find(o=>!o.availableWhen)?.id??s.observations[0].id}},
 ]){const next=reduceExpedition(state,{type:'game',action:action as never});assert.notEqual(next,state);state=next;}
 const remaining=state.remaining;assert.ok(remaining<state.definition.initialBudget);assert.equal(reduceExpedition(state,{type:'game',action:{id:'refund',type:'reset'}}),state);
 const retried=reduceExpedition(state,{type:'retry-floor'});assert.notEqual(retried,state);assert.equal(retried.remaining,remaining);assert.equal(retried.floorStartBudget,remaining);assert.equal(retried.game.runtime!.missionRemaining,remaining);assert.equal(retried.attempts[0].cost,state.definition.initialBudget-remaining);assert.equal(retried.game.observed.challengeWeather,undefined);assert.equal(validateExpedition(retried),true);
 const abandoned=reduceExpedition(retried,{type:'abandon'});assert.equal(abandoned.status,'abandoned');assert.equal(abandoned.remaining,remaining);assert.equal(validateExpedition(abandoned),true);assert.equal(reduceExpedition(abandoned,{type:'retry-floor'}),abandoned);
});
test('expedition refuses skipping, malformed actions and fabricated clocks/world/proofs/attempts',()=>{
 const initial=createExpedition({factoryVersion:1,seed:99});assert.equal(reduceExpedition(initial,{type:'advance'}),initial);assert.equal(reduceExpedition(initial,{type:'retry-floor',refund:true} as never),initial);
 for(const mutate of [(s:ExpeditionState)=>{s.remaining++;},(s:ExpeditionState)=>{s.floor=2;},(s:ExpeditionState)=>{s.game.world[Object.keys(s.game.world)[0]]=true;},(s:ExpeditionState)=>{s.definition.initialBudget++;},(s:ExpeditionState)=>{s.finished=[{floor:0,spec:s.definition.floors[0],initialBudget:s.remaining,game:s.game,actions:[],cost:0}];}]){const x=structuredClone(initial);mutate(x);assert.equal(validateExpedition(x),false);}
 const x=structuredClone(initial);x.history.push({type:'advance'});assert.equal(validateExpedition(x),false);
});
