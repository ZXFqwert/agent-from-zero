import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contentBundle} from '../scripts/validate-content';
import {journeyOrder,isUnlocked} from '../src/content/progression';
import {prologueIds,finaleIds} from '../src/content/seasonBookends';
import {blueprintTrialOrder} from '../src/content/blueprintTrials';
import {resolveAuthoredStep} from '../src/content/walkthrough';
import {createGame,reduceGame,type GameAction,type GameState} from '../src/engine';
import {CONTENT_VERSION,MAX_SAVE_BYTES,emptySave,parseSaveText,recordCompletion,resetCurrentScenario,restoreCheckpoint,validateSave,type PlayerSave} from '../src/storage';
const scenarioFor=(id:string)=>contentBundle.scenarios.find(s=>s.id===id)!;
function play(id:string,hint=false):GameState {
 const scenario=scenarioFor(id),route=contentBundle.walkthroughs.find(r=>r.scenarioId===id&&r.purpose==='reference')!;
 assert.ok(route,id);let state=createGame(scenario,91);
 const act=(data:object,rejected=false)=>{const next=reduceGame(scenario,state,{...data,id:`season-${state.processedActionIds.length}`} as GameAction);if(rejected)assert.equal(next,state);else {assert.notEqual(next,state,JSON.stringify(data));state=next;}};
 if(hint)act({type:'hint'});
 for(const stage of route.stages){
  if(state.status==='running')act({type:'pause'});
  act({type:'configure',blueprint:{tools:stage.tools,feedback:true,verification:true,budget:scenario.limits?.maxBudget??12,permissions:['*'],...(stage.loopPolicy?{loopPolicy:stage.loopPolicy}:{}),...(stage.instructionPolicy?{instructionPolicy:stage.instructionPolicy}:{}),...(stage.toolPermissions?{toolPermissions:stage.toolPermissions}:{})}});
  act({type:'dispatch',mode:'manual'});
  for(const change of stage.contextChanges??[]){const card=[...state.context!.records].reverse().find(r=>r.observationId===change.observationId)!;act({type:'context',recordId:card.id,operation:change.operation,...(change.summaryId?{summaryId:change.summaryId}:{})});}
  for(const step of stage.steps??[]){if(step.type==='tool'||step.type==='step'||step.type==='skill'&&step.operation==='run'){if(state.status==='paused')act({type:'resume',mode:'manual'});else if(state.status!=='running')act({type:'dispatch',mode:'manual'});}act(resolveAuthoredStep(state,step,'recorded'),step.expectRejected===true);}
  for(const call of stage.calls)act({type:'tool',call});
  if(stage.collectReceipts)for(const receipt of state.protocol?.receipts.filter(r=>!r.collected)??[])act({type:'receive',callId:receipt.callId,receiptId:receipt.id});
 }
 assert.equal(state.status,'won',id);return state;
}
let cache:PlayerSave|undefined;
function season():PlayerSave {
 if(!cache){let save=validateSave(JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json',import.meta.url),'utf8')));
 for(const id of journeyOrder){if(save.completedScenarioIds.includes(id))continue;assert.ok(isUnlocked(id,save.completedScenarioIds),id);const state=play(id);save.currentScenarioId=id;save.games[id]=state;save.actions[id]=state.runtime!.actionHistory;recordCompletion(save,state);save.choices[id]='people';}
 assert.equal(save.completedScenarioIds.length,84);cache=validateSave(save);}
 return structuredClone(cache);
}
test('new journey begins with two meaningful tool requests and no compulsory failure',()=>{
 const initial=emptySave();assert.equal(initial.currentScenarioId,prologueIds[0]);const state=play(prologueIds[0]);
 assert.equal(state.world.curtainOpen,true);assert.deepEqual(state.events.filter(e=>e.type==='request').map(e=>e.tool),['operate','verify']);assert.equal(state.status,'won');
});
test('all 84 actual authored completions survive JSON import, three checkpoints and retry without duplicate rewards',()=>{
 const save=season();assert.equal(save.contentVersion,CONTENT_VERSION);
 save.checkpoints=[prologueIds[0],finaleIds[1],blueprintTrialOrder.at(-1)!].map(id=>({scenarioId:id,state:structuredClone(save.games[id]),actions:structuredClone(save.actions[id])}));
 const text=JSON.stringify(save,null,2);assert.ok(new TextEncoder().encode(text).byteLength<MAX_SAVE_BYTES);assert.deepEqual(parseSaveText(text),save);
 const retry=resetCurrentScenario(save);assert.equal(retry.completedScenarioIds.length,84);assert.deepEqual(retry.evidence,save.evidence);assert.equal(retry.completedGames[save.currentScenarioId].status,'won');validateSave(retry);
 const restored=restoreCheckpoint(parseSaveText(text),1);assert.equal(restored.currentScenarioId,finaleIds[1]);assert.equal(restored.completedScenarioIds.length,84);validateSave(restored);
});
test('v0.9 containers cannot smuggle new bookends or blueprint records into old chapter numbers',()=>{
 const save=season();
 const old=structuredClone(save);old.contentVersion='season-0.9.0';
 const legacyIds=contentBundle.scenarios.filter(s=>s.chapter<=8&&!prologueIds.includes(s.id)&&!finaleIds.includes(s.id)).map(s=>s.id);
 old.games=Object.fromEntries(Object.entries(old.games).filter(([id])=>legacyIds.includes(id)));old.actions=Object.fromEntries(Object.entries(old.actions).filter(([id])=>legacyIds.includes(id)));old.completedGames=Object.fromEntries(Object.entries(old.completedGames).filter(([id])=>legacyIds.includes(id)));old.completedScenarioIds=legacyIds;old.evidence=old.evidence.filter(e=>legacyIds.includes(e.scenarioId));old.choices=Object.fromEntries(Object.entries(old.choices).filter(([id])=>legacyIds.includes(id)));old.currentScenarioId='hollow-regent';old.checkpoints=[];
 assert.equal(validateSave(old).completedScenarioIds.length,64);
 for(const id of [prologueIds[0],finaleIds[0],blueprintTrialOrder[0]]){
  const injected=structuredClone(old);injected.games[id]=save.games[id];injected.actions[id]=save.actions[id];
  assert.throws(()=>validateSave(injected),/旧存档|未知关卡/);
 }
});
test('real blueprint migration evidence remains hint-sensitive and derives from successful action history',()=>{
 const save=season();for(const id of ['bp-openclaw-queue','bp-hermes-stale','bp-opencode-migration','bp-dsh-lifecycle']){
 const state=save.completedGames[id];assert.ok(state.learningEvidence.length);assert.ok(state.learningEvidence.every(e=>e.level==='independent-transfer'),id);
 const events=state.events;assert.ok(events.some(e=>['request','lab-request'].includes(e.type)),id);
 const hinted=play(id,true);assert.ok(hinted.learningEvidence.every(e=>e.level!=='independent-transfer'),id+' hint prevents independent claim');
 }
});
