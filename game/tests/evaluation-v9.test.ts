import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, reduceGame, replayGame, validateGameState, validateScenario } from '../src/engine/v9';
import { currentCertificate, currentEvaluationSeal, evaluationGateDenial } from '../src/engine/evaluation';
import type { EvaluationCandidate, EvaluationRun } from '../src/engine/evaluation-contract';
import type { OperationDefinition, ToolCall } from '../src/engine/types';

type Scenario=Parameters<typeof createGame>[0];
const operate=(operationId:string)=>({call:{tool:'operate' as const,operationId}});
const observe=(observationId:string)=>({call:{tool:'observe' as const,observationId}});
function candidate(id:string,steps:EvaluationCandidate['steps']):EvaluationCandidate{return {id,label:id,description:'有限真实工具策略',steps,tools:['observe','operate','verify'],permissions:['*']};}
function fixture():Scenario {
 const accepted={id:'accept',target:'council',label:'现场正式交付',requires:{handled:true,privacyIntact:true},effects:{cityAccepted:true},evaluationRequires:true,successText:'现场交付。',failureText:'现场未完成。'} as OperationDefinition&{evaluationRequires:boolean};
 return {id:'evaluation-fixture',version:1,engineVersion:9 as Scenario['engineVersion'],chapter:8,title:'镜面试验台',subtitle:'报告与现场',brief:'证据来自真实工具。',npc:'阿芙',location:'warehouse',art:'court',kind:'guided',contextCapacity:12,limits:{maxBudget:64,missionBudget:128},
 initialWorld:{controller:'unconfigured',boxLight:true,scaleAvailable:true,handled:false,privacyIntact:true,stampIssued:false,cityAccepted:false,meterAvailable:true,credential:'C1',secureOpen:false,hookFired:false},
 observations:[
  {id:'scale-status',target:'scale',label:'仪器状况',facts:['scaleAvailable'],text:'称重入口状态。',document:{units:1,source:'称重台'}},
  {id:'scale',target:'scale',label:'称重',facts:['boxLight'],availableWhen:{scaleAvailable:true},text:'真实重量。',document:{units:1,source:'称重台'}},
  {id:'outcome',target:'crate',label:'真实结果',facts:['handled','privacyIntact'],availableWhen:{meterAvailable:true},text:'实际接收与边界。',document:{units:1,source:'现场验收'}},
  {id:'stamp',target:'ledger',label:'展示计数',facts:['stampIssued'],reportedFacts:{stampIssued:true},text:'展示称已盖章，但它只证明显示字段。',document:{units:1,source:'展示栏'}},
  {id:'registry',target:'registry',label:'登记原件',facts:['credential'],provenance:'registry',text:'工人身份。',document:{units:1,source:'登记处'}},
 ],
 operations:[
  {id:'rush',target:'crate',label:'宽权限快运',requires:{boxLight:true},effects:{handled:true,privacyIntact:false,stampIssued:true},successText:'箱子收到了，门禁破坏了。',failureText:'重箱真实失败。',failureCost:2},
  {id:'safe-light',target:'crate',label:'轻箱安全搬运',requires:{boxLight:true},contextRequires:{boxLight:true},effects:{handled:true,privacyIntact:true},successText:'轻箱真实收下。',failureText:'轻箱工具不适用。'},
  {id:'safe-heavy',target:'crate',label:'重箱安全搬运',requires:{boxLight:false},contextRequires:{boxLight:false},effects:{handled:true,privacyIntact:true},successText:'重箱真实收下。',failureText:'重箱工具不适用。'},
  {id:'safe-hold',target:'crate',label:'受限交接',requires:{scaleAvailable:false},contextRequires:{scaleAvailable:false},effects:{handled:true,privacyIntact:true},successText:'明确缺少重量，受限交接而非声称搬完。',failureText:'交接前提未成立。'},
  {id:'secure',target:'secure-gate',label:'批准门',effects:{secureOpen:true},security:{principalIds:['worker'],approval:true},successText:'批准门打开。',failureText:'门未打开。'},accepted,
 ],goals:[{fact:'cityAccepted',equals:true,label:'现场真正交付',operationId:'accept'}],concepts:['真实验收','未知','案例覆盖'],memory:{slots:[],initial:[],skills:[]},security:{principals:[{id:'worker',label:'工人',registryObservationId:'registry',credentialFact:'credential',grants:['secure']}],sandbox:true},
 evaluation:{candidateFact:'controller',candidates:[
  candidate('fast',[operate('rush')]),
  candidate('aware',[observe('scale-status'),{...observe('scale'),whenKnown:{scaleAvailable:true}},{...operate('safe-light'),whenKnown:{boxLight:true}},{...operate('safe-heavy'),whenKnown:{boxLight:false}},{...operate('safe-hold'),whenKnown:{scaleAvailable:false}}]),
  candidate('blind',[{...operate('safe-heavy'),whenKnown:{boxLight:false}},{...operate('safe-light'),whenKnown:{boxLight:true}}]),
  candidate('guess',[operate('rush')]),
 ],cases:[
  {id:'light',label:'轻箱正常',description:'入口完整',initialOverrides:{boxLight:true},category:'normal'},
  {id:'heavy',label:'重箱边界',description:'同一策略面对重箱',initialOverrides:{boxLight:false},category:'boundary'},
  {id:'offscale',label:'称重失联',description:'不能假设重量',initialOverrides:{boxLight:false,scaleAvailable:false},category:'exception'},
  {id:'holdout',label:'封存重箱',description:'打开后不再未知',initialOverrides:{boxLight:false},category:'holdout'},
 ],metrics:[{id:'stamps',label:'展示盖章数',observationId:'stamp',fact:'stampIssued'},{id:'received',label:'实际接收',observationId:'outcome',fact:'handled'},{id:'privacy',label:'门禁保持',observationId:'outcome',fact:'privacyIntact'}],
 criteria:[{id:'stamped',label:'盖章',metricId:'stamps',equals:true},{id:'handled',label:'真正接收',metricId:'received',equals:true},{id:'private',label:'门禁未破坏',metricId:'privacy',equals:true}],gate:{caseIds:['light','heavy','offscale'],criterionIds:['handled','private'],requireAll:true}}};
}
function setup(s=fixture()) {
 let state=createGame(s,23),seq=0;
 const act=(input:object)=>{const next=reduceGame(s,state,{id:`a-${seq++}`,...input} as Parameters<typeof reduceGame>[2]);assert.notEqual(next,state,`Accepted: ${JSON.stringify(input)}`);state=next;return state;};
 const deny=(input:object)=>{const before=state,snapshot=JSON.stringify(state);assert.equal(reduceGame(s,state,{id:`denied-${seq++}`,...input} as Parameters<typeof reduceGame>[2]),before);assert.equal(JSON.stringify(state),snapshot);};
 const configure=(candidateId='aware',criterionIds=['handled','private'],aggregation='all')=>act({type:'evaluation',operation:'configure',candidateId,criterionIds,aggregation});
 const tick=()=>act({type:'evaluation',operation:'tick'});
 const run=(caseId:string)=>{act({type:'evaluation',operation:'run',caseId});let count=0;while(state.evaluation!.activeRunId){assert.ok(count++<20);tick();}return state.evaluation!.runs.at(-1)!;};
 const call=(call:ToolCall)=>{if(state.status==='paused')act({type:'resume',mode:'manual'});else if(state.status!=='running')act({type:'dispatch',mode:'manual'});act({type:'tool',call});};
 const all=()=>{for(const id of s.evaluation.gate.caseIds)run(id);act({type:'evaluation',operation:'certify'});};
 const deliver=()=>{call({tool:'observe',observationId:'scale'});act({type:'context',operation:'include',recordId:state.context!.records.at(-1)!.id});call({tool:'operate',operationId:'safe-light'});call({tool:'operate',operationId:'accept'});call({tool:'verify',fact:'cityAccepted'});};
 act({type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:64,permissions:['*'],loopPolicy:{maxCalls:64,maxRetries:0,permanentFailure:'repair'},instructionPolicy:'data-only'}});
 return {s,act,deny,configure,tick,run,call,all,deliver,get state(){return state;}};
}

test('v9 finite strategies execute actual isolated tools deterministically and replay mid-run',()=>{
 const g=setup();assert.deepEqual(validateScenario(g.s),[]);g.configure();g.act({type:'evaluation',operation:'run',caseId:'heavy'});g.tick();g.tick();
 const r=g.state.evaluation!.runs[0];assert.equal(r.world.boxLight,false);assert.equal(r.observed.boxLight.value,false);assert.equal(g.state.world.boxLight,true);assert.equal(g.state.observed.boxLight,undefined);assert.equal(g.state.context!.records.length,0);
 assert.ok(validateGameState(g.s,g.state));assert.deepEqual(replayGame(g.s,23,g.state.runtime!.actionHistory),g.state);
 const poisoned=structuredClone(g.state);poisoned.evaluation!.runs[0].world.handled=true;assert.equal(validateGameState(g.s,poisoned),false);
 while(g.state.evaluation!.activeRunId)g.tick();assert.equal(g.state.evaluation!.runs[0].report,'pass');assert.equal(g.state.world.handled,false);assert.equal(g.state.verifiedGoals.length,0);assert.notEqual(g.state.status,'won');
});

test('v9 branches see only received private fields: unseen false and unseen true both skip',()=>{
 const g=setup();g.configure('blind');const light=g.run('light'),heavy=g.run('heavy');for(const r of [light,heavy]){assert.equal(r.world.handled,false);assert.deepEqual(r.observed,{});assert.equal(r.report,'fail');}
 assert.equal(g.state.events.filter(e=>e.type==='evaluation-request'&&e.tool==='operate').length,0);assert.equal(g.state.runtime!.toolCalls,4);
});

test('v9 missing observation stays unknown while an observed safe fallback really executes',()=>{
 const g=setup();g.configure();const r=g.run('offscale');assert.equal(r.observed.boxLight,undefined);assert.equal(r.observed.scaleAvailable.value,false);assert.equal(r.world.handled,true);assert.equal(r.report,'pass');assert.equal(g.state.world.handled,false);
 assert.ok(g.state.events.some(e=>e.type==='evaluation-result'&&e.operationId==='safe-hold'&&e.success));assert.equal(g.state.events.filter(e=>e.type==='evaluation-request'&&e.tool==='operate').length,1);
 const s=fixture();s.evaluation.candidates[1].steps[1]=observe('scale');const unavailable=setup(s);unavailable.configure();const fallback=unavailable.run('offscale');assert.equal(fallback.observed.boxLight,undefined);assert.equal(fallback.report,'pass');assert.ok(unavailable.state.events.some(e=>e.type==='evaluation-observation'&&!e.success&&e.facts&&Object.keys(e.facts).length===0));
});

test('v9 guesses can truly work for light boxes and fail for heavy boxes; no forced first failure',()=>{
 const g=setup();g.configure('guess',['handled']);const light=g.run('light');assert.equal(light.report,'pass');assert.equal(light.world.handled,true);const before=g.state.runtime!.missionRemaining,heavy=g.run('heavy');assert.equal(heavy.report,'fail');assert.equal(heavy.world.handled,false);assert.equal(before-g.state.runtime!.missionRemaining,3);assert.equal(heavy.toolFailed,true);
});

test('v9 any green score and proxy green score cannot erase hard constraints or actual delivery',()=>{
 const g=setup();g.configure('fast',['handled','private'],'any');const r=g.run('light');assert.equal(r.report,'pass');assert.deepEqual(r.checks,[{criterionId:'handled',status:'pass'},{criterionId:'private',status:'fail'}]);assert.match(evaluationGateDenial(g.s,g.state)!,/同时/);g.act({type:'evaluation',operation:'certify'});assert.equal(g.state.evaluation!.certificate,undefined);
 g.configure('blind',['stamped']);assert.equal(g.run('light').report,'pass');assert.match(evaluationGateDenial(g.s,g.state)!,/全部硬条件/);g.act({type:'dispatch',mode:'manual'});g.deny({type:'tool',call:{tool:'operate',operationId:'accept'}});assert.equal(g.state.world.cityAccepted,false);
});

test('v9 unknown measurements are neither false nor pass and cannot certify',()=>{
 const s=fixture();s.evaluation.cases[0].initialOverrides.meterAvailable=false;const g=setup(s);g.configure();const r=g.run('light');assert.equal(r.world.handled,true);assert.equal(r.report,'unknown');assert.ok(r.measurements.every(m=>!m.known&&!Object.hasOwn(m,'value')));assert.ok(r.checks.every(c=>c.status==='unknown'));g.act({type:'evaluation',operation:'certify'});assert.equal(currentCertificate(g.state),false);
});

test('v9 repeated normal tests do not cover absent boundary and exception cases',()=>{
 const g=setup();g.configure();g.run('light');g.run('light');assert.equal(g.state.evaluation!.seenCaseIds.length,1);g.act({type:'evaluation',operation:'certify'});assert.equal(currentCertificate(g.state),false);assert.match(evaluationGateDenial(g.s,g.state)!,/未实际测完/);
 g.run('heavy');g.run('offscale');assert.equal(evaluationGateDenial(g.s,g.state),undefined);g.act({type:'evaluation',operation:'certify'});assert.equal(currentCertificate(g.state),true);
});

test('v9 current certificate still requires independent city construction and verification',()=>{
 const g=setup();g.configure();g.all();assert.equal(currentCertificate(g.state),true);assert.equal(g.state.world.handled,false);assert.equal(g.state.world.cityAccepted,false);assert.equal(g.state.status,'ready');g.deliver();assert.equal(g.state.status,'won');assert.equal(g.state.world.cityAccepted,true);assert.ok(validateGameState(g.s,g.state));
});

test('v9 changing candidate or contract invalidates reports, seal and certificate without rewriting old runs',()=>{
 const g=setup();g.configure();g.all();g.act({type:'evaluation',operation:'seal'});const oldRuns=structuredClone(g.state.evaluation!.runs),rev=g.state.evaluation!.candidateRevision;
 g.configure('fast');assert.equal(g.state.evaluation!.candidateRevision,rev+1);assert.equal(currentCertificate(g.state),false);assert.equal(currentEvaluationSeal(g.state),false);assert.deepEqual(g.state.evaluation!.runs,oldRuns);assert.match(evaluationGateDenial(g.s,g.state)!,/旧版本/);
 g.configure('aware');g.all();const crev=g.state.evaluation!.contractRevision;g.configure('aware',['handled','private','stamped']);assert.equal(g.state.evaluation!.contractRevision,crev+1);assert.equal(currentCertificate(g.state),false);assert.match(evaluationGateDenial(g.s,g.state)!,/旧版本/);
});

test('v9 held-out cases require explicit version sealing; reset preserves actual exposure',()=>{
 const g=setup();g.configure();g.deny({type:'evaluation',operation:'run',caseId:'holdout'});g.act({type:'evaluation',operation:'seal'});g.deny({type:'evaluation',operation:'seal'});assert.equal(g.run('holdout').firstSeen,true);
 g.act({type:'reset'});assert.deepEqual(g.state.evaluation!.seenCaseIds,['holdout']);assert.equal(g.state.evaluation!.generation,2);g.configure();g.act({type:'evaluation',operation:'seal'});assert.equal(g.run('holdout').firstSeen,false);assert.ok(validateGameState(g.s,g.state));
});

test('v9 conservative checkpoint exposure can downgrade an already-open fresh run only',()=>{
 const g=setup();g.configure();g.act({type:'evaluation',operation:'seal'});g.act({type:'evaluation',operation:'run',caseId:'holdout'});assert.equal(g.state.evaluation!.runs[0].firstSeen,true);const before=g.state.runtime!.missionRemaining;
 g.act({type:'evaluation',operation:'mark-seen',caseIds:['holdout']});assert.equal(g.state.evaluation!.runs[0].firstSeen,false);assert.equal(g.state.runtime!.missionRemaining,before);assert.equal(g.state.evaluation!.certificate,undefined);g.deny({type:'evaluation',operation:'mark-seen',caseIds:['holdout']});while(g.state.evaluation!.activeRunId)g.tick();assert.ok(validateGameState(g.s,g.state));
 g.act({type:'evaluation',operation:'mark-seen',caseIds:['light']});assert.equal(g.state.evaluation!.runs[0].report,'pass');assert.equal(g.state.runtime!.missionRemaining,before-5);g.deny({type:'evaluation',operation:'mark-seen',caseIds:['invented']});
});

test('v9 configurations lock during a run, cancellation keeps fees, and malformed actions reject atomically',()=>{
 const g=setup();g.configure();g.act({type:'evaluation',operation:'run',caseId:'light'});g.deny({type:'evaluation',operation:'configure',candidateId:'fast',criterionIds:['handled','private'],aggregation:'all'});g.deny({type:'evaluation',operation:'run',caseId:'heavy'});g.tick();const cost=g.state.runtime!.missionRemaining;g.act({type:'evaluation',operation:'cancel'});assert.equal(g.state.evaluation!.runs[0].status,'cancelled');assert.equal(g.state.runtime!.missionRemaining,cost);assert.deepEqual(g.state.evaluation!.seenCaseIds,['light']);g.deny({type:'evaluation',operation:'cancel'});
 g.deny({type:'evaluation',operation:'tick',world:{handled:true}});g.deny({type:'evaluation',operation:'configure',candidateId:'aware',criterionIds:['private','handled'],aggregation:'all'});g.deny({type:'evaluation',operation:'run',caseId:'light',passed:true});assert.ok(validateGameState(g.s,g.state));
});

test('v9 exhausted mission stops the in-flight case; new runs and ticks never refill budget',()=>{
 const s=fixture();s.limits!.missionBudget=2;const g=setup(s);g.configure();g.act({type:'evaluation',operation:'run',caseId:'light'});g.tick();g.tick();assert.equal(g.state.runtime!.missionRemaining,0);assert.equal(g.state.status,'exhausted');assert.equal(g.state.evaluation!.runs[0].status,'exhausted');g.deny({type:'evaluation',operation:'tick'});g.deny({type:'evaluation',operation:'run',caseId:'heavy'});g.configure('fast');assert.equal(g.state.runtime!.missionRemaining,0);assert.ok(validateGameState(g.s,g.state));
});

test('v9 pause prevents case progression until explicit resume',()=>{
 const g=setup();g.configure();g.act({type:'dispatch',mode:'manual'});g.act({type:'evaluation',operation:'run',caseId:'light'});g.act({type:'pause'});g.deny({type:'evaluation',operation:'tick'});g.act({type:'resume',mode:'manual'});g.tick();assert.equal(g.state.evaluation!.runs[0].cursor,1);
});

test('v9 case tools cannot borrow player identity, one-use permit, main goal evidence or sandbox evidence',()=>{
 const s=fixture();s.evaluation.candidates.push(candidate('secure-policy',[operate('secure')]));s.operations.find(o=>o.id==='accept')!.security={sandboxRequires:['safe-light']};const g=setup(s);g.call({tool:'observe',observationId:'registry'});const card=g.state.context!.records.at(-1)!;g.act({type:'context',operation:'include',recordId:card.id});g.act({type:'security',operation:'authenticate',principalId:'worker',recordId:card.id});g.act({type:'security',operation:'preview',call:{tool:'operate',operationId:'secure'}});g.act({type:'security',operation:'approve'});const permits=structuredClone(g.state.security!.permits),budget=g.state.runtime!.missionRemaining;
 g.configure('secure-policy',['private']);const r=g.run('light');assert.equal(r.toolFailed,true);assert.equal(r.world.secureOpen,false);assert.equal(g.state.world.secureOpen,false);assert.deepEqual(g.state.security!.permits,permits);assert.equal(budget-g.state.runtime!.missionRemaining,1);
 g.configure();g.all();g.call({tool:'observe',observationId:'scale'});g.call({tool:'operate',operationId:'safe-light'});g.deny({type:'tool',call:{tool:'operate',operationId:'accept'}});assert.equal(g.state.verifiedGoals.length,0);assert.equal(g.state.events.filter(e=>e.type==='result'&&e.realm==='sandbox').length,0);
});

test('v9 case operations do not fire real-city hooks or silently consume live-call clocks',()=>{
 const s=fixture();s.hooks=[{id:'first-city-call',trigger:{type:'after-call',call:1},effects:{hookFired:true}}];const g=setup(s);g.configure();g.run('light');assert.equal(g.state.world.hookFired,false);assert.deepEqual(g.state.runtime!.triggeredHookIds,[]);g.call({tool:'observe',observationId:'scale'});assert.equal(g.state.world.hookFired,true);assert.deepEqual(g.state.runtime!.triggeredHookIds,['first-city-call']);
});

test('v9 accepted same-value object-key-order imports remain replay-valid after a future tick',()=>{
 const g=setup();g.configure();g.act({type:'evaluation',operation:'run',caseId:'light'});g.tick();const imported=structuredClone(g.state);const r=imported.evaluation!.runs[0];r.observed.scaleAvailable.provenance={realm:'sandbox',trust:'external',observationId:'scale-status'};assert.ok(validateGameState(g.s,imported));const next=reduceGame(g.s,imported,{id:'after-import',type:'evaluation',operation:'tick'});assert.notEqual(next,imported);assert.ok(validateGameState(g.s,next));
 const bad=structuredClone(next);bad.evaluation!.seenCaseIds=[];assert.equal(validateGameState(g.s,bad),false);const wrong=structuredClone(next);wrong.evaluation!.runs[0].firstSeen=false;assert.equal(validateGameState(g.s,wrong),false);
});

test('v9 independent transfer needs actual fresh-case evidence and is downgraded by hints/exposure',()=>{
 const make=()=>{const s=fixture();s.kind='transfer';s.transferRequirement={evaluation:{caseIds:['light','heavy','offscale'],freshCaseIds:['holdout'],certified:true}};return s;};
 for(const mode of ['independent','hinted','seen']){const g=setup(make());g.configure();if(mode==='hinted')g.act({type:'hint'});if(mode==='seen')g.act({type:'evaluation',operation:'mark-seen',caseIds:['holdout']});g.act({type:'evaluation',operation:'seal'});g.run('holdout');g.all();g.deliver();assert.equal(g.state.status,'won');assert.ok(g.state.learningEvidence.every(e=>e.level===(mode==='independent'?'independent-transfer':'guided')));}
});

test('v9 author validation rejects design bypass, arbitrary policy code, undefined branches and fake metrics',()=>{
 const modify:Array<(s:Scenario)=>void>=[s=>{s.operations[0].effects.controller='fast';},s=>{s.hooks=[{id:'bypass',trigger:{type:'after-call',call:1},effects:{controller:'fast'}}];},s=>{(s.evaluation.candidates[0].steps[0] as unknown as Record<string,unknown>).script='score=100';},s=>{s.evaluation.candidates[0].steps[0].whenKnown={undefinedFact:true};},s=>{s.evaluation.metrics[0].fact='handled';},s=>{s.evaluation.cases[0].initialOverrides.controller='fast';},s=>{s.evaluation.criteria[0].atLeast=1;},s=>{s.evaluation.candidates[0].steps=Array(9).fill(operate('rush'));},s=>{s.operations[0].collaboration={actorIds:['made-up']};}];
 for(const edit of modify){const s=fixture();edit(s);assert.ok(validateScenario(s).length);assert.throws(()=>createGame(s));}
});

test('v9 only charged requests carry cost and fresh case identifiers prevent duplicate execution',()=>{
 const g=setup();g.configure();const before=g.state.runtime!.missionRemaining,r=g.run('light');const events=g.state.events.filter(e=>r.eventIds.includes(e.id));assert.equal(events.reduce((sum,e)=>sum+(e.cost??0),0),before-g.state.runtime!.missionRemaining);assert.ok(events.every(e=>!e.cost||e.type==='evaluation-request'));const last=g.state.runtime!.actionHistory.at(-1)!;assert.equal(reduceGame(g.s,g.state,last),g.state);assert.equal(replayGame(g.s,23,[...g.state.runtime!.actionHistory,last]),null);assert.ok(validateGameState(g.s,g.state));
});

test('v9 last measurement may honestly complete its report but resource exhaustion stops city action',()=>{
 const s=fixture();s.limits!.missionBudget=3;const g=setup(s);g.configure('fast');const r=g.run('light');assert.equal(r.status,'completed');assert.equal(r.report,'fail');assert.equal(g.state.runtime!.missionRemaining,0);assert.equal(g.state.status,'exhausted');g.deny({type:'dispatch',mode:'manual'});g.deny({type:'evaluation',operation:'run',caseId:'heavy'});assert.ok(validateGameState(g.s,g.state));
});

test('v9 insufficient cost records the actual run stop with no partial execution or charge',()=>{
 const s=fixture();s.limits!.missionBudget=1;s.operations[0].cost=2;const g=setup(s);g.configure('fast');g.act({type:'evaluation',operation:'run',caseId:'light'});g.tick();const run=g.state.evaluation!.runs[0],stop=g.state.events.at(-1)!;assert.equal(run.status,'exhausted');assert.equal(stop.evaluationRunId,run.id);assert.equal(g.state.runtime!.missionRemaining,1);assert.equal(run.world.handled,false);assert.equal(g.state.runtime!.toolCalls,0);assert.ok(validateGameState(g.s,g.state));
});

test('v9 candidate design facts cannot be changed through protocol variants, deltas or receipt effects',()=>{
 for(const field of ['effects','deltas','receiptEffects']){const s=fixture(),p={parameters:[],defaults:{},variants:[{when:{},text:'变更设计'}]} as NonNullable<OperationDefinition['protocol']>;
  if(field==='receiptEffects')p.receiptEffects={controller:'forged'};else if(field==='effects')p.variants[0].effects={controller:'forged'};else p.variants[0].deltas={controller:1};s.operations[0].protocol=p;assert.ok(validateScenario(s).some(e=>e.includes('版本化评价配置')));assert.throws(()=>createGame(s));}
});

test('v9 certification and city delivery reject mirror-sandbox realm even with current green reports',()=>{
 const g=setup();g.configure();for(const id of g.s.evaluation!.gate.caseIds)g.run(id);g.act({type:'security',operation:'realm',realm:'sandbox'});g.deny({type:'evaluation',operation:'certify'});g.deny({type:'evaluation',operation:'seal'});g.act({type:'security',operation:'realm',realm:'live'});g.act({type:'evaluation',operation:'certify'});g.deny({type:'evaluation',operation:'certify'});g.act({type:'security',operation:'realm',realm:'sandbox'});g.act({type:'dispatch',mode:'manual'});g.deny({type:'tool',call:{tool:'operate',operationId:'accept'}});assert.equal(g.state.world.cityAccepted,false);assert.ok(validateGameState(g.s,g.state));
});

test('v9 numeric criterion bounds are measured from the actual instrument, not a preset score',()=>{
 const s=fixture();s.initialWorld.actualWeight=7;s.observations.push({id:'weight-meter',target:'scale',label:'重量值',facts:['actualWeight'],text:'真实测量重量',document:{units:1,source:'秤'}});s.evaluation!.metrics.push({id:'weight',label:'重量',observationId:'weight-meter',fact:'actualWeight'});s.evaluation!.criteria.push({id:'within-limit',label:'限定范围',metricId:'weight',atLeast:5,atMost:10});s.evaluation!.cases[1].initialOverrides.actualWeight=12;const g=setup(s);g.configure('blind',['within-limit']);assert.equal(g.run('light').report,'pass');assert.equal(g.run('heavy').report,'fail');
});

test('v9 selected extra unknown contract condition blocks certification even when mandatory fields pass',()=>{
 const s=fixture();s.observations.push({id:'extra-weight',target:'scale',label:'更多重量证据',facts:['boxLight'],availableWhen:{scaleAvailable:true},text:'要测到才知道',document:{units:1,source:'秤'}});s.evaluation!.metrics.push({id:'extra-metric',label:'另选条件',observationId:'extra-weight',fact:'boxLight'});s.evaluation!.criteria.push({id:'extra-light',label:'额外轻箱检查',metricId:'extra-metric',equals:true});const g=setup(s);g.configure('aware',['handled','private','extra-light']);for(const id of s.evaluation!.gate.caseIds)g.run(id);const last=g.state.evaluation!.runs.at(-1)!;assert.equal(last.report,'unknown');assert.deepEqual(last.checks.filter(c=>c.criterionId!=='extra-light').map(c=>c.status),['pass','pass']);g.act({type:'evaluation',operation:'certify'});assert.equal(currentCertificate(g.state),false);assert.match(evaluationGateDenial(s,g.state)!,/所选验收契约/);g.configure();g.all();assert.equal(currentCertificate(g.state),true);
});

test('v9 world goals alone cannot bypass chapter-wide certification; certification itself never completes city',()=>{
 const s=fixture();s.operations.find(o=>o.id==='accept')!.evaluationRequires=false;const g=setup(s);g.call({tool:'observe',observationId:'scale'});g.act({type:'context',operation:'include',recordId:g.state.context!.records.at(-1)!.id});g.call({tool:'operate',operationId:'safe-light'});g.call({tool:'operate',operationId:'accept'});g.call({tool:'verify',fact:'cityAccepted'});assert.equal(g.state.world.cityAccepted,true);assert.equal(g.state.status,'running');g.configure();g.all();assert.equal(currentCertificate(g.state),true);assert.equal(g.state.status,'running');g.call({tool:'verify',fact:'cityAccepted'});assert.equal(g.state.status,'won');assert.ok(validateGameState(g.s,g.state));
});

test('v9 reset event binds the reset action rather than the previous recorded action',()=>{
 const g=setup();g.configure();g.act({type:'reset'});assert.equal(g.state.events[0].type,'reset');assert.equal(g.state.events[0].actionId,g.state.runtime!.actionHistory.at(-1)!.id);assert.ok(validateGameState(g.s,g.state));
});

test('v9 ordinary mirror-sandbox calls also leave the real-city hook clock untouched',()=>{
 const s=fixture();s.hooks=[{id:'first-live-call',trigger:{type:'after-call',call:1},effects:{hookFired:true}}];const g=setup(s);g.act({type:'security',operation:'realm',realm:'sandbox'});g.call({tool:'observe',observationId:'scale'});assert.equal(g.state.world.hookFired,false);g.act({type:'security',operation:'realm',realm:'live'});g.call({tool:'observe',observationId:'scale'});assert.equal(g.state.world.hookFired,true);assert.ok(validateGameState(g.s,g.state));
});

test('v9 actual city budget exhaustion immediately stops an active case without waiting for another tick',()=>{
 const s=fixture();s.limits!.missionBudget=2;const g=setup(s);g.configure();g.act({type:'evaluation',operation:'run',caseId:'light'});g.tick();g.call({tool:'observe',observationId:'scale'});assert.equal(g.state.runtime!.missionRemaining,0);assert.equal(g.state.evaluation!.runs[0].status,'exhausted');assert.equal(g.state.evaluation!.activeRunId,undefined);assert.equal(g.state.events.at(-1)!.evaluationRunId,g.state.evaluation!.runs[0].id);g.deny({type:'evaluation',operation:'tick'});assert.ok(validateGameState(g.s,g.state));
});

test('v9 actual city victory cancels pending optional trials but never makes them completed evidence',()=>{
 const g=setup();g.configure();g.all();g.act({type:'evaluation',operation:'run',caseId:'light'});g.tick();const remaining=g.state.runtime!.missionRemaining;g.deliver();const r=g.state.evaluation!.runs.at(-1)!;assert.equal(g.state.status,'won');assert.equal(r.status,'cancelled');assert.equal(r.report,undefined);assert.equal(g.state.evaluation!.activeRunId,undefined);assert.equal(remaining-g.state.runtime!.missionRemaining,4);assert.ok(g.state.evaluation!.seenCaseIds.includes('light'));assert.ok(validateGameState(g.s,g.state));
});
