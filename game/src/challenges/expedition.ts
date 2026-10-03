import {createGame,reduceGame} from '../engine';
import type {ScenarioDefinition} from '../engine/types';
import {challengeTemplates} from './catalog';
import {canonical,generateChallenge,seededRandom} from './generator';
import type {ExpeditionAction,ExpeditionAttempt,ExpeditionDefinition,ExpeditionSpec,ExpeditionState} from './types';
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export function generateExpedition(spec:ExpeditionSpec):ExpeditionDefinition {
 if(!object(spec)||spec.factoryVersion!==1||!Number.isSafeInteger(spec.seed)||spec.seed<0||spec.seed>0xffffffff||Object.keys(spec).some(k=>!['factoryVersion','seed'].includes(k)))throw new Error('远征工厂与种子无效。');
 const random=seededRandom(spec.seed),floors=([1,2,3] as const).map(tier=>{const pool=challengeTemplates.filter(t=>t.tier===tier);return {factoryVersion:1 as const,templateId:pool[Math.floor(random()*pool.length)].id,seed:Math.floor(random()*4294967296)};}) as ExpeditionDefinition['floors'];
 const referenceCost=floors.reduce((n,s)=>n+generateChallenge(s).referenceCost,0),initialBudget=referenceCost+Math.max(5,Math.ceil(referenceCost*.25));if(initialBudget>256)throw new Error('三层参考解超出有限任务资源上限。');
 return {spec:structuredClone(spec),id:`expedition-v1-${spec.seed.toString(36)}`,floors,initialBudget,referenceCost};
}
/** The scenario is reconstructed from the frozen spec, with the real remaining pool as its start budget. */
export function scenarioForExpedition(state:Pick<ExpeditionState,'definition'|'floor'|'floorStartBudget'>):ScenarioDefinition {
 const s=generateChallenge(state.definition.floors[state.floor]).scenario;s.limits={...s.limits,missionBudget:state.floorStartBudget,maxBudget:Math.min(s.limits!.maxBudget!,state.floorStartBudget)};return s;
}
export function createExpedition(spec:ExpeditionSpec):ExpeditionState {
 const definition=generateExpedition(spec),base={definition,floor:0 as const,floorStartBudget:definition.initialBudget};return {version:1,...base,remaining:definition.initialBudget,status:'active',game:createGame(scenarioForExpedition(base),definition.floors[0].seed),currentActions:[],attempts:[],finished:[],history:[]};
}
const attempt=(state:ExpeditionState):ExpeditionAttempt=>({floor:state.floor,spec:structuredClone(state.definition.floors[state.floor]),initialBudget:state.floorStartBudget,game:structuredClone(state.game),actions:structuredClone(state.currentActions),cost:state.floorStartBudget-state.remaining});
export function reduceExpedition(previous:ExpeditionState,action:ExpeditionAction):ExpeditionState {
 try{
  if(previous.status!=='active'||previous.history.length>=10000||!object(action)||Object.keys(action).some(k=>!['type',...(action.type==='game'?['action']:[])].includes(k)))return previous;
  if(action.type==='game'){
   // A normal reset restores the inner scenario's original crystals. The expedition offers its own charged retry instead.
   if(!object(action.action)||action.action.type==='reset')return previous;
   const game=reduceGame(scenarioForExpedition(previous),previous.game,action.action);if(game===previous.game)return previous;
   const next=structuredClone(previous);next.game=game;next.currentActions.push(structuredClone(action.action));next.remaining=game.runtime!.missionRemaining;next.history.push(structuredClone(action));return next;
  }
  if(action.type==='advance'){
   if(previous.game.status!=='won')return previous;
   const next=structuredClone(previous);next.finished.push(attempt(previous));next.history.push(structuredClone(action));
   if(previous.floor===2){next.status='cleared';return next;}
   if(previous.remaining<=0)return previous;
   next.floor=(previous.floor+1) as 1|2;next.floorStartBudget=previous.remaining;next.currentActions=[];next.game=createGame(scenarioForExpedition(next),next.definition.floors[next.floor].seed);return next;
  }
  if(action.type==='retry-floor'){
   if(previous.game.status==='won'||previous.remaining<=0)return previous;
   const next=structuredClone(previous);next.attempts.push(attempt(previous));next.floorStartBudget=previous.remaining;next.currentActions=[];next.game=createGame(scenarioForExpedition(next),next.definition.floors[next.floor].seed);next.history.push(structuredClone(action));return next;
  }
  if(action.type==='abandon'){const next=structuredClone(previous);next.status='abandoned';next.history.push(structuredClone(action));return next;}
  return previous;
 }catch{return previous;}
}
export function validateExpedition(input:unknown):input is ExpeditionState {
 try{
  if(!object(input)||input.version!==1||!object(input.definition)||!Array.isArray(input.history)||input.history.length>10000)return false;
  let state=createExpedition(input.definition.spec as unknown as ExpeditionSpec);for(const a of input.history){const next=reduceExpedition(state,a as ExpeditionAction);if(next===state)return false;state=next;}return canonical(state)===canonical(input);
 }catch{return false;}
}
