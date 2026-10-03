import test from 'node:test';
import assert from 'node:assert/strict';
import { contentBundle,validateContent } from '../scripts/validate-content';

test('registered authored content passes the production gate',()=>{
  const report=validateContent(contentBundle);
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.counts,{scenarios:64,stories:64,profiles:7,paths:129,art:26});
});
test('authoring gate rejects cyclic progression and false reference costs',()=>{
  const cycle=structuredClone(contentBundle);
  cycle.prerequisites['harbor-light']=['after-tide'];
  assert.ok(validateContent(cycle).errors.length>0);
  const wrong=structuredClone(contentBundle);
  wrong.walkthroughs[0].expectedCost++;
  assert.ok(validateContent(wrong).errors.some(error=>error.includes('成本')));
});
test('content accessors and executable values are rejected without invoking them',()=>{
  let invoked=false;
  const getter=Object.defineProperty({},'scenarios',{get(){invoked=true;return contentBundle.scenarios;},enumerable:true});
  assert.ok(validateContent(getter).errors.length>0);
  assert.equal(invoked,false);
  assert.ok(validateContent({...contentBundle,callback:()=>{invoked=true;}}).errors.length>0);
  assert.equal(invoked,false);
});
test('evaluation authoring rejects malformed exposure lists and undocumented nested rules',()=>{
  const malformed=structuredClone(contentBundle);
  const route=malformed.walkthroughs.find(route=>route.scenarioId==='stamps-and-supplies')!;
  route.stages[0].steps.unshift({type:'evaluation',operation:'mark-seen',caseIds:17} as never);
  assert.ok(validateContent(malformed).errors.length>0);
  const nested=structuredClone(contentBundle);
  const scenario=nested.scenarios.find(s=>s.id==='stamps-and-supplies')!;
  Object.assign(scenario.evaluation!.candidates[0],{hiddenOverride:true});
  assert.ok(validateContent(nested).errors.some(error=>error.includes('hiddenOverride')));
  const incompatible=structuredClone(contentBundle);
  incompatible.scenarios.find(s=>s.id==='stamps-and-supplies')!.engineVersion=8;
  assert.ok(validateContent(incompatible).errors.length>0);
});
