import type { GameState, ScenarioDefinition, OperationDefinition, GameEvent, FactMap, ToolCall, ObservationRecord } from './types';
import type { BlueprintLabDefinition, BlueprintLabState, LabAction, LabEventFields, LabEventType, LabModule, LabOperation, LabPermit, LabRole, LabRule, LabSource, LabTask } from './blueprint-contract';
import { documentProvenance, executionRevision } from './security';
export type LabScenario=ScenarioDefinition;
export type LabHost=GameState & {lab?:BlueprintLabState};
export type LabEvent=Omit<GameEvent,'type'> & LabEventFields & {type:GameEvent['type']|LabEventType};
export type LabEmit=(state:LabHost,event:Omit<LabEvent,'id'|'sequence'|'attempt'>)=>LabEvent;
const obj=(x:unknown):x is Record<string,unknown>=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const structural=(x:unknown):boolean=>obj(x);
const allowed=(x:object,keys:string[])=>Object.keys(x).every(k=>keys.includes(k));
const ids=(x:unknown,max=24):x is string[]=>Array.isArray(x)&&x.length<=max&&x.every(v=>typeof v==='string'&&/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v))&&new Set(x).size===x.length;
const equal=(a:unknown,b:unknown):boolean=>Object.is(a,b)||Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]))||obj(a)&&obj(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
const maps=(x:unknown,s:ScenarioDefinition):x is FactMap=>obj(x)&&Object.entries(x).every(([k,v])=>Object.hasOwn(s.initialWorld,k)&&typeof v===typeof s.initialWorld[k]&&['string','boolean','number'].includes(typeof v)&&(typeof v!=='number'||Number.isFinite(v))&&(typeof v!=='string'||v.length<=1000));
const target=(s:ScenarioDefinition,c:ToolCall)=>c.tool==='observe'?s.observations.find(o=>o.id===c.observationId)?.target:c.tool==='operate'?s.operations.find(o=>o.id===c.operationId)?.target:s.operations.find(o=>o.id===s.goals.find(g=>g.fact===c.fact)?.operationId)?.target;
const universe=(s:ScenarioDefinition)=>[...new Set([...s.observations.map(o=>o.target),...s.operations.map(o=>o.target)])];
export const labProviders=(s:LabScenario)=>s.blueprintLab!.providers??[{id:'local',label:'教学连接',models:[{id:'sim',label:'有限工具适配器',adapter:'tool-v1' as const}]}];
export const labRoles=(s:LabScenario):LabRole[]=>s.blueprintLab!.roles??[{id:'operator',label:'契约师',tools:['observe','operate','verify'],rules:[{tool:'*',target:'*',decision:'allow'}]}];
const busy=(st:LabHost)=>st.lab!.tasks.some(t=>['queued','running','waiting-approval'].includes(t.status));
const sourceEqual=(a:LabSource,b:LabSource)=>['senderId','channelId','accountId','peerId','replyTarget'].every(k=>a[k as keyof LabSource]===b[k as keyof LabSource]);
const role=(s:LabScenario,st:LabHost)=>labRoles(s).find(r=>r.id===st.lab!.roleId)!;
export const labTarget=target;
function validRules(s:LabScenario,x:unknown):x is LabRule[]{return Array.isArray(x)&&x.length<=12&&x.every(r=>obj(r)&&allowed(r,['tool','target','decision'])&&['*','observe','operate','verify'].includes(r.tool as string)&&typeof r.target==='string'&&(r.target==='*'||universe(s).includes(r.target))&&['allow','ask','deny'].includes(r.decision as string));}
export function validLabCall(s:LabScenario,c:unknown):c is ToolCall {
 if(!obj(c)||!['observe','operate','verify'].includes(c.tool as string))return false;
 if(!allowed(c,c.tool==='observe'?['tool','observationId']:c.tool==='verify'?['tool','fact']:['tool','operationId','arguments','requestKey'])||!target(s,c as ToolCall))return false;
 if(c.tool==='operate'){const o=s.operations.find(o=>o.id===c.operationId)!;if(!o.protocol)return c.arguments===undefined&&c.requestKey===undefined;
  if(c.arguments!==undefined&&(!obj(c.arguments)||Object.entries(c.arguments).some(([k,v])=>!o.protocol!.parameters.some(p=>p.name===k)||(!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||typeof v==='string'&&v.length>200))))return false;
  if(c.requestKey!==undefined&&(typeof c.requestKey!=='string'||!c.requestKey||c.requestKey.length>100))return false;
 }return true;
}
export function moduleGraphDenial(s:LabScenario,moduleIds:string[],trusted:boolean):string|undefined {
 const catalog=s.blueprintLab!.modules??[],selected=catalog.filter(m=>moduleIds.includes(m.id));
 if(moduleIds.some(id=>!catalog.some(m=>m.id===id)))return '模块不在声明目录内。';
 if(selected.some(m=>m.interfaceVersion!==(s.blueprintLab!.interfaceVersion??1)))return '模块接口与宿主合同不兼容，不能靠名字相似激活。';
 if(selected.some(m=>m.requires.some(id=>!moduleIds.includes(id))))return '模块缺少声明依赖。';
 if(selected.some(m=>m.projectResource&&!trusted))return '项目资源尚未被允许加载；加载信任不是执行权限。';
 if(selected.some(m=>m.kind==='storage'&&m.logFormat===2))return '日志格式不兼容，不能读取未来格式或伪装完成迁移。';
 for(const kind of ['model','loop','tools','storage'])if(catalog.some(m=>m.kind===kind)&&!selected.some(m=>m.kind===kind))return `缺少${kind}模块，循环与恢复能力尚未完整。`;
 for(const kind of ['model','loop','storage'])if(selected.filter(m=>m.kind===kind).length>1)return '同一位置不能同时激活两个互相竞争的核心模块。';
}
export function validateLabScenario(s:LabScenario):string[]{
 try{
 const d=s.blueprintLab!,e:string[]=[];if(!structural(d)||!allowed(d,['providers','roles','workspaceTargets','messages','memorySnapshot','modules','interfaceVersion','initial']))return ['蓝图宿主合同结构无效。'];
 if(d.providers!==undefined&&(!Array.isArray(d.providers)||!d.providers.length||d.providers.length>4||!ids(d.providers.map(p=>p.id),4)))e.push('连接目录无效。');
 for(const p of labProviders(s))if(!structural(p)||!allowed(p,['id','label','models'])||!p.label||!Array.isArray(p.models)||!p.models.length||p.models.length>4||!ids(p.models.map(m=>m.id),4)||p.models.some(m=>!structural(m)||!allowed(m,['id','label','adapter'])||!m.label||!['tool-v1','text-only'].includes(m.adapter)))e.push('模型适配器目录无效。');
 if(d.roles!==undefined&&(!Array.isArray(d.roles)||!d.roles.length||d.roles.length>4||!ids(d.roles.map(r=>r.id),4)))e.push('角色目录无效。');
 for(const r of labRoles(s))if(!structural(r)||!allowed(r,['id','label','tools','rules'])||!r.label||!Array.isArray(r.tools)||new Set(r.tools).size!==r.tools.length||r.tools.some(t=>!['observe','operate','verify'].includes(t))||!validRules(s,r.rules))e.push('角色必须有独立有限工具与有序权限规则。');
 if(d.workspaceTargets!==undefined&&(!Array.isArray(d.workspaceTargets)||new Set(d.workspaceTargets).size!==d.workspaceTargets.length||d.workspaceTargets.some(t=>!universe(s).includes(t))))e.push('工作区只能含声明目标，不能用宽权限替代。');
 if(d.memorySnapshot!==undefined&&typeof d.memorySnapshot!=='boolean')e.push('记忆快照开关无效。');
 if(d.interfaceVersion!==undefined&&![1,2].includes(d.interfaceVersion))e.push('宿主接口版本无效。');
 if(d.messages!==undefined&&(!Array.isArray(d.messages)||d.messages.length>8||!ids(d.messages.map(m=>m.id),8)))e.push('入口消息目录无效。');
 for(const m of d.messages??[]){if(!structural(m)||!allowed(m,['id','label','source','facts','steps','tools','targets'])||!m.label||!obj(m.source)||!allowed(m.source,['senderId','channelId','accountId','peerId','displayName','replyTarget'])||['senderId','channelId','accountId','peerId','displayName','replyTarget'].some(k=>typeof m.source[k as keyof LabSource]!=='string'||!m.source[k as keyof LabSource]||m.source[k as keyof LabSource].length>100)||!universe(s).includes(m.source.replyTarget)||!maps(m.facts,s)||!Array.isArray(m.steps)||!m.steps.length||m.steps.length>8||!Array.isArray(m.tools)||new Set(m.tools).size!==m.tools.length||m.tools.some(t=>!['observe','operate','verify'].includes(t))||!Array.isArray(m.targets)||new Set(m.targets).size!==m.targets.length||m.targets.some(t=>!universe(s).includes(t)))e.push('消息必须保留固定来源、输入、有限步骤与来源权限上限。');
  for(const st of m.steps??[])if(!structural(st)||!allowed(st,['call','whenKnown'])||!validLabCall(s,st.call)||st.whenKnown!==undefined&&(!maps(st.whenKnown,s)||!Object.keys(st.whenKnown).length))e.push('入口任务只能执行有限声明调用和已知条件分支。');}
 if(d.modules!==undefined&&(!Array.isArray(d.modules)||d.modules.length>10||!ids(d.modules.map(m=>m.id),10)))e.push('模块目录无效。');
 for(const m of d.modules??[]){if(!structural(m)||!allowed(m,['id','label','kind','interfaceVersion','requires','tools','operationIds','projectResource','initialRealm','mountableTargets','initialMounts','logFormat'])||!m.label||!['model','loop','tools','storage','extension'].includes(m.kind)||![1,2].includes(m.interfaceVersion)||!ids(m.requires,10)||m.requires.some(id=>!d.modules!.some(x=>x.id===id)||id===m.id)||m.tools!==undefined&&(!Array.isArray(m.tools)||new Set(m.tools).size!==m.tools.length||m.tools.some(t=>!['observe','operate','verify'].includes(t)))||m.operationIds!==undefined&&(!ids(m.operationIds,12)||m.operationIds.some(id=>!s.operations.some(o=>o.id===id&&o.lab?.moduleId===m.id)))||m.projectResource!==undefined&&typeof m.projectResource!=='boolean'||m.initialRealm!==undefined&&!['live','sandbox'].includes(m.initialRealm)||m.mountableTargets!==undefined&&(!Array.isArray(m.mountableTargets)||new Set(m.mountableTargets).size!==m.mountableTargets.length||m.mountableTargets.some(t=>!universe(s).includes(t)))||m.initialMounts?.some(t=>!m.mountableTargets?.includes(t))||m.logFormat!==undefined&&![1,2].includes(m.logFormat))e.push('模块须有有限接口、依赖、作用域与注册边界。');}
 const visit=(id:string,path:string[]):boolean=>path.includes(id)||(d.modules?.find(m=>m.id===id)?.requires??[]).some(next=>visit(next,[...path,id]));if((d.modules??[]).some(m=>visit(m.id,[])))e.push('模块依赖不能成环。');
 for(const o of s.operations)if(o.lab&&(!structural(o.lab)||!allowed(o.lab,['moduleId','reply'])||o.lab.reply!==undefined&&typeof o.lab.reply!=='boolean'||o.lab.moduleId&&!d.modules?.some(m=>m.kind==='extension'&&m.id===o.lab!.moduleId&&m.operationIds?.includes(o.id))))e.push('法器模块/原始回信合同无效。');
 const i=d.initial;if(i){if(!structural(i)||!allowed(i,['providerId','modelId','roleId','workspaceTargets','routing','moduleIds','projectTrusted'])||i.roleId&&!labRoles(s).some(r=>r.id===i.roleId)||i.providerId&&!labProviders(s).some(p=>p.id===i.providerId)||i.modelId&&!labProviders(s).find(p=>p.id===(i.providerId??labProviders(s)[0].id))?.models.some(m=>m.id===i.modelId)||i.workspaceTargets?.some(t=>!(d.workspaceTargets??universe(s)).includes(t))||i.routing&&!['main','sender','channel-sender'].includes(i.routing)||i.projectTrusted!==undefined&&typeof i.projectTrusted!=='boolean'||i.moduleIds!==undefined&&(!ids(i.moduleIds,10)||i.moduleIds.length>0&&moduleGraphDenial(s,i.moduleIds,i.projectTrusted??false)))e.push('初始蓝图配置无效。');}
 const req=s.transferRequirement?.lab;
 if(req!==undefined){
  const fields=['messageIds','queueModes','modelIds','roleIds','moduleIds','snapshotReload','approvalUsed','committedRestore'];
  if(!structural(req)||!allowed(req,fields)||!Object.keys(req).length)e.push('蓝图迁移要求必须是明确有限合同。');
  else{
   const catalogs:Record<string,string[]>={messageIds:(d.messages??[]).map(m=>m.id),queueModes:['followup','collect','interrupt','steer'],modelIds:labProviders(s).flatMap(p=>p.models.map(m=>m.id)),roleIds:labRoles(s).map(r=>r.id),moduleIds:(d.modules??[]).map(m=>m.id)};
   for(const [field,catalog]of Object.entries(catalogs)){const values=(req as unknown as Record<string,unknown>)[field];if(values!==undefined&&(!ids(values,12)||!values.length||values.some(id=>!catalog.includes(id))))e.push('蓝图迁移要求引用未知或空能力。');}
   for(const flag of ['snapshotReload','approvalUsed','committedRestore'])if(Object.hasOwn(req,flag)&&(req as unknown as Record<string,unknown>)[flag]!==true)e.push('蓝图迁移开关必须明确要求实际证据。');
   if(req.snapshotReload&&!d.memorySnapshot)e.push('快照迁移需要启动快照机制。');
   if(req.committedRestore&&!(d.modules??[]).some(m=>m.kind==='storage'))e.push('日志恢复迁移需要持久日志模块。');
  }
 }
 return e;
 }catch{return ['蓝图宿主合同结构无效。'];}
}
export function initializeLab(s:LabScenario,st:LabHost,generation=1):void {
 const d=s.blueprintLab!,i=d.initial??{},p=labProviders(s).find(p=>p.id===i.providerId)??labProviders(s)[0],r=labRoles(s).find(r=>r.id===i.roleId)??labRoles(s)[0];
 st.lab={providerId:p.id,modelId:i.modelId??p.models[0].id,roleId:r.id,rules:Object.fromEntries(labRoles(s).map(r=>[r.id,structuredClone(r.rules)])),workspaceTargets:[...(i.workspaceTargets??d.workspaceTargets??universe(s))],configurationRevision:1,permits:[],routing:i.routing??'sender',tasks:[],nextTask:1,generation,sessions:{},storeVersion:1,snapshots:{},projectTrusted:i.projectTrusted??false,activeModuleIds:[...(i.moduleIds??[])],moduleScopes:Object.fromEntries((d.modules??[]).map(m=>[m.id,{realm:m.initialRealm??'live',mounts:[...(m.initialMounts??m.mountableTargets??[])]}])),registrations:[],log:{format:1,entries:[],committedSequence:0}};
 rebuildRegistrations(s,st);captureSnapshot(s,st);
}
function rebuildRegistrations(s:LabScenario,st:LabHost):void {
 const l=st.lab!;l.registrations=[];
 for(const m of s.blueprintLab!.modules??[])if(l.activeModuleIds.includes(m.id)){
  for(const t of m.tools??[])l.registrations.push({moduleId:m.id,kind:'tool',name:t});for(const id of m.operationIds??[])l.registrations.push({moduleId:m.id,kind:'tool',name:id});if(m.kind==='storage')l.registrations.push({moduleId:m.id,kind:'listener',name:'events'});
 }
 const storage=(s.blueprintLab!.modules??[]).find(m=>m.kind==='storage'&&l.activeModuleIds.includes(m.id));if(storage)l.log.providerId=storage.id;else delete l.log.providerId;
}
export function captureSnapshot(s:LabScenario,st:LabHost):void {
 if(!s.blueprintLab!.memorySnapshot)return;
 st.lab!.snapshots[st.sessions!.activeId]={storeVersion:st.lab!.storeVersion,records:st.memory!.entries.filter(e=>e.status==='active').map(e=>({memoryId:e.id,key:e.key,revision:e.revision,facts:structuredClone(e.facts),...(e.provenance?{provenance:structuredClone(e.provenance)}:{})}))};
}
export function labSnapshotKnowledge(s:LabScenario,st:LabHost):Record<string,ObservationRecord> {
 const result:Record<string,ObservationRecord>={};if(!s.blueprintLab!.memorySnapshot)return result;
 for(const r of st.lab!.snapshots[st.sessions!.activeId]?.records??[])for(const [f,value]of Object.entries(r.facts))result[f]={value,source:'memory',eventId:r.memoryId,provenance:structuredClone(r.provenance)};return result;
}
export function refreshLabMemory(s:LabScenario,st:LabHost,a:{type:string;operation?:string},previousActiveId:string,emit:LabEmit):void {
 if(!s.blueprintLab!.memorySnapshot)return;
 if(a.type==='memory'&&['write','revise','retire'].includes(a.operation??'')){st.lab!.storeVersion++;emitLab(st,emit,'snapshot','档案已写入新存储版本。当前会话启动块保持原快照；检索回响或新会话才能明确带入新版。');}
 if(a.type==='session'){
  if(a.operation==='fresh'){captureSnapshot(s,st);emitLab(st,emit,'snapshot','新会话捕获了当前存储快照。现场、副作用与委托资源保留。');}
  if(a.operation==='fork')st.lab!.snapshots[st.sessions!.activeId]=structuredClone(st.lab!.snapshots[previousActiveId]);
 }
}
function emitLab(st:LabHost,emit:LabEmit,phase:LabEventFields['labPhase'],text:string,fields:Partial<LabEvent>={}):LabEvent {const l=st.lab!;return emit(st,{type:'lab-change',labPhase:phase,labConfigurationRevision:l.configurationRevision,labStoreVersion:l.storeVersion,...(l.snapshots[st.sessions!.activeId]?{labSnapshotVersion:l.snapshots[st.sessions!.activeId].storeVersion}:{}),text,...fields});}
function decision(rules:LabRule[],call:ToolCall,t:string){return [...rules].reverse().find(r=>(r.tool==='*'||r.tool===call.tool)&&(r.target==='*'||r.target===t))?.decision??'deny';}
export function matchingLabPermit(s:LabScenario,st:LabHost,call:ToolCall,task?:LabTask,moduleId?:string):LabPermit|undefined {return st.lab!.permits.find(p=>!p.consumed&&p.roleId===(task?.roleId??st.lab!.roleId)&&p.taskId===task?.id&&p.moduleId===moduleId&&p.realm===st.security!.realm&&p.configurationRevision===st.lab!.configurationRevision&&p.worldRevision===executionRevision(st)&&equal(p.call,call));}
export function labCallDenial(s:LabScenario,st:LabHost,call:ToolCall,options:{task?:LabTask;moduleId?:string;ignoreAsk?:boolean}={}):string|undefined {
 const l=st.lab!,task=options.task,t=target(s,call);if(!t)return '未知法器请求。';
 const p=labProviders(s).find(p=>p.id===(task?.providerId??l.providerId)),m=p?.models.find(m=>m.id===(task?.modelId??l.modelId));if(m?.adapter!=='tool-v1')return '当前模型适配不提供此工具调用合同。换模型不会改变角色与许可。';
 const r=labRoles(s).find(r=>r.id===(task?.roleId??l.roleId))!;if(!r.tools.includes(call.tool)||task&&(!task.tools.includes(call.tool)||!task.targets.includes(t)))return '角色或原始寄件身份没有这个工具/目标能力；正文和共享资料不升级授权。';
 const op=call.tool==='operate'?s.operations.find(o=>o.id===call.operationId):undefined;
 if(op?.protocol&&st.security!.realm!=='live')return '此延迟协议仅有现场日志合同，不能借试验域访问现场库存或回执。';
 if(op?.lab?.reply&&(!task||task.source.replyTarget!==t))return '回信目标不属于原始寄件来源，正文不能改写宿主回信地址。';
 if(options.moduleId){const mod=(s.blueprintLab!.modules??[]).find(m=>m.id===options.moduleId),scope=l.moduleScopes[options.moduleId];if(!mod||!l.activeModuleIds.includes(mod.id)||op?.lab?.moduleId!==mod.id||!mod.operationIds?.includes(op!.id))return '这个扩展未注册本次法器。';if(!scope.mounts.includes(t))return '扩展执行域没有挂载这个资源；项目加载信任不会扩大执行范围。';}
 else if(op?.lab?.moduleId)return '此法器属于扩展自身执行域，必须明确选择扩展调用。内置法器沙箱不包住宿主扩展。';
 else if(call.tool==='operate'&&!l.workspaceTargets.includes(t))return '工作区不可写这个目标。即使角色允许或批准了请求，隔离范围仍独立生效。';
 const graph=moduleGraphDenial(s,l.activeModuleIds,l.projectTrusted);if(graph)return graph;
 if((s.blueprintLab!.modules??[]).some(m=>m.kind==='tools')&&!options.moduleId&&!l.registrations.some(r=>r.kind==='tool'&&r.name===call.tool&&s.blueprintLab!.modules!.find(m=>m.id===r.moduleId)?.kind==='tools'))return '当前工具注册作用域未提供这件法器。';
 const d=decision(task?.rules??l.rules[r.id],call,t);if(d==='deny')return '最后匹配的角色规则拒绝这个目标。';if(d==='ask'&&!options.ignoreAsk&&!matchingLabPermit(s,st,call,task,options.moduleId))return '最后匹配规则要求审阅这一项精确请求；现有许可不存在、已消耗或版本不匹配。';
}
export function consumeLabPermit(s:LabScenario,st:LabHost,call:ToolCall,task?:LabTask,moduleId?:string):string|undefined {const p=matchingLabPermit(s,st,call,task,moduleId);if(p){p.consumed=true;return p.id;}}
export function labRequestFields(st:LabHost,task?:LabTask):LabEventFields{return {labStoreVersion:st.lab!.storeVersion,...(st.lab!.snapshots[st.sessions!.activeId]?{labSnapshotVersion:st.lab!.snapshots[st.sessions!.activeId].storeVersion}:{}),labProviderId:task?.providerId??st.lab!.providerId,labModelId:task?.modelId??st.lab!.modelId,labRoleId:task?.roleId??st.lab!.roleId,labConfigurationRevision:st.lab!.configurationRevision,labModuleIds:[...st.lab!.activeModuleIds],...(task?{labTaskId:task.id,labMessageId:task.messageId,labSessionKey:task.sessionKey,labSource:structuredClone(task.source)}:{})};}
const head=(st:LabHost,key:string)=>st.lab!.tasks.find(t=>t.sessionKey===key&&['queued','running','waiting-approval'].includes(t.status));
const sessionKey=(st:LabHost,source:LabSource)=>st.lab!.routing==='main'?'main':st.lab!.routing==='sender'?JSON.stringify([source.accountId,source.senderId]):JSON.stringify([source.channelId,source.accountId,source.senderId]);
function recordable(e:LabEvent):boolean{return ['request','observation','result','verified','lab-request','lab-observation','lab-result','lab-verified'].includes(e.type)||e.type==='lab-change'&&e.labPhase==='input';}
export function validLabAction(s:LabScenario,st:LabHost,a:LabAction):boolean {
 if(!st.lab||st.status==='won'||!obj(a))return false;const l=st.lab,d=s.blueprintLab!;
 const fields:Record<string,string[]>={'select-model':['providerId','modelId'],'select-role':['roleId'],rules:['roleId','rules'],workspace:['targets'],approve:['call','taskId','moduleId'],router:['routing'],enqueue:['messageId','mode'],tick:['taskId'],cancel:['taskId'],'trust-project':['trusted'],activate:['moduleIds'],'module-scope':['moduleId','realm','mounts'],invoke:['moduleId','call'],commit:[],'power-cycle':[],'ui-signal':['signal']};
 if(!fields[a.operation]||!allowed(a,['id','type','operation',...fields[a.operation]]))return false;
 const free=!busy(st),live=st.security!.realm==='live';
 if(a.operation==='select-model')return free&&labProviders(s).some(p=>p.id===a.providerId&&p.models.some(m=>m.id===a.modelId))&&(a.providerId!==l.providerId||a.modelId!==l.modelId);
 if(a.operation==='select-role')return free&&labRoles(s).some(r=>r.id===a.roleId)&&a.roleId!==l.roleId;
 if(a.operation==='rules')return free&&labRoles(s).some(r=>r.id===a.roleId)&&validRules(s,a.rules)&&!equal(a.rules,l.rules[a.roleId]);
 if(a.operation==='workspace')return free&&Array.isArray(a.targets)&&new Set(a.targets).size===a.targets.length&&a.targets.every(t=>(d.workspaceTargets??universe(s)).includes(t))&&!equal([...a.targets].sort(),[...l.workspaceTargets].sort());
 if(a.operation==='router')return free&&['main','sender','channel-sender'].includes(a.routing)&&a.routing!==l.routing;
 if(a.operation==='approve'){
  const task=a.taskId?l.tasks.find(t=>t.id===a.taskId):undefined;
  if(a.taskId&&(!task||a.moduleId||head(st,task.sessionKey)!==task||!equal(task.steps[task.cursor]?.call,a.call)))return false;
  if(!validLabCall(s,a.call)||a.moduleId&&(!free||!d.modules?.some(m=>m.id===a.moduleId&&m.kind==='extension')))return false;
  const probe=a.moduleId?structuredClone(st):st;if(a.moduleId)probe.security!.realm=l.moduleScopes[a.moduleId].realm;
  return !labCallDenial(s,probe,a.call,{task,moduleId:a.moduleId,ignoreAsk:true})&&decision(task?.rules??l.rules[l.roleId],a.call,target(s,a.call)!)==='ask'&&!matchingLabPermit(s,probe,a.call,task,a.moduleId);
 }
 if(a.operation==='enqueue'){const m=d.messages?.find(m=>m.id===a.messageId);if(!live||!m||l.tasks.length>=24||st.runtime!.missionRemaining<=0||!['followup','collect','interrupt','steer'].includes(a.mode))return false;const h=head(st,sessionKey(st,m.source));return a.mode==='followup'||Boolean(h&&sourceEqual(h.source,m.source)&&(a.mode!=='collect'||h.started));}
 if(a.operation==='tick'){const t=l.tasks.find(t=>t.id===a.taskId);return live&&st.status!=='paused'&&st.runtime!.missionRemaining>0&&Boolean(t&&head(st,t.sessionKey)===t&&!(t.status==='waiting-approval'&&labCallDenial(s,st,t.steps[t.cursor].call,{task:t})));}
 if(a.operation==='cancel'){const t=l.tasks.find(t=>t.id===a.taskId);return Boolean(t&&['queued','running','waiting-approval'].includes(t.status));}
 if(a.operation==='trust-project')return free&&typeof a.trusted==='boolean'&&a.trusted!==l.projectTrusted;
 if(a.operation==='activate'){if(!free||!ids(a.moduleIds,10)||equal([...a.moduleIds].sort(),[...l.activeModuleIds].sort())||moduleGraphDenial(s,a.moduleIds,l.projectTrusted))return false;const nextStorage=d.modules?.find(m=>m.kind==='storage'&&a.moduleIds.includes(m.id))?.id;return !l.log.entries.length||nextStorage===l.log.providerId||st.status==='paused';}
 if(a.operation==='module-scope'){const m=d.modules?.find(m=>m.id===a.moduleId);return free&&m?.kind==='extension'&&['live','sandbox'].includes(a.realm)&&(a.realm!=='sandbox'||s.security?.sandbox===true)&&Array.isArray(a.mounts)&&new Set(a.mounts).size===a.mounts.length&&a.mounts.every(t=>m.mountableTargets?.includes(t))&&!equal(l.moduleScopes[m.id],{realm:a.realm,mounts:[...a.mounts].sort()});}
 if(a.operation==='invoke'){const m=d.modules?.find(m=>m.id===a.moduleId);return !busy(st)&&st.status==='running'&&m?.kind==='extension'&&validLabCall(s,a.call)&&a.call.tool==='operate'&&s.operations.find(o=>o.id===a.call.operationId)?.lab?.moduleId===m.id;}
 if(a.operation==='commit')return Boolean(l.log.providerId&&st.events.some(e=>recordable(e as LabEvent)&&e.sequence>l.log.committedSequence));
 if(a.operation==='power-cycle')return st.status==='paused'&&Boolean(l.log.providerId);
 if(a.operation==='ui-signal')return typeof a.signal==='string'&&a.signal.length>0&&a.signal.length<=200&&a.signal!==l.uiSignal;
 return false;
}
function receiveBody(st:LabHost,task:LabTask,facts:FactMap,emit:LabEmit,messageId=task.messageId):void {
 const session=st.lab!.sessions[task.sessionKey]??={observed:{},messageIds:[]};if(!session.messageIds.includes(messageId))session.messageIds.push(messageId);
 const ev=emitLab(st,emit,'input','来信内容进入宿主确定的会话。正文只是资料；原始来源、回信地址与授权上限没有改变。',{...labRequestFields(st,task),facts:structuredClone(facts),labFieldProvenance:Object.fromEntries(Object.keys(facts).map(f=>[f,{observationId:`message:${messageId}`,trust:'external' as const,realm:'live' as const}])),success:true,delivered:true});task.eventIds.push(ev.id);
 for(const [f,value]of Object.entries(facts))session.observed[f]={value,source:'observation',eventId:ev.id,provenance:{observationId:`message:${messageId}`,trust:'external',realm:'live'}};task.observed=structuredClone(session.observed);
}
function taskCost(s:LabScenario,st:LabHost,c:ToolCall):number {const o=c.tool==='operate'?s.operations.find(o=>o.id===c.operationId):undefined;return o?.failureCost!==undefined&&Object.entries(o.requires??{}).some(([f,v])=>st.world[f]!==v)?o.failureCost:(c.tool==='observe'?s.observations.find(o=>o.id===c.observationId)?.cost:o?.cost??(c.tool==='verify'?s.goals.find(g=>g.fact===c.fact)?.verifyCost:undefined))??s.limits?.toolCosts?.[c.tool]??1;}
function runTask(s:LabScenario,st:LabHost,t:LabTask,emit:LabEmit):void {
 const m=s.blueprintLab!.messages!.find(m=>m.id===t.messageId)!;
 if(!t.started){t.started=true;t.status='running';receiveBody(st,t,m.facts,emit);emitLab(st,emit,'started','会话队首开始执行。其他队列不能同时改变这一会话；未执行与已发生的动作分开。',{...labRequestFields(st,t),facts:Object.fromEntries(Object.entries(t.observed).map(([f,r])=>[f,r.value])),success:true});}
 const step=t.steps[t.cursor],c=step.call;
 if(step.whenKnown&&Object.entries(step.whenKnown).some(([f,v])=>t.observed[f]?.value!==v)){t.cursor++;emitLab(st,emit,'skipped','该分支没有获得所需已知条件。未知没有被当作真或假，没有请求工具。',{...labRequestFields(st,t),success:true});}
 else{
  const op=c.tool==='operate'?s.operations.find(o=>o.id===c.operationId):undefined,denial=labCallDenial(s,st,c,{task:t})??(op&&(op.security||op.memoryRequires||op.sessionRequires||op.skillRequires||op.protocol||op.retryWindow||op.collaboration||op.lab?.moduleId)?'入口任务不能继承回声身份、批准、记忆流程、协作岗位或扩展执行域。':undefined);
  if(denial){if(decision(t.rules,c,target(s,c)!)==='ask'&&!matchingLabPermit(s,st,c,t)&&!labCallDenial(s,st,c,{task:t,ignoreAsk:true})){t.status='waiting-approval';emitLab(st,emit,'waiting',denial,{...labRequestFields(st,t),success:false});return;}t.status='failed';emitLab(st,emit,'failed',denial,{...labRequestFields(st,t),success:false});return;}
  const cost=taskCost(s,st,c);if(st.runtime!.missionRemaining<cost){t.status='failed';emitLab(st,emit,'failed','共同委托资源不足，未执行本次工具；重新派信不会补充资源。',{...labRequestFields(st,t),success:false});return;}
  t.status='running';const labPermitId=consumeLabPermit(s,st,c,t);st.runtime!.missionRemaining-=cost;st.runtime!.toolCalls++;st.budgetRemaining=Math.min(st.budgetRemaining,st.runtime!.missionRemaining);const callId=`${s.id}:lab-call:${st.runtime!.toolCalls}`,fields={...labRequestFields(st,t),realm:'live' as const,tool:c.tool,target:target(s,c)!,callId,...(labPermitId?{labPermitId}:{})};const req=emit(st,{...fields,type:'lab-request',text:'按原始来源上限请求真实虚拟法器。',cost,...(op?{operationId:op.id}:{})});t.eventIds.push(req.id);let facts:FactMap={},success=false;
  if(c.tool==='observe'){const o=s.observations.find(o=>o.id===c.observationId)!,available=Object.entries(o.availableWhen??{}).every(([f,v])=>st.world[f]===v);facts=available?Object.fromEntries(o.facts.map(f=>[f,o.reportedFacts&&Object.hasOwn(o.reportedFacts,f)?o.reportedFacts[f]:st.world[f]])):{};success=available;const ev=emit(st,{...fields,type:'lab-observation',text:available?o.text:'入口不可用，未取得这些字段。',facts,labFieldProvenance:Object.fromEntries(Object.keys(facts).map(f=>[f,documentProvenance(s,o.id,'live')])),success,delivered:true});t.eventIds.push(ev.id);for(const [f,value]of Object.entries(facts))t.observed[f]={value,source:'observation',eventId:ev.id,provenance:documentProvenance(s,o.id,'live')};}
  else if(c.tool==='operate'){const missing=Object.entries(op!.requires??{}).filter(([f,v])=>st.world[f]!==v),contextMissing=Object.entries(op!.contextRequires??{}).some(([f,v])=>t.observed[f]?.value!==v)||(op!.contextMatches??[]).some(f=>t.observed[f]?.value!==st.world[f]);success=!missing.length&&!contextMissing;facts=success?structuredClone(op!.effects):contextMissing?{}:Object.fromEntries(missing.map(([f])=>[f,st.world[f]]));if(success){Object.assign(st.world,op!.effects);st.security!.revision++;st.verifiedGoals=st.verifiedGoals.filter(f=>!Object.hasOwn(op!.effects,f));}const ev=emit(st,{...fields,type:'lab-result',operationId:op!.id,text:success?op!.successText:contextMissing?'当前会话没有实际收到所需字段，现场未改变。':op!.failureText,facts,success,delivered:true});t.eventIds.push(ev.id);for(const [f,value]of Object.entries(facts))t.observed[f]={value,source:'receipt',eventId:ev.id,provenance:{observationId:ev.id,trust:'executor',realm:'live'}};}
  else{const g=s.goals.find(g=>g.fact===c.fact)!;facts={[g.fact]:st.world[g.fact]};success=st.world[g.fact]===g.equals;const ev=emit(st,{...fields,type:'lab-verified',text:success?'此入口检查的真实现场成立。回声仍须最终验收。':'此入口检查未成立。',facts,success,delivered:true});t.eventIds.push(ev.id);t.observed[g.fact]={value:st.world[g.fact],source:'verification',eventId:ev.id,provenance:{observationId:ev.id,trust:'executor',realm:'live'}};}
  st.lab!.sessions[t.sessionKey].observed=structuredClone(t.observed);t.cursor++;if(!success){t.status='failed';emitLab(st,emit,'failed','实际调用失败，剩余步骤停止；已发生动作与费用保留。',{...labRequestFields(st,t),success:false});return;}
 }
 if(t.cursor===t.steps.length){t.status='succeeded';emitLab(st,emit,'completed','本来信的有限步骤完成，回执仍属于这个原始请求。',{...labRequestFields(st,t),success:true});}
}
export function synchronizeLab(st:LabHost,emit:LabEmit):void {for(const t of st.lab!.tasks)if(['queued','running','waiting-approval'].includes(t.status)&&(st.status==='won'||st.runtime!.missionRemaining===0)){t.status='cancelled';emitLab(st,emit,'cancelled',st.status==='won'?'现场任务完成，未执行的入口步骤已取消。':'共同委托资源耗尽，未执行的入口步骤明确停止。',{...labRequestFields(st,t),success:true});}if(st.runtime!.missionRemaining===0&&st.status!=='won')st.status='exhausted';}
export function applyLabAction(s:LabScenario,st:LabHost,a:LabAction,emit:LabEmit,rebuild:()=>void):void {
 const l=st.lab!;st.runtime!.executionMode='manual';
 if(a.operation==='select-model'){l.providerId=a.providerId;l.modelId=a.modelId;}
 else if(a.operation==='select-role')l.roleId=a.roleId;
 else if(a.operation==='rules')l.rules[a.roleId]=structuredClone(a.rules);
 else if(a.operation==='workspace')l.workspaceTargets=[...a.targets].sort();
 else if(a.operation==='router')l.routing=a.routing;
 else if(a.operation==='trust-project'){l.projectTrusted=a.trusted;if(!a.trusted){l.activeModuleIds=l.activeModuleIds.filter(id=>!s.blueprintLab!.modules?.find(m=>m.id===id)?.projectResource);let removed=true;while(removed){const next=l.activeModuleIds.filter(id=>s.blueprintLab!.modules!.find(m=>m.id===id)!.requires.every(dep=>l.activeModuleIds.includes(dep)));removed=next.length!==l.activeModuleIds.length;l.activeModuleIds=next;}rebuildRegistrations(s,st);}}
 else if(a.operation==='activate'){const removed=l.activeModuleIds.filter(id=>!a.moduleIds.includes(id));l.activeModuleIds=[...a.moduleIds].sort();rebuildRegistrations(s,st);for(const id of removed)emitLab(st,emit,'unloaded','旧模块已经卸载，它的工具与监听注册已清理；既有世界和已提交日志保留。',{labModuleId:id,success:true});}
 else if(a.operation==='module-scope')l.moduleScopes[a.moduleId]={realm:a.realm,mounts:[...a.mounts].sort()};
 else if(a.operation==='approve'){const task=a.taskId?l.tasks.find(t=>t.id===a.taskId):undefined;const realm=a.moduleId?l.moduleScopes[a.moduleId].realm:st.security!.realm,revision=realm==='sandbox'?st.security!.sandboxRevision:st.security!.revision;l.permits.push({id:a.id,call:structuredClone(a.call),...(task?{taskId:task.id}:{}),...(a.moduleId?{moduleId:a.moduleId}:{}),roleId:task?.roleId??l.roleId,realm,configurationRevision:l.configurationRevision,worldRevision:revision,consumed:false});emitLab(st,emit,'approved','只批准这件法器、目标、来源与当前执行版本一次。许可不扩大工作区，也不借出另一位寄件人的权利。',{labPermitId:a.id,...labRequestFields(st,task),realm,...(a.moduleId?{labModuleId:a.moduleId}:{}),success:true});return;}
 else if(a.operation==='enqueue'){
  const m=s.blueprintLab!.messages!.find(m=>m.id===a.messageId)!,key=sessionKey(st,m.source),h=head(st,key),r=role(s,st);const t:LabTask={id:`${s.id}:lab:${l.generation}:task:${l.nextTask++}`,messageId:m.id,sessionKey:key,source:structuredClone(m.source),steps:structuredClone(m.steps),providerId:l.providerId,modelId:l.modelId,roleId:l.roleId,rules:structuredClone(l.rules[r.id]),tools:[...m.tools],targets:[...m.targets],cursor:0,status:'queued',observed:{},eventIds:[],started:false};
  if(h&&(a.mode==='interrupt'||a.mode==='steer')){h.status='cancelled';emitLab(st,emit,'cancelled','同源更改只取消尚未执行的步骤。已装箱、已发送、费用与原始回执不会回滚。',{...labRequestFields(st,h),success:true});}
  if(h&&(a.mode==='interrupt'||a.mode==='steer'))l.tasks.splice(l.tasks.indexOf(h)+1,0,t);else l.tasks.push(t);if(h&&a.mode==='collect'){receiveBody(st,h,m.facts,emit,m.id);}
  emitLab(st,emit,'queued',`宿主按原始来源确定会话 ${key}，采用 ${a.mode}。显示姓名与正文自称不参与认证。`,{...labRequestFields(st,t),labQueueMode:a.mode,success:true});return;
 }
 else if(a.operation==='tick'){runTask(s,st,l.tasks.find(t=>t.id===a.taskId)!,emit);return;}
 else if(a.operation==='cancel'){const t=l.tasks.find(t=>t.id===a.taskId)!;t.status='cancelled';emitLab(st,emit,'cancelled','尚未执行的入口步骤停止。已经发生的现场变化、消息和费用保留。',{...labRequestFields(st,t),success:true});return;}
 else if(a.operation==='commit'){const entries=st.events.filter(e=>recordable(e as LabEvent)&&e.sequence>l.log.committedSequence);l.log.entries.push(...structuredClone(entries));l.log.committedSequence=entries.at(-1)!.sequence;emitLab(st,emit,'committed','已把真实请求、回执与输入提交到当前有限日志提供方。显示动画与ui-signal不属于恢复日志。',{labModuleId:l.log.providerId,success:true});return;}
 else if(a.operation==='power-cycle'){
  st.context!.records=[];st.context!.activeIds=[];delete st.context!.reply;delete st.memory!.queue;st.security!.permits=[];delete st.security!.identity;delete st.security!.preview;l.permits=[];delete l.uiSignal;
  for(const session of Object.values(l.sessions))session.observed={};
  const rootFacts:FactMap={};for(const ev of l.log.entries as LabEvent[])if(ev.delivered&&ev.facts){if(ev.labSessionKey){const session=l.sessions[ev.labSessionKey]??={observed:{},messageIds:[]};for(const [f,value]of Object.entries(ev.facts))session.observed[f]={value,source:ev.type==='lab-observation'||ev.labPhase==='input'?'observation':'receipt',eventId:ev.id,provenance:structuredClone(ev.labFieldProvenance?.[f]??{observationId:ev.id,trust:'executor',realm:'live'})};}else if(ev.realm===st.security!.realm)Object.assign(rootFacts,ev.facts);}
  for(const t of l.tasks)if(['queued','running','waiting-approval'].includes(t.status))t.observed=structuredClone(l.sessions[t.sessionKey]?.observed??{});
  if(Object.keys(rootFacts).length)st.context!.reply={facts:rootFacts,source:'receipt',eventId:l.log.entries.at(-1)!.id,provenance:{observationId:'committed-log',trust:'executor',realm:st.security!.realm}};rebuild();emitLab(st,emit,'restored','从已提交日志恢复模型可见投影。现场和实际执行游标未回滚，不重新执行已经发出的法器；未提交信息需要重新观察。',{labModuleId:l.log.providerId,success:true});return;
 }
 else if(a.operation==='ui-signal'){l.uiSignal=a.signal;emitLab(st,emit,'ui','这是临时显示信号，不是执行回执，不改变世界，也不进入可恢复日志。',{success:true});return;}
 else return;
 l.configurationRevision++;emitLab(st,emit,a.operation==='activate'?'activated':'configured','这层配置已经明确。其他层与实际世界保持各自状态；配置不是施工，也不生成完成证据。',{success:true});
}

/** Independence is proven by successful executions after the latest reset, not configuration clicks. */
export function hasLabTransferEvidence(s:LabScenario,st:LabHost,currentActionIds:Set<string>):boolean {
 const r=s.transferRequirement?.lab;if(!r)return true;
 const events=st.events.filter(e=>e.actionId&&currentActionIds.has(e.actionId)),requests=events.filter(e=>['request','lab-request'].includes(e.type));
 const actual=requests.filter(q=>events.some(e=>e.callId===q.callId&&e.success&&['result','lab-result','observation','lab-observation','verified','lab-verified'].includes(e.type)));
 const complete=(id:string)=>events.some(e=>e.type==='lab-change'&&e.labPhase==='completed'&&e.labMessageId===id&&e.success&&actual.some(q=>q.labTaskId===e.labTaskId));
 if(r.messageIds?.some(id=>!complete(id)))return false;
 if(r.queueModes?.some(mode=>!events.some(e=>e.labPhase==='queued'&&e.labQueueMode===mode&&e.labMessageId&&complete(e.labMessageId)&&actual.some(q=>q.labTaskId===e.labTaskId))))return false;
 if(r.modelIds?.some(id=>!actual.some(e=>e.labModelId===id)))return false;
 if(r.roleIds?.some(id=>!actual.some(e=>e.labRoleId===id)))return false;
 if(r.moduleIds?.some(id=>{const module=s.blueprintLab!.modules!.find(m=>m.id===id)!;return !actual.some(e=>e.labModuleIds?.includes(id)&&(module.kind!=='extension'||e.labModuleId===id));}))return false;
 if(r.approvalUsed&&!actual.some(q=>q.labPermitId&&events.some(e=>e.labPhase==='approved'&&e.success&&e.labPermitId===q.labPermitId&&e.sequence<q.sequence&&e.realm===q.realm&&e.labConfigurationRevision===q.labConfigurationRevision&&e.labRoleId===q.labRoleId&&e.labTaskId===q.labTaskId&&e.labModuleId===q.labModuleId)))return false;
 if(r.snapshotReload){
  const fresh=events.some(e=>e.labPhase==='snapshot'&&e.labSnapshotVersion!==undefined&&e.labSnapshotVersion>1&&e.labSnapshotVersion===e.labStoreVersion&&actual.some(q=>q.sequence>e.sequence&&q.labSnapshotVersion===e.labSnapshotVersion&&q.tool==='operate'));
  const recalled=st.runtime!.actionHistory.some(a=>{
   if(a.type!=='memory'||a.operation!=='recall'||!currentActionIds.has(a.id))return false;
   const recall=events.find(e=>e.actionId===a.id&&e.type==='memory-change'),entry=st.memory!.entries.find(m=>m.key===a.key&&m.status==='active');
   if(!recall||!entry||entry.revision<=(st.lab!.snapshots[st.sessions!.activeId]?.records.find(x=>x.key===a.key)?.revision??0))return false;
   return st.context!.activeIds.some(id=>{
    const card=st.context!.records.find(c=>c.id===id)!,included=events.find(e=>e.type==='context-change'&&e.sequence>recall.sequence&&e.actionId&&st.runtime!.actionHistory.some(a=>a.id===e.actionId&&a.type==='context'&&a.operation==='include'&&a.recordId===id));
    return card.origin?.memoryId===entry.id&&card.origin.revision===entry.revision&&included&&actual.some(q=>{
     const op=q.operationId?s.operations.find(o=>o.id===q.operationId):undefined;
     return q.sequence>included.sequence&&op&&[...Object.keys(op.contextRequires??{}),...(op.contextMatches??[])].some(f=>Object.hasOwn(entry.facts,f));
    });
   });
  });
  if(!fresh&&!recalled)return false;
 }

 if(r.committedRestore&&!events.some(e=>e.labPhase==='restored'&&st.lab!.log.entries.some(q=>q.sequence<e.sequence&&['result','observation','lab-result','lab-observation'].includes(q.type)&&q.success)&&actual.some(q=>q.sequence>e.sequence)))return false;
 return true;
}
