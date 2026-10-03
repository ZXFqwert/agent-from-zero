import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterOneWalkthroughs } from '../src/content/chapterOne';
import { chapterTwoWalkthroughs } from '../src/content/chapterTwo';
import { chapterThreeWalkthroughs } from '../src/content/chapterThree';
import { scenarios } from '../src/content/scenarios';
import { createGame,reduceGame } from '../src/engine';
import { validateSave,CONTENT_VERSION,recordCompletion } from '../src/storage';
import type { GameAction,GameState } from '../src/engine';

function season() {
  let save=validateSave(JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json',import.meta.url),'utf8')));
  const seen=new Set(save.completedScenarioIds);
  for(const route of [...chapterOneWalkthroughs,...chapterTwoWalkthroughs,...chapterThreeWalkthroughs].filter(r=>r.purpose==='reference')){
    if(seen.has(route.scenarioId))continue;
    if(seen.size===16){save.contentVersion='season-0.3.0';const before=structuredClone(save.games);save=validateSave(save);assert.deepEqual(save.games,before);assert.equal(save.contentVersion,CONTENT_VERSION);}
    const scenario=scenarios.find(s=>s.id===route.scenarioId)!;let state=createGame(scenario);let count=0;
    const act=(data:object)=>{const next=reduceGame(scenario,state,{id:`proof-${count++}`,...data} as GameAction);assert.notEqual(next,state);state=next;};
    for(const stage of route.stages){
      if(state.status==='running')act({type:'pause'});
      act({type:'configure',blueprint:{tools:stage.tools,feedback:true,verification:true,budget:24> (scenario.limits?.maxBudget??20)?scenario.limits?.maxBudget??20:24,permissions:['*'],...(stage.loopPolicy?{loopPolicy:stage.loopPolicy}:{})}});act({type:'dispatch',mode:'manual'});
      for(const call of stage.calls)act({type:'tool',call});
      if(stage.collectReceipts)for(const r of state.protocol!.receipts.filter(r=>!r.collected))act({type:'receive',callId:r.callId,receiptId:r.id});
    }
    assert.equal(state.status,'won');save.currentScenarioId=scenario.id;save.games[scenario.id]=state;save.actions[scenario.id]=state.runtime!.actionHistory;recordCompletion(save,state);seen.add(scenario.id);save=validateSave(save);
  }
  return save;
}
test('all 24 scenes coexist with frozen v1/v2/v3 and replayable bounded loops; v0.3 cannot smuggle v4',()=>{
  const save=season();assert.equal(save.completedScenarioIds.length,24);assert.equal(save.completedGames['rescue-rope'].learningEvidence[0].level,'independent-transfer');
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save))),save);
  const wrong=structuredClone(save);wrong.contentVersion='season-0.3.0';assert.throws(()=>validateSave(wrong),/旧存档/);
  const forged=structuredClone(save);forged.games['cooling-pulse'].control!.attempts['send-pulse']=9;assert.throws(()=>validateSave(forged));
});
test('guided repeat retains earlier independent proof without reissuing rewards',()=>{
  const save=season(),id='rescue-rope',scenario=scenarios.find(s=>s.id===id)!;
  const historical=structuredClone(save.completedGames[id]);let state=createGame(scenario);
  const actions:GameAction[]=[{id:'build',type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:24,permissions:['*'],loopPolicy:{maxCalls:12,maxRetries:0,permanentFailure:'repair'}}},{id:'hint',type:'hint'},{id:'launch',type:'dispatch'}];
  for(const action of actions)state=reduceGame(scenario,state,action);
  for(let i=0;state.status==='running'&&i<20;i++)state=reduceGame(scenario,state,{id:`run${i}`,type:'step'});
  assert.equal(state.status,'won');assert.equal(state.learningEvidence[0].level,'guided');save.games[id]=state;save.actions[id]=state.runtime!.actionHistory;
  recordCompletion(save,state);assert.deepEqual(save.completedGames[id],historical);assert.equal(save.completedScenarioIds.length,24);assert.ok(validateSave(save));
});
