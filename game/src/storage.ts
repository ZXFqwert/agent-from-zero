import { scenarios } from './content/scenarios';
import { isUnlocked } from './content/progression';
import { createGame, reduceGame, validateGameState } from './engine';
import type { GameAction, GameState, SaveEnvelope, ScenarioDefinition } from './engine/types';

export interface PlayerSave extends SaveEnvelope {
  playerVersion: 1;
  started: boolean;
  choices: Record<string,string>;
  actions: Record<string,GameAction[]>;
  notes: string;
  sound: boolean;
  /** Historical proofs survive retries without turning an unfinished retry into a win. */
  completedGames: Record<string, GameState>;
  checkpoints: Array<{ scenarioId: string; state: GameState; actions: GameAction[] }>;
}
export const CONTENT_VERSION = 'season-0.5.0';
export const MAX_SAVE_BYTES = 8_000_000;
export const emptySave = (): PlayerSave => ({saveVersion:1,kernelVersion:1,contentVersion:CONTENT_VERSION,savedAt:new Date().toISOString(),currentScenarioId:scenarios[0].id,games:{},completedScenarioIds:[],evidence:[],checkpoints:[],playerVersion:1,started:false,choices:{},actions:{},notes:'',sound:false,completedGames:{}});

/** A guided repeat cannot erase a previous independent transfer and its real proof. */
export function recordCompletion(save:PlayerSave,state:GameState):void {
  if(state.status!=='won')return;
  const rank=(game:GameState)=>game.learningEvidence.reduce((sum,item)=>sum+({seen:0,guided:1,'independent-transfer':2}[item.level]),0);
  const prior=save.completedGames[state.scenarioId];
  if(!prior||rank(state)>=rank(prior))save.completedGames[state.scenarioId]=structuredClone(state);
  save.completedScenarioIds=[...new Set([...save.completedScenarioIds,state.scenarioId])];
  save.evidence=save.completedScenarioIds.flatMap(id=>save.completedGames[id].learningEvidence);
}

let connection: Promise<IDBDatabase> | undefined;
function db() {
  return connection ??= new Promise<IDBDatabase>((resolve,reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('此浏览器环境没有可用的 IndexedDB，请启用网站存储。')); return; }
    const request = indexedDB.open('echo-workshop',1);
    let failed=false;
    request.onupgradeneeded=()=>request.result.createObjectStore('saves');
    request.onsuccess=()=>{if(failed){request.result.close();return;}request.result.onversionchange=()=>{request.result.close();connection=undefined;};resolve(request.result);};
    request.onerror=()=>reject(request.error??new Error('无法打开存档数据库。'));
    request.onblocked=()=>{failed=true;reject(new Error('存档数据库正在被另一个页面更新，请关闭其他游戏页面。'));};
  }).catch(error=>{connection=undefined;throw error;});
}
export async function readSave(): Promise<PlayerSave|null> {
  const database=await db();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction('saves','readonly');
    const request=transaction.objectStore('saves').get('active');
    request.onsuccess=()=>{try {resolve(request.result===undefined?null:validateSave(request.result));} catch(e){reject(e);}};
    request.onerror=()=>reject(request.error??new Error('无法读取存档。'));
    transaction.onabort=()=>reject(transaction.error??new Error('读取存档被中断。'));
  });
}
let queue: Promise<void> = Promise.resolve();
export function writeSave(save:PlayerSave):Promise<void> {
  let snapshot: PlayerSave;
  try { snapshot=validateSave(save); } catch(error) { return Promise.reject(error); }
  const job=queue.catch(()=>{}).then(async()=>{
    const database=await db();
    await new Promise<void>((resolve,reject)=>{
      const transaction=database.transaction('saves','readwrite');
      transaction.objectStore('saves').put(snapshot,'active');
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error??new Error('存档写入失败。'));
      transaction.onabort=()=>reject(transaction.error??new Error('存档写入被中断。'));
    });
  });queue=job;return job;
}

export function validateSave(input:unknown):PlayerSave {
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if(!record(input)) throw new Error('这不是回声工坊存档。');
  let size: number;
  try { size = new TextEncoder().encode(JSON.stringify(input)).byteLength; } catch { throw new Error('存档包含无法读取的循环引用。'); }
  if(size > MAX_SAVE_BYTES) throw new Error('存档不能超过 8 MB。');
  const save=structuredClone(input) as unknown as PlayerSave;
  const legacy = ['harbor-0.1.0','harbor-0.2.0','season-0.3.0','season-0.4.0'].includes(save.contentVersion);
  if(save.saveVersion!==1||save.kernelVersion!==1||save.playerVersion!==1||(!legacy&&save.contentVersion!==CONTENT_VERSION)) throw new Error('存档版本不兼容。请保留原文件，在对应版本中打开。');
  // Migration changes the content envelope only. Legacy action logs still replay in the frozen v1 kernel.
  if(legacy) {
    const oldIds=save.contentVersion === 'harbor-0.1.0' ? ['harbor-light','warehouse-gate','hollow-regent'] : scenarios.filter(scenario=>scenario.chapter<=(save.contentVersion==='season-0.4.0'?3:save.contentVersion==='season-0.3.0'?2:1)).map(scenario=>scenario.id);
    if(!oldIds.includes(save.currentScenarioId)||!record(save.games)||!record(save.completedGames)||!Array.isArray(save.completedScenarioIds)||save.completedScenarioIds.some(id=>!oldIds.includes(id))||Object.keys(save.games).some(id=>!oldIds.includes(id))) throw new Error('旧存档包含未知关卡，迁移已停止。');
    if(!record(save.actions)||!record(save.choices)||!Array.isArray(save.checkpoints)||!Array.isArray(save.evidence)||Object.keys(save.completedGames).some(id=>!oldIds.includes(id))||Object.keys(save.actions).some(id=>!oldIds.includes(id))||Object.keys(save.choices).some(id=>!oldIds.includes(id))||save.checkpoints.some(checkpoint=>!oldIds.includes(checkpoint?.scenarioId))||save.evidence.some(evidence=>!oldIds.includes(evidence?.scenarioId)))throw new Error('旧存档包含当时不存在的内容，迁移已停止。');
    save.contentVersion=CONTENT_VERSION;
  }
  const ids=scenarios.map(s=>s.id);
  if(!ids.includes(save.currentScenarioId)||!record(save.games)||!record(save.completedGames)||!Array.isArray(save.completedScenarioIds)||!Array.isArray(save.evidence)||!Array.isArray(save.checkpoints)||save.checkpoints.length>3||typeof save.started!=='boolean'||typeof save.sound!=='boolean'||typeof save.notes!=='string'||save.notes.length>10000||!record(save.choices)||!record(save.actions)||typeof save.savedAt!=='string'||!Number.isFinite(Date.parse(save.savedAt))||new Date(save.savedAt).toISOString()!==save.savedAt) throw new Error('存档结构不完整，当前进度未被覆盖。');
  if(!save.started&&(Object.keys(save.games).length>0||save.completedScenarioIds.length>0)) throw new Error('旅途开始标记与关卡进度不一致。');
  for(const [id,state] of Object.entries(save.games)) {
    const scenario=scenarios.find(s=>s.id===id);
    if(!scenario || !validateGameState(scenario,state)) throw new Error('关卡进度或行动证据损坏，当前存档未被覆盖。');
    validateTrace(scenario,state,save.actions[id]??[]);
  }
  for(const id of Object.keys(save.actions)) if(!ids.includes(id)||!save.games[id]) throw new Error('行动记录引用了不存在的关卡。');
  if(new Set(save.completedScenarioIds).size!==save.completedScenarioIds.length||save.completedScenarioIds.some(id=>!ids.includes(id))) throw new Error('完成记录包含重复或未知关卡。');
  for(const id of save.completedScenarioIds) if(!isUnlocked(id,save.completedScenarioIds)) throw new Error('历史委托的解锁顺序不一致。');
  if(Object.keys(save.completedGames).length!==save.completedScenarioIds.length) throw new Error('完成记录缺少对应的历史验收证据。');
  for(const [id,state] of Object.entries(save.completedGames)) {
    const scenario=scenarios.find(s=>s.id===id);
    if(!scenario||!save.completedScenarioIds.includes(id)||state?.status!=='won'||!validateGameState(scenario,state)) throw new Error('历史完成记录没有有效的验收证据。');
  }
  if(!isUnlocked(save.currentScenarioId,save.completedScenarioIds)) throw new Error('当前委托尚未解锁。');
  for(const id of Object.keys(save.games)) if(!isUnlocked(id,save.completedScenarioIds)) throw new Error('关卡记录引用了尚未解锁的委托。');
  if(save.evidence.length>scenarios.reduce((total,scenario)=>total+scenario.concepts.length,0)) throw new Error('学习证据数量异常。');
  const expectedEvidence=save.completedScenarioIds.flatMap(id=>save.completedGames[id].learningEvidence);
  if(stableJSON([...save.evidence].sort(evidenceOrder))!==stableJSON([...expectedEvidence].sort(evidenceOrder))) throw new Error('学习证据与历史验收记录不一致。');
  for(const [id,choice] of Object.entries(save.choices)) if(!ids.includes(id)||!['people','workshop'].includes(choice)||!save.completedScenarioIds.includes(id)) throw new Error('故事选择记录不正确。');
  for(const checkpoint of save.checkpoints) {
    if(!record(checkpoint)) throw new Error('恢复检查点结构不正确。');
    const scenario=scenarios.find(item=>item.id===checkpoint.scenarioId);
    if(!scenario||!validateGameState(scenario,checkpoint.state)) throw new Error('恢复检查点缺少有效行动证据。');
    if(!isUnlocked(scenario.id,save.completedScenarioIds)) throw new Error('恢复检查点引用了尚未解锁的委托。');
    validateTrace(scenario,checkpoint.state,checkpoint.actions);
  }
  return structuredClone(save);
}

function evidenceOrder(left: SaveEnvelope['evidence'][number],right: SaveEnvelope['evidence'][number]) {
  return `${left?.scenarioId}:${left?.concept}`.localeCompare(`${right?.scenarioId}:${right?.concept}`);
}

function stableJSON(value: unknown): string {
  if(Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if(value&&typeof value==='object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stableJSON(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

function validateTrace(scenario:ScenarioDefinition,state:GameState,input:unknown):void {
  if(!Array.isArray(input)||input.length>10000) throw new Error('行动记录格式不正确。');
  let replay=createGame(scenario,state.seed);
  for(const action of input as GameAction[]) {
    if(!action||typeof action!=='object'||Array.isArray(action)) throw new Error('行动记录包含无效请求。');
    const commonKeys=['id','type'];
    const permittedKeys=action.type==='context'?[...commonKeys,'operation','recordId','summaryId']:action.type==='configure'?[...commonKeys,'blueprint']:action.type==='tool'?[...commonKeys,'call']:action.type==='reset'?[...commonKeys,'preserveBlueprint']:action.type==='dispatch'||action.type==='resume'?[...commonKeys,'mode']:action.type==='step'?[...commonKeys,'source']:action.type==='receive'?[...commonKeys,'callId','receiptId']:commonKeys;
    if(Object.keys(action).some(key=>!permittedKeys.includes(key))||(action.type==='reset'&&action.preserveBlueprint!==undefined&&typeof action.preserveBlueprint!=='boolean')) throw new Error('行动记录包含无效参数。');
    const next=reduceGame(scenario,replay,action);
    if(next===replay) throw new Error('行动记录包含被拒绝或重复的操作。');
    replay=next;
  }
  if(stableJSON(replay)!==stableJSON(state)) throw new Error('行动回放与保存状态不一致。');
}

export function parseSaveText(text:string):PlayerSave {
  if(new TextEncoder().encode(text).byteLength>MAX_SAVE_BYTES) throw new Error('存档不能超过 8 MB。');
  let parsed:unknown;
  try { parsed=JSON.parse(text); } catch { throw new Error('存档不是有效的 JSON 文件。'); }
  return validateSave(parsed);
}

function nextHelperId(state:GameState,label:string):string {
  let suffix=state.processedActionIds.length;
  while(state.processedActionIds.includes(`${label}-${suffix}`)) suffix++;
  return `${label}-${suffix}`;
}

function hasEverUsedHint(save:PlayerSave,id:string):boolean {
  return Boolean(save.games[id]?.hintUsed||save.completedGames[id]?.hintUsed||save.checkpoints.some(checkpoint=>checkpoint.scenarioId===id&&checkpoint.state.hintUsed));
}

/** Reset a current attempt atomically while retaining historical wins and their evidence. */
export function resetCurrentScenario(input:PlayerSave):PlayerSave {
  const save=structuredClone(input);
  const scenario=scenarios.find(item=>item.id===save.currentScenarioId)!;
  let state=save.games[scenario.id]??createGame(scenario);
  const actions=[...(save.actions[scenario.id]??[])];
  const reset:GameAction={id:nextHelperId(state,'retry'),type:'reset'};
  state=reduceGame(scenario,state,reset);actions.push(reset);
  if(hasEverUsedHint(input,scenario.id)&&!state.hintUsed) {
    const hint:GameAction={id:nextHelperId(state,'remember-hint'),type:'hint'};
    state=reduceGame(scenario,state,hint);actions.push(hint);
  }
  save.games[scenario.id]=state;save.actions[scenario.id]=actions;
  return save;
}

/** A checkpoint carries its own replay prefix, so restoring checkpoints can branch safely. */
export function restoreCheckpoint(input:PlayerSave,index:number):PlayerSave {
  if(!Number.isInteger(index)||index<0||index>=input.checkpoints.length) throw new Error('这个恢复检查点不存在。');
  const save=structuredClone(input),checkpoint=save.checkpoints[index];
  const scenario=scenarios.find(item=>item.id===checkpoint.scenarioId)!;
  let state=checkpoint.state;
  const actions=[...checkpoint.actions];
  if(hasEverUsedHint(input,scenario.id)&&!state.hintUsed&&state.status!=='won') {
    const hint:GameAction={id:nextHelperId(state,'remember-hint'),type:'hint'};
    state=reduceGame(scenario,state,hint);actions.push(hint);
  }
  if(state.status==='running') {
    const pause:GameAction={id:nextHelperId(state,'restore-pause'),type:'pause'};
    state=reduceGame(scenario,state,pause);actions.push(pause);
  }
  save.currentScenarioId=scenario.id;save.games[scenario.id]=state;save.actions[scenario.id]=actions;
  save.started=true;
  return save;
}

export function downloadSave(save:PlayerSave) {
  const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`回声工坊-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
