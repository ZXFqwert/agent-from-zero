import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scenarios } from '../src/content/scenarios';
import { chapterOneScenarios } from '../src/content/chapterOne';
import { createGame, reduceGame, validateBlueprint, validateGameState, validateScenario, chooseNextCall, getRemainingBudget, getToolCost, replayGame } from '../src/engine';
import type { AgentBlueprint, GameAction, GameState, ScenarioDefinition, ToolCall } from '../src/engine';

const base:ScenarioDefinition={
  id:'v2-test',version:1,engineVersion:2,title:'轻装契约',subtitle:'状态与成本',brief:'总计6枚晶石，观察1，操作2，验收1，装备2件。',npc:'守灯人',location:'lighthouse',chapter:1,kind:'guided',
  initialWorld:{power:false,lit:false,hidden:'not-seen'},
  limits:{toolCapacity:2,toolCosts:{observe:1,operate:2,verify:1},maxBudget:6,missionBudget:6},
  observations:[{id:'inspect',target:'lamp',label:'检查线路',facts:['power','lit'],text:'检查了灯与供能。'}],
  operations:[
    {id:'ignite',target:'lamp',label:'点灯',requires:{power:true},effects:{lit:true},successText:'灯亮。',failureText:'电源未接通。'},
    {id:'connect',target:'supply',label:'接通电源',effects:{power:true},successText:'已接通。',failureText:'连接失败。'},
  ],goals:[{fact:'lit',equals:true,label:'灯真的亮',operationId:'ignite'}],concepts:['观察','反馈','验收'],
};
const build=(tools:AgentBlueprint['tools'],extra:Partial<AgentBlueprint>={}):AgentBlueprint=>({tools,feedback:true,verification:true,budget:6,permissions:['*'],...extra});
type InputAction={ [K in GameAction['type']]:Omit<Extract<GameAction,{type:K}>,'id'> }[GameAction['type']];
function act(scenario:ScenarioDefinition,state:GameState,input:InputAction):GameState {
  const action={...input,id:`test-${state.processedActionIds.length}`} as GameAction;
  const next=reduceGame(scenario,state,action);assert.notStrictEqual(next,state,`${input.type} should be valid`);return next;
}
function configure(scenario:ScenarioDefinition,state:GameState,blueprint:AgentBlueprint):GameState{return act(scenario,state,{type:'configure',blueprint});}
function tool(scenario:ScenarioDefinition,state:GameState,call:ToolCall):GameState{return act(scenario,state,{type:'tool',call});}
function auto(scenario:ScenarioDefinition,state:GameState):GameState {
  let current=state;if(current.status!=='running')current=act(scenario,current,{type:current.status==='paused'?'resume':'dispatch',mode:'automatic'});
  for(let i=0;current.status==='running'&&i<100;i++)current=act(scenario,current,{type:'step',source:'scheduler'});
  assert.notEqual(current.status,'running','bounded reference must stop');return current;
}

test('v2 capacity makes equip-everything invalid without changing state',()=>{
  const state=createGame(base);
  assert.match(validateBlueprint(base,build(['observe','operate','verify'])).join(''),/2/);
  assert.strictEqual(reduceGame(base,state,{id:'invalid',type:'configure',blueprint:build(['observe','operate','verify'])}),state);
  assert.deepEqual(validateBlueprint(base,build(['observe','operate'])),[],'verification switch may be armed before equipping verify');
});

test('v2 observation, operation then equipment swap solves with exactly the total resource pool',()=>{
  let state=auto(base,configure(base,createGame(base),build(['observe','operate'])));
  assert.equal(state.status,'stalled');assert.equal(state.world.lit,true);assert.equal(state.runtime!.missionRemaining,1);
  const evidenceBefore=structuredClone(state.observed);
  state=configure(base,state,build(['operate','verify']));
  assert.deepEqual(state.observed,evidenceBefore);assert.equal(state.budgetRemaining,1);
  state=auto(base,state);assert.equal(state.status,'won');assert.equal(state.runtime!.missionRemaining,0);
  assert.equal(validateGameState(base,state),true);
});

test('v2 permits a second, informed manual route without forcing a tutorial failure',()=>{
  let state=configure(base,createGame(base),build(['operate','verify']));state=act(base,state,{type:'dispatch',mode:'manual'});
  state=tool(base,state,{tool:'operate',operationId:'connect'});state=tool(base,state,{tool:'operate',operationId:'ignite'});state=tool(base,state,{tool:'verify',fact:'lit'});
  assert.equal(state.status,'won');assert.equal(state.runtime!.missionRemaining,1);assert.equal(state.events.some(event=>event.type==='result'&&!event.success),false);
});

test('v2 blindly running operate+verify costs more and cannot refill total resources by reconfiguring',()=>{
  let state=auto(base,configure(base,createGame(base),build(['operate','verify'])));
  assert.equal(state.status,'exhausted');assert.equal(state.runtime!.missionRemaining,0);assert.equal(state.world.lit,true);assert.deepEqual(state.verifiedGoals,[]);
  state=configure(base,state,build(['observe','verify']));assert.equal(state.runtime!.missionRemaining,0);assert.equal(state.budgetRemaining,0);
  assert.strictEqual(reduceGame(base,state,{id:'free-refill',type:'dispatch'}),state);
  const restarted=act(base,state,{type:'reset'});assert.equal(restarted.runtime!.missionRemaining,6);assert.equal(restarted.world.lit,false);
  assert.equal(validateGameState(base,restarted),true);
});

test('v2 changing per-dispatch budget redistributes remaining resources without creating any',()=>{
  let state=configure(base,createGame(base),build(['observe','operate'],{budget:1}));state=auto(base,state);
  assert.equal(state.runtime!.missionRemaining,5);assert.equal(state.budgetRemaining,0);
  state=configure(base,state,build(['operate','verify'],{budget:6}));assert.equal(state.runtime!.missionRemaining,5);assert.equal(state.budgetRemaining,5);
  state=auto(base,state);assert.equal(state.status,'won');assert.equal(state.runtime!.missionRemaining,0);
});

test('v2 insufficient remainder halts before an unaffordable request, without going negative',()=>{
  const scenario={...base,limits:{...base.limits,missionBudget:5}};
  let state=auto(scenario,configure(scenario,createGame(scenario),build(['operate','verify'])));
  assert.equal(state.status,'exhausted');assert.equal(state.runtime!.missionRemaining,1);assert.equal(state.runtime!.toolCalls,2);assert.equal(state.world.lit,false);
  assert.equal(state.events.filter(event=>event.type==='request').length,2);assert.equal(getRemainingBudget(state),1);
  const snapshot=state;assert.strictEqual(reduceGame(scenario,state,{id:'manual-too-expensive',type:'tool',call:{tool:'operate',operationId:'ignite'}}),snapshot);
});

test('v2 call-specific costs override defaults and malformed requests never trigger hooks',()=>{
  const scenario={...base,observations:[{...base.observations[0],cost:3}],operations:[{...base.operations[0],cost:4},base.operations[1]],goals:[{...base.goals[0],verifyCost:2}]};
  assert.equal(getToolCost(scenario,{tool:'observe',observationId:'inspect'}),3);assert.equal(getToolCost(scenario,{tool:'operate',operationId:'ignite'}),4);assert.equal(getToolCost(scenario,{tool:'verify',fact:'lit'}),2);
  let state=configure(scenario,createGame(scenario),build(['observe','operate']));state=act(scenario,state,{type:'dispatch',mode:'manual'});
  const malformed={id:'malformed',type:'tool',call:{tool:'operate',operationId:'ignite',override:true}} as unknown as GameAction;
  assert.strictEqual(reduceGame(scenario,state,malformed),state);assert.equal(state.runtime!.toolCalls,0);
});

test('v2 failed operations charge their authored failure cost, with atomic affordability checks',()=>{
  const scenario:ScenarioDefinition={...base,limits:{maxBudget:6,missionBudget:6},operations:[{...base.operations[0],cost:1,failureCost:3},base.operations[1]]};
  let state=configure(scenario,createGame(scenario),build(['operate','verify']));state=act(scenario,state,{type:'dispatch',mode:'manual'});
  assert.equal(getToolCost(scenario,{tool:'operate',operationId:'ignite'}),1,'public preview reports normal cost');
  state=tool(scenario,state,{tool:'operate',operationId:'ignite'});
  assert.equal(state.runtime!.missionRemaining,3);assert.equal(state.events.find(event=>event.type==='request')!.cost,3);assert.equal(state.world.lit,false);
  state=tool(scenario,state,{tool:'operate',operationId:'connect'}); // This operation costs the default 1.
  state=tool(scenario,state,{tool:'operate',operationId:'ignite'});assert.equal(state.world.lit,true);assert.equal(state.runtime!.missionRemaining,1);
  state=tool(scenario,state,{tool:'verify',fact:'lit'});assert.equal(state.status,'won');assert.equal(validateGameState(scenario,state),true);
  let poor=configure(scenario,createGame(scenario),build(['operate'],{budget:2}));poor=act(scenario,poor,{type:'dispatch',mode:'manual'});
  assert.strictEqual(reduceGame(scenario,poor,{id:'cannot-pay-failure',type:'tool',call:{tool:'operate',operationId:'ignite'}}),poor);
  poor=act(scenario,poor,{type:'step',source:'player'});assert.equal(poor.status,'exhausted');assert.equal(poor.runtime!.missionRemaining,6);assert.equal(poor.runtime!.toolCalls,0);
  assert.throws(()=>createGame({...scenario,operations:[{...scenario.operations[0],failureCost:0},scenario.operations[1]]}),/失败成本/);
});

const orderScenario:ScenarioDefinition={...base,id:'priority-test',limits:{toolCosts:{observe:1,operate:1,verify:1},maxBudget:5,missionBudget:5},initialWorld:{lit:false,drained:false},observations:[],operations:[
  {id:'light',target:'lamp',label:'点灯',effects:{lit:true},successText:'灯亮。',failureText:'失败。'},
  {id:'drain',target:'pump',label:'排水',effects:{drained:true,lit:false},successText:'水退去，启动的泵抽走了灯的电力。',failureText:'失败。'},
],goals:[{fact:'lit',equals:true,label:'灯亮',operationId:'light'},{fact:'drained',equals:true,label:'排水',operationId:'drain'}]};

test('v2 goal priority changes outcome: pumping after lighting forces costly rework',()=>{
  const normal=auto(orderScenario,configure(orderScenario,createGame(orderScenario),build(['operate','verify'],{budget:5})));
  assert.equal(normal.status,'exhausted');assert.equal(normal.verifiedGoals.includes('drained'),false);
  const planned=auto(orderScenario,configure(orderScenario,createGame(orderScenario),build(['operate','verify'],{budget:5,goalOrder:['drained','lit']})));
  assert.equal(planned.status,'won');assert.equal(planned.runtime!.missionRemaining,1);
  assert.ok(validateBlueprint(orderScenario,build(['operate'],{budget:5,goalOrder:['lit','lit']})).length);
});

test('v2 hooks revoke stale proof after a successful verification without leaking new facts',()=>{
  const scenario:ScenarioDefinition={...base,limits:{missionBudget:12,maxBudget:12},hooks:[{id:'gust',trigger:{type:'after-call',call:2},effects:{lit:false},notice:{trust:'environment',text:'第二次调用后，阵风吹灭灯火。'}}],initialWorld:{...base.initialWorld,power:true},kind:'guided'};
  let state=configure(scenario,createGame(scenario),build(['operate','verify'],{budget:12}));state=act(scenario,state,{type:'dispatch',mode:'manual'});
  state=tool(scenario,state,{tool:'operate',operationId:'ignite'});state=tool(scenario,state,{tool:'verify',fact:'lit'});
  assert.equal(state.world.lit,false);assert.equal(state.observed.lit.value,true);assert.deepEqual(state.verifiedGoals,[]);assert.notEqual(state.status,'won');
  assert.deepEqual(chooseNextCall(scenario,state),{tool:'verify',fact:'lit'});
  const hiddenChange=structuredClone(state);hiddenChange.world.power=false;assert.deepEqual(chooseNextCall(scenario,state),chooseNextCall(scenario,hiddenChange));
  state=tool(scenario,state,{tool:'verify',fact:'lit'});assert.equal(state.observed.lit.value,false);
  state=tool(scenario,state,{tool:'operate',operationId:'ignite'});state=tool(scenario,state,{tool:'verify',fact:'lit'});
  assert.equal(state.status,'won');assert.deepEqual(state.runtime!.triggeredHookIds,['gust']);assert.equal(state.events.filter(event=>event.type==='world-change').length,1);assert.equal(validateGameState(scenario,state),true);
});

test('v2 untrusted reports never become physical effects or companion evidence',()=>{
  const scenario:ScenarioDefinition={...base,hooks:[{id:'fake-report',trigger:{type:'after-call',call:1},notice:{trust:'untrusted',text:'报告称灯已亮。',reportedFacts:{lit:true,power:true}}}]};
  let state=configure(scenario,createGame(scenario),build(['observe','operate']));state=act(scenario,state,{type:'dispatch',mode:'manual'});state=tool(scenario,state,{tool:'observe',observationId:'inspect'});
  assert.equal(state.world.lit,false);assert.equal(state.observed.lit.value,false);
  const report=state.events.find(event=>event.type==='untrusted-message')!;assert.deepEqual(report.reportedFacts,{lit:true,power:true});assert.equal(report.facts,undefined);assert.equal(report.delivered,false);
});

test('v2 operation hooks require success and run once in declared order',()=>{
  const scenario:ScenarioDefinition={...base,limits:{maxBudget:12,missionBudget:12},hooks:[{id:'after-ignite',trigger:{type:'after-operation',operationId:'ignite'},when:{lit:true},effects:{power:false}},{id:'after-second',trigger:{type:'after-operation',operationId:'ignite'},when:{power:false},notice:{trust:'environment',text:'灯亮后线路改变。'}}]};
  let state=configure(scenario,createGame(scenario),build(['operate','verify'],{budget:12}));state=act(scenario,state,{type:'dispatch',mode:'manual'});
  state=tool(scenario,state,{tool:'operate',operationId:'ignite'});assert.deepEqual(state.runtime!.triggeredHookIds,[]);
  state=tool(scenario,state,{tool:'operate',operationId:'connect'});state=tool(scenario,state,{tool:'operate',operationId:'ignite'});
  assert.deepEqual(state.runtime!.triggeredHookIds,['after-ignite','after-second']);assert.equal(state.world.power,false);assert.equal(state.observed.power.value,true);
});

test('v2 per-tool target scope permits broad observation while limiting operation to one target',()=>{
  const scenario:ScenarioDefinition={...base,limits:{...base.limits,maxPermissionTargets:{operate:1}}};
  assert.ok(validateBlueprint(scenario,build(['observe','operate'])).length);
  let state=configure(scenario,createGame(scenario),build(['observe','operate'],{toolPermissions:{observe:['*'],operate:['supply']}}));state=act(scenario,state,{type:'dispatch',mode:'manual'});
  const before=JSON.stringify(state);assert.strictEqual(reduceGame(scenario,state,{id:'denied',type:'tool',call:{tool:'operate',operationId:'ignite'}}),state);assert.equal(JSON.stringify(state),before);
  state=tool(scenario,state,{tool:'observe',observationId:'inspect'});state=tool(scenario,state,{tool:'operate',operationId:'connect'});state=act(scenario,state,{type:'pause'});
  state=configure(scenario,state,build(['operate','verify'],{toolPermissions:{operate:['lamp'],verify:['*']}}));state=auto(scenario,state);
  assert.equal(state.status,'won');assert.equal(state.runtime!.missionRemaining,0);
});

test('v2 scheduler cannot advance manual or paused state and survives serialization exactly',()=>{
  let state=configure(base,createGame(base),build(['observe','operate']));state=act(base,state,{type:'dispatch',mode:'manual'});
  assert.strictEqual(reduceGame(base,state,{id:'wrong-scheduler',type:'step',source:'scheduler'}),state);
  state=act(base,state,{type:'pause'});assert.strictEqual(reduceGame(base,state,{id:'paused-scheduler',type:'step',source:'scheduler'}),state);
  state=act(base,state,{type:'resume',mode:'automatic'});state=act(base,state,{type:'step',source:'scheduler'});
  const restored=JSON.parse(JSON.stringify(state));assert.equal(validateGameState(base,restored),true);assert.equal(restored.runtime.executionMode,'automatic');
  state=act(base,state,{type:'step',source:'player'});assert.equal(state.runtime!.executionMode,'manual');
  assert.strictEqual(reduceGame(base,state,{id:'stale-timer',type:'step',source:'scheduler'}),state);
});

test('v2 repeat IDs and bad runtime/history cannot alter valid state',()=>{
  let state=configure(base,createGame(base),build(['observe','operate']));state=act(base,state,{type:'dispatch',mode:'manual'});state=tool(base,state,{tool:'observe',observationId:'inspect'});
  const action=state.runtime!.actionHistory.at(-1)!;assert.strictEqual(reduceGame(base,state,action),state);
  for(const mutate of [(s:GameState)=>{s.world.lit=true;},(s:GameState)=>{s.runtime!.missionRemaining=600;},(s:GameState)=>{s.runtime!.toolCalls++;},(s:GameState)=>{s.observed.hidden={value:'not-seen',source:'receipt',eventId:'fake'};},(s:GameState)=>{s.runtime!.actionHistory.pop();}]){
    const forged=structuredClone(state);mutate(forged);assert.equal(validateGameState(base,forged),false);
  }
  assert.deepEqual(replayGame(base,state.seed,state.runtime!.actionHistory),state);
});

test('v2 transfer classification needs declared, successful manual decisions and survives reset',()=>{
  const scenario:ScenarioDefinition={...base,kind:'transfer',limits:{maxBudget:12,missionBudget:12},transferRequirement:{operationIds:['ignite']}};
  const automatic=auto(scenario,configure(scenario,createGame(scenario),build(['operate','verify'],{budget:12})));
  assert.ok(automatic.learningEvidence.every(item=>item.level==='guided'));
  let manual=configure(scenario,createGame(scenario),build(['operate','verify'],{budget:12}));manual=act(scenario,manual,{type:'dispatch',mode:'manual'});
  manual=tool(scenario,manual,{tool:'operate',operationId:'ignite'}); // Failed manual guessing must not count.
  manual=act(scenario,manual,{type:'pause'});manual=auto(scenario,manual);assert.ok(manual.learningEvidence.every(item=>item.level==='guided'));
  manual=act(scenario,manual,{type:'reset'});manual=act(scenario,manual,{type:'dispatch',mode:'manual'});manual=tool(scenario,manual,{tool:'operate',operationId:'connect'});manual=tool(scenario,manual,{tool:'operate',operationId:'ignite'});manual=tool(scenario,manual,{tool:'verify',fact:'lit'});
  assert.ok(manual.learningEvidence.every(item=>item.level==='independent-transfer'));
  manual=act(scenario,manual,{type:'reset'});manual=act(scenario,manual,{type:'hint'});manual=auto(scenario,manual);assert.ok(manual.learningEvidence.every(item=>item.level==='guided'));
});

test('v2 swap evidence requires actual execution between configurations',()=>{
  const scenario:ScenarioDefinition={...base,kind:'transfer',transferRequirement:{reconfiguration:true}};
  let state=auto(scenario,configure(scenario,createGame(scenario),build(['observe','operate'])));state=configure(scenario,state,build(['operate','verify']));state=auto(scenario,state);
  assert.ok(state.learningEvidence.every(item=>item.level==='independent-transfer'));
  let cosmetic=configure(scenario,createGame(scenario),build(['observe','operate']));cosmetic=configure(scenario,cosmetic,build(['operate','verify']));cosmetic=act(scenario,cosmetic,{type:'dispatch',mode:'manual'});
  cosmetic=tool(scenario,cosmetic,{tool:'operate',operationId:'connect'});cosmetic=tool(scenario,cosmetic,{tool:'operate',operationId:'ignite'});cosmetic=tool(scenario,cosmetic,{tool:'verify',fact:'lit'});
  assert.ok(cosmetic.learningEvidence.every(item=>item.level==='guided'));
});

test('v2 malformed cost and hook configurations are rejected before play',()=>{
  assert.deepEqual(validateScenario(base),[]);
  assert.throws(()=>createGame({...base,limits:{missionBudget:0}}),/资源/);
  assert.throws(()=>createGame({...base,operations:[{...base.operations[0],cost:-1},base.operations[1]]}),/成本/);
  assert.throws(()=>createGame({...base,hooks:[{id:'bad',trigger:{type:'after-call',call:0},effects:{lit:true}}]}),/时机/);
  assert.throws(()=>createGame({...base,hooks:[{id:'bad',trigger:{type:'after-operation',operationId:'unknown'},effects:{lit:true}}]}),/操作/);
});

test('real exported v1 games and checkpoint traces remain byte-compatible through the engine router',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/harbor-v1.json',import.meta.url),'utf8'));
  for(const [id,state]of Object.entries(fixture.games) as Array<[string,GameState]>){const scenario=scenarios.find(item=>item.id===id)!;assert.equal(validateGameState(scenario,state),true);assert.deepEqual(replayGame(scenario,state.seed,fixture.actions[id]),state);assert.equal(state.runtime,undefined);}
  for(const checkpoint of fixture.checkpoints){const scenario=scenarios.find(item=>item.id===checkpoint.scenarioId)!;assert.deepEqual(replayGame(scenario,checkpoint.state.seed,checkpoint.actions),checkpoint.state);}
});

test('medicine resource conservation holds across every reachable operation and verification state',()=>{
  const scenario=chapterOneScenarios.find(item=>item.id==='medicine-detour')!;
  let initial=configure(scenario,createGame(scenario),build(['operate','verify'],{budget:12}));initial=act(scenario,initial,{type:'dispatch',mode:'manual'});
  const queue=[initial],visited=new Set<string>(),winningRoutes=new Set<string>();
  const calls:ToolCall[]=[...scenario.operations.map(operation=>({tool:'operate' as const,operationId:operation.id})),...scenario.goals.map(goal=>({tool:'verify' as const,fact:goal.fact}))];
  for(let index=0;index<queue.length;index++){
    const current=queue[index];
    const key=JSON.stringify([current.world,current.verifiedGoals.slice().sort(),current.runtime!.triggeredHookIds,current.runtime!.missionRemaining]);
    if(visited.has(key))continue;visited.add(key);
    assert.equal(Number(current.world.warehouseCrates)+Number(current.world.clinicCrates)+Number(current.world.dockCrates)+(current.world.cartLoaded?1:0),2,'neither retries nor partial failures can duplicate medicine');
    if(current.status==='won')winningRoutes.add(String(current.world.supplyRoute));
    if(current.status!=='running')continue;
    for(const call of calls){const next=reduceGame(scenario,current,{id:`explore-${current.processedActionIds.length}`,type:'tool',call});if(next!==current)queue.push(next);}
  }
  assert.deepEqual([...winningRoutes].sort(),['clinic','mobile']);
  assert.ok(visited.size>100,'explore failed, repeated, reordered and successful actions, not just the two authored paths');
});

test('authored fog-bell rejects an all-tools build and a blind automatic two-tool shortcut runs out',()=>{
  const scenario=chapterOneScenarios.find(item=>item.id==='fog-bell')!;
  assert.ok(validateBlueprint(scenario,build(['observe','operate','verify'],{budget:7})).length);
  const state=auto(scenario,configure(scenario,createGame(scenario),build(['operate','verify'],{budget:7})));
  assert.equal(state.status,'exhausted');assert.notEqual(state.verifiedGoals.includes('heardAcrossFog'),true);
  assert.equal(state.events.find(event=>event.type==='request')!.cost,3);
});
