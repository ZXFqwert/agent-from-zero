import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterOneScenarios,chapterOneWalkthroughs } from '../src/content/chapterOne';
import { createGame,reduceGame,validateScenario,validateGameState } from '../src/engine';
import type { GameAction,GameState } from '../src/engine';
import { validateSave,restoreCheckpoint,type PlayerSave } from '../src/storage';

type Input = {[K in GameAction['type']]:Omit<Extract<GameAction,{type:K}>,'id'>}[GameAction['type']];
function apply(scenario:typeof chapterOneScenarios[number],state:GameState,input:Input):GameState {
  const action={...input,id:`${scenario.id}-reference-${state.processedActionIds.length}`} as GameAction;
  const next=reduceGame(scenario,state,action);
  assert.notStrictEqual(next,state,`${scenario.id}: ${input.type} must be accepted`);
  assert.equal(validateGameState(scenario,next),true);
  return next;
}
function walkthrough(route:typeof chapterOneWalkthroughs[number]):GameState {
  const scenario=chapterOneScenarios.find(q=>q.id===route.scenarioId)!;
  assert.deepEqual(validateScenario(scenario),[]);
  let state=createGame(scenario);
  for(const stage of route.stages) {
    if(state.status==='running') state=apply(scenario,state,{type:'pause'});
    state=apply(scenario,state,{type:'configure',blueprint:{tools:stage.tools,feedback:true,verification:true,budget:scenario.limits?.maxBudget ?? 12,permissions:['*']}});
    state=apply(scenario,state,{type:'dispatch',mode:'manual'});
    for(const call of stage.calls) state=apply(scenario,state,{type:'tool',call});
    for(const [fact,value]of Object.entries(stage.expectWorld??{})) assert.equal(state.world[fact],value,route.id);
    for(const fact of stage.absentProofs??[]) assert.equal(state.verifiedGoals.includes(fact),false,route.id);
  }
  assert.equal(state.status,'won',route.id);
  assert.equal((scenario.limits?.missionBudget ?? 64)-state.runtime!.missionRemaining,route.expectedCost,route.id);
  for(const [fact,value]of Object.entries(route.expectedWorld)) assert.equal(state.world[fact],value,route.id);
  return state;
}
for(const route of chapterOneWalkthroughs) test(`authored path: ${route.id} (${route.purpose})`,()=>{walkthrough(route);});

test('all eight missions can coexist in a migrated save with mixed kernels and replayable histories',()=>{
  let save:PlayerSave=validateSave(JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json',import.meta.url),'utf8')));
  for(const id of ['tide-ledger','last-ferry','after-tide','fog-bell','medicine-detour']) {
    const route=chapterOneWalkthroughs.find(r=>r.scenarioId===id&&r.purpose==='reference')!;
    const state=walkthrough(route);
    save.currentScenarioId=id;save.games[id]=state;save.actions[id]=state.runtime!.actionHistory;
    save.completedGames[id]=structuredClone(state);save.completedScenarioIds.push(id);
    save.evidence.push(...state.learningEvidence);
    save=validateSave(save);
  }
  assert.equal(save.completedScenarioIds.length,8);
  assert.equal(save.completedGames['harbor-light'].kernelVersion,1);
  assert.equal(save.completedGames['fog-bell'].kernelVersion,2);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save))),save);
});

test('a v2 checkpoint retains spent mission resources and hint history when restored',()=>{
  const save=validateSave(JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json',import.meta.url),'utf8')));
  const scenario=chapterOneScenarios.find(q=>q.id==='tide-ledger')!;
  let state=createGame(scenario);
  state=apply(scenario,state,{type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:10,permissions:['*']}});
  state=apply(scenario,state,{type:'dispatch',mode:'manual'});
  state=apply(scenario,state,{type:'tool',call:{tool:'observe',observationId:'sound-channel'}});
  save.currentScenarioId=scenario.id;save.games[scenario.id]=state;save.actions[scenario.id]=state.runtime!.actionHistory;
  save.checkpoints=[{scenarioId:scenario.id,state:structuredClone(state),actions:structuredClone(state.runtime!.actionHistory)}];
  const hinted=apply(scenario,state,{type:'hint'});
  save.games[scenario.id]=hinted;save.actions[scenario.id]=hinted.runtime!.actionHistory;
  const restored=restoreCheckpoint(validateSave(save),0);
  assert.equal(restored.games[scenario.id].hintUsed,true);
  assert.equal(restored.games[scenario.id].status,'paused');
  assert.equal(restored.games[scenario.id].runtime!.missionRemaining,8);
  assert.deepEqual(validateSave(restored),restored);
});
