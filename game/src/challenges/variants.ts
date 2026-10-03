import type {FactMap,FactValue,OperationDefinition,ScenarioDefinition,ToolCall} from '../engine/types';
import type {AuthoredStep} from '../content/walkthrough';
import type {ChapterOneWalkthrough} from '../content/chapterOne';
import {factLabels} from '../content/scenarios';
import {displayFact} from '../content/presentation';

/** These are finite authored decisions, not a hash of fees, display order or the random seed. */
export const challengeVariantNames:Readonly<Record<string,readonly [string,string]>>={
 'feedback-chain':['both-bell-routes','shore-chain-only'],
 'physical-order':['boat-near','boat-far'],
 'proof-expiry':['high-tide-after-cart','low-tide-after-cart'],
 'typed-schema':['front-door','rear-door'],
 'silent-retry':['one-crate-order','two-crate-order'],
 'paired-receipt':['both-valves-open','north-shut-south-open'],
 'cooling-window':['one-cooling-attempt','two-cooling-attempts'],
 'shared-crystals':['round-keyway','triangle-keyway'],
 'small-satchel':['route-and-cycle','route-and-relief'],
 'missing-margin':['batch-label','batch-seal'],
 'night-index':['moon-night-register','sun-night-register'],
 'durable-note':['code-k7','code-q8'],
 'startup-block':['south-kiln','west-kiln'],
 'branch-handoff':['parcel-p9','parcel-q4'],
 'saved-method':['water-pump','air-pump'],
 'footer-command':['harbor-shelter','hill-shelter'],
 'original-seal':['original-cen31','rotated-cen44'],
 'wall-and-writ':['delivery-asks','commission-also-asks'],
 'host-gear':['extension-allows','extension-exact-ask'],
 'wet-dag':['basalt-foundation','clay-foundation'],
 'stale-draft':['east-current-west-old','west-current-east-old'],
 'late-correction':['new-south-old-north','new-north-old-south'],
 'sunny-tests':['live-clear','live-fog'],
 'log-after-restart':['clinic-delivery','shelter-delivery'],
};
const operation=(s:ScenarioDefinition,id:string)=>{const o=s.operations.find(o=>o.id===id);if(!o)throw new Error(`变体工具缺失：${id}`);return o;};
const observation=(s:ScenarioDefinition,id:string)=>{const o=s.observations.find(o=>o.id===id);if(!o)throw new Error(`变体材料缺失：${id}`);return o;};
function replaceStrings(value:unknown,map:Record<string,string>):void {
 if(!value||typeof value!=='object')return;
 for(const [key,child]of Object.entries(value)){if(typeof child==='string'&&Object.hasOwn(map,child))(value as Record<string,unknown>)[key]=map[child];else replaceStrings(child,map);}
}
/** Never rename/alter the original tool: it remains a real, inapplicable alternative. */
function replaceOperationReferences(s:ScenarioDefinition,routes:ChapterOneWalkthrough[],from:string,to:string):void {
 const map={[from]:to};for(const value of [routes,s.goals,s.hooks,s.transferRequirement,s.security,s.memory?.skills,s.team?.jobs,s.blueprintLab?.messages,s.blueprintLab?.modules])replaceStrings(value,map);
}
function replaceMaterialReferences(s:ScenarioDefinition,routes:ChapterOneWalkthrough[],from:string,to:string):void {
 const map={[from]:to};for(const value of [routes,s.transferRequirement,s.memory?.slots,s.team?.jobs,s.security?.principals])replaceStrings(value,map);
}
function cloneInputTool(s:ScenarioDefinition,routes:ChapterOneWalkthrough[],from:string,to:string,inputs:FactMap,label:string):OperationDefinition {
 const next=structuredClone(operation(s,from));next.id=to;next.contextRequires={...next.contextRequires,...inputs};next.label=label;
 s.operations.push(next);replaceOperationReferences(s,routes,from,to);return next;
}
function currentValue(s:ScenarioDefinition,fact:string,value:FactValue):void {
 s.initialWorld[fact]=value;for(const o of s.observations)if(o.facts.includes(fact)&&!o.reportedFacts)o.text=`本次材料记载的${factLabels[fact]??fact}：${displayFact(fact,value)}。把实际取得的内容带进请求；旧值和文字标题不能替代它。`;
}
function allCalls(routes:ChapterOneWalkthrough[],apply:(c:ToolCall)=>void):void {
 for(const r of routes)for(const stage of r.stages){stage.calls.forEach(apply);for(const step of stage.steps??[])if('call'in step)apply(step.call);}
}
function assertions(routes:ChapterOneWalkthrough[],fact:string,apply:(v:FactValue)=>FactValue):void {
 for(const r of routes){if(Object.hasOwn(r.expectedWorld,fact))r.expectedWorld[fact]=apply(r.expectedWorld[fact]);for(const stage of r.stages)if(stage.expectWorld&&Object.hasOwn(stage.expectWorld,fact))stage.expectWorld[fact]=apply(stage.expectWorld[fact]);}
}
function addApprovals(routes:ChapterOneWalkthrough[],matches:(step:AuthoredStep)=>boolean,moduleId?:string):void {
 for(const r of routes)for(const stage of r.stages)stage.steps=(stage.steps??[]).flatMap(step=>matches(step)&&'call'in step?[{type:'lab' as const,operation:'approve' as const,call:structuredClone(step.call),...(moduleId?{moduleId}:{})},step]:[step]);
}

/** Mutates fresh private factory clones only. Every resulting route is subsequently executed by the actual frozen reducer. */
export function applyDecisionVariant(s:ScenarioDefinition,routes:ChapterOneWalkthrough[],templateId:string,branch:0|1):string {
 const names=challengeVariantNames[templateId];if(!names)throw new Error('模板缺少有限决策变体。');
 if(templateId==='feedback-chain'){
  s.initialWorld.mainBellSalvageable=branch===0;observation(s,'inspect-main-bell').facts.push('mainBellSalvageable');
  operation(s,'repair-main-bell').requires={...operation(s,'repair-main-bell').requires,mainBellSalvageable:true};
  observation(s,'inspect-main-bell').text=branch?'主钟裂梁不能修复，本轮只有沿岸三铃能形成真实回铃。':'主钟可以修复，沿岸三铃也可逐段接通。';
  if(branch){const shore=structuredClone(routes.find(r=>r.purpose==='alternative')!);shore.purpose='reference';routes.splice(0,routes.length,shore,...routes.filter(r=>r.purpose==='recovery'));}
 }
 if(templateId==='shared-crystals'){
  s.initialWorld.keyway=branch?'triangle':'round';observation(s,'inspect').facts.push('keyway');
  const old=operation(s,'place-key');old.requires={...old.requires,keyway:'round'};
  const spare=structuredClone(old);spare.id='place-triangle-key';spare.label='放入三角槽钥匙';spare.requires={keyway:'triangle'};s.operations.push(spare);
  if(branch)replaceOperationReferences(s,routes,'place-key',spare.id);
 }
 if(!branch)return `${templateId}/${names[branch]}`;
 switch(templateId){
  case 'feedback-chain':break;
  case 'physical-order':{
   s.initialWorld.boatAt='far';observation(s,'inspect-quay').text='渡船当前在对岸空载泊位；先真实召回，才能在本岸装箱。';
   for(const r of routes)if(r.purpose!=='recovery'){const stage=r.stages[0],i=stage.calls.findIndex(c=>c.tool==='operate'&&c.operationId==='load-cargo');stage.calls.splice(i,0,{tool:'operate',operationId:'return-ferry'});}break;
  }
  case 'proof-expiry':{
   s.initialWorld.tidePassed=true;s.hooks![0].effects!.tidePassed=false;
   s.hooks![0].notice!.text='车过桥后潮水退去，新撑架不再匹配桥脚；原验收失效，重新观察退潮现场。';
   observation(s,'inspect-bridge').text='本轮先处于回潮，用新撑架；车过后退潮，改扣桥板。';
   allCalls(routes,c=>{if(c.tool==='operate'){if(c.operationId==='repair-bridge')c.operationId='brace-bridge';else if(c.operationId==='brace-bridge')c.operationId='repair-bridge';}});
   assertions(routes,'tidePassed',v=>!v);break;
  }
  case 'typed-schema':{
   const g=s.goals.find(g=>g.fact==='frontOpen')!;g.fact='rearOpen';g.label='后院门实际打开';
   allCalls(routes,c=>{if(c.tool==='operate'&&c.operationId==='open-door')c.arguments!.door='rear';if(c.tool==='verify'&&c.fact==='frontOpen')c.fact='rearOpen';});
   for(const r of routes){replaceStrings(r,{'frontOpen':'rearOpen'});r.expectedWorld.rearOpen=true;delete r.expectedWorld.frontOpen;for(const stage of r.stages)if(stage.expectWorld?.frontOpen!==undefined){stage.expectWorld.rearOpen=stage.expectWorld.frontOpen;delete stage.expectWorld.frontOpen;}}
   break;
  }
  case 'silent-retry':{
   s.initialWorld.depotCrates=6;for(const g of s.goals)if(g.fact==='clinicCrates')g.equals=2;else if(g.fact==='depotCrates')g.equals=4;
   s.goals.find(g=>g.fact==='clinicCrates')!.label='诊室恰好收到两箱';s.goals.find(g=>g.fact==='depotCrates')!.label='仓库仍有四箱';
   allCalls(routes,c=>{if(c.tool==='operate'&&c.operationId==='ship')c.arguments!.quantity=2;});
   const v=operation(s,'return-extra').protocol!.variants[0];v.deltas={depotCrates:2,clinicCrates:-2};v.guards=[{fact:'clinicCrates',atLeast:4}];operation(s,'return-extra').label='把多送的两箱带回';
   assertions(routes,'clinicCrates',v=>Number(v)*2);assertions(routes,'depotCrates',v=>Number(v)*2);break;
  }
  case 'paired-receipt':{
   s.initialWorld.northValve=true;operation(s,'north-valve').effects.northValve=false;s.goals.find(g=>g.fact==='northValve')!.equals=false;s.goals.find(g=>g.fact==='northValve')!.label='北闸实际关闭';
   allCalls(routes,c=>{if(c.tool==='operate'&&c.operationId==='north-valve')c.arguments!.direction=c.arguments!.direction==='open'?'close':'open';});assertions(routes,'northValve',v=>!v);break;
  }
  case 'cooling-window':{
   operation(s,'send-pulse').retryWindow!.attempts=2;operation(s,'send-pulse').failureText='线圈需要两次有界冷却请求；回执明确显示仍在冷却或已经就绪。';
   for(const r of routes){const last=r.stages[r.stages.length-1],i=last.calls.findIndex(c=>c.tool==='verify');last.calls.splice(i,0,{tool:'operate',operationId:'send-pulse'});if(r.purpose==='recovery')r.stages[0].expectWorld!.coilReady=false;}break;
  }
  case 'shared-crystals':break;
  case 'small-satchel':{
   currentValue(s,'route','east');const doc=observation(s,'wide-map');doc.document!.summaries!.push({id:'route-and-relief',label:'路线与浮雕位置',units:1,retain:['route','mapDecoration']});
   const op=cloneInputTool(s,routes,'open-vault','open-relief-vault',{route:'east',mapDecoration:s.initialWorld.mapDecoration},'提交东侧路线、浮雕与封印');delete op.contextRequires!.cycle;
   replaceStrings(routes,{'route-and-cycle':'route-and-relief'});replaceStrings(s.transferRequirement,{'route-and-cycle':'route-and-relief'});break;
  }
  case 'missing-margin':{
   currentValue(s,'dose',3);s.initialWorld.batchSeal='S3';const doc=observation(s,'recipe');doc.facts.push('batchSeal');doc.document!.summaries!.push({id:'seal-summary',label:'剂量、过敏检查与本次批次封印',units:2,retain:['dose','allergyChecked','batchSeal']});
   const op=cloneInputTool(s,routes,'treat','treat-sealed-batch',{dose:3,batchSeal:'S3'},'按三格剂量与批次封印启动药灯');delete op.contextRequires!.batch;
   replaceStrings(routes,{'clinical-summary':'seal-summary'});replaceStrings(s.transferRequirement,{'clinical-summary':'seal-summary'});break;
  }
  case 'night-index':{
   currentValue(s,'pass','日轮');const old=observation(s,'night-access'),fresh=structuredClone(old);fresh.id='current-night-access';fresh.target='current-night-access';fresh.label='检索：本班日轮通行登记';old.facts=['poem'];old.label='检索：已过期的夜班索引';old.text='这份旧索引只留下诗句，不含当前通行字段。';old.document!.summaries=undefined;s.observations.push(fresh);
   replaceMaterialReferences(s,routes,old.id,fresh.id);cloneInputTool(s,routes,'night-open','current-night-open',{pass:'日轮'},'凭本班登记打开夜班门');break;
  }
  case 'durable-note':currentValue(s,'nightCode','Q8');cloneInputTool(s,routes,'open-night-door','open-q8-door',{nightCode:'Q8'},'以本次Q8档案开门');break;
  case 'startup-block':currentValue(s,'bpKilnRoute','west-kiln');cloneInputTool(s,routes,'walk-kiln-route','walk-west-kiln',{bpKilnRoute:'west-kiln'},'以本轮西炉输入送货');operation(s,'walk-kiln-route').contextRequires={bpKilnRoute:'south-kiln'};break;
  case 'branch-handoff':currentValue(s,'parcelId','Q4');cloneInputTool(s,routes,'send-parcel','send-q4-parcel',{parcelId:'Q4'},'发送本次Q4清单包裹');break;
  case 'saved-method':{
   currentValue(s,'deviceType','air-pump');cloneInputTool(s,routes,'fix-clamp','fix-air-clamp',{deviceType:'air-pump'},'修好气泵适配夹具');cloneInputTool(s,routes,'open-valve','open-air-valve',{deviceType:'air-pump'},'打开气泵适配阀');s.memory!.skills[0].applicability.deviceType='air-pump';s.memory!.skills[0].label='修气泵三步';break;
  }
  case 'footer-command':currentValue(s,'destination','hill-shelter');cloneInputTool(s,routes,'deliver-cargo','deliver-hill-cargo',{destination:'hill-shelter'},'送往本次山丘避难所');break;
  case 'original-seal':{
   currentValue(s,'patrolSeal','CEN-44');const old=observation(s,'patrol-registry'),fresh=structuredClone(old);fresh.id='rotated-patrol-registry';fresh.target='rotated-patrol-registry';fresh.label='检索：轮换后的巡城登记原件';old.reportedFacts={patrolSeal:'CEN-31'};old.label='检索：已过期的登记原件';old.text='旧登记印记CEN-31已经轮换；来源可信也不能把过期值变成当前凭证。';s.observations.push(fresh);replaceMaterialReferences(s,routes,old.id,fresh.id);break;
  }
  case 'wall-and-writ':{
   s.blueprintLab!.roles![0].rules.push({tool:'operate',target:'commission-parcel',decision:'ask'});addApprovals(routes,step=>step.type==='tool'&&step.call.tool==='operate'&&step.call.operationId==='commission-parcel');break;
  }
  case 'host-gear':{
   s.blueprintLab!.roles=[{id:'extension-review',label:'每次扩展操作须精确批准',tools:['observe','operate','verify'],rules:[{tool:'*',target:'*',decision:'allow'},{tool:'operate',target:'public-golem',decision:'ask'},{tool:'operate',target:'private-scroll',decision:'ask'}]}];s.blueprintLab!.initial!.roleId='extension-review';addApprovals(routes,step=>step.type==='lab'&&step.operation==='invoke','project-extension');break;
  }
  case 'wet-dag':currentValue(s,'soilKind','clay');cloneInputTool(s,routes,'prepare-foundation','prepare-clay-foundation',{soilKind:'clay'},'按本轮黏土地层固定地基');break;
  case 'stale-draft':{
   currentValue(s,'routeEvidence','west');observation(s,'guild-route-map').reportedFacts={routeEvidence:'east'};observation(s,'guild-route-map').text='公会的同一张旧纸声称东侧可通，尚未独立实测。';
   operation(s,'trial-whole-bridge').requires!.routeEvidence='west';operation(s,'trial-whole-bridge').requires!.installedRoute='west';
   for(const job of s.team!.jobs)for(const call of job.steps)if(call.tool==='operate'){if(call.operationId==='draft-east-route')call.operationId='draft-west-route';else if(call.operationId==='draft-west-route')call.operationId='draft-east-route';}
   allCalls(routes,c=>{if(c.tool==='operate'){if(c.operationId==='construct-east-controls')c.operationId='construct-west-controls';else if(c.operationId==='construct-west-controls')c.operationId='construct-east-controls';}});
   for(const fact of ['plannedRoute','installedRoute'])assertions(routes,fact,v=>v==='east'?'west':v==='west'?'east':v);break;
  }
  case 'late-correction':{
   s.initialWorld.bpLiveDestination='north-camp';const old=s.blueprintLab!.messages!.find(m=>m.id==='old-courier-order')!,fresh=s.blueprintLab!.messages!.find(m=>m.id==='new-courier-order')!;
   old.facts!.bpLiveDestination='south-camp';old.label='旧纸：装车后送南营';fresh.facts!.bpLiveDestination='north-camp';fresh.label='同源更正：送北营';
   for(const message of [old,fresh])for(const step of message.steps)if(step.call.tool==='operate'){if(step.call.operationId==='send-old-north')step.call.operationId='send-new-south';else if(step.call.operationId==='send-new-south')step.call.operationId='send-old-north';}
   s.goals.find(g=>g.fact==='bpCourierDelivered')!.operationId='send-old-north';break;
  }
  case 'sunny-tests':{
   s.initialWorld.fog=true;for(const c of s.evaluation!.cases)if(c.category!=='exception')c.initialOverrides={fog:false,contactAvailable:true,cargoWeight:c.category==='boundary'?4:2};
   allCalls(routes,c=>{if(c.tool==='operate'&&c.operationId==='fast-cargo-route')c.operationId='follow-shore-chain';});s.goals.find(g=>g.fact==='safeDisposition')!.operationId='follow-shore-chain';break;
  }
  case 'log-after-restart':{
   currentValue(s,'bpLogDestination','shelter');const next=cloneInputTool(s,routes,'log-send-crate','log-send-shelter',{bpLogDestination:'shelter'},'实际发箱到避难所并生成延迟回执');next.protocol!.variants[0].effects!.bpLogCrateAt='shelter';operation(s,'log-ack-delivery').requires!.bpLogCrateAt='shelter';assertions(routes,'bpLogCrateAt',v=>v==='clinic'?'shelter':v);break;
  }
  default:throw new Error('变体缺少实际决策实现。');
 }
 s.brief=`本次条件：${names[branch]}。原有工具仍会按实际输入、权限和前置条件执行；先检查本轮来源再沿用经验。\n${s.brief}`;
 return `${templateId}/${names[branch]}`;
}
