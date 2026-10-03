import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterOneWalkthroughs } from '../src/content/chapterOne';
import { chapterTwoWalkthroughs } from '../src/content/chapterTwo';
import { chapterThreeWalkthroughs } from '../src/content/chapterThree';
import { chapterFourWalkthroughs } from '../src/content/chapterFour';
import { scenarios } from '../src/content/scenarios';
import { createGame,reduceGame } from '../src/engine';
import { validateSave,recordCompletion,CONTENT_VERSION } from '../src/storage';
import type { GameAction } from '../src/engine';
test('all 32 tasks coexist; v0.4 migrates unchanged and cannot smuggle future context records',()=>{
 let save=validateSave(JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json',import.meta.url),'utf8')));const seen=new Set(save.completedScenarioIds);
 for(const route of [...chapterOneWalkthroughs,...chapterTwoWalkthroughs,...chapterThreeWalkthroughs,...chapterFourWalkthroughs].filter(r=>r.purpose==='reference')){
  if(seen.has(route.scenarioId))continue;
  if(seen.size===24){save.contentVersion='season-0.4.0';const before=structuredClone(save.games);save=validateSave(save);assert.deepEqual(save.games,before);assert.equal(save.contentVersion,CONTENT_VERSION);}
  const scenario=scenarios.find(s=>s.id===route.scenarioId)!;let state=createGame(scenario),i=0;const act=(data:object)=>{const next=reduceGame(scenario,state,{id:`p${i++}`,...data} as GameAction);assert.notEqual(next,state);state=next;};
  for(const stage of route.stages){if(state.status==='running')act({type:'pause'});act({type:'configure',blueprint:{tools:stage.tools,feedback:true,verification:true,budget:scenario.limits?.maxBudget??20,permissions:['*'],...(stage.loopPolicy?{loopPolicy:stage.loopPolicy}:{})}});act({type:'dispatch',mode:'manual'});
   for(const c of stage.contextChanges??[]){const card=[...state.context!.records].reverse().find(r=>r.observationId===c.observationId)!;act({type:'context',recordId:card.id,operation:c.operation,...(c.summaryId?{summaryId:c.summaryId}:{})});}
   for(const call of stage.calls)act({type:'tool',call});if(stage.collectReceipts)for(const r of state.protocol!.receipts.filter(r=>!r.collected))act({type:'receive',callId:r.callId,receiptId:r.id});
  }
  assert.equal(state.status,'won');save.currentScenarioId=scenario.id;save.games[scenario.id]=state;save.actions[scenario.id]=state.runtime!.actionHistory;recordCompletion(save,state);seen.add(scenario.id);save=validateSave(save);
 }
 assert.equal(save.completedScenarioIds.length,32);assert.equal(save.completedGames['field-hospital'].learningEvidence[0].level,'independent-transfer');assert.deepEqual(validateSave(JSON.parse(JSON.stringify(save))),save);
 const mislabeled=structuredClone(save);mislabeled.contentVersion='season-0.4.0';assert.throws(()=>validateSave(mislabeled),/旧存档/);
 const poison=structuredClone(save);poison.games['field-hospital'].context!.activeIds=[];assert.throws(()=>validateSave(poison));
});
