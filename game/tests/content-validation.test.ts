import test from 'node:test';
import assert from 'node:assert/strict';
import { contentBundle,validateContent } from '../scripts/validate-content';

test('registered authored content passes the production gate',()=>{
  const report=validateContent(contentBundle);
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.counts,{scenarios:48,stories:48,profiles:7,paths:93,art:20});
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
