import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterOneWalkthroughs } from '../src/content/chapterOne';
import { chapterTwoWalkthroughs } from '../src/content/chapterTwo';
import { scenarios } from '../src/content/scenarios';
import { createGame,reduceGame,validateGameState } from '../src/engine';
import { validateSave,CONTENT_VERSION } from '../src/storage';
import type { GameAction } from '../src/engine';
import { chapterComplete,nextMission } from '../src/content/progression';

test('v0.2 migrates unchanged into a complete v1/v2/v3 season save with receipt replay',()=>{
  let save=validateSave(JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json',import.meta.url),'utf8')));
  const routes=[...chapterOneWalkthroughs,...chapterTwoWalkthroughs].filter(route=>route.purpose==='reference');
  const seen=new Set(save.completedScenarioIds);
  for(const route of routes){
    if(seen.has(route.scenarioId))continue;
    const scenario=scenarios.find(scenario=>scenario.id===route.scenarioId)!;let state=createGame(scenario);let index=0;
    const action=(data:object)=>{const next=reduceGame(scenario,state,{id:`save-${index++}`,...data} as GameAction);assert.notEqual(next,state);state=next;};
    for(const stage of route.stages){
      if(state.status==='running')action({type:'pause'});
      action({type:'configure',blueprint:{tools:stage.tools,feedback:true,verification:true,budget:scenario.limits?.maxBudget??20,permissions:['*']}});action({type:'dispatch',mode:'manual'});
      for(const call of stage.calls)action({type:'tool',call});
      if(stage.collectReceipts)for(const receipt of state.protocol!.receipts.filter(receipt=>!receipt.collected))action({type:'receive',callId:receipt.callId,receiptId:receipt.id});
    }
    assert.equal(state.status,'won');assert.ok(validateGameState(scenario,state));
    if(scenario.chapter===2&&save.contentVersion==='harbor-0.2.0'){
      const histories=structuredClone(save.games);save=validateSave(save);assert.equal(save.contentVersion,CONTENT_VERSION);assert.deepEqual(save.games,histories);
    }
    save.currentScenarioId=scenario.id;save.games[scenario.id]=state;save.actions[scenario.id]=state.runtime!.actionHistory;save.completedGames[scenario.id]=structuredClone(state);save.completedScenarioIds.push(scenario.id);save.evidence.push(...state.learningEvidence);seen.add(scenario.id);
    save=validateSave(JSON.parse(JSON.stringify(save)));
    if(save.completedScenarioIds.length===8)save.contentVersion='harbor-0.2.0';
  }
  assert.equal(save.completedScenarioIds.length,16);assert.equal(chapterComplete(save.completedScenarioIds,2),true);
  assert.equal(chapterComplete(save.completedScenarioIds,3),false);assert.equal(nextMission('reusable-scale',save.completedScenarioIds,scenarios.map(s=>s.id)),'brass-order');
  assert.equal(save.completedGames['courier-lock'].learningEvidence[0].level,'independent-transfer');
  const tampered=structuredClone(save);tampered.completedGames['missing-crate'].protocol!.ledger[0].fingerprint='forged';assert.throws(()=>validateSave(tampered));
  const mislabeled=structuredClone(save);mislabeled.contentVersion='harbor-0.2.0';assert.throws(()=>validateSave(mislabeled));
});
