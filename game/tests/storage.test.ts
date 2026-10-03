import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scenarios } from '../src/content/scenarios';
import { createGame, reduceGame } from '../src/engine';
import type { AgentBlueprint, GameAction } from '../src/engine';
import { emptySave, validateSave, parseSaveText, resetCurrentScenario, restoreCheckpoint, MAX_SAVE_BYTES, type PlayerSave } from '../src/storage';

const full: AgentBlueprint={tools:['observe','operate','verify'],feedback:true,verification:true,budget:12,permissions:['*']};

function begin(save=emptySave(),index=0):PlayerSave {
  const next=structuredClone(save),scenario=scenarios[index];
  next.started=true;next.currentScenarioId=scenario.id;next.games[scenario.id]??=createGame(scenario);next.actions[scenario.id]??=[];
  return next;
}

function apply(save:PlayerSave,action:Omit<GameAction,'id'>):PlayerSave {
  const next=structuredClone(save),scenario=scenarios.find(item=>item.id===next.currentScenarioId)!;
  const current=next.games[scenario.id];
  const request={...action,id:`test-action-${next.actions[scenario.id].length}`} as GameAction;
  const state=reduceGame(scenario,current,request);
  assert.notStrictEqual(state,current,`fixture action ${action.type} must be accepted`);
  next.games[scenario.id]=state;next.actions[scenario.id].push(request);
  if(state.status==='won'&&current.status!=='won'){
    next.completedGames[scenario.id]=structuredClone(state);
    next.completedScenarioIds=[...new Set([...next.completedScenarioIds,scenario.id])];
    next.evidence=[...next.evidence.filter(item=>item.scenarioId!==scenario.id),...state.learningEvidence];
  }
  return next;
}

function configure(save:PlayerSave):PlayerSave {
  return apply(save,{type:'configure',blueprint:full} as Omit<GameAction,'id'>);
}

function finish(save:PlayerSave):PlayerSave {
  let next=save;
  const status=next.games[next.currentScenarioId].status;
  if(status!=='running')next=apply(next,{type:status==='paused'?'resume':'dispatch'});
  for(let count=0;next.games[next.currentScenarioId].status==='running'&&count<64;count++)next=apply(next,{type:'step'});
  assert.equal(next.games[next.currentScenarioId].status,'won');
  return next;
}

function checkpoint(save:PlayerSave):PlayerSave {
  const next=structuredClone(save),id=save.currentScenarioId;
  next.checkpoints=[...next.checkpoints,{scenarioId:id,state:structuredClone(next.games[id]),actions:structuredClone(next.actions[id])}].slice(-3);
  return next;
}

function allWon():PlayerSave {
  let save=emptySave();
  for(let index=0;index<3;index++)save=finish(configure(begin(save,index)));
  return save;
}

test('new save and exported JSON round-trip without requiring a browser database',()=>{
  const initial=emptySave();
  assert.deepEqual(validateSave(initial),initial);
  const restored=parseSaveText(JSON.stringify(initial,null,2));
  assert.deepEqual(restored,initial);
  assert.notStrictEqual(restored,initial);
});

test('current-game and checkpoint action prefixes replay into exactly the committed states',()=>{
  let save=checkpoint(begin());
  save=configure(save);assert.deepEqual(validateSave(save),save);
  save=apply(save,{type:'dispatch'});save=checkpoint(save);
  save=apply(save,{type:'step'});assert.deepEqual(validateSave(save),save);
  save=apply(save,{type:'pause'});assert.deepEqual(validateSave(save),save);
  const resumed=finish(save);assert.deepEqual(validateSave(resumed),resumed);
});

test('all completed adventures carry independent historical proofs and exactly matching evidence',()=>{
  const save=allWon();
  assert.deepEqual(validateSave(save),save);
  assert.equal(save.completedScenarioIds.length,3);
  assert.equal(Object.keys(save.completedGames).length,3);
  const transfer=save.completedGames[scenarios[1].id];
  assert.ok(transfer.learningEvidence.every(item=>item.level==='independent-transfer'));
});

test('retry is atomic, preserves downstream unlocks and never turns a fresh attempt into an awarded win',()=>{
  const finished=allWon();finished.currentScenarioId=scenarios[0].id;finished.choices[scenarios[0].id]='people';
  const before=JSON.stringify(finished);
  const reset=resetCurrentScenario(finished);
  assert.equal(JSON.stringify(finished),before,'input snapshot is immutable');
  assert.equal(reset.games[scenarios[0].id].status,'ready');
  assert.equal(reset.games[scenarios[0].id].world.light,false);
  assert.equal(reset.completedGames[scenarios[0].id].status,'won');
  assert.deepEqual(reset.completedScenarioIds,finished.completedScenarioIds);
  assert.deepEqual(reset.evidence,finished.evidence);
  assert.equal(reset.choices[scenarios[0].id],'people');
  assert.deepEqual(validateSave(reset),reset);
  const replayed=finish(reset);
  assert.equal(replayed.completedScenarioIds.length,3,'repeat victory cannot duplicate rewards');
  assert.equal(replayed.evidence.length,finished.evidence.length);
  assert.deepEqual(validateSave(replayed),replayed);
});

test('restoring a pre-hint checkpoint cannot erase lifetime hint usage or create independent-transfer evidence',()=>{
  const first=finish(configure(begin()));
  let transfer=checkpoint(configure(begin(first,1)));
  transfer=apply(transfer,{type:'dispatch'});
  transfer=apply(transfer,{type:'hint'});
  transfer=apply(transfer,{type:'step'});
  transfer=checkpoint(transfer);
  transfer=finish(transfer);
  assert.ok(transfer.games[scenarios[1].id].learningEvidence.every(item=>item.level==='guided'));
  const restored=restoreCheckpoint(transfer,0);
  assert.equal(restored.games[scenarios[1].id].hintUsed,true);
  assert.equal(restored.games[scenarios[1].id].status,'ready');
  assert.deepEqual(validateSave(restored),restored);
  const wonAgain=finish(restored);
  assert.ok(wonAgain.games[scenarios[1].id].learningEvidence.every(item=>item.level==='guided'));
  assert.deepEqual(validateSave(wonAgain),wonAgain);
});

test('a later checkpoint remains recoverable after an earlier checkpoint branches its action history',()=>{
  let save=checkpoint(configure(begin()));
  save=apply(save,{type:'dispatch'});save=apply(save,{type:'step'});save=checkpoint(save);
  save=finish(save);
  const earlier=restoreCheckpoint(save,0);
  assert.deepEqual(validateSave(earlier),earlier);
  const later=restoreCheckpoint(earlier,1);
  assert.equal(later.games[later.currentScenarioId].status,'paused','restored running jobs wait for user input');
  assert.equal(later.games[later.currentScenarioId].observed.light.value,false);
  assert.deepEqual(validateSave(later),later);
  assert.deepEqual(validateSave(finish(later)),finish(later));
});

test('malformed save imports fail without modifying the caller snapshot',()=>{
  const original=allWon(),before=JSON.stringify(original);
  const corruptions:Array<(save:PlayerSave)=>void>=[
    save=>{save.games[scenarios[0].id].world.light=false;},
    save=>{save.games[scenarios[0].id].observed.power.value=false;},
    save=>{save.actions[scenarios[0].id].pop();},
    save=>{save.actions[scenarios[0].id].push(save.actions[scenarios[0].id][0]);},
    save=>{save.completedScenarioIds.push(save.completedScenarioIds[0]);},
    save=>{delete save.completedGames[scenarios[0].id];},
    save=>{save.completedGames[scenarios[0].id].status='ready';},
    save=>{save.evidence[0].level='independent-transfer';},
    save=>{save.evidence[0].eventIds=['invented-proof'];},
    save=>{save.evidence.push(save.evidence[0]);},
    save=>{save.choices[scenarios[0].id]='invented-choice';},
    save=>{save.notes='字'.repeat(10001);},
    save=>{save.savedAt='not-a-date';},
    save=>{save.sound='yes' as unknown as boolean;},
    save=>{save.started=false;},
  ];
  for(const corrupt of corruptions){const altered=structuredClone(original);corrupt(altered);const alteredBefore=JSON.stringify(altered);assert.throws(()=>validateSave(altered));assert.equal(JSON.stringify(altered),alteredBefore);}
  assert.equal(JSON.stringify(original),before);
});

test('every checkpoint is validated, including its state and action prefix',()=>{
  const valid=checkpoint(configure(begin()));
  assert.deepEqual(validateSave(valid),valid);
  const badState=structuredClone(valid);badState.checkpoints[0].state.world.light=true;
  assert.throws(()=>validateSave(badState),/检查点/);
  const badHistory=structuredClone(valid);badHistory.checkpoints[0].actions=[];
  assert.throws(()=>validateSave(badHistory),/行动回放/);
  const excess=structuredClone(valid);excess.checkpoints=Array.from({length:4},()=>excess.checkpoints[0]);
  assert.throws(()=>validateSave(excess),/结构/);
  assert.throws(()=>restoreCheckpoint(valid,-1),/不存在/);
  assert.throws(()=>restoreCheckpoint(valid,1),/不存在/);
});

test('incompatible versions, unknown unlocked scenes and over-limit payloads are rejected explicitly',()=>{
  const initial=emptySave();
  for(const key of ['saveVersion','kernelVersion','playerVersion','contentVersion'])assert.throws(()=>validateSave({...initial,[key]:'future'}),/版本/);
  assert.throws(()=>validateSave({...initial,currentScenarioId:scenarios[1].id}),/未解锁/);
  assert.throws(()=>parseSaveText('{broken'),/JSON/);
  assert.throws(()=>parseSaveText(' '.repeat(MAX_SAVE_BYTES+1)),/8 MB/);
  assert.throws(()=>validateSave({...initial,extra:'a'.repeat(MAX_SAVE_BYTES)}),/8 MB/);
  for(const malformed of [null,[],42,'save'])assert.throws(()=>validateSave(malformed),/存档/);
});

test('semantically identical object key order does not break action replay import',()=>{
  const save=allWon();
  const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
  assert.deepEqual(validateSave(reorder(save)),save);
});

test('a real v0.1 browser export migrates its envelope without altering any historical action or proof',()=>{
  const legacy=JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json',import.meta.url),'utf8'));
  const before=JSON.stringify(legacy);
  const migrated=validateSave(legacy);
  assert.equal(JSON.stringify(legacy),before,'migration never changes the backup file snapshot');
  assert.equal(migrated.contentVersion,'season-0.10.0');
  for(const key of ['games','completedGames','actions','choices','evidence','checkpoints']) assert.deepEqual(migrated[key as keyof PlayerSave],legacy[key]);
  assert.equal(migrated.completedScenarioIds.length,3);
  assert.deepEqual(validateSave(migrated),migrated);
});
