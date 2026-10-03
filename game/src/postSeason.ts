import {createGame,reduceGame,validateGameState} from './engine';
import type {GameAction,GameState,ScenarioDefinition} from './engine/types';
import {
 canonical,challengeTemplates,createExpedition,deriveUnlockedTemplateIds,generateChallenge,reduceExpedition,
 validateExpedition,scenarioForExpedition,type ChallengeSpec,type ExpeditionAction,type ExpeditionSpec,type ExpeditionState,
} from './challenges';

export interface PostChallenge {spec:ChallengeSpec;game:GameState;actions:GameAction[];}
export interface PostSeasonState {
 version:1;selectedMode:null|'challenge'|'expedition';currentChallenge:PostChallenge|null;
 /** At most one actual ordinary-task win per template + finite decision variant. */
 wonProofs:PostChallenge[];checkpoints:PostChallenge[];
 activeExpedition:ExpeditionState|null;latestClearedExpedition:ExpeditionState|null;
}
export type PostSeasonAction=
 |{type:'select-mode';mode:PostSeasonState['selectedMode']}
 |{type:'start-challenge';spec:ChallengeSpec}
 |{type:'challenge';action:GameAction}
 |{type:'checkpoint'}
 |{type:'restore-checkpoint';index:number}
 |{type:'start-expedition';spec:ExpeditionSpec}
 |{type:'expedition';action:ExpeditionAction};
export const MAX_POST_ACTIONS=4000;
export const emptyPostSeason=():PostSeasonState=>({version:1,selectedMode:null,currentChallenge:null,wonProofs:[],checkpoints:[],activeExpedition:null,latestClearedExpedition:null});
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
function keys(value:unknown,expected:string[]):boolean {return object(value)&&Object.keys(value).length===expected.length&&Object.keys(value).every(k=>expected.includes(k));}
const sameSpec=(a:ChallengeSpec,b:ChallengeSpec)=>canonical(a)===canonical(b);
const proofKey=(p:PostChallenge)=>generateChallenge(p.spec).decisionVariantKey;
// Content keys, rather than mutable object identities, make these bounded positive caches
// safe across JSON imports. A modified world, action or hint always gets a different key.
const unlockedMemo=new Map<string,string[]>(),ordinaryMemo=new Set<string>(),expeditionMemo=new Set<string>();
function remember(set:Set<string>,key:string,limit:number):void {if(key.length>262144)return;if(set.size>=limit)set.delete(set.values().next().value!);set.add(key);}
function unlockedIds(mainGames:readonly GameState[]):string[] {
 const relevant=mainGames.filter(g=>g&&challengeTemplates.some(t=>t.sourceScenarioId===g.scenarioId)),key=canonical(relevant);
 const cached=unlockedMemo.get(key);if(cached)return cached;const result=deriveUnlockedTemplateIds(relevant);if(key.length<=1048576){if(unlockedMemo.size>=2)unlockedMemo.delete(unlockedMemo.keys().next().value!);unlockedMemo.set(key,result);}return result;
}
function helperId(game:GameState,kind:string):string {let n=game.processedActionIds.length;while(game.processedActionIds.includes(`post-${kind}-${n}`))n++;return `post-${kind}-${n}`;}
function validActionKeys(action:unknown):action is GameAction {
 if(!object(action)||typeof action.type!=='string')return false;
 const common=['id','type'];const extras:Record<string,string[]>={
  lab:['operation','providerId','modelId','roleId','rules','targets','call','taskId','moduleId','routing','messageId','mode','trusted','moduleIds','realm','mounts','signal'],
  evaluation:['operation','candidateId','criterionIds','aggregation','caseId','caseIds'],
  team:['operation','actorId','blueprint','jobId','inputRecordIds','boardRefs','afterTaskIds','taskId','resultId','slotId','recordId','expectedRevision','fieldKeys','proposalId'],
  security:['operation','principalId','recordId','call','realm'],memory:['operation','key','recordId'],session:['operation','branchId','label'],skill:['operation','skillId'],context:['operation','recordId','summaryId'],
  configure:['blueprint'],tool:['call'],reset:['preserveBlueprint'],dispatch:['mode'],resume:['mode'],step:['source'],receive:['callId','receiptId'],pause:[],hint:[],
 };
 const actionType=action.type;if(!Object.hasOwn(extras,actionType)||Object.keys(action).some(k=>![...common,...extras[actionType]].includes(k)))return false;
 if(action.type==='reset'&&action.preserveBlueprint!==undefined&&typeof action.preserveBlueprint!=='boolean')return false;
 if(action.call!==undefined){const call=action.call;if(!object(call)||typeof call.tool!=='string')return false;const allowed=call.tool==='operate'?['tool','operationId','arguments','requestKey']:call.tool==='observe'?['tool','observationId']:call.tool==='verify'?['tool','fact']:[];if(!allowed.length||Object.keys(call).some(k=>!allowed.includes(k)))return false;}
 return true;
}
function validateOrdinary(input:unknown,unlocked:Set<string>):PostChallenge {
 if(!keys(input,['spec','game','actions']))throw new Error('挑战记录结构不正确。');const p=input as unknown as PostChallenge;
 const instance=generateChallenge(p.spec);if(!unlocked.has(instance.template.id))throw new Error('挑战缺少已验证的主线来源通关。');
 if(!Array.isArray(p.actions)||p.actions.length>MAX_POST_ACTIONS||!p.actions.every(validActionKeys)||p.game?.seed!==p.spec.seed)throw new Error('挑战行动或实际状态不能严格重放。');
 const key=canonical(p);if(!ordinaryMemo.has(key)){if(!validateGameState(instance.scenario,p.game)||canonical(p.actions)!==canonical(p.game.runtime!.actionHistory))throw new Error('挑战行动或实际状态不能严格重放。');remember(ordinaryMemo,key,64);}
 if(p.actions.some(a=>a.type==='hint')&&!p.game.hintUsed)throw new Error('重试后的提示记录不能洗白。');
 return p;
}
function expeditionInputs(e:ExpeditionState):GameState[] {return [e.game,...e.attempts.filter(a=>a.floor===e.floor).map(a=>a.game)];}
function validateExpeditionRecord(input:unknown,unlocked:Set<string>):ExpeditionState {
 const key=canonical(input);if(!expeditionMemo.has(key)){if(!validateExpedition(input))throw new Error('远征的共同预算与行动历史不能严格重放。');remember(expeditionMemo,key,8);}const e=input as ExpeditionState;
 if(e.history.length>MAX_POST_ACTIONS||e.history.some(a=>a.type==='game'&&!validActionKeys(a.action))||e.definition.floors.some(f=>!unlocked.has(f.templateId)))throw new Error('远征行动超限或缺少已验证的来源通关。');
 if(expeditionInputs(e).some(g=>g.hintUsed)&&!e.game.hintUsed)throw new Error('远征重试不能洗掉本层提示。');
 const seen=[...new Set(expeditionInputs(e).flatMap(g=>g.evaluation?.seenCaseIds??[]))];if(seen.some(id=>!e.game.evaluation?.seenCaseIds.includes(id)))throw new Error('远征重试不能洗掉本层案例曝光。');
 return e;
}
function records(state:PostSeasonState):PostChallenge[] {return [...(state.currentChallenge?[state.currentChallenge]:[]),...state.wonProofs,...state.checkpoints];}
function totalActions(state:PostSeasonState):number {
 return records(state).reduce((n,p)=>n+p.actions.length,0)+(state.activeExpedition?.history.length??0)+(state.latestClearedExpedition&&canonical(state.activeExpedition)!==canonical(state.latestClearedExpedition)?state.latestClearedExpedition.history.length:0);
}
/** Main wins are checked here too; IDs, UI completion flags and firstEncounter are never accepted. */
export function validatePostSeason(input:unknown,mainGames:readonly GameState[]):PostSeasonState {
 if(!keys(input,['version','selectedMode','currentChallenge','wonProofs','checkpoints','activeExpedition','latestClearedExpedition']))throw new Error('长期挑战存档结构不正确。');const s=input as unknown as PostSeasonState;
 if(s.version!==1||![null,'challenge','expedition'].includes(s.selectedMode)||!Array.isArray(s.wonProofs)||s.wonProofs.length>48||!Array.isArray(s.checkpoints)||s.checkpoints.length>3)throw new Error('长期挑战版本或记录数量不正确。');
 const unlocked=new Set(unlockedIds(mainGames));const proofs=new Set<string>();
 if(s.currentChallenge!==null)validateOrdinary(s.currentChallenge,unlocked);
 for(const p of s.wonProofs){validateOrdinary(p,unlocked);const key=proofKey(p);if(p.game.status!=='won'||proofs.has(key))throw new Error('同一实际决策变体只能保留一份胜利证明。');proofs.add(key);}
 for(const cp of s.checkpoints){validateOrdinary(cp,unlocked);if(cp.game.status==='won')throw new Error('恢复检查点应是尚未完成的普通挑战。');}
 if(s.activeExpedition!==null)validateExpeditionRecord(s.activeExpedition,unlocked);
 if(s.latestClearedExpedition!==null){validateExpeditionRecord(s.latestClearedExpedition,unlocked);if(s.latestClearedExpedition.status!=='cleared')throw new Error('远征里程碑缺少三层实际胜利。');}
 if(s.activeExpedition?.status==='cleared'&&canonical(s.activeExpedition)!==canonical(s.latestClearedExpedition))throw new Error('最新远征胜利里程碑不一致。');
 if(s.selectedMode==='challenge'&&!s.currentChallenge||s.selectedMode==='expedition'&&!s.activeExpedition)throw new Error('当前模式没有对应的真实尝试。');
 if(s.currentChallenge){const same=records(s).filter(p=>sameSpec(p.spec,s.currentChallenge!.spec));if(same.some(p=>p.game.hintUsed)&&!s.currentChallenge.game.hintUsed)throw new Error('恢复后的当前挑战不能洗掉已经使用的提示。');const seen=[...new Set(same.flatMap(p=>p.game.evaluation?.seenCaseIds??[]))];if(seen.some(id=>!s.currentChallenge!.game.evaluation?.seenCaseIds.includes(id)))throw new Error('恢复后的当前挑战不能洗掉已经打开的案例。');}
 if(totalActions(s)>MAX_POST_ACTIONS)throw new Error('长期挑战实际行动记录超过4000条。');
 return structuredClone(s);
}
function rememberedOrdinary(state:PostSeasonState,p:PostChallenge,recovered=false):PostChallenge {
 const same=records(state).filter(old=>sameSpec(old.spec,p.spec)),next=structuredClone(p),scenario=generateChallenge(p.spec).scenario;
 const apply=(action:GameAction)=>{const game=reduceGame(scenario,next.game,action);if(game===next.game)throw new Error('无法保守恢复学习记录。');next.game=game;next.actions.push(action);};
 if((p.actions.some(a=>a.type==='hint')||same.some(old=>old.game.hintUsed))&&!next.game.hintUsed)apply({id:helperId(next.game,'remember-hint'),type:'hint'});
 const active=next.game.evaluation?.runs.find(r=>r.id===next.game.evaluation?.activeRunId);
 const seen=[...new Set(same.flatMap(old=>old.game.evaluation?.seenCaseIds??[]))].filter(id=>!next.game.evaluation?.seenCaseIds.includes(id)||recovered&&active?.caseId===id&&active.firstSeen);if(seen.length)apply({id:helperId(next.game,'remember-seen'),type:'evaluation',operation:'mark-seen',caseIds:seen});
 return next;
}
function recordWin(state:PostSeasonState):void {
 const p=state.currentChallenge;if(p?.game.status!=='won')return;const key=proofKey(p),i=state.wonProofs.findIndex(old=>proofKey(old)===key);
 if(i<0)state.wonProofs.push(structuredClone(p));else if(state.wonProofs[i].game.hintUsed&&!p.game.hintUsed)state.wonProofs[i]=structuredClone(p);
}
function rememberCheckpointFacts(state:PostSeasonState):void {
 // A current attempt may be deliberately replaced. Each retained checkpoint must
 // carry its own conservative exposure proof before that sole live record disappears.
 state.checkpoints=state.checkpoints.map(cp=>rememberedOrdinary(state,cp,true));
}
function rememberedExpedition(e:ExpeditionState):ExpeditionState {
 let next=e;const prior=expeditionInputs(next),scenario=next.game;
 if(prior.some(g=>g.hintUsed)&&!scenario.hintUsed){const action:GameAction={id:helperId(scenario,'exp-hint'),type:'hint'};const amended=reduceExpedition(next,{type:'game',action});if(amended===next)throw new Error('无法保守恢复远征提示。');next=amended;}
 const seen=[...new Set(prior.flatMap(g=>g.evaluation?.seenCaseIds??[]))].filter(id=>!next.game.evaluation?.seenCaseIds.includes(id));if(seen.length){const amended=reduceExpedition(next,{type:'game',action:{id:helperId(next.game,'exp-seen'),type:'evaluation',operation:'mark-seen',caseIds:seen}});if(amended===next)throw new Error('无法保守恢复远征案例曝光。');next=amended;}
 return next;
}
/** Invalid updates preserve the original object. Domain reducers alone change worlds or charge crystals. */
export function reducePostSeason(previous:PostSeasonState,action:PostSeasonAction,mainGames:readonly GameState[]):PostSeasonState {
 try{
  const permitted:Record<PostSeasonAction['type'],string[]>={'select-mode':['type','mode'],'start-challenge':['type','spec'],challenge:['type','action'],checkpoint:['type'],'restore-checkpoint':['type','index'],'start-expedition':['type','spec'],expedition:['type','action']};
  if(!object(action)||!Object.hasOwn(permitted,action.type)||!keys(action,permitted[action.type]))return previous;
  const next=structuredClone(previous),unlocked=new Set(unlockedIds(mainGames));rememberCheckpointFacts(next);
  if(action.type==='select-mode'){if(action.mode===previous.selectedMode)return previous;next.selectedMode=action.mode;}
  else if(action.type==='start-challenge'){
   if(previous.activeExpedition?.status==='active')return previous;const instance=generateChallenge(action.spec);if(!unlocked.has(instance.template.id))return previous;
   next.currentChallenge=rememberedOrdinary(previous,{spec:structuredClone(action.spec),game:createGame(instance.scenario,action.spec.seed),actions:[]},true);next.selectedMode='challenge';
  }
  else if(action.type==='challenge'){
   const p=previous.currentChallenge;if(previous.selectedMode!=='challenge'||!p||!validActionKeys(action.action))return previous;const game=reduceGame(generateChallenge(p.spec).scenario,p.game,action.action);if(game===p.game)return previous;
   next.currentChallenge=rememberedOrdinary(previous,{spec:structuredClone(p.spec),game,actions:[...p.actions,structuredClone(action.action)]},action.action.type==='reset');recordWin(next);
  }
  else if(action.type==='checkpoint'){
   if(previous.selectedMode!=='challenge'||!previous.currentChallenge||previous.currentChallenge.game.status==='won')return previous;
   if(previous.checkpoints.some(cp=>canonical(cp)===canonical(previous.currentChallenge)))return previous;next.checkpoints=[structuredClone(previous.currentChallenge),...next.checkpoints].slice(0,3);
  }
  else if(action.type==='restore-checkpoint'){
   if(!Number.isInteger(action.index)||action.index<0||action.index>=previous.checkpoints.length)return previous;next.currentChallenge=rememberedOrdinary(previous,previous.checkpoints[action.index],true);next.selectedMode='challenge';
  }
  else if(action.type==='start-expedition'){
   if(previous.activeExpedition?.status==='active')return previous;const e=createExpedition(action.spec);if(e.definition.floors.some(f=>!unlocked.has(f.templateId)))return previous;next.activeExpedition=e;next.selectedMode='expedition';
  }
  else if(action.type==='expedition'){
   if(previous.selectedMode!=='expedition'||!previous.activeExpedition)return previous;
   const e=reduceExpedition(previous.activeExpedition,action.action);if(e===previous.activeExpedition)return previous;next.activeExpedition=rememberedExpedition(e);
   if(next.activeExpedition.status==='cleared')next.latestClearedExpedition=structuredClone(next.activeExpedition);
  }
  rememberCheckpointFacts(next);validatePostSeason(next,mainGames);return next;
 }catch{return previous;}
}
export function postSeasonScenario(state:PostSeasonState):ScenarioDefinition|null {
 if(state.selectedMode==='challenge'&&state.currentChallenge)return generateChallenge(state.currentChallenge.spec).scenario;
 if(state.selectedMode==='expedition'&&state.activeExpedition)return scenarioForExpedition(state.activeExpedition);
 return null;
}
