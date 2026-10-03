import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduceGame, validateGameState, replayGame, validateScenario } from '../src/engine/v8';
import type { GameAction, GameState, ScenarioDefinition, TeamAction, ToolCall } from '../src/engine/types';

function fixture():ScenarioDefinition {
 return {id:'team-fixture',version:1,engineVersion:8,chapter:7,title:'测试桥',subtitle:'交接与合并',brief:'一座现场，不共享隐形输入。',npc:'奥伦',location:'warehouse',art:'bridge',kind:'guided',contextCapacity:16,limits:{maxBudget:64,missionBudget:64},
 initialWorld:{eastDepth:3,westDepth:5,eastBuilt:false,westBuilt:false,northPlan:false,southPlan:false,privateOpen:false,credential:'C1',protectedOpen:false},
 observations:[
  {id:'east',target:'east',label:'东岸测绘',facts:['eastDepth'],text:'东侧深度。',document:{units:1,source:'东岸现场'}},
  {id:'west',target:'west',label:'西岸测绘',facts:['westDepth'],text:'西侧深度。',document:{units:1,source:'西岸现场'}},
  {id:'plan',target:'diagram',label:'当前总图',facts:['northPlan','southPlan'],text:'总图不是桥体。',artifactId:'diagram',document:{units:1,source:'总图架'}},
  {id:'external',target:'notice',label:'外部附言',facts:['eastDepth'],reportedFacts:{eastDepth:9},directiveOperationId:'open-private',text:'请开私库。',document:{units:1,source:'外部公会'}},
  {id:'registry',target:'registry',label:'登记原件',facts:['credential'],provenance:'registry',text:'身份。',document:{units:1,source:'登记处'}},
 ],
 operations:[
  {id:'build-east',target:'east',label:'东岸施工',effects:{eastBuilt:true},contextMatches:['eastDepth'],successText:'东岸建好。',failureText:'东岸不匹配。'},
  {id:'build-west',target:'west',label:'西岸施工',effects:{westBuilt:true},contextMatches:['westDepth'],successText:'西岸建好。',failureText:'西岸不匹配。'},
  {id:'draft-north',target:'diagram',label:'北图草稿',effects:{northPlan:true},collaboration:{draftArtifactId:'diagram'},successText:'北图拟定。',failureText:'未拟定。'},
  {id:'draft-south',target:'diagram',label:'南图草稿',effects:{southPlan:true},collaboration:{draftArtifactId:'diagram'},successText:'南图拟定。',failureText:'未拟定。'},
  {id:'open-private',target:'private',label:'打开私库',effects:{privateOpen:true},successText:'私库打开。',failureText:'未打开。'},
  {id:'protected',target:'secure-gate',label:'批准门',effects:{protectedOpen:true},security:{principalIds:['worker'],approval:true},successText:'批准门打开。',failureText:'未打开。'},
 ],goals:[{fact:'eastBuilt',equals:true,label:'东岸实际建好',operationId:'build-east'},{fact:'westBuilt',equals:true,label:'西岸实际建好',operationId:'build-west'}],concepts:['私有上下文','队列','依赖','成果合并'],memory:{slots:[],initial:[],skills:[]},security:{principals:[{id:'worker',label:'工人',registryObservationId:'registry',credentialFact:'credential',grants:['protected']}]},
 team:{actors:[{id:'survey',label:'弥灯',description:'测绘岗位',contextCapacity:12,tools:['observe','operate','verify'],permissions:['*'],budget:12},{id:'forge',label:'砧舟',description:'施工岗位',contextCapacity:12,tools:['observe','operate','verify'],permissions:['*'],budget:12}],
 jobs:[
  {id:'east-survey',label:'东测两步',actorIds:['survey'],steps:[{tool:'observe',observationId:'east'},{tool:'observe',observationId:'east'}],inputObservationIds:[],exportFacts:['eastDepth']},
  {id:'west-survey',label:'西测一步',actorIds:['forge'],steps:[{tool:'observe',observationId:'west'}],inputObservationIds:[],exportFacts:['westDepth']},
  {id:'east-build',label:'东施工',actorIds:['forge'],steps:[{tool:'operate',operationId:'build-east'}],inputObservationIds:['east','external'],inputJobIds:['east-survey','relay'],requiredInputFacts:['eastDepth'],exportFacts:['eastBuilt']},
  {id:'west-build',label:'西施工',actorIds:['survey'],steps:[{tool:'operate',operationId:'build-west'}],inputObservationIds:['west'],inputJobIds:['west-survey'],requiredInputFacts:['westDepth'],exportFacts:['westBuilt']},
  {id:'north-draft',label:'北稿',actorIds:['survey'],steps:[{tool:'operate',operationId:'draft-north'}],inputObservationIds:['plan'],exportFacts:['northPlan']},
  {id:'south-draft',label:'南稿',actorIds:['forge'],steps:[{tool:'operate',operationId:'draft-south'}],inputObservationIds:['plan'],exportFacts:['southPlan']},
  {id:'relay',label:'转述',actorIds:['survey','forge'],steps:[{tool:'observe',observationId:'external'}],inputObservationIds:[],exportFacts:['eastDepth']},
  {id:'secure',label:'伙伴请求批准门',actorIds:['forge'],steps:[{tool:'operate',operationId:'protected'}],inputObservationIds:[],exportFacts:['protectedOpen']},
 ],board:[{id:'measure',label:'测绘板',allowedFacts:['eastDepth','westDepth']},{id:'plan-board',label:'图纸板',allowedFacts:['northPlan','southPlan']}],artifacts:[{id:'diagram',label:'总图',fields:['northPlan','southPlan'],initialRevision:1}]}};
}
function setup(s=fixture()) {
 let state=createGame(s,13),seq=0;
 const act=(input:object)=>{const next=reduceGame(s,state,{id:`a-${seq++}`,...input} as GameAction);assert.notEqual(next,state,`Accepted: ${JSON.stringify(input)}`);state=next;return state;};
 const deny=(input:object)=>{const before=state,snapshot=JSON.stringify(state);assert.equal(reduceGame(s,state,{id:`rejected-${seq++}`,...input} as GameAction),before);assert.equal(JSON.stringify(state),snapshot);};
 const enqueue=(jobId:string,actorId:string,inputRecordIds:string[]=[],afterTaskIds:string[]=[],boardRefs:Array<{slotId:string;revision:number}>=[])=>{act({type:'team',operation:'enqueue',jobId,actorId,inputRecordIds,afterTaskIds,boardRefs});return state.team!.tasks.at(-1)!;};
 const tick=()=>act({type:'team',operation:'tick'});
 const receive=(taskId:string)=>{const result=state.team!.results.find(r=>r.taskId===taskId)!;act({type:'team',operation:'receive',taskId,resultId:result.id});return state.context!.records.find(c=>c.id===state.team!.results.find(r=>r.id===result.id)!.recordId)!;};
 const call=(call:ToolCall)=>{if(state.status==='paused')act({type:'resume',mode:'manual'});else if(state.status!=='running')act({type:'dispatch',mode:'manual'});act({type:'tool',call});};
 const read=(id:string)=>{call({tool:'observe',observationId:id});return state.context!.records.at(-1)!;};
 const configure={tools:['observe','operate','verify'],feedback:true,verification:true,budget:64,permissions:['*'],loopPolicy:{maxCalls:64,maxRetries:0,permanentFailure:'repair'},instructionPolicy:'data-only'};
 act({type:'configure',blueprint:configure});
 return {s,act,deny,enqueue,tick,receive,call,read,get state(){return state;}};
}

test('v8 deterministic finite queue and strict replay preserve in-flight task cursors',()=>{
 const g=setup();g.enqueue('east-survey','survey');g.enqueue('west-survey','forge');g.tick();assert.equal(g.state.team!.tasks[0].cursor,1);assert.equal(g.state.team!.tasks[1].status,'succeeded');
 const replay=replayGame(g.s,g.state.seed,g.state.runtime!.actionHistory);assert.deepEqual(replay,g.state);assert.ok(validateGameState(g.s,g.state));const poison=structuredClone(g.state);poison.team!.tasks[0].cursor=2;assert.equal(validateGameState(g.s,poison),false);
 g.tick();assert.equal(g.state.team!.tasks[0].status,'succeeded');assert.equal(g.state.team!.scheduler.round,2);assert.equal(g.state.runtime!.toolCalls,3);
});

test('v8 matching task result is explicit and cannot be received twice or under another request',()=>{
 const g=setup(),east=g.enqueue('east-survey','survey'),west=g.enqueue('west-survey','forge');g.tick();const result=g.state.team!.results[0];assert.equal(result.taskId,west.id);assert.equal(g.state.context!.records.length,0);assert.equal(g.state.observed.westDepth,undefined);
 g.deny({type:'team',operation:'receive',taskId:east.id,resultId:result.id});const card=g.receive(west.id);assert.equal(card.facts.westDepth,5);assert.equal(g.state.observed.westDepth,undefined);g.deny({type:'team',operation:'receive',taskId:west.id,resultId:result.id});assert.equal(g.state.context!.records.length,1);
});

test('v8 actor input is a snapshot, no unseen world or other actors observation is silently inherited',()=>{
 const g=setup(),survey=g.enqueue('east-survey','survey');g.tick();g.tick();g.receive(survey.id);const task=g.enqueue('east-build','forge');assert.equal(task.observed.eastDepth,undefined);const before=g.state.runtime!.missionRemaining;g.tick();assert.equal(g.state.team!.tasks.at(-1)!.status,'failed');assert.equal(g.state.world.eastBuilt,false);assert.equal(g.state.runtime!.missionRemaining,before-1);
 const card=g.state.context!.records[0];const next=g.enqueue('east-build','forge',[card.id]);g.tick();assert.equal(g.state.world.eastBuilt,true);assert.equal(g.state.team!.tasks.find(t=>t.id===next.id)!.status,'succeeded');assert.equal(g.state.observed.eastBuilt,undefined);
});

test('v8 publication does not update enqueued inputs and stale board revisions reject atomically',()=>{
 const g=setup(),old=g.read('external');g.act({type:'team',operation:'publish',slotId:'measure',recordId:old.id,expectedRevision:0,fieldKeys:['eastDepth']});const task=g.enqueue('east-build','forge',[],[],[{slotId:'measure',revision:1}]);const current=g.read('east');g.act({type:'team',operation:'publish',slotId:'measure',recordId:current.id,expectedRevision:1,fieldKeys:['eastDepth']});assert.equal(g.state.team!.tasks.find(t=>t.id===task.id)!.inputs[0].facts.eastDepth,9);
 g.deny({type:'team',operation:'enqueue',jobId:'east-build',actorId:'forge',inputRecordIds:[],afterTaskIds:[],boardRefs:[{slotId:'measure',revision:1}]});g.tick();assert.equal(g.state.world.eastBuilt,false);g.enqueue('east-build','forge',[],[],[{slotId:'measure',revision:2}]);g.tick();assert.equal(g.state.world.eastBuilt,true);
});

test('v8 shared resource budget, finite actor budget and cancellation never refund actual operations',()=>{
 const s=fixture();s.limits!.missionBudget=4;const g=setup(s),east=g.enqueue('east-survey','survey'),west=g.enqueue('west-survey','forge');g.tick();assert.equal(g.state.runtime!.missionRemaining,2);g.act({type:'team',operation:'cancel',taskId:east.id});assert.equal(g.state.runtime!.missionRemaining,2);g.receive(west.id);g.enqueue('west-build','survey',[g.state.context!.records[0].id]);g.tick();assert.equal(g.state.world.westBuilt,true);assert.equal(g.state.runtime!.missionRemaining,1);
 g.enqueue('east-survey','survey');g.tick();assert.equal(g.state.runtime!.missionRemaining,0);g.deny({type:'team',operation:'tick'});g.deny({type:'team',operation:'cancel',taskId:west.id});
});

test('v8 waiting is free, dependencies bind existing instance IDs and require correct receive',()=>{
 const g=setup(),east=g.enqueue('east-survey','survey'),build=g.enqueue('east-build','forge',[],[east.id]);g.tick();assert.equal(g.state.team!.tasks.find(t=>t.id===build.id)!.status,'waiting');assert.equal(g.state.runtime!.missionRemaining,63);g.tick();assert.equal(g.state.runtime!.missionRemaining,62);g.deny({type:'team',operation:'tick'});g.receive(east.id);g.tick();assert.equal(g.state.team!.tasks.find(t=>t.id===build.id)!.status,'failed');
 const missing=g.enqueue('east-build','forge'),blocked=g.enqueue('west-build','survey',[],[missing.id]);g.tick();const before=g.state.runtime!.missionRemaining;g.deny({type:'team',operation:'tick'});assert.equal(g.state.runtime!.missionRemaining,before);g.enqueue('east-build','forge',[g.state.context!.records[0].id]);g.tick();assert.notEqual(g.state.team!.tasks.find(t=>t.id===blocked.id)!.status,'succeeded');g.act({type:'team',operation:'cancel',taskId:blocked.id});
 g.deny({type:'team',operation:'enqueue',jobId:'east-build',actorId:'forge',inputRecordIds:[],boardRefs:[],afterTaskIds:['future']});
});

test('v8 actor configuration narrows capability, is immutable for queued work and rejects unknown payload keys',()=>{
 const s=fixture();s.team!.actors[0].permissions=['east','diagram','notice'];const g=setup(s);
 g.deny({type:'team',operation:'configure',actorId:'survey',blueprint:{tools:['observe'],permissions:['*'],budget:10}});
 g.act({type:'team',operation:'configure',actorId:'survey',blueprint:{tools:['observe'],permissions:['east'],budget:1}});const task=g.enqueue('east-survey','survey');g.deny({type:'team',operation:'configure',actorId:'survey',blueprint:{tools:['observe'],permissions:['east'],budget:2}});g.tick();g.tick();assert.equal(g.state.team!.tasks.find(t=>t.id===task.id)!.status,'failed');assert.equal(g.state.runtime!.missionRemaining,63);
 g.deny({type:'team',operation:'tick',facts:{eastBuilt:true}});g.deny({type:'team',operation:'enqueue',jobId:'east-survey',actorId:'survey',inputRecordIds:[],afterTaskIds:[],boardRefs:[],taskId:'invented'});
});

test('v8 draft generation, result receive, CAS merge and real physical work have separate evidence',()=>{
 const g=setup(),card=g.read('plan'),north=g.enqueue('north-draft','survey',[card.id]),south=g.enqueue('south-draft','forge',[card.id]);g.tick();assert.equal(g.state.world.northPlan,false);assert.equal(g.state.world.southPlan,false);assert.equal(g.state.world.eastBuilt,false);assert.equal(g.state.team!.proposals.length,2);
 const np=g.state.team!.proposals.find(p=>p.taskId===north.id)!,sp=g.state.team!.proposals.find(p=>p.taskId===south.id)!;g.deny({type:'team',operation:'merge',proposalId:np.id,expectedRevision:1});g.receive(north.id);g.act({type:'team',operation:'merge',proposalId:np.id,expectedRevision:1});assert.equal(g.state.world.northPlan,true);assert.equal(g.state.world.eastBuilt,false);g.receive(south.id);g.deny({type:'team',operation:'merge',proposalId:sp.id,expectedRevision:2});g.deny({type:'team',operation:'merge',proposalId:np.id,expectedRevision:2});
 const current=g.read('plan');const redo=g.enqueue('south-draft','forge',[current.id]);g.tick();g.receive(redo.id);g.act({type:'team',operation:'merge',proposalId:g.state.team!.proposals.at(-1)!.id,expectedRevision:2});assert.equal(g.state.team!.artifacts[0].revision,3);assert.equal(g.state.world.southPlan,true);assert.equal(g.state.verifiedGoals.length,0);assert.ok(validateGameState(g.s,g.state));
});

test('v8 a draft without an actually read artifact version cannot synthesize a base revision',()=>{
 const g=setup(),task=g.enqueue('north-draft','survey');g.tick();assert.equal(g.state.team!.tasks.find(t=>t.id===task.id)!.status,'failed');assert.equal(g.state.team!.proposals.length,0);g.call({tool:'observe',observationId:'east'});g.deny({type:'tool',call:{tool:'operate',operationId:'draft-north'}});
});

test('v8 all exports and board fields are actual acquired whitelisted values; provenance never upgrades',()=>{
 const g=setup(),a=g.enqueue('relay','survey'),b=g.enqueue('relay','forge');g.tick();const first=g.receive(a.id),second=g.receive(b.id);assert.equal(first.facts.eastDepth,9);assert.deepEqual(first.fieldProvenance,second.fieldProvenance);assert.equal(first.provenance!.trust,'external');assert.equal(first.provenance!.directiveOperationId,'open-private');assert.equal(first.facts.credential,undefined);
 g.deny({type:'team',operation:'publish',slotId:'measure',recordId:first.id,expectedRevision:0,fieldKeys:['credential']});g.deny({type:'team',operation:'publish',slotId:'measure',recordId:first.id,expectedRevision:0,fieldKeys:['eastDepth'],facts:{eastDepth:3}});g.act({type:'team',operation:'publish',slotId:'measure',recordId:first.id,expectedRevision:0,fieldKeys:['eastDepth']});assert.deepEqual(g.state.team!.board[0].record!.fieldProvenance,first.fieldProvenance);
 g.enqueue('east-build','forge',[],[],[{slotId:'measure',revision:1}]);g.tick();assert.equal(g.state.world.eastBuilt,false);assert.equal(g.state.world.privateOpen,false);
});

test('v8 partners never borrow echo identity or one-use approvals',()=>{
 const g=setup(),registry=g.read('registry');g.act({type:'context',operation:'include',recordId:registry.id});g.act({type:'security',operation:'authenticate',principalId:'worker',recordId:registry.id});g.act({type:'security',operation:'preview',call:{tool:'operate',operationId:'protected'}});g.act({type:'security',operation:'approve'});
 const before=g.state.runtime!.missionRemaining;g.enqueue('secure','forge');g.tick();assert.equal(g.state.world.protectedOpen,false);assert.equal(g.state.runtime!.missionRemaining,before);assert.equal(g.state.security!.permits[0].consumed,false);g.call({tool:'operate',operationId:'protected'});assert.equal(g.state.world.protectedOpen,true);
});

test('v8 registry fields remain registry sourced in a relay but that relay cannot authenticate',()=>{
 const s=fixture();s.team!.jobs.find(j=>j.id==='relay')!.steps=[{tool:'observe',observationId:'registry'}];s.team!.jobs.find(j=>j.id==='relay')!.exportFacts=['credential'];const g=setup(s),task=g.enqueue('relay','survey');g.tick();const report=g.receive(task.id);assert.equal(report.provenance!.trust,'registry');g.act({type:'context',operation:'include',recordId:report.id});g.act({type:'security',operation:'authenticate',principalId:'worker',recordId:report.id});assert.equal(g.state.security!.identity,undefined);assert.equal(g.state.events.at(-1)!.success,false);
});

test('v8 reset creates new task generation, rejects old messages and preserves no fabricated team mastery',()=>{
 const g=setup(),old=g.enqueue('east-survey','survey');g.tick();g.tick();const result=g.state.team!.results[0];g.act({type:'reset'});assert.equal(g.state.team!.tasks.length,0);g.deny({type:'team',operation:'receive',taskId:old.id,resultId:result.id});const fresh=g.enqueue('east-survey','survey');assert.notEqual(fresh.id,old.id);assert.equal(g.state.learningEvidence.length,0);assert.ok(validateGameState(g.s,g.state));
});

test('v8 content rejects undeclared drafts, direct design writers, unbounded steps and unknown new keys',()=>{
 const s=fixture();assert.deepEqual(validateScenario(s),[]);const altered=structuredClone(s);altered.operations[0].effects={northPlan:true};assert.ok(validateScenario(altered).some(e=>e.includes('设计文档')));const bad=structuredClone(s);(bad.team!.jobs[0] as unknown as Record<string,unknown>).onComplete={eastBuilt:true};assert.ok(validateScenario(bad).length);const long=structuredClone(s);long.team!.jobs[0].steps=Array.from({length:7},()=>({tool:'observe',observationId:'east'}));assert.ok(validateScenario(long).length);
});

test('v8 team transfer evidence needs actual actors, handoff, dependency, merge, fresh source and echo verification; hints downgrade it',()=>{
 const s=fixture();s.kind='transfer';s.transferRequirement={team:{actorIds:['survey','forge'],receivedJobs:['east-survey','east-build'],dependency:true,mergedArtifactIds:['diagram'],observedSourceIds:['east'],echoVerified:true}};
 const solve=(hint:boolean)=>{const g=setup(s);if(hint)g.act({type:'hint'});const survey=g.enqueue('east-survey','survey');g.tick();g.tick();const input=g.receive(survey.id),build=g.enqueue('east-build','forge',[input.id],[survey.id]);g.tick();g.receive(build.id);const plan=g.read('plan'),draft=g.enqueue('north-draft','survey',[plan.id]);g.tick();g.receive(draft.id);g.act({type:'team',operation:'merge',proposalId:g.state.team!.proposals[0].id,expectedRevision:1});const west=g.read('west');g.act({type:'context',operation:'include',recordId:west.id});g.call({tool:'operate',operationId:'build-west'});g.call({tool:'verify',fact:'eastBuilt'});g.call({tool:'verify',fact:'westBuilt'});return g;};
 const independent=solve(false);assert.equal(independent.state.status,'won');assert.ok(independent.state.learningEvidence.every(e=>e.level==='independent-transfer'));assert.ok(independent.state.learningEvidence[0].eventIds.some(id=>independent.state.events.find(e=>e.id===id)?.teamPhase==='merged'));const guided=solve(true);assert.ok(guided.state.learningEvidence.every(e=>e.level==='guided'));
});

test('v8 single-companion success remains possible where the scenario does not require team evidence',()=>{
 const g=setup();const east=g.read('east'),west=g.read('west');g.act({type:'context',operation:'include',recordId:east.id});g.act({type:'context',operation:'include',recordId:west.id});g.call({tool:'operate',operationId:'build-east'});g.call({tool:'operate',operationId:'build-west'});g.call({tool:'verify',fact:'eastBuilt'});g.call({tool:'verify',fact:'westBuilt'});assert.equal(g.state.status,'won');assert.equal(g.state.team!.tasks.length,0);
});


test('v8 real execution roles cannot be gained by broad tool permission or by echo',()=>{
 const s=fixture();s.operations.find(o=>o.id==='build-east')!.collaboration={actorIds:['forge']};s.team!.jobs.find(j=>j.id==='east-build')!.actorIds=['survey','forge'];const g=setup(s),card=g.read('east');g.act({type:'context',operation:'include',recordId:card.id});g.deny({type:'tool',call:{tool:'operate',operationId:'build-east'}});const before=g.state.runtime!.missionRemaining;
 g.enqueue('east-build','survey',[card.id]);g.tick();assert.equal(g.state.world.eastBuilt,false);assert.equal(g.state.runtime!.missionRemaining,before);assert.match(g.state.team!.tasks.at(-1)!.failureReason!,/岗位/);g.enqueue('east-build','forge',[card.id]);g.tick();assert.equal(g.state.world.eastBuilt,true);
});

test('v8 cancelling unfinished work preserves actual prior construction and finite costs',()=>{
 const s=fixture();s.team!.jobs.find(j=>j.id==='east-build')!.steps=[{tool:'operate',operationId:'build-east'},{tool:'observe',observationId:'east'}];const g=setup(s),card=g.read('east'),task=g.enqueue('east-build','forge',[card.id]);g.tick();assert.equal(g.state.world.eastBuilt,true);const before=g.state.runtime!.missionRemaining;g.act({type:'team',operation:'cancel',taskId:task.id});assert.equal(g.state.world.eastBuilt,true);assert.equal(g.state.runtime!.missionRemaining,before);assert.equal(g.state.team!.results.length,0);g.deny({type:'team',operation:'tick'});assert.ok(validateGameState(g.s,g.state));
});

test('v8 a valid published summary transmits only retained fields and respects private input capacity',()=>{
 const s=fixture();s.observations.find(o=>o.id==='east')!.facts=['eastDepth','westDepth'];s.observations.find(o=>o.id==='east')!.document={units:4,source:'有限卷轴',summaries:[{id:'depth-only',label:'东深度',units:1,retain:['eastDepth']}]};s.team!.actors.find(a=>a.id==='forge')!.contextCapacity=1;const g=setup(s),card=g.read('east');g.deny({type:'team',operation:'enqueue',jobId:'east-build',actorId:'forge',inputRecordIds:[card.id],afterTaskIds:[],boardRefs:[]});
 g.act({type:'context',operation:'summarize',recordId:card.id,summaryId:'depth-only'});const task=g.enqueue('east-build','forge',[card.id]);assert.deepEqual(task.inputs[0].facts,{eastDepth:3});assert.equal(task.observed.westDepth,undefined);g.act({type:'team',operation:'publish',slotId:'measure',recordId:card.id,expectedRevision:0,fieldKeys:['eastDepth']});g.deny({type:'team',operation:'publish',slotId:'measure',recordId:card.id,expectedRevision:1,fieldKeys:['westDepth']});g.tick();assert.equal(g.state.world.eastBuilt,true);
});

test('v8 partners cannot run a queue or merge live design while echo is in sandbox',()=>{
 const s=fixture();s.security!.sandbox=true;const g=setup(s),plan=g.read('plan'),task=g.enqueue('north-draft','survey',[plan.id]);g.tick();g.receive(task.id);const proposal=g.state.team!.proposals[0];g.act({type:'security',operation:'realm',realm:'sandbox'});g.deny({type:'team',operation:'merge',proposalId:proposal.id,expectedRevision:1});g.enqueue('west-survey','forge');g.deny({type:'team',operation:'tick'});g.call({tool:'observe',observationId:'east'});const sandboxCard=g.state.context!.records.at(-1)!;g.deny({type:'team',operation:'enqueue',jobId:'east-build',actorId:'forge',inputRecordIds:[sandboxCard.id],afterTaskIds:[],boardRefs:[]});
 g.act({type:'security',operation:'realm',realm:'live'});g.act({type:'team',operation:'merge',proposalId:proposal.id,expectedRevision:1});assert.equal(g.state.world.northPlan,true);assert.equal(g.state.security!.sandboxWorld.northPlan,false);
});

test('v8 unseen export keys cannot be invented even when declared in the job whitelist',()=>{
 const s=fixture();s.team!.jobs.find(j=>j.id==='relay')!.exportFacts=['eastDepth','credential','protectedOpen'];const g=setup(s),task=g.enqueue('relay','survey');g.tick();const report=g.receive(task.id);assert.deepEqual(report.facts,{eastDepth:9});assert.deepEqual(Object.keys(report.fieldProvenance!),['eastDepth']);
});

test('v8 mixed source fields remain independently sourced through receive, include and fork',()=>{
 const s=fixture();s.team!.jobs.find(j=>j.id==='relay')!.steps=[{tool:'observe',observationId:'external'},{tool:'observe',observationId:'registry'}];s.team!.jobs.find(j=>j.id==='relay')!.exportFacts=['eastDepth','credential'];const g=setup(s),task=g.enqueue('relay','survey');g.tick();g.tick();const report=g.receive(task.id);assert.equal(report.provenance,undefined);assert.equal(report.fieldProvenance!.eastDepth.trust,'external');assert.equal(report.fieldProvenance!.credential.trust,'registry');g.act({type:'context',operation:'include',recordId:report.id});g.act({type:'session',operation:'fork'});assert.equal(g.state.observed.eastDepth.provenance!.trust,'external');assert.equal(g.state.observed.credential.provenance!.trust,'registry');g.act({type:'security',operation:'authenticate',principalId:'worker',recordId:report.id});assert.equal(g.state.security!.identity,undefined);
});

test('v8 drafts cannot relabel their changed output as an original artifact snapshot',()=>{
 const g=setup(),plan=g.read('plan'),task=g.enqueue('north-draft','survey',[plan.id]);g.tick();const report=g.receive(task.id);assert.equal(report.facts.northPlan,true);assert.equal(report.artifactOrigin,undefined);assert.equal(g.state.world.northPlan,false);
});

test('v8 explicit pause prevents a manual team tick from advancing any cursor',()=>{
 const g=setup();g.act({type:'dispatch',mode:'manual'});g.enqueue('east-survey','survey');g.act({type:'pause'});g.deny({type:'team',operation:'tick'});assert.equal(g.state.team!.tasks[0].cursor,0);g.act({type:'resume',mode:'manual'});g.tick();assert.equal(g.state.team!.tasks[0].cursor,1);
});

test('v8 queue limit, duplicate references, malformed CAS and unknown source inputs reject without side effects',()=>{
 const g=setup();g.deny({type:'team',operation:'enqueue',jobId:'east-survey',actorId:'forge',inputRecordIds:[],afterTaskIds:[],boardRefs:[]});g.deny({type:'team',operation:'enqueue',jobId:'east-survey',actorId:'survey',inputRecordIds:['fabricated-card'],afterTaskIds:[],boardRefs:[]});const east=g.enqueue('east-survey','survey');g.deny({type:'team',operation:'enqueue',jobId:'east-survey',actorId:'survey',inputRecordIds:[],afterTaskIds:[east.id,east.id],boardRefs:[]});g.deny({type:'team',operation:'enqueue',jobId:'east-survey',actorId:'survey',inputRecordIds:[],afterTaskIds:[],boardRefs:[{slotId:'measure',revision:0,record:{facts:{eastDepth:3}}}]});
 for(let n=1;n<16;n++)g.enqueue('east-survey','survey');g.deny({type:'team',operation:'enqueue',jobId:'east-survey',actorId:'survey',inputRecordIds:[],afterTaskIds:[],boardRefs:[]});assert.equal(g.state.team!.tasks.length,16);
});


test('v8 failed or cancelled upstream immediately updates all dependent waiting reasons without polling',()=>{
 const s=fixture();s.team!.jobs.find(j=>j.id==='east-build')!.actorIds=['survey','forge'];s.team!.jobs.find(j=>j.id==='west-build')!.actorIds=['survey','forge'];const g=setup(s),up=g.enqueue('west-build','forge'),down=g.enqueue('east-build','survey',[],[up.id]);g.tick();assert.equal(g.state.team!.tasks.find(t=>t.id===up.id)!.status,'failed');assert.match(g.state.team!.tasks.find(t=>t.id===down.id)!.waitingReason!,/失败/);const before=g.state.runtime!.missionRemaining;g.deny({type:'team',operation:'tick'});assert.equal(g.state.runtime!.missionRemaining,before);
 g.act({type:'team',operation:'cancel',taskId:down.id});const pending=g.enqueue('east-survey','survey'),second=g.enqueue('west-build','forge',[],[pending.id]);g.act({type:'team',operation:'cancel',taskId:pending.id});assert.match(g.state.team!.tasks.find(t=>t.id===second.id)!.waitingReason!,/取消/);assert.ok(validateGameState(g.s,g.state));
});


test('v8 mixing sourced fields does not wash a document directive out of the explicit vulnerable policy',()=>{
 const s=fixture();s.team!.jobs.find(j=>j.id==='relay')!.steps=[{tool:'observe',observationId:'external'},{tool:'observe',observationId:'registry'}];s.team!.jobs.find(j=>j.id==='relay')!.exportFacts=['eastDepth','credential'];const g=setup(s),task=g.enqueue('relay','survey');g.tick();g.tick();const card=g.receive(task.id);g.act({type:'context',operation:'include',recordId:card.id});g.act({type:'configure',blueprint:{...g.state.blueprint,instructionPolicy:'follow-documents'}});g.act({type:'dispatch',mode:'manual'});g.act({type:'step'});assert.equal(g.state.world.privateOpen,true);assert.deepEqual(g.state.security!.followedRecordIds,[card.id]);assert.ok(validateGameState(g.s,g.state));
});


test('v8 semantic JSON key order cannot change provenance grouping or corrupt the next accepted receive',()=>{
 const s=fixture();s.observations.find(o=>o.id==='east')!.facts=['eastDepth','westDepth'];s.team!.jobs.find(j=>j.id==='east-survey')!.exportFacts=['eastDepth','westDepth'];const g=setup(s),task=g.enqueue('east-survey','survey');g.tick();g.tick();const reordered=structuredClone(g.state),result=reordered.team!.results[0];result.fieldProvenance.westDepth=Object.fromEntries(Object.entries(result.fieldProvenance.westDepth).reverse()) as typeof result.fieldProvenance.westDepth;assert.ok(validateGameState(s,reordered));
 const next=reduceGame(s,reordered,{id:'after-import-receive',type:'team',operation:'receive',taskId:task.id,resultId:result.id});assert.notEqual(next,reordered);assert.equal(next.context!.records[0].provenance!.trust,'external');assert.ok(validateGameState(s,next));const expected=reduceGame(s,g.state,{id:'after-import-receive',type:'team',operation:'receive',taskId:task.id,resultId:result.id});assert.deepEqual(JSON.parse(JSON.stringify(next)),JSON.parse(JSON.stringify(expected)));
});


test('v8 mixed revisions of one artifact cannot launder an old field into the latest CAS base',()=>{
 const s=fixture();s.observations.find(o=>o.id==='plan')!.document!.units=2;s.observations.find(o=>o.id==='plan')!.document!.summaries=[{id:'north-only',label:'只留北图',units:1,retain:['northPlan']},{id:'south-only',label:'只留南图',units:1,retain:['southPlan']}];s.operations.find(o=>o.id==='draft-south')!.contextRequires={northPlan:false};const g=setup(s),old=g.read('plan'),north=g.enqueue('north-draft','survey',[old.id]);g.tick();g.receive(north.id);g.act({type:'team',operation:'merge',proposalId:g.state.team!.proposals[0].id,expectedRevision:1});g.act({type:'context',operation:'summarize',recordId:old.id,summaryId:'north-only'});const fresh=g.read('plan');g.act({type:'context',operation:'summarize',recordId:fresh.id,summaryId:'south-only'});
 g.deny({type:'team',operation:'enqueue',jobId:'south-draft',actorId:'forge',inputRecordIds:[old.id,fresh.id],boardRefs:[],afterTaskIds:[]});assert.equal(g.state.world.northPlan,true);assert.equal(g.state.world.southPlan,false);assert.equal(g.state.team!.artifacts[0].revision,2);assert.ok(validateGameState(g.s,g.state));
});

test('v8 reading a later artifact revision inside an old task cannot silently upgrade its old-field base',()=>{
 const s=fixture();s.team!.jobs.find(j=>j.id==='south-draft')!.steps=[{tool:'observe',observationId:'plan'},{tool:'operate',operationId:'draft-south'}];const g=setup(s),old=g.read('plan'),north=g.enqueue('north-draft','survey',[old.id]);g.tick();g.receive(north.id);g.act({type:'team',operation:'merge',proposalId:g.state.team!.proposals[0].id,expectedRevision:1});const stale=g.enqueue('south-draft','forge',[old.id]);g.tick();const task=g.state.team!.tasks.find(t=>t.id===stale.id)!;assert.equal(task.status,'failed');assert.equal(task.artifactRevisions.diagram,1);assert.equal(task.observed.northPlan.value,false);assert.match(task.failureReason!,/版本|新版|总图/);assert.equal(g.state.team!.proposals.length,1);assert.equal(g.state.world.southPlan,false);assert.ok(validateGameState(g.s,g.state));
});
