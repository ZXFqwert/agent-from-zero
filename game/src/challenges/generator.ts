import {scenarios} from '../content/scenarios';
import {chapterOneWalkthroughs,type ChapterOneWalkthrough} from '../content/chapterOne';
import {chapterTwoWalkthroughs} from '../content/chapterTwo';
import {chapterThreeWalkthroughs} from '../content/chapterThree';
import {chapterFourWalkthroughs} from '../content/chapterFour';
import {chapterFiveWalkthroughs} from '../content/chapterFive';
import {chapterSixWalkthroughs} from '../content/chapterSix';
import {chapterSevenWalkthroughs} from '../content/chapterSeven';
import {chapterEightWalkthroughs} from '../content/chapterEight';
import {blueprintTrialWalkthroughs} from '../content/blueprintTrials';
import {createGame,reduceGame,validateGameState,validateScenario} from '../engine';
import {resolveAuthoredStep} from '../content/walkthrough';
import type {GameAction,GameState,ScenarioDefinition} from '../engine/types';
import {challengeTemplates} from './catalog';
import {applyDecisionVariant} from './variants';
import {challengeNarrative} from '../content/challengeNarrative';
import type {ChallengeInstance,ChallengeSpec,ChallengeReplay,ChallengeValidation} from './types';
const authored:ChapterOneWalkthrough[]=[...chapterOneWalkthroughs,...chapterTwoWalkthroughs,...chapterThreeWalkthroughs,...chapterFourWalkthroughs,...chapterFiveWalkthroughs,...chapterSixWalkthroughs,...chapterSevenWalkthroughs,...chapterEightWalkthroughs,...blueprintTrialWalkthroughs] as ChapterOneWalkthrough[];
export const canonical=(x:unknown):string=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.entries(x).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`:JSON.stringify(x);
export function seededRandom(seed:number):()=>number {let x=seed>>>0;return ()=>{x=(x+0x6d2b79f5)>>>0;let z=x;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};}
const mix=(seed:number,key:string)=>[...key].reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,seed>>>0);
const shuffle=<T>(values:T[],random:()=>number)=>{for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;};
function build(spec:ChallengeSpec):ChallengeInstance {
 if(spec.factoryVersion!==1||!Number.isSafeInteger(spec.seed)||spec.seed<0||spec.seed>0xffffffff||Object.keys(spec).some(k=>!['factoryVersion','templateId','seed'].includes(k)))throw new Error('挑战只接受固定工厂版本、模板和32位非负种子。');
 const template=challengeTemplates.find(t=>t.id===spec.templateId);if(!template)throw new Error('未知机制模板。');
 const source=scenarios.find(s=>s.id===template.sourceScenarioId)!;if(!source)throw new Error('冻结模板来源缺失。');
 const scenario=structuredClone(source),routes=structuredClone(authored.filter(r=>r.scenarioId===source.id)),random=seededRandom(mix(spec.seed,template.id));
 if(!routes.some(r=>r.purpose==='reference')||!routes.some(r=>r.purpose==='recovery'))throw new Error('模板必须有实际参考与恢复路线。');
 const id=`challenge-${template.id}-${spec.seed.toString(36)}`;scenario.id=id;scenario.title=template.label;scenario.subtitle=`远行编号 ${spec.seed.toString(36).toUpperCase()}`;
 // A rearranged authored encounter is practice, including its kernel-level evidence.
 if(scenario.kind==='transfer')scenario.kind='guided';
 const decisionVariantKey=applyDecisionVariant(scenario,routes,template.id,(spec.seed&1) as 0|1);
 scenario.brief=challengeNarrative(template.id,template.decision).brief;
 const targets=[...new Set([...scenario.observations.map(o=>o.target),...scenario.operations.map(o=>o.target)])].sort();const factors=Object.fromEntries(targets.map(t=>[t,random()<.5?1:2]));
 for(const o of scenario.observations){o.label=o.label.replace(/\s*·\s*\d+\s*$/,'');o.cost=(o.cost??scenario.limits?.toolCosts?.observe??1)*factors[o.target];}
 for(const o of scenario.operations){o.label=o.label.replace(/\s*·\s*\d+\s*$/,'');o.cost=(o.cost??scenario.limits?.toolCosts?.operate??1)*factors[o.target];if(o.failureCost!==undefined)o.failureCost*=factors[o.target];}
 for(const g of scenario.goals){const target=scenario.operations.find(o=>o.id===g.operationId)!.target;g.verifyCost=(g.verifyCost??scenario.limits?.toolCosts?.verify??1)*factors[target];}
 const budget=Math.min(256,Math.max(...routes.map(r=>r.expectedCost))*2+4+Math.floor(random()*5));scenario.limits={...scenario.limits,maxBudget:Math.min(64,budget),missionBudget:budget};
 if(scenario.team){for(const a of scenario.team.actors)a.budget=Math.min(64,a.budget*2);for(const r of routes)for(const stage of r.stages)for(const step of stage.steps??[])if(step.type==='team'&&step.operation==='configure')step.blueprint.budget=Math.min(64,step.blueprint.budget*2);}
 // A new irrelevant observation is genuinely unknown and can consume scarce context if carried.
 const noise='challengeWeather';if(Object.hasOwn(scenario.initialWorld,noise))throw new Error('冻结模板使用了保留变体字段。');scenario.initialWorld[noise]=['窗外有雨','街口有雾','屋顶有风'][Math.floor(random()*3)];
 scenario.observations.push({id:'challenge-weather',target:'challenge-roof',label:'屋顶闲谈',facts:[noise],text:'这条消息说的是天气。是否与当前交付有关，要看工具真正要求的字段。',cost:1,...((scenario.engineVersion??1)>=5?{document:{units:1,source:'远征路边传闻'},...((scenario.engineVersion??1)>=7?{provenance:'external' as const}:{})}:{})});
 shuffle(scenario.observations,random);shuffle(scenario.operations,random);
 if(scenario.evaluation)shuffle(scenario.evaluation.cases,random);
 for(const r of routes){r.scenarioId=id;r.id=`${id}-${r.purpose}-${routes.indexOf(r)}`;}
 const errors=validateScenario(scenario);if(errors.length)throw new Error(errors.join('；'));
 return {spec:structuredClone(spec),id,template:structuredClone(template),decisionVariantKey,scenario,routes,referenceCost:0,recoveryCost:0};
}
/** The verification runner lives outside gameplay; it cannot supply state or knowledge to the player. */
export function replayChallengeRoute(instance:ChallengeInstance,route:ChapterOneWalkthrough):ChallengeReplay {
 const s=instance.scenario;let state=createGame(s,instance.spec.seed),counter=0,cost=0,rejected=0;
 const apply=(data:object,reject=false)=>{const a={...data,id:`challenge-action-${counter++}`} as GameAction,next=reduceGame(s,state,a);if(reject){if(next!==state)throw new Error('参考故障动作没有原对象无副作用拒绝。');rejected++;return;}if(next===state)throw new Error(`挑战参考被拒绝：${JSON.stringify(data)}`);cost+=next.events.slice(state.events.length).filter(e=>['request','lab-request','evaluation-request'].includes(e.type)).reduce((sum,e)=>sum+(e.cost??1),0);state=next;};
 const running=()=>{if(state.status==='paused')apply({type:'resume',mode:'manual'});else if(state.status!=='running')apply({type:'dispatch',mode:'manual'});};
 const assertWorld=(map:Record<string,string|number|boolean>)=>{for(const [f,v]of Object.entries(map))if(state.world[f]!==v)throw new Error(`恢复断言未成立：${f}`);};
 for(const stage of route.stages){
  if(state.status==='running')apply({type:'pause'});
  apply({type:'configure',blueprint:{tools:stage.tools,feedback:true,verification:true,budget:s.limits!.maxBudget!,permissions:['*'],...(stage.loopPolicy?{loopPolicy:stage.loopPolicy}:{}),...(stage.instructionPolicy?{instructionPolicy:stage.instructionPolicy}:{}),...(stage.toolPermissions?{toolPermissions:stage.toolPermissions}:{})}});apply({type:'dispatch',mode:'manual'});
  for(const c of stage.contextChanges??[]){const card=[...(state.context?.records??[])].reverse().find(r=>r.observationId===c.observationId);if(!card)throw new Error('挑战不能装入尚未取得的资料。');apply({type:'context',recordId:card.id,operation:c.operation,...(c.summaryId?{summaryId:c.summaryId}:{})});}
  for(const step of stage.steps??[]){if(step.type==='tool'||step.type==='step'||step.type==='skill'&&step.operation==='run')running();apply(resolveAuthoredStep(state,step,`challenge-action-${counter}`),step.expectRejected===true);}
  for(const call of stage.calls)apply({type:'tool',call});
  if(stage.collectReceipts)for(const receipt of state.protocol?.receipts.filter(r=>!r.collected)??[])apply({type:'receive',callId:receipt.callId,receiptId:receipt.id});
  assertWorld(stage.expectWorld??{});for(const fact of stage.absentProofs??[])if(state.verifiedGoals.includes(fact))throw new Error('挑战错误地保留了已经失效的证明。');
 }
 assertWorld(route.expectedWorld);if(state.status!=='won')throw new Error('参考实际事件不能完成此变体。');if(!validateGameState(s,JSON.parse(JSON.stringify(state))))throw new Error('挑战事件不能通过严格JSON重放。');
 const faults=state.events.filter(e=>e.success===false||['result','lab-result'].includes(e.type)&&(e.delivered===false||s.goals.some(g=>e.facts&&Object.hasOwn(e.facts,g.fact)&&e.facts[g.fact]!==g.equals)));
 return {state,actions:structuredClone(state.runtime!.actionHistory),cost,rejected,failedEvents:state.events.filter(e=>e.success===false).length,faultEventIds:faults.map(e=>e.id)};
}
const verifiedCache=new Map<string,ChallengeInstance>();
export function generateChallenge(spec:ChallengeSpec):ChallengeInstance {
 const key=canonical(spec),cached=verifiedCache.get(key);if(cached)return structuredClone(cached);
 const instance=build(spec);for(const route of instance.routes)route.expectedCost=replayChallengeRoute(instance,route).cost;
 instance.referenceCost=Math.min(...instance.routes.filter(r=>r.purpose!=='recovery').map(r=>r.expectedCost));instance.recoveryCost=Math.max(...instance.routes.filter(r=>r.purpose==='recovery').map(r=>r.expectedCost));if(verifiedCache.size>=48)verifiedCache.delete(verifiedCache.keys().next().value!);verifiedCache.set(key,structuredClone(instance));return instance;
}
export function validateChallenge(instance:ChallengeInstance):ChallengeValidation {
 const errors:string[]=[],routeCosts:Record<string,number>={};try{
  const rebuilt=generateChallenge(instance.spec);if(canonical(instance)!==canonical(rebuilt))errors.push('挑战定义或参考解与冻结种子工厂不一致。');
  for(const r of rebuilt.routes){const proof=replayChallengeRoute(rebuilt,r);routeCosts[r.id]=proof.cost;if(proof.cost!==r.expectedCost)errors.push('参考成本与真实事件不一致。');if(r.purpose==='recovery'&&!proof.rejected&&!proof.faultEventIds.length)errors.push('故障恢复没有真实失败或拒绝证据。');}
 }catch(e){errors.push(String(e));}return {valid:!errors.length,errors,routeCosts};
}
