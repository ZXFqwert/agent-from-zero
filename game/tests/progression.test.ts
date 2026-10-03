import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterComplete,isUnlocked,nextMission,journeyOrder } from '../src/content/progression';

test('legacy boss access is preserved, while the expanded final task requires both new voyage and old boss',()=>{
  const old=['harbor-light','warehouse-gate','hollow-regent'];
  assert.equal(isUnlocked('hollow-regent',old),true);
  assert.equal(isUnlocked('tide-ledger',old),true);
  assert.equal(isUnlocked('after-tide',old),false);
  assert.equal(chapterComplete(old),false);
  assert.equal(nextMission('hollow-regent',old,journeyOrder),'tide-ledger');
  assert.equal(isUnlocked('after-tide',[...old,'tide-ledger','last-ferry']),true);
});
test('side quests never gate main completion and next mission favors the main path',()=>{
  const prefix=['harbor-light','warehouse-gate','tide-ledger'];
  assert.equal(nextMission('tide-ledger',prefix,journeyOrder),'last-ferry');
  assert.equal(isUnlocked('fog-bell',prefix),true);
  assert.equal(isUnlocked('medicine-detour',prefix),true);
  assert.equal(chapterComplete([...prefix,'last-ferry','hollow-regent','after-tide']),true);
  assert.equal(isUnlocked('invented-quest',prefix),false);
});
