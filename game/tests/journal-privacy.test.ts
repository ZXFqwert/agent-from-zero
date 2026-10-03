import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,type ViteDevServer} from 'vite';
import {createGame,reduceGame,validateGameState,validateScenario} from '../src/engine';
import type {GameAction,GameState,ScenarioDefinition} from '../src/engine';
import {generateChallenge} from '../src/challenges';
import {uiStories} from '../src/content/stories';
import {journalFactDisclosures,journalPublicEvents,journalTechnicalProjection} from '../src/components/journalDisclosure';

let server:ViteDevServer,ui:typeof import('../src/components/Journal'),CommandDeck:typeof import('../src/components/CommandDeck')['default'],TeamDeck:typeof import('../src/components/TeamDeck')['default'];
before(async()=>{
 server=await createServer({root:process.cwd(),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error'});
 ui=await server.ssrLoadModule('/src/components/Journal.tsx');
 CommandDeck=(await server.ssrLoadModule('/src/components/CommandDeck.tsx')).default;
 TeamDeck=(await server.ssrLoadModule('/src/components/TeamDeck.tsx')).default;
});
after(async()=>{await server?.close();});
const secret='sealed-original-A',changed='sealed-current-B',other='never-disclosed-C';
function fixture(version:7|8|9|10=7):ScenarioDefinition {
 const scenario:ScenarioDefinition={id:`journal-fixture-${version}`,version:1,engineVersion:version,chapter:8,title:'保守复盘台',subtitle:'先取得证据',brief:'检查未知信息。',npc:'记者',location:'warehouse',kind:'guided',contextCapacity:8,limits:{maxBudget:64,missionBudget:128},initialWorld:{journalSecret:secret,journalOther:other,done:false,controller:'unset'},
  observations:[{id:'secret',target:'archive',label:'读封存资料',facts:['journalSecret'],text:'已读到资料原文。',document:{units:1,source:'封存柜'}},{id:'outcome',target:'workbench',label:'检查结果',facts:['done'],text:'已检查结果。',document:{units:1,source:'工具台'}}],
  operations:[{id:'finish',target:'workbench',label:'实际完成',effects:{done:true},successText:'工具执行成功。',failureText:'工具执行失败。'}],goals:[{fact:'done',equals:true,label:'实际完成',operationId:'finish'}],concepts:['上下文'],memory:{slots:[],initial:[],skills:[]},security:{principals:[],sandbox:true},
 };
 if(version===8)scenario.team={actors:[{id:'reader',label:'读图员',description:'独立勘测',contextCapacity:4,tools:['observe'],permissions:['archive'],budget:8}],jobs:[{id:'read',label:'勘测资料',actorIds:['reader'],steps:[{tool:'observe',observationId:'secret'}],inputObservationIds:[],exportFacts:['journalSecret']}],board:[],artifacts:[{id:'diagram',label:'封存总图',fields:['journalSecret'],initialRevision:1}]};
 if(version===8)scenario.observations[0].artifactId='diagram';
 if(version===9)scenario.evaluation={candidateFact:'controller',candidates:[{id:'reader',label:'先观察',description:'实际读取',tools:['observe'],permissions:['archive'],steps:[{call:{tool:'observe',observationId:'secret'}}]}],cases:[{id:'private-case',label:'隔离案例',description:'测试同一工具',category:'normal',initialOverrides:{journalSecret:'isolated-case-D'}}],metrics:[{id:'done',label:'结果测量',observationId:'outcome',fact:'done'}],criteria:[{id:'done',label:'完成',metricId:'done',equals:true}],gate:{caseIds:['private-case'],criterionIds:['done']}};
 if(version===10)scenario.blueprintLab={messages:[{id:'private-message',label:'未打开的来信',source:{senderId:'sender',channelId:'channel',accountId:'account',peerId:'peer',displayName:'寄件人',replyTarget:'workbench'},facts:{journalSecret:secret},steps:[{call:{tool:'operate',operationId:'finish'},whenKnown:{journalSecret:secret}}],tools:['operate'],targets:['workbench']} ]};
 assert.deepEqual(validateScenario(scenario),[]);return scenario;
}
function play(scenario=fixture()) {
 let state=createGame(scenario,5);const actions:GameAction[]=[];
 const act=(data:object)=>{const action={...data,id:`journal-${actions.length}`} as GameAction,next=reduceGame(scenario,state,action);assert.notEqual(next,state,JSON.stringify(data));state=next;actions.push(action);assert.ok(validateGameState(scenario,state));return state;};
 const launch=()=>{act({type:'configure',blueprint:{tools:['observe','operate','verify'],feedback:true,verification:true,budget:64,permissions:['*']}});act({type:'dispatch',mode:'manual'});};
 return {scenario,act,launch,actions,get state(){return state;}};
}
const system=(state:GameState,scenario:ScenarioDefinition,hide=true)=>renderToStaticMarkup(createElement(ui.JournalSystemEvidence,{replay:state,scenario,hideUnobservedWorld:hide}));
const technical=(state:GameState,hide=true)=>renderToStaticMarkup(createElement(ui.JournalTechnicalEvidence,{replay:state,hideUnobservedWorld:hide}));

test('SSR generated-style system and technical views show no initial secrets, disclose only actual observations',()=>{
 const scenario=fixture();scenario.hooks=[{id:'silent-change',trigger:{type:'after-call',call:1},effects:{journalSecret:changed}}];const g=play(scenario);
 for(const html of [system(g.state,scenario),technical(g.state)]){assert.ok(!html.includes(secret));assert.ok(!html.includes(other));assert.ok(!html.includes('journalSecret'));}
 g.launch();g.act({type:'tool',call:{tool:'observe',observationId:'secret'}});assert.equal(g.state.world.journalSecret,changed);assert.equal(g.state.observed.journalSecret,undefined);
 for(const html of [system(g.state,scenario),technical(g.state)]){assert.ok(html.includes(secret));assert.ok(!html.includes(changed),'a background world-change is not an observation');assert.ok(!html.includes(other));}
 assert.equal(journalPublicEvents(g.state,true).find(e=>e.type==='world-change')!.facts,undefined);assert.match(system(g.state,scenario),/历史快照|当前状态需重新观察/);
 g.act({type:'tool',call:{tool:'observe',observationId:'secret'}});assert.ok(system(g.state,scenario).includes(changed));assert.ok(technical(g.state).includes(changed));
 const disclosures=journalFactDisclosures(g.state,scenario);assert.deepEqual(disclosures.map(d=>d.value),[secret,changed]);assert.ok(disclosures[1].sequence>disclosures[0].sequence);
});
test('sandbox observations keep sandbox provenance and never reveal untouched live world facts',()=>{
 const g=play();g.act({type:'security',operation:'realm',realm:'sandbox'});g.launch();g.act({type:'tool',call:{tool:'observe',observationId:'secret'}});g.act({type:'context',operation:'include',recordId:g.state.context!.records.at(-1)!.id});
 const html=system(g.state,g.scenario);assert.ok(html.includes(secret));assert.ok(!html.includes(other));assert.match(html,/镜砂沙箱/);assert.doesNotMatch(html,/城市现场实际状态|世界实际状态/);assert.equal(journalFactDisclosures(g.state,g.scenario)[0].realm,'sandbox');assert.equal(g.state.observed.journalSecret.provenance!.realm,'sandbox');
 assert.equal(journalFactDisclosures(g.state,g.scenario).length,1,'装卷的已知快照不把原外部资料再标成一次行动回执');assert.equal(journalFactDisclosures(g.state,g.scenario)[0].provenance!.trust,'external');
});
test('team initial artifact fields and queued task inputs remain private until a real teammate observation event',()=>{
 const g=play(fixture(8));assert.equal(g.state.team!.artifacts[0].fields.journalSecret,secret);assert.ok(!technical(g.state).includes(secret));assert.ok(!system(g.state,g.scenario).includes(secret));g.launch();
 g.act({type:'team',operation:'enqueue',jobId:'read',actorId:'reader',inputRecordIds:[],boardRefs:[],afterTaskIds:[]});assert.ok(!technical(g.state).includes(secret));
 g.act({type:'team',operation:'tick'});const html=system(g.state,g.scenario);assert.ok(html.includes(secret));assert.match(html,/读图员/);assert.equal(g.state.observed.journalSecret,undefined);assert.ok(technical(g.state).includes(secret));assert.ok(!technical(g.state).includes(other));
 const team=journalTechnicalProjection(g.state,true).team as {artifacts:unknown[];tasks:Array<Record<string,unknown>>};assert.ok(!JSON.stringify(team.artifacts).includes(secret));assert.ok(!('observed' in team.tasks[0]));assert.ok(!('inputs' in team.tasks[0]));
});
test('queued lab message conditions and private host plans are hidden until the real input event',()=>{
 const g=play(fixture(10));g.launch();g.act({type:'lab',operation:'enqueue',messageId:'private-message',mode:'followup'});assert.equal(g.state.lab!.tasks[0].steps[0].whenKnown!.journalSecret,secret);assert.ok(!technical(g.state).includes(secret));assert.ok(!system(g.state,g.scenario).includes(secret));
 g.act({type:'lab',operation:'tick',taskId:g.state.lab!.tasks[0].id});assert.equal(g.state.observed.journalSecret,undefined);assert.ok(system(g.state,g.scenario).includes(secret));assert.ok(technical(g.state).includes(secret));assert.ok(!technical(g.state).includes(other));assert.match(system(g.state,g.scenario),/原始来信正文/);
 const host=journalTechnicalProjection(g.state,true).host as {tasks:Array<Record<string,unknown>>};assert.ok(!('steps' in host.tasks[0]));assert.ok(!('observed' in host.tasks[0]));
});
test('isolated evaluation initial overrides stay private until case tools actually disclose them',()=>{
 const g=play(fixture(9));g.launch();g.act({type:'evaluation',operation:'configure',candidateId:'reader',criterionIds:['done'],aggregation:'all'});g.act({type:'evaluation',operation:'run',caseId:'private-case'});
 assert.equal(g.state.evaluation!.runs[0].world.journalSecret,'isolated-case-D');for(const html of [technical(g.state),system(g.state,g.scenario)]){assert.ok(!html.includes('isolated-case-D'));assert.ok(!html.includes(secret));assert.ok(!html.includes(other));}
 g.act({type:'evaluation',operation:'tick'});assert.ok(technical(g.state).includes('isolated-case-D'));assert.ok(system(g.state,g.scenario).includes('isolated-case-D'));assert.ok(!system(g.state,g.scenario).includes(secret));assert.match(system(g.state,g.scenario),/试验世界 隔离案例/);assert.equal(g.state.observed.journalSecret,undefined);
 const evaluation=journalTechnicalProjection(g.state,true).evaluation as {runs:Array<Record<string,unknown>>};assert.ok(!('world' in evaluation.runs[0]));assert.ok(!('observed' in evaluation.runs[0]));
});
test('ordinary authored system truth and technical host dumps retain their previous behavior',()=>{
 const g=play(fixture(8));assert.ok(system(g.state,g.scenario,false).includes(secret));assert.ok(system(g.state,g.scenario,false).includes(other));assert.ok(technical(g.state,false).includes(secret));assert.deepEqual(journalTechnicalProjection(g.state,false).team,g.state.team);assert.equal(journalPublicEvents(g.state,false),g.state.events);
});
test('generated recap override takes priority and official source recap remains a fallback',()=>{
 const instance=generateChallenge({factoryVersion:1,templateId:'typed-schema',seed:71}),state=createGame(instance.scenario,71);
 const fallback=renderToStaticMarkup(createElement(ui.default,{state,scenario:instance.scenario,actions:[],sourceScenarioId:instance.template.sourceScenarioId,hideUnobservedWorld:true}));assert.ok(fallback.includes(uiStories[instance.template.sourceScenarioId].recap.story));
 const custom=renderToStaticMarkup(createElement(ui.default,{state,scenario:instance.scenario,actions:[],sourceScenarioId:instance.template.sourceScenarioId,hideUnobservedWorld:true,recap:{story:'这次使用已取得的证据推进。',system:'保留来源。',technical:'有限工具回路。'}}));assert.match(custom,/这次使用已取得的证据推进。/);assert.ok(!custom.includes(uiStories[instance.template.sourceScenarioId].recap.story));
});
test('generated command feedback excludes silent hook fields while preserving its actual observed document',()=>{
 const scenario=fixture();scenario.hooks=[{id:'silent-change',trigger:{type:'after-call',call:1},effects:{journalSecret:changed}}];const g=play(scenario);g.launch();g.act({type:'tool',call:{tool:'observe',observationId:'secret'}});
 const asyncNoop=async()=>undefined,props={state:g.state,scenario,busy:false,onCall:asyncNoop,onStep:asyncNoop,onWorkshop:()=>{},onReceive:asyncNoop,onContext:asyncNoop,onArchive:asyncNoop,onSecurity:asyncNoop,onTeam:asyncNoop,onEvaluation:asyncNoop,onLab:asyncNoop,onPause:asyncNoop,onResume:asyncNoop};
 const hidden=renderToStaticMarkup(createElement(CommandDeck,{...props,hideUnobservedWorld:true}));assert.ok(hidden.includes(secret),'the actually read archive remains inspectable');assert.ok(!hidden.includes(changed));assert.ok(!hidden.includes(other));
 const ordinary=renderToStaticMarkup(createElement(CommandDeck,props));assert.ok(ordinary.includes(changed),'the optional privacy flag preserves authored feedback behavior');
});
test('generated team diagram shows actual disclosed version snapshots rather than its initial fields',()=>{
 const g=play(fixture(8));const render=(hide=true)=>renderToStaticMarkup(createElement(TeamDeck,{state:g.state,scenario:g.scenario,onTeam:()=>{},hideUnobservedWorld:hide}));
 assert.ok(!render().includes(secret));assert.match(render(),/尚未取得总图字段/);assert.ok(render(false).includes(secret));g.launch();g.act({type:'team',operation:'enqueue',jobId:'read',actorId:'reader',inputRecordIds:[],boardRefs:[],afterTaskIds:[]});assert.ok(!render().includes(secret));g.act({type:'team',operation:'tick'});assert.ok(render().includes(secret));assert.match(render(),/已披露总图 v1/);
 const before=JSON.stringify(g.state);render();assert.equal(JSON.stringify(g.state),before,'display does not fill any actor context or mutate the shared design');
});
test('session started snapshots retain no external input claims disguised as executor receipts',()=>{
 const g=play(fixture(10));g.launch();g.act({type:'lab',operation:'enqueue',messageId:'private-message',mode:'followup'});g.act({type:'lab',operation:'tick',taskId:g.state.lab!.tasks[0].id});
 const started=g.state.events.find(e=>e.labPhase==='started')!;assert.ok(started.facts?.journalSecret);assert.equal(journalPublicEvents(g.state,true).find(e=>e.id===started.id)!.facts,undefined);
 const inputs=journalFactDisclosures(g.state,g.scenario).filter(d=>d.fact==='journalSecret');assert.equal(inputs.length,1);assert.equal(inputs[0].source,'原始来信正文');assert.equal(inputs[0].provenance!.trust,'external');
});
