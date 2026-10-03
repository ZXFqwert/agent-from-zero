import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {scenarios} from '../src/content/scenarios';
import {createGame} from '../src/engine';
import type {GameAction,GameState} from '../src/engine/types';
import {canonical,challengeTemplates,generateChallenge,replayChallengeRoute,scenarioForExpedition,type ChallengeSpec,type ExpeditionState} from '../src/challenges';
import {emptyPostSeason,postSeasonScenario,reducePostSeason,validatePostSeason,MAX_POST_ACTIONS,type PostSeasonAction,type PostSeasonState} from '../src/postSeason';

const spec=(templateId:string,seed=70):ChallengeSpec=>({factoryVersion:1,templateId,seed});
const reference=(templateId:string,seed=70)=>{const x=generateChallenge(spec(templateId,seed));return replayChallengeRoute(x,x.routes.filter(r=>r.purpose!=='recovery').sort((a,b)=>a.expectedCost-b.expectedCost)[0]);};
const mains:GameState[]=challengeTemplates.map(t=>{
 const x=generateChallenge(spec(t.id));x.scenario=structuredClone(scenarios.find(s=>s.id===t.sourceScenarioId)!);
 return replayChallengeRoute(x,x.routes.find(r=>r.purpose==='reference')!).state;
});
const apply=(state:PostSeasonState,action:PostSeasonAction,mainGames:GameState[]=mains)=>{const next=reducePostSeason(state,action,mainGames);assert.notEqual(next,state,`rejected ${JSON.stringify(action)}`);return next;};
const act=(state:PostSeasonState,action:GameAction)=>apply(state,{type:'challenge',action});
const roundTrip=(state:PostSeasonState)=>assert.deepEqual(validatePostSeason(JSON.parse(JSON.stringify(state)),mains),state);
function complete(state:PostSeasonState,seed=70,hint=false):PostSeasonState {
 let next=apply(state,{type:'start-challenge',spec:spec('typed-schema',seed)});
 if(hint)next=act(next,{id:'ordinary-hint',type:'hint'});
 for(const a of reference('typed-schema',seed).actions)next=act(next,a);return next;
}
test('version1 empty envelope is exact and malformed/unversioned fields reject without side effects',()=>{
 const empty=emptyPostSeason();assert.deepEqual(validatePostSeason(empty,[]),empty);assert.equal(postSeasonScenario(empty),null);
 for(const bad of [{...empty,version:2},{...empty,extra:true},{...empty,wonProofs:Array(49).fill(null)},{...empty,checkpoints:Array(4).fill(null)},{...empty,selectedMode:'challenge'}])assert.throws(()=>validatePostSeason(bad,mains));
 assert.equal(reducePostSeason(empty,{type:'checkpoint'},mains),empty);assert.equal(reducePostSeason(empty,{type:'start-challenge',spec:spec('typed-schema'),firstEncounter:true} as never,mains),empty);
});
test('start demands actual official wins, never completed IDs, unfinished states or copied challenge victories',()=>{
 const empty=emptyPostSeason(),source=scenarios.find(s=>s.id==='etched-door')!;
 for(const wrong of [[],[createGame(source,70)],[reference('typed-schema').state],[{scenarioId:source.id,status:'won'} as GameState]])assert.equal(reducePostSeason(empty,{type:'start-challenge',spec:spec('typed-schema')},wrong),empty);
 const next=apply(empty,{type:'start-challenge',spec:spec('typed-schema')});roundTrip(next);assert.equal(postSeasonScenario(next)?.id,next.currentChallenge!.game.scenarioId);
 assert.equal(reducePostSeason(next,{type:'start-expedition',spec:{factoryVersion:1,seed:1}},[mains.find(g=>g.scenarioId==='etched-door')!]),next);
});
test('ordinary actions store strict full replay; duplicate/fabricated requests preserve the original object',()=>{
 let state=apply(emptyPostSeason(),{type:'start-challenge',spec:spec('typed-schema')});const action=reference('typed-schema').actions[0];state=act(state,action);roundTrip(state);
 assert.deepEqual(state.currentChallenge!.actions,state.currentChallenge!.game.runtime!.actionHistory);
 assert.equal(reducePostSeason(state,{type:'challenge',action},mains),state);
 assert.equal(reducePostSeason(state,{type:'challenge',action:{id:'unknown',type:'pause',admin:true} as never},mains),state);
 for(const mutation of [(s:PostSeasonState)=>{s.currentChallenge!.game.world.frontOpen=true;},(s:PostSeasonState)=>{s.currentChallenge!.game.seed=99;},(s:PostSeasonState)=>{s.currentChallenge!.actions=[];},(s:PostSeasonState)=>{s.currentChallenge!.actions[0]={...s.currentChallenge!.actions[0],clientComplete:true} as never;}]){const bad=structuredClone(state);mutation(bad);assert.throws(()=>validatePostSeason(bad,mains));}
});
test('mode exit preserves ordinary attempt, checkpoints and exact committed progress',()=>{
 let state=apply(emptyPostSeason(),{type:'start-challenge',spec:spec('typed-schema')});state=act(state,reference('typed-schema').actions[0]);state=apply(state,{type:'checkpoint'});const before=structuredClone(state.currentChallenge),cp=structuredClone(state.checkpoints);
 state=apply(state,{type:'select-mode',mode:null});assert.deepEqual(state.currentChallenge,before);assert.deepEqual(state.checkpoints,cp);assert.equal(postSeasonScenario(state),null);
 state=apply(state,{type:'select-mode',mode:'challenge'});assert.deepEqual(state.currentChallenge,before);roundTrip(state);
});
test('victories keep one genuine proof per finite variant; only a later real unhinted seed strengthens it',()=>{
 let state=complete(emptyPostSeason(),70,true);assert.equal(state.wonProofs.length,1);assert.equal(state.wonProofs[0].game.hintUsed,true);
 state=complete(state,72,false);assert.equal(state.wonProofs.length,1);assert.equal(state.wonProofs[0].game.hintUsed,false);assert.equal(state.wonProofs[0].spec.seed,72);
 state=complete(state,74,true);assert.equal(state.wonProofs.length,1);assert.equal(state.wonProofs[0].spec.seed,72);
 state=complete(state,71,false);assert.equal(state.wonProofs.length,2);assert.ok(state.wonProofs.every(p=>p.game.learningEvidence.every(e=>e.level!=='independent-transfer')));roundTrip(state);
 const duplicate=structuredClone(state);duplicate.wonProofs.push(structuredClone(duplicate.wonProofs[0]));assert.throws(()=>validatePostSeason(duplicate,mains));
 const falseWin=structuredClone(state);falseWin.wonProofs[0].game.status='ready';assert.throws(()=>validatePostSeason(falseWin,mains));
});
test('ordinary retry and checkpoint restoration append actual hint evidence and cannot launder it',()=>{
 let state=apply(emptyPostSeason(),{type:'start-challenge',spec:spec('typed-schema')});state=apply(state,{type:'checkpoint'});state=act(state,{id:'first-hint',type:'hint'});state=act(state,reference('typed-schema').actions[0]);
 state=apply(state,{type:'restore-checkpoint',index:0});assert.equal(state.currentChallenge!.game.hintUsed,true);assert.equal(state.currentChallenge!.actions.at(-1)?.type,'hint');roundTrip(state);
 state=act(state,{id:'restart-with-hint',type:'reset'});assert.equal(state.currentChallenge!.game.hintUsed,true);assert.ok(state.currentChallenge!.actions.some(a=>a.type==='hint'));roundTrip(state);
 const washed=structuredClone(state);washed.currentChallenge!.game.hintUsed=false;assert.throws(()=>validatePostSeason(washed,mains));
 state=apply(state,{type:'start-challenge',spec:spec('typed-schema')});assert.equal(state.currentChallenge!.game.hintUsed,true);roundTrip(state);
});
test('checkpoint itself retains a real hint after switching the only live attempt to another seed',()=>{
 let state=apply(emptyPostSeason(),{type:'start-challenge',spec:spec('typed-schema')});state=apply(state,{type:'checkpoint'});state=act(state,{id:'switched-hint',type:'hint'});
 assert.equal(state.checkpoints[0].game.hintUsed,true);assert.equal(state.checkpoints[0].actions.at(-1)?.type,'hint');
 state=apply(state,{type:'start-challenge',spec:spec('typed-schema',71)});state=apply(state,{type:'restore-checkpoint',index:0});assert.equal(state.currentChallenge!.game.hintUsed,true);roundTrip(state);
});
test('only three unfinished ordinary checkpoints remain; no won checkpoint or expedition checkpoint',()=>{
 let state=apply(emptyPostSeason(),{type:'start-challenge',spec:spec('typed-schema')});state=apply(state,{type:'checkpoint'});
 for(let i=0;i<4;i++){state=act(state,{id:`checkpoint-cycle-${i}`,type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:12,permissions:['*']}});state=apply(state,{type:'checkpoint'});}
 assert.equal(state.checkpoints.length,3);assert.equal(reducePostSeason(state,{type:'restore-checkpoint',index:3},mains),state);
 state=complete(state,72);assert.equal(reducePostSeason(state,{type:'checkpoint'},mains),state);state=apply(state,{type:'start-expedition',spec:{factoryVersion:1,seed:3}});assert.equal(reducePostSeason(state,{type:'checkpoint'},mains),state);roundTrip(state);
});
test('case exposure survives a checkpoint restore, including a queued first-open run already in seenCaseIds',()=>{
 let state=apply(emptyPostSeason(),{type:'start-challenge',spec:spec('sunny-tests')});const s=postSeasonScenario(state)!;
 for(const action of [
  {id:'eval-configure',type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:s.limits!.maxBudget!,permissions:['*']}},
  {id:'eval-dispatch',type:'dispatch',mode:'manual'},
  {id:'eval-candidate',type:'evaluation',operation:'configure',candidateId:'condition-aware',criterionIds:['handled','reserve-safe'],aggregation:'all'},
  {id:'eval-open',type:'evaluation',operation:'run',caseId:'clear-light-load'},
 ])state=act(state,action as GameAction);
 const first=state.currentChallenge!.game.evaluation!.runs.at(-1)!;assert.equal(first.firstSeen,true);
 state=apply(state,{type:'checkpoint'});state=act(state,{id:'eval-tick',type:'evaluation',operation:'tick'});assert.equal(state.currentChallenge!.game.evaluation!.runs.at(-1)!.firstSeen,true,'ordinary first-run tick must not downgrade its own opening');
 state=apply(state,{type:'restore-checkpoint',index:0});assert.equal(state.currentChallenge!.game.evaluation!.runs.at(-1)!.firstSeen,false);assert.equal(state.currentChallenge!.actions.at(-1)?.type,'evaluation');roundTrip(state);
});
test('pre-open checkpoint retains actual case exposure after the live attempt is replaced',()=>{
 let state=apply(emptyPostSeason(),{type:'start-challenge',spec:spec('sunny-tests')});const s=postSeasonScenario(state)!;
 for(const action of [
  {id:'seen-configure',type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:s.limits!.maxBudget!,permissions:['*']}},
  {id:'seen-dispatch',type:'dispatch',mode:'manual'},
  {id:'seen-candidate',type:'evaluation',operation:'configure',candidateId:'condition-aware',criterionIds:['handled','reserve-safe'],aggregation:'all'},
 ])state=act(state,action as GameAction);
 state=apply(state,{type:'checkpoint'});state=act(state,{id:'seen-open',type:'evaluation',operation:'run',caseId:'clear-light-load'});
 assert.ok(state.checkpoints[0].game.evaluation!.seenCaseIds.includes('clear-light-load'));
 state=apply(state,{type:'start-challenge',spec:spec('typed-schema',71)});state=apply(state,{type:'restore-checkpoint',index:0});state=act(state,{id:'seen-open-again',type:'evaluation',operation:'run',caseId:'clear-light-load'});
 assert.equal(state.currentChallenge!.game.evaluation!.runs.at(-1)!.firstSeen,false);roundTrip(state);
});
test('unfinished expedition cannot be replaced by a new seed or ordinary new game and mode exit does not erase it',()=>{
 let state=apply(emptyPostSeason(),{type:'start-expedition',spec:{factoryVersion:1,seed:77}});const before=structuredClone(state.activeExpedition);
 assert.equal(reducePostSeason(state,{type:'start-expedition',spec:{factoryVersion:1,seed:78}},mains),state);assert.equal(reducePostSeason(state,{type:'start-challenge',spec:spec('typed-schema')},mains),state);
 assert.equal(reducePostSeason(state,{type:'expedition',action:{type:'game',action:{id:'refund',type:'reset'}}},mains),state);
 state=apply(state,{type:'select-mode',mode:null});assert.deepEqual(state.activeExpedition,before);state=apply(state,{type:'select-mode',mode:'expedition'});
 state=apply(state,{type:'expedition',action:{type:'abandon'}});const spent=state.activeExpedition!.remaining;state=apply(state,{type:'start-challenge',spec:spec('typed-schema')});assert.equal(state.activeExpedition!.status,'abandoned');assert.equal(state.activeExpedition!.remaining,spent);roundTrip(state);
});
test('expedition retries preserve both charged pool and hint using genuine outer history',()=>{
 let state=apply(emptyPostSeason(),{type:'start-expedition',spec:{factoryVersion:1,seed:11}});const s=postSeasonScenario(state)!;
 for(const action of [
  {id:'exp-hint',type:'hint'},
  {id:'exp-config',type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:s.limits!.maxBudget!,permissions:['*']}},
  {id:'exp-dispatch',type:'dispatch',mode:'manual'},
  {id:'exp-observe',type:'tool',call:{tool:'observe',observationId:s.observations.find(o=>!o.availableWhen)!.id}},
 ])state=apply(state,{type:'expedition',action:{type:'game',action:action as GameAction}});
 const spent=state.activeExpedition!.remaining;state=apply(state,{type:'expedition',action:{type:'retry-floor'}});assert.equal(state.activeExpedition!.remaining,spent);assert.equal(state.activeExpedition!.game.hintUsed,true);assert.equal(state.activeExpedition!.history.at(-1)!.type,'game');assert.equal(state.activeExpedition!.attempts.length,1);roundTrip(state);
});
function finishExpedition(previous:PostSeasonState):PostSeasonState {
 let next=previous;for(let floor=0;floor<3;floor++){
  const e=next.activeExpedition!,x=generateChallenge(e.definition.floors[e.floor]);x.scenario=scenarioForExpedition(e);const p=replayChallengeRoute(x,x.routes.filter(r=>r.purpose!=='recovery').sort((a,b)=>a.expectedCost-b.expectedCost)[0]);
  for(const action of p.actions)next=apply(next,{type:'expedition',action:{type:'game',action}});next=apply(next,{type:'expedition',action:{type:'advance'}});
 }return next;
}
test('last cleared expedition is fully verified and survives a new ongoing or abandoned expedition',()=>{
 let state=finishExpedition(apply(emptyPostSeason(),{type:'start-expedition',spec:{factoryVersion:1,seed:0}}));assert.equal(state.activeExpedition!.status,'cleared');assert.deepEqual(state.latestClearedExpedition,state.activeExpedition);assert.equal(state.wonProofs.length,0,'different-budget expedition games must not be fabricated into ordinary proofs');roundTrip(state);
 const prior=structuredClone(state.latestClearedExpedition);state=apply(state,{type:'start-expedition',spec:{factoryVersion:1,seed:1}});assert.deepEqual(state.latestClearedExpedition,prior);state=apply(state,{type:'expedition',action:{type:'abandon'}});assert.deepEqual(state.latestClearedExpedition,prior);roundTrip(state);
 for(const mutate of [(e:ExpeditionState)=>{e.remaining++;},(e:ExpeditionState)=>{e.status='active';},(e:ExpeditionState)=>{e.history=[];}]){const bad=structuredClone(state);mutate(bad.latestClearedExpedition!);assert.throws(()=>validatePostSeason(bad,mains));}
});
test('4000 total stored-action cap rejects excessive evidence without claiming a first encounter',()=>{
 const state=complete(emptyPostSeason());assert.equal(MAX_POST_ACTIONS,4000);const bad=structuredClone(state);bad.currentChallenge!.actions=Array(MAX_POST_ACTIONS+1).fill(reference('typed-schema').actions[0]);assert.throws(()=>validatePostSeason(bad,mains));
 const extra=structuredClone(state);(extra.currentChallenge as unknown as Record<string,unknown>).firstEncounter=true;assert.throws(()=>validatePostSeason(extra,mains));
});
test('48 strongest ordinary variants, latest cleared expedition, current and three checkpoints fit the measured full-save cap',context=>{
 let state=apply(emptyPostSeason(),{type:'start-challenge',spec:spec('typed-schema',75)});state=apply(state,{type:'checkpoint'});
 for(const action of reference('typed-schema',75).actions.slice(0,2)){state=act(state,action);state=apply(state,{type:'checkpoint'});}
 state.wonProofs=challengeTemplates.flatMap(t=>[70,71].map(seed=>{const p=reference(t.id,seed);return {spec:spec(t.id,seed),game:p.state,actions:p.actions};}));
 const expedition=finishExpedition(apply(emptyPostSeason(),{type:'start-expedition',spec:{factoryVersion:1,seed:0}}));state.latestClearedExpedition=expedition.latestClearedExpedition;
 state=apply(state,{type:'start-expedition',spec:{factoryVersion:1,seed:1}});roundTrip(state);assert.equal(state.wonProofs.length,48);assert.equal(state.checkpoints.length,3);
 const bytes=(x:unknown,pretty=false)=>new TextEncoder().encode(JSON.stringify(x,null,pretty?2:undefined)).byteLength;
 const counts=state.wonProofs.reduce((n,p)=>n+p.actions.length,0)+state.currentChallenge!.actions.length+state.checkpoints.reduce((n,p)=>n+p.actions.length,0)+state.activeExpedition!.history.length+state.latestClearedExpedition!.history.length;
 const measurement:Record<string,number>={postCompactBytes:bytes(state),postPrettyBytes:bytes(state,true),storedActions:counts};assert.ok(counts<=MAX_POST_ACTIONS);assert.ok(measurement.postCompactBytes<16_000_000);
 const mainPath=join('output','playwright','season-v010-live-84.json');if(existsSync(mainPath)){const main=JSON.parse(readFileSync(mainPath,'utf8').replace(/^\uFEFF/,'')),full={...main,postSeason:state};measurement.fullCompactBytes=bytes(full);measurement.fullPrettyBytes=bytes(full,true);assert.ok(measurement.fullCompactBytes<16_000_000);assert.ok(measurement.fullPrettyBytes<16_000_000);}
 mkdirSync('output',{recursive:true});writeFileSync(join('output','post-season-capacity.json'),JSON.stringify(state,null,2),'utf8');writeFileSync(join('output','post-season-capacity-measurement.json'),JSON.stringify(measurement,null,2),'utf8');context.diagnostic(JSON.stringify(measurement));
});
