import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scenarios} from '../src/content/scenarios';
import {contentBundle} from '../scripts/validate-content';
import {journeyOrder,isUnlocked} from '../src/content/progression';
import {resolveAuthoredStep} from '../src/content/walkthrough';
import {createGame,reduceGame,validateGameState} from '../src/engine';
import type {GameAction,GameState} from '../src/engine/types';
import {canonical,challengeTemplates,generateChallenge,generateExpedition,replayChallengeRoute,scenarioForExpedition,type ChallengeSpec} from '../src/challenges';
import {emptyPostSeason,postSeasonScenario,reducePostSeason,validatePostSeason,MAX_POST_ACTIONS,type PostSeasonAction,type PostSeasonState} from '../src/postSeason';
import {CONTENT_VERSION,MAX_SAVE_BYTES,emptySave,parseSaveText,recordCompletion,serializeSave,validateSave,type PlayerSave} from '../src/storage';

const expeditionSpec={factoryVersion:1 as const,seed:77};
const definition=generateExpedition(expeditionSpec);
const sourceWins=new Map<string,GameState>();
function officialWin(templateId:string):GameState {
 const cached=sourceWins.get(templateId);if(cached)return structuredClone(cached);
 const x=generateChallenge({factoryVersion:1,templateId,seed:70});x.scenario=structuredClone(scenarios.find(s=>s.id===x.template.sourceScenarioId)!);
 const game=replayChallengeRoute(x,x.routes.find(r=>r.purpose==='reference')!).state;sourceWins.set(templateId,game);return structuredClone(game);
}
const mainWins=()=>definition.floors.map(f=>officialWin(f.templateId));
function started():PostSeasonState {
 const empty=emptyPostSeason(),next=reducePostSeason(empty,{type:'start-expedition',spec:expeditionSpec},mainWins());assert.notEqual(next,empty);return next;
}
test('expedition requires all three actual floor sources, not only the opened first floor',()=>{
 const wins=mainWins(),empty=emptyPostSeason();
 for(let missing=0;missing<3;missing++){
  const partial=wins.filter((_,i)=>i!==missing);assert.equal(reducePostSeason(empty,{type:'start-expedition',spec:expeditionSpec},partial),empty);
  assert.throws(()=>validatePostSeason(started(),partial),/来源通关/);
 }
 assert.deepEqual(validatePostSeason(started(),wins),started());
 const fake=structuredClone(wins);fake[1].world[Object.keys(fake[1].world)[0]]='fabricated';assert.equal(reducePostSeason(empty,{type:'start-expedition',spec:expeditionSpec},fake),empty);
});
test('hidden ordinary current, checkpoint and historical victory all retain source gates',()=>{
 const templateId='typed-schema',wins=[officialWin(templateId)],spec={factoryVersion:1 as const,templateId,seed:71};
 let state=reducePostSeason(emptyPostSeason(),{type:'start-challenge',spec},wins);state=reducePostSeason(state,{type:'checkpoint'},wins);
 state=reducePostSeason(state,{type:'select-mode',mode:null},wins);assert.equal(state.selectedMode,null);assert.throws(()=>validatePostSeason(state,[]),/来源通关/);
 const cpOnly=structuredClone(state);cpOnly.currentChallenge=null;assert.throws(()=>validatePostSeason(cpOnly,[]),/来源通关/);
 state=reducePostSeason(state,{type:'select-mode',mode:'challenge'},wins);const x=generateChallenge(spec),p=replayChallengeRoute(x,x.routes.find(r=>r.purpose==='reference')!);
 for(const action of p.actions){const next=reducePostSeason(state,{type:'challenge',action},wins);assert.notEqual(next,state);state=next;}
 const historical=structuredClone(state);historical.currentChallenge=null;historical.checkpoints=[];historical.selectedMode=null;assert.equal(historical.wonProofs.length,1);assert.throws(()=>validatePostSeason(historical,[]),/来源通关/);
});
test('latest cleared expedition is gated even when it is not selected and another mode exists',()=>{
 const wins=mainWins();let state=started();for(let floor=0;floor<3;floor++){
  const e=state.activeExpedition!,x=generateChallenge(e.definition.floors[e.floor]);x.scenario=scenarioForExpedition(e);
  const p=replayChallengeRoute(x,x.routes.filter(r=>r.purpose!=='recovery').sort((a,b)=>a.expectedCost-b.expectedCost)[0]);
  for(const action of p.actions){const next=reducePostSeason(state,{type:'expedition',action:{type:'game',action}},wins);assert.notEqual(next,state);state=next;}
  const next=reducePostSeason(state,{type:'expedition',action:{type:'advance'}},wins);assert.notEqual(next,state);state=next;
 }
 assert.equal(state.latestClearedExpedition!.status,'cleared');state.selectedMode=null;state.activeExpedition=null;
 assert.equal(validatePostSeason(state,wins).latestClearedExpedition!.status,'cleared');
 for(let missing=0;missing<3;missing++)assert.throws(()=>validatePostSeason(state,wins.filter((_,i)=>i!==missing)),/来源通关/);
});
test('nonselected expedition cannot run queued work or spend shared pool, including a hidden running game',()=>{
 const wins=[...mainWins(),officialWin('typed-schema')];let state=reducePostSeason(emptyPostSeason(),{type:'start-challenge',spec:{factoryVersion:1,templateId:'typed-schema',seed:71}},wins);
 state=reducePostSeason(state,{type:'start-expedition',spec:expeditionSpec},wins);const scenario=postSeasonScenario(state)!;
 for(const action of [
  {id:'hidden-config',type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:scenario.limits!.maxBudget!,permissions:['*']}},
  {id:'hidden-start',type:'dispatch',mode:'manual'},
 ] as GameAction[]){const next=reducePostSeason(state,{type:'expedition',action:{type:'game',action}},wins);assert.notEqual(next,state);state=next;}
 assert.equal(state.activeExpedition!.game.status,'running');
 for(const mode of [null,'challenge'] as const){state=reducePostSeason(state,{type:'select-mode',mode},wins);const before=canonical(state.activeExpedition),remaining=state.activeExpedition!.remaining;
  const next=reducePostSeason(state,{type:'expedition',action:{type:'game',action:{id:`hidden-tick-${mode}`,type:'step',source:'scheduler'}}},wins);
  assert.equal(next,state);assert.equal(canonical(next.activeExpedition),before);assert.equal(next.activeExpedition!.remaining,remaining);assert.deepEqual(validatePostSeason(state,wins),state);
 }
});

/** Build proofs from shipped author routes, never ignored QA files or completion flags. */
function playOfficial(id:string):{game:GameState;actions:GameAction[]} {
 const scenario=scenarios.find(s=>s.id===id)!,route=contentBundle.walkthroughs.find(r=>r.scenarioId===id&&r.purpose==='reference')!;
 let game=createGame(scenario,91);const actions:GameAction[]=[];
 const act=(data:object,rejected=false)=>{const action={...data,id:`save-safety-${game.processedActionIds.length}`} as GameAction,next=reduceGame(scenario,game,action);if(rejected)assert.equal(next,game);else{assert.notEqual(next,game,`${id}: ${JSON.stringify(data)}`);game=next;actions.push(action);}};
 if((scenario.engineVersion??1)===1){
  act({type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:16,permissions:['*']}});act({type:'dispatch'});
  for(let step=0;game.status==='running'&&step<64;step++)act({type:'step'});
  assert.equal(game.status,'won',id);assert.ok(validateGameState(scenario,game));return {game,actions};
 }
 assert.ok(route,id);
 for(const stage of route.stages){
  if(game.status==='running')act({type:'pause'});
  act({type:'configure',blueprint:{tools:stage.tools,feedback:true,verification:true,budget:scenario.limits?.maxBudget??12,permissions:['*'],...(stage.loopPolicy?{loopPolicy:stage.loopPolicy}:{}),...(stage.instructionPolicy?{instructionPolicy:stage.instructionPolicy}:{}),...(stage.toolPermissions?{toolPermissions:stage.toolPermissions}:{})}});
  act({type:'dispatch',mode:'manual'});
  for(const change of stage.contextChanges??[]){const card=[...game.context!.records].reverse().find(r=>r.observationId===change.observationId)!;assert.ok(card);act({type:'context',recordId:card.id,operation:change.operation,...(change.summaryId?{summaryId:change.summaryId}:{})});}
  for(const step of stage.steps??[]){if(step.type==='tool'||step.type==='step'||step.type==='skill'&&step.operation==='run'){if(game.status==='paused')act({type:'resume',mode:'manual'});else if(game.status!=='running')act({type:'dispatch',mode:'manual'});}act(resolveAuthoredStep(game,step,'recorded'),step.expectRejected===true);}
  for(const call of stage.calls)act({type:'tool',call});
  if(stage.collectReceipts)for(const receipt of game.protocol?.receipts.filter(r=>!r.collected)??[])act({type:'receive',callId:receipt.callId,receiptId:receipt.id});
 }
 assert.equal(game.status,'won',id);assert.ok(validateGameState(scenario,game),id);assert.deepEqual(actions,game.runtime!.actionHistory);return {game,actions};
}
let seasonCache:PlayerSave|undefined;
function actualSeason():PlayerSave {
 if(!seasonCache){let save=emptySave();save.started=true;save.savedAt='2026-10-03T00:00:00.000Z';
  for(const id of journeyOrder){assert.ok(isUnlocked(id,save.completedScenarioIds),id);const played=playOfficial(id);save.currentScenarioId=id;save.games[id]=played.game;save.actions[id]=played.actions;recordCompletion(save,played.game);save.choices[id]='people';}
  assert.equal(save.completedScenarioIds.length,84);seasonCache=validateSave(save);
 }
 return structuredClone(seasonCache);
}
function startOrdinary(save:PlayerSave,templateId='typed-schema',seed=71):PlayerSave {
 const old=save.postSeason!;save.postSeason=reducePostSeason(old,{type:'start-challenge',spec:{factoryVersion:1,templateId,seed}},Object.values(save.completedGames));assert.notEqual(save.postSeason,old);return save;
}
function postApply(state:PostSeasonState,action:PostSeasonAction,wins:GameState[]):PostSeasonState {
 const next=reducePostSeason(state,action,wins);assert.notEqual(next,state,JSON.stringify(action));return next;
}
function finishExpedition(state:PostSeasonState,wins:GameState[]):PostSeasonState {
 for(let floor=0;floor<3;floor++){
  const expedition=state.activeExpedition!,instance=generateChallenge(expedition.definition.floors[expedition.floor]);instance.scenario=scenarioForExpedition(expedition);
  const replay=replayChallengeRoute(instance,instance.routes.filter(r=>r.purpose!=='recovery').sort((a,b)=>a.expectedCost-b.expectedCost)[0]);
  for(const action of replay.actions)state=postApply(state,{type:'expedition',action:{type:'game',action}},wins);
  state=postApply(state,{type:'expedition',action:{type:'advance'}},wins);
 }
 return state;
}
test('shared save validates real official historical proofs before allowing post-season source unlocks',()=>{
 const save=startOrdinary(actualSeason()),before=canonical(save);assert.deepEqual(validateSave(save),save);
 const source=generateChallenge(save.postSeason!.currentChallenge!.spec).template.sourceScenarioId;
 const fake=structuredClone(save);fake.completedGames[source].world[Object.keys(fake.completedGames[source].world)[0]]='fabricated';assert.throws(()=>validateSave(fake),/历史完成记录/);
 const unfinished=structuredClone(save);unfinished.completedGames[source]=createGame(scenarios.find(s=>s.id===source)!,91);assert.throws(()=>validateSave(unfinished),/历史完成记录/);
 const detached=structuredClone(save);delete detached.completedGames[source];assert.throws(()=>validateSave(detached),/历史验收证据/);
 assert.equal(canonical(save),before,'failed imports do not modify the live save');
});
test('shared import rejects forged post worlds, actions, rewards, budgets and client encounter flags',()=>{
 const save=startOrdinary(actualSeason()),spec=save.postSeason!.currentChallenge!.spec,instance=generateChallenge(spec),replay=replayChallengeRoute(instance,instance.routes.find(r=>r.purpose==='reference')!),wins=Object.values(save.completedGames);
 save.postSeason=postApply(save.postSeason!,{type:'challenge',action:replay.actions[0]},wins);const before=canonical(save);
 for(const mutate of [
  (s:PlayerSave)=>{s.postSeason!.currentChallenge!.game.world[Object.keys(s.postSeason!.currentChallenge!.game.world)[0]]='fabricated';},
  (s:PlayerSave)=>{s.postSeason!.currentChallenge!.actions=[];},
  (s:PlayerSave)=>{s.postSeason!.currentChallenge!.game.hintUsed=true;},
  (s:PlayerSave)=>{(s.postSeason!.currentChallenge as unknown as Record<string,unknown>).firstEncounter=true;},
  (s:PlayerSave)=>{s.postSeason!.wonProofs=[structuredClone(s.postSeason!.currentChallenge!)];},
  (s:PlayerSave)=>{s.postSeason!.currentChallenge!.actions[0]={...s.postSeason!.currentChallenge!.actions[0],admin:true} as never;},
 ]){const forged=structuredClone(save);mutate(forged);assert.throws(()=>parseSaveText(JSON.stringify(forged)));assert.equal(canonical(save),before);}
 const exp=structuredClone(save);exp.postSeason=postApply(exp.postSeason!,{type:'start-expedition',spec:expeditionSpec},wins);exp.postSeason.activeExpedition!.remaining++;assert.throws(()=>validateSave(exp),/共同预算/);
});
test('even unselected imported ordinary checkpoints and expedition history must be unlocked by official sources',()=>{
 const save=emptySave();save.started=true;
 const unlocked=startOrdinary(actualSeason());let post=postApply(unlocked.postSeason!,{type:'checkpoint'},Object.values(unlocked.completedGames));post=postApply(post,{type:'select-mode',mode:null},Object.values(unlocked.completedGames));
 save.postSeason=post;assert.throws(()=>validateSave(save),/主线来源通关/);
 const cpOnly=structuredClone(save);cpOnly.postSeason!.currentChallenge=null;assert.throws(()=>validateSave(cpOnly),/主线来源通关/);
 save.postSeason=started();save.postSeason.selectedMode=null;assert.throws(()=>validateSave(save),/来源通关/);
 const notStarted=structuredClone(unlocked);notStarted.started=false;assert.throws(()=>validateSave(notStarted),/旅途开始标记/);
});
test('0.10 actual 84-task container migrates without adding post progress; every older container rejects injected post records',()=>{
 const original=actualSeason(),legacy=structuredClone(original);legacy.contentVersion='season-0.10.0';delete legacy.postSeason;const before=canonical(legacy);
 const migrated=parseSaveText(JSON.stringify(legacy));assert.equal(migrated.contentVersion,CONTENT_VERSION);assert.equal(migrated.completedScenarioIds.length,84);assert.equal(migrated.postSeason,undefined);assert.deepEqual(migrated.games,original.games);assert.equal(canonical(legacy),before);
 for(const version of ['harbor-0.1.0','harbor-0.2.0','season-0.3.0','season-0.4.0','season-0.5.0','season-0.6.0','season-0.7.0','season-0.8.0','season-0.9.0','season-0.10.0']){
  const injected=structuredClone(legacy);injected.contentVersion=version;injected.postSeason=emptyPostSeason();assert.throws(()=>validateSave(injected),/旧存档包含当时不存在的长期挑战/);
 }
 const smuggled=structuredClone(legacy),challenge=generateChallenge({factoryVersion:1,templateId:'typed-schema',seed:71});smuggled.games[challenge.id]=createGame(challenge.scenario,71);smuggled.actions[challenge.id]=[];assert.throws(()=>validateSave(smuggled),/旧存档包含未知关卡/);
});
test('accepted shared imports and serialized exports return isolated snapshots with no mutable cache alias',()=>{
 const source=startOrdinary(actualSeason()),before=canonical(source),validated=validateSave(source);validated.postSeason!.currentChallenge!.game.world[Object.keys(validated.postSeason!.currentChallenge!.game.world)[0]]='edited';validated.games[source.currentScenarioId].events.length=0;
 assert.equal(canonical(source),before);assert.deepEqual(validateSave(source),source,'mutating a returned clone never poisons a positive replay cache');
 const text=serializeSave(source),imported=parseSaveText(text);assert.deepEqual(imported,source);imported.postSeason!.currentChallenge!.actions.push({id:'detached-edit',type:'hint'});assert.equal(canonical(source),before);assert.equal(serializeSave(source),text);
});
test('actual 84 main wins plus 48 strongest variants, three checkpoints and both expedition records export below 16MB',context=>{
 const save=actualSeason(),wins=Object.values(save.completedGames),spec:ChallengeSpec={factoryVersion:1,templateId:'typed-schema',seed:75};
 let post=postApply(emptyPostSeason(),{type:'start-challenge',spec},wins);post=postApply(post,{type:'checkpoint'},wins);
 const current=generateChallenge(spec),reference=replayChallengeRoute(current,current.routes.find(r=>r.purpose==='reference')!);
 for(const action of reference.actions.slice(0,2)){post=postApply(post,{type:'challenge',action},wins);post=postApply(post,{type:'checkpoint'},wins);}
 post.wonProofs=challengeTemplates.flatMap(template=>[70,71].map(seed=>{const spec:ChallengeSpec={factoryVersion:1,templateId:template.id,seed},instance=generateChallenge(spec),replay=replayChallengeRoute(instance,instance.routes.filter(r=>r.purpose!=='recovery').sort((a,b)=>a.expectedCost-b.expectedCost)[0]);assert.equal(replay.state.hintUsed,false);return {spec,game:replay.state,actions:replay.actions};}));
 post=postApply(post,{type:'start-expedition',spec:{factoryVersion:1,seed:0}},wins);post=finishExpedition(post,wins);post=postApply(post,{type:'start-expedition',spec:{factoryVersion:1,seed:1}},wins);
 save.postSeason=post;save.checkpoints=journeyOrder.slice(-3).map(id=>({scenarioId:id,state:structuredClone(save.games[id]),actions:structuredClone(save.actions[id])}));
 assert.equal(post.wonProofs.length,48);assert.equal(post.checkpoints.length,3);assert.equal(post.latestClearedExpedition!.status,'cleared');assert.equal(post.activeExpedition!.status,'active');
 const count=post.wonProofs.reduce((n,p)=>n+p.actions.length,0)+post.currentChallenge!.actions.length+post.checkpoints.reduce((n,p)=>n+p.actions.length,0)+post.latestClearedExpedition!.history.length+post.activeExpedition!.history.length;assert.ok(count<=MAX_POST_ACTIONS);
 const bytes=(text:string)=>new TextEncoder().encode(text).byteLength,compact=JSON.stringify(save),pretty=JSON.stringify(save,null,2),download=serializeSave(save);
 assert.equal(MAX_SAVE_BYTES,16_000_000);assert.ok(bytes(pretty)<MAX_SAVE_BYTES);assert.equal(download,pretty);assert.deepEqual(parseSaveText(download),save);
 context.diagnostic(JSON.stringify({mainWins:84,variantProofs:48,postActions:count,compactBytes:bytes(compact),prettyBytes:bytes(pretty),downloadBytes:bytes(download),cap:MAX_SAVE_BYTES}));
});
