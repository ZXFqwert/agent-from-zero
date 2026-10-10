import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourier, COURIER_SCENARIOS, type CourierAction} from '../src/transfer/courier';
import {applyCourierAction, beginCourierAttempt, courierLearningProofs, emptyCourierProgress, mergeCourierBackup, restoreCourierCheckpoint, validateCourierProgress, type CourierProgress, type CourierSourceId} from '../src/courierProgress';
import {deriveCoreCurriculum} from '../src/curriculum';

function start(id: CourierSourceId = 'courier-storm-transfer') {
  const progress = emptyCourierProgress();
  progress.current = createCourier(17, 'test-attempt', id);
  return progress;
}
function action(progress: CourierProgress, input: Record<string, unknown>): CourierProgress {
  return applyCourierAction(progress, {...input, id:`a-${progress.current.actions.length}`} as CourierAction);
}
function finish(initial = start()): CourierProgress {
  const mission = COURIER_SCENARIOS.find(item => item.id === initial.current.scenarioId)!;
  let progress = action(initial, {type:'configure', dedupe:'business-key', ledger:'persistent', receipt:'exposed'});
  progress = action(progress,{type:'observe',target:'commission'});
  progress = action(progress,{type:'submit',callId:'C1',businessKey:mission.businessKey,destination:mission.destination,quantity:mission.quantity});
  progress = action(progress,{type:'restart'});
  progress = action(progress,{type:'recover'});
  progress = action(progress,{type:'observe',target:'commission'});
  progress = action(progress,{type:'submit',callId:'C2',businessKey:mission.businessKey,destination:mission.destination,quantity:mission.quantity});
  progress = action(progress,{type:'submit',callId:'C3',businessKey:mission.businessKey,destination:mission.destination,quantity:mission.quantity===1?2:1});
  return action(progress,{type:'verify'});
}

test('a supplemental proof fills only idempotent-effects transfer; a caller badge fills nothing',()=>{
  const baseline = deriveCoreCurriculum([]), progress = finish();
  const verified = deriveCoreCurriculum([], {courierProgress:progress});
  assert.equal(verified.counts.evidencedStages,baseline.counts.evidencedStages+1);
  assert.equal(verified.counts.transferConcepts,1);
  const stage = verified.concepts.find(item=>item.id==='idempotent-effects')!.stages.find(item=>item.id==='transfer')!;
  assert.equal(stage.status,'evidenced'); assert.equal(stage.gap,undefined);
  assert.equal(stage.proofs[0].sourceKind,'courier-module'); assert.equal(stage.proofs[0].eventIds.length,7);
  assert.deepEqual(deriveCoreCurriculum([],{courierProgress:{won:true,hintUsed:false,checks:{all:true}}}),baseline);
});

test('editing world, effects, exposure, future envelope version, or duplicate proof rejects the entire backup',()=>{
  const progress = finish();
  const bad = [structuredClone(progress), structuredClone(progress), structuredClone(progress)];
  bad[0].current.world.hospitalBoxes=2;
  (bad[1] as unknown as {version:number}).version=2;
  bad[2].deliveries.push(structuredClone(bad[2].deliveries[0]));
  for(const value of bad){assert.throws(()=>validateCourierProgress(value)); assert.deepEqual(courierLearningProofs(value),[]);}
  const hinted = action(start(),{type:'hint'}); hinted.hintExposureIds=[];
  assert.throws(()=>validateCourierProgress(hinted));
});

test('mission exposure survives new attempts and true no-hint success in the same source',()=>{
  const hinted = action(start(),{type:'hint'});
  const retry = beginCourierAttempt(hinted);
  assert.equal(retry.current.hintUsed,false);
  const winner = finish(retry);
  assert.equal(winner.current.status,'won'); assert.equal(winner.deliveries.length,0);
  assert.deepEqual(courierLearningProofs(winner),[]);
  assert.deepEqual(winner.hintExposureIds,['courier-storm-transfer']);
});

test('a hint in a later attempt cannot withdraw a proof earned before the exposure',()=>{
  const winner = finish(), expected = courierLearningProofs(winner);
  const hinted = action(beginCourierAttempt(winner),{type:'hint'});
  assert.deepEqual(courierLearningProofs(hinted),expected);
  assert.deepEqual(courierLearningProofs(mergeCourierBackup(hinted,start())),expected);
});

test('restoring an earlier backup cannot remove hints or install a new proof for an exposed source',()=>{
  const exposed = action(start(),{type:'hint'}), older = start();
  const restored = mergeCourierBackup(exposed,older);
  assert.deepEqual(restored.hintExposureIds,exposed.hintExposureIds);
  const forgedFreshHistory = mergeCourierBackup(exposed,finish());
  assert.equal(forgedFreshHistory.deliveries.length,0);
  assert.deepEqual(courierLearningProofs(forgedFreshHistory),[]);
});

test('the second authored goal needs changed destination and quantity; it remains available after hospital hints',()=>{
  const exposed = action(start(),{type:'hint'});
  const second = finish(beginCourierAttempt(exposed,'courier-night-transfer'));
  assert.equal(second.current.world.hospitalBoxes,0);assert.equal(second.current.world.marketBoxes,2);
  assert.deepEqual(courierLearningProofs(second).map(proof=>proof.scenarioId),['courier-night-transfer']);
  const importSecond = mergeCourierBackup(exposed,finish(start('courier-night-transfer')));
  assert.equal(courierLearningProofs(importSecond).length,1);
});

test('before-shipment checkpoint resets virtual effects while preserving the source hint exposure',()=>{
  let progress = action(start(),{type:'configure',dedupe:'call-id',ledger:'volatile',receipt:'exposed'});
  progress = action(progress,{type:'submit',callId:'C1',businessKey:'HOSP-RAIN-17',destination:'hospital',quantity:2});
  progress = action(progress,{type:'hint'});
  const checkpoint = restoreCourierCheckpoint(progress);
  assert.equal(checkpoint.current.world.hospitalBoxes,0);
  assert.equal(checkpoint.current.config.dedupe,'call-id');
  assert.equal(checkpoint.current.actions.length,1);
  assert.deepEqual(checkpoint.hintExposureIds,['courier-storm-transfer']);
  assert.equal(checkpoint.deliveries.length,0);
});

test('bad and duplicate action requests never mutate a saved progress or advance its revision',()=>{
  const progress = action(start(),{type:'observe',target:'commission'}), before = JSON.stringify(progress);
  assert.throws(()=>applyCourierAction(progress,progress.current.actions[0]));
  assert.throws(()=>applyCourierAction(progress,{id:'bad',type:'submit',callId:'X',businessKey:'HOSP-RAIN-17',destination:'hospital',quantity:99} as unknown as CourierAction));
  assert.equal(JSON.stringify(progress),before);assert.equal(progress.revision,0);
});

test('copied trajectories and changed attempt labels do not create extra concept stages',()=>{
  const progress = finish();
  let duplicate = beginCourierAttempt(progress);
  for(const original of progress.current.actions) duplicate=applyCourierAction(duplicate,original);
  const curriculum = deriveCoreCurriculum([],{courierProgress:duplicate});
  assert.equal(duplicate.deliveries.length,1);
  assert.equal(curriculum.counts.evidencedStages,1);
});
