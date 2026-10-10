import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCHITECTURE_MISSIONS, defaultArchitectureBuild, retainArchitectureAttempts, runArchitecture, type ArchitectureBuild, type ArchitectureMission} from '../src/graduation/architecture';

const solutions: Record<string, ArchitectureBuild> = {
  'two-shores': {session: 'sender', authority: 'origin', queue: 'serial', verification: 'world'},
  'healing-index': {context: 'retrieval', memory: 'refresh', workers: 'packet', verification: 'world'},
  'sealed-workshop': {provider: 'adapter', extension: 'isolated', approval: 'exact', storage: 'business', verification: 'world'},
};
function enumerate(mission: ArchitectureMission): ArchitectureBuild[] {
  return mission.slots.reduce<ArchitectureBuild[]>((builds, slot) => builds.flatMap(build => slot.choices.map(item => ({...build, [slot.id]: item.id}))), [{}]);
}
test('each blind mission is solvable, deterministic and default build genuinely fails', () => {
  for (const mission of ARCHITECTURE_MISSIONS) {
    const build = solutions[mission.id], original = JSON.stringify(build);
    assert.equal(runArchitecture(mission.id, build).won, true);
    assert.deepEqual(runArchitecture(mission.id, build), runArchitecture(mission.id, structuredClone(build)));
    assert.equal(JSON.stringify(build), original);
    assert.equal(runArchitecture(mission.id, defaultArchitectureBuild(mission)).won, false);
    assert.ok(enumerate(mission).some(candidate => runArchitecture(mission.id, candidate).won));
  }
});
test('invalid or extra configuration fields have no world side effects', () => {
  for (const invalid of [null, [], 'sender', {}, {...solutions['two-shores'], injected: 'open-gate'}, {...solutions['two-shores'], queue: 'constructor'}]) {
    const result = runArchitecture('two-shores', invalid);
    assert.equal(result.valid, false);assert.deepEqual(result.world, {});
    assert.equal(result.events.some(item => item.phase === 'request'), false);
  }
  assert.equal(runArchitecture('__proto__', solutions['two-shores']).valid, false);
});
test('source identity, private sessions, ordering and world inspection affect actual outcomes separately', () => {
  const source = solutions['two-shores'];
  assert.equal(runArchitecture('two-shores', {...source, authority: 'claim'}).world.gateOpen, true);
  assert.equal(runArchitecture('two-shores', {...source, session: 'shared'}).world.privateLeak, true);
  assert.equal(runArchitecture('two-shores', {...source, session: 'entry'}).world.deliveredToEast, false);
  assert.equal(runArchitecture('two-shores', {...source, queue: 'parallel'}).world.latest, '平稳');
  assert.equal(runArchitecture('two-shores', {...source, verification: 'claim'}).won, false);
});
test('context overflow never starts execution, metadata survives only real retrieval and private inputs need handoff', () => {
  const source = solutions['healing-index'];
  const overflow = runArchitecture('healing-index', {...source, context: 'all', workers: 'solo'});
  assert.deepEqual(overflow.world, {});assert.equal(overflow.events.some(item => item.phase === 'request'), false);
  assert.equal(runArchitecture('healing-index', {...source, context: 'summary'}).world.source, '');
  assert.equal(runArchitecture('healing-index', {...source, memory: 'trust'}).world.bottle, '蓝瓶');
  assert.equal(runArchitecture('healing-index', {...source, workers: 'empty'}).world.bottle, '未配药');
  assert.equal(runArchitecture('healing-index', {...source, workers: 'solo'}).won, true);
});
test('persistent business key replay stops duplicate side effects; merely keeping call IDs does not', () => {
  const source = solutions['sealed-workshop'];
  assert.equal(runArchitecture('sealed-workshop', source).world.quantity, 1);
  assert.equal(runArchitecture('sealed-workshop', {...source, storage: 'call-id'}).world.quantity, 2);
  assert.equal(runArchitecture('sealed-workshop', {...source, storage: 'ram'}).world.quantity, 2);
  assert.equal(runArchitecture('sealed-workshop', {...source, extension: 'inline'}).world.gateOpen, true);
  assert.equal(runArchitecture('sealed-workshop', {...source, provider: 'fixed'}).world.quantity, 0);
  assert.equal(runArchitecture('sealed-workshop', {...source, approval: 'auto'}).won, false);
});
test('all 126 finite configurations obey admission and acceptance bounds; successes require observable verification', () => {
  let count = 0;
  for (const mission of ARCHITECTURE_MISSIONS) for (const build of enumerate(mission)) {
    count++;const result = runArchitecture(mission.id, build);
    assert.equal(result.valid, true);
    if (result.won) {assert.ok(result.cost <= mission.budget);assert.equal(build.verification, 'world');assert.equal(result.events.at(-1)?.okay, true);}
    if (result.cost > mission.budget) {assert.deepEqual(result.world, {});assert.equal(result.won, false);}
  }
  assert.equal(count, 24 + 54 + 48);
});

test('later practice cannot evict earlier completed deliveries or alias caller configurations', () => {
  const attempts = [...Object.entries(solutions).map(([missionId, build]) => ({missionId, build})), ...Array.from({length: 50}, () => ({missionId: 'two-shores', build: defaultArchitectureBuild(ARCHITECTURE_MISSIONS[0])}))];
  const retained = retainArchitectureAttempts(attempts);
  assert.equal(retained.length, 30);
  assert.equal(new Set(retained.filter(item => runArchitecture(item.missionId, item.build).won).map(item => item.missionId)).size, 3);
  retained[0].build.queue = 'parallel';
  assert.equal(solutions['two-shores'].queue, 'serial');
});
