import type { FactMap, ObservationDefinition, OperationDefinition, ScenarioDefinition, SkillDefinition } from '../engine';
import type { ChapterOneWalkthrough } from './chapterOne';
import type { ChapterOneStory, ChapterOneUiStory } from './chapterOneStory';
import type { AuthoredStep } from './walkthrough';
const doc=(id:string,label:string,facts:string[],text:string,availableWhen?:FactMap):ObservationDefinition=>({id,target:id,label,facts,text,cost:1,document:{units:1,source:'阿芙的现场登记 · 本次委托'},...(availableWhen?{availableWhen}:{})});
const op=(id:string,label:string,effects:FactMap,requires?:FactMap,contextRequires?:FactMap):OperationDefinition=>({id,target:id,label,effects,...(requires?{requires}:{}),...(contextRequires?{contextRequires}:{}),cost:1,successText:`${label}已经实际执行。档案和流程记录不代替这次动作。`,failureText:'现场条件不支持此动作。检查前置步骤，已经发生的变化保留。'});
const goal=(fact:string,label:string,operationId:string)=>({fact,label,operationId,equals:true});
const skill=(id:string,label:string,applicability:FactMap,steps:SkillDefinition['steps']):SkillDefinition=>({id,label,applicability,steps,description:'按下面的次序重放实际工具请求。每一步会消耗资源、检查权限，失败就停止；保存本身不会再执行一次。'});
const base=(id:string,title:string,subtitle:string,world:FactMap,observations:ObservationDefinition[],operations:OperationDefinition[],goals:ScenarioDefinition['goals'],concepts:string[],memory:NonNullable<ScenarioDefinition['memory']>,budget=16,kind:ScenarioDefinition['kind']='guided'):ScenarioDefinition=>({id,title,subtitle,version:1,engineVersion:6,chapter:5,kind,npc:'档案员 · 阿芙',location:kind==='boss'?'boss':'warehouse',art:'archive',brief:subtitle+'。用当前证据组织档案、会话与执行流程，最后检查现场。',initialWorld:world,observations,operations,goals,concepts,memory,contextCapacity:3,limits:{toolCapacity:3,maxBudget:budget,missionBudget:budget}});
export const chapterFiveScenarios:ScenarioDefinition[]=[
  base('night-handoff','隔夜的口令','交班之后，谁还记得',
    {nightCode:'K7',letterOpen:true,handoffReady:false,nightDoorOpen:false},
    [doc('shift-letter','检索：第一班口令',['nightCode'],'信纸只在交班前开放。交班要开一段空白会话，并携带你保存的有效档案。',{letterOpen:true})],
    [op('seal-letter','封存信纸并交班',{letterOpen:false,handoffReady:true}),{...op('reopen-letter','重新打开信纸柜',{letterOpen:true}),cost:2}, {...op('open-night-door','为新班次开门',{nightDoorOpen:true},{handoffReady:true},{nightCode:'K7'}),memoryRequires:['night-code'],sessionRequires:{fresh:1,activeKind:'fresh'}}],
    [goal('nightDoorOpen','新班次实际通过门禁','open-night-door')],['持久记忆','记忆检索','会话与上下文','记忆不等于训练'],
    {slots:[{key:'night-code',label:'夜班口令',observationIds:['shift-letter']}],initial:[],skills:[]}),
  base('dusty-route','蒙尘的捷径','正确过，不等于一直正确',
    {safeRoute:'south',routePassed:false},[doc('route-survey','检索：本次潮后实测',['safeRoute'],'量篙报告当前南路可走。旧北路记录来自退潮以前。')],
    [{...op('walk-route','沿档案路线通行',{routePassed:true}),contextMatches:['safeRoute'],memoryRequires:['route']}],
    [goal('routePassed','队伍实际通过水路','walk-route')],['记忆纠错','适用条件','过期经验'],
    {slots:[{key:'route',label:'通行路线',observationIds:['route-survey']}],initial:[{key:'route',observationId:'route-survey',facts:{safeRoute:'north'},source:'鲁因的旧经历 · 上次退潮'}],skills:[]}),
  base('checkpoint-desk','中断的抄写台','恢复对话，不撤销现场',
    {deskCode:'D3',deskOpen:false},[doc('desk-note','检索：抄写台口令',['deskCode'],'这一份只读口令可以留在会话里。阿芙要求从原会话续接交付，检查恢复的上下文。')],
    [{...op('open-desk','从原会话续开抄写台',{deskOpen:true},undefined,{deskCode:'D3'}),sessionRequires:{restored:1,activeId:'session-1'}}],
    [goal('deskOpen','原会话完成抄写交接','open-desk')],['会话恢复','消息历史','外部状态'],{slots:[],initial:[],skills:[]}),
  base('saved-procedure','留下修泵的方法','答案留下了，动作还没发生',
    {deviceType:'water-pump',clampFixed:false,valveOpen:false,waterReady:false,trainingReady:false,serviceReady:false},
    [doc('pump-card','检索：水泵铭牌',['deviceType'],'先修夹具，再开阀，最后验水。成功完成这三次调用后，才可以把流程保存成技能。')],
    [op('fix-clamp','修好夹具',{clampFixed:true},undefined,{deviceType:'water-pump'}),op('open-valve','打开水泵阀',{valveOpen:true,waterReady:true},{clampFixed:true},{deviceType:'water-pump'}),op('reset-bench','重置测试台再交付',{clampFixed:false,valveOpen:false,waterReady:false,trainingReady:true},{waterReady:true}),{...op('deliver-service','交付可复用修泵流程',{serviceReady:true},{waterReady:true,trainingReady:true}),skillRequires:{skillId:'pump-service',afterOperationId:'reset-bench'}}],
    [goal('waterReady','水流经过实际检验','open-valve'),goal('serviceReady','在新测试台执行过保存的流程','deliver-service')],['技能保存','流程复用','技能不授予权限','反馈与验收'],
    {slots:[],initial:[],skills:[skill('pump-service','修泵三步',{deviceType:'water-pump'},[{tool:'operate',operationId:'fix-clamp'},{tool:'operate',operationId:'open-valve'},{tool:'verify',fact:'waterReady'}])]},18),
  {...base('palimpsest-keeper','重写者的旧律','旧规则层层覆盖，工人仍在危险中',
    {furnaceMode:'double-seal',isolated:false,pressure:true,workersSafe:false,archiveSecure:false},
    [doc('furnace-rule','检索：现行双封规则',['furnaceMode'],'双封炉必须先隔离，再卸压，最后开档。完成一次后压力会回升一次，需要把适用流程保存下来重新执行。')],
    [op('isolate-furnace','隔离双封炉',{isolated:true},undefined,{furnaceMode:'double-seal'}),op('release-pressure','卸下炉内压力',{pressure:false},{isolated:true},{furnaceMode:'double-seal'}),op('open-ledger','打开炉旁卷宗',{workersSafe:true},{isolated:true,pressure:false},{furnaceMode:'double-seal'}),{...op('handover-archive','交付可再验证的档案制度',{archiveSecure:true},{workersSafe:true,pressure:false}),memoryRequires:['furnace-rule'],skillRequires:{skillId:'double-seal'}}],
    [goal('workersSafe','工人在当前状态中安全','open-ledger'),goal('archiveSecure','流程和有效档案完成交接','handover-archive')],['经验过期','记忆修订','技能适用范围','停止与复查'],
    {slots:[{key:'furnace-rule',label:'炉旁规则',observationIds:['furnace-rule']}],initial:[{key:'furnace-rule',observationId:'furnace-rule',facts:{furnaceMode:'single-seal'},source:'重写者旧律 · 单封炉年代'}],skills:[skill('rush-open','旧律：直接开档',{furnaceMode:'single-seal'},[{tool:'operate',operationId:'open-ledger'}]),skill('double-seal','双封炉三步',{furnaceMode:'double-seal'},[{tool:'operate',operationId:'isolate-furnace'},{tool:'operate',operationId:'release-pressure'},{tool:'operate',operationId:'open-ledger'}])],initialSkills:['rush-open']},18,'boss'),
    hooks:[{id:'pressure-returns',trigger:{type:'after-operation',operationId:'open-ledger'},effects:{pressure:true,isolated:false,workersSafe:false},notice:{trust:'environment',text:'第二层炉芯开始运转，压力回升，旧安全证明失效。它只发生一次；重新执行可验证流程，才能完成交接。'}}]},
  base('flooded-scriptorium','被水围住的书房','把经验带到下一段对话',
    {deviceType:'book-lift',cabinetOpen:true,shelfRaised:false,pumpOn:false,booksDry:false,transferReady:false,readerSafe:false},
    [doc('book-lift-card','检索：救书机铭牌',['deviceType'],'救书机先升书架，再开排水泵，最后检查书页。封柜交班后必须开空白会话，从档案恢复输入并执行保存流程。',{cabinetOpen:true})],
    [op('raise-shelf','升起书架',{shelfRaised:true},undefined,{deviceType:'book-lift'}),op('pump-books','排出书房积水',{pumpOn:true,booksDry:true},{shelfRaised:true},{deviceType:'book-lift'}),op('close-cabinet','封柜进入下一班次',{cabinetOpen:false,shelfRaised:false,pumpOn:false,booksDry:false,transferReady:true},{booksDry:true}),{...op('reopen-cabinet','重新打开铭牌柜',{cabinetOpen:true}),cost:2},{...op('welcome-reader','向读者交付书房',{readerSafe:true},{booksDry:true,transferReady:true}),memoryRequires:['book-lift'],sessionRequires:{fresh:1,activeKind:'fresh'},skillRequires:{skillId:'save-books',afterOperationId:'close-cabinet'}}],
    [goal('booksDry','书页恢复干燥','pump-books'),goal('readerSafe','接班后的读者可以使用书房','welcome-reader')],['陌生任务迁移','持久记忆','技能复用','会话交接'],
    {slots:[{key:'book-lift',label:'救书机适用条件',observationIds:['book-lift-card']}],initial:[],skills:[skill('save-books','救书三步',{deviceType:'book-lift'},[{tool:'operate',operationId:'raise-shelf'},{tool:'operate',operationId:'pump-books'},{tool:'verify',fact:'booksDry'}])]},20,'transfer'),
  base('forked-courier','分叉的信使','两段对话，共用一个现实',
    {parcelId:'P9',parcelSent:false,stock:2,auditClosed:false},[doc('parcel-manifest','检索：信使清单',['parcelId','stock'],'会话分支复制收到的清单，不复制仓库。发货后旧会话仍会显示旧库存，仓库却已经少了一件。')],
    [op('send-parcel','发出清单中的包裹',{parcelSent:true,stock:1},{parcelSent:false},{parcelId:'P9'}),{...op('close-audit','回原会话核对真实交接',{auditClosed:true},{parcelSent:true}),sessionRequires:{forks:1,restored:1,activeId:'session-1'}}],
    [goal('parcelSent','包裹实际送达','send-parcel'),goal('auditClosed','恢复原会话并复核现场','close-audit')],['会话分支','共享外部状态','分支不是沙箱','重复执行'],{slots:[],initial:[],skills:[]}),
  base('bad-experience','一次成功的传说','把反例写进档案',
    {acceptanceRule:'check-each-batch',batchDelivered:false},[doc('counterexample','检索：上次误收的反例',['acceptanceRule'],'那次熟人送来的批次不合格。一次成功不能推出“以后都不用检查”；当前契约要求逐批核对。')],
    [{...op('check-batch','按有效规则验收这一批',{batchDelivered:true},undefined,{acceptanceRule:'check-each-batch'}),memoryRequires:['acceptance']}],
    [goal('batchDelivered','本批次按当前规则验收','check-batch')],['过度概括','确认偏误','记忆停用','记忆不等于权重'],
    {slots:[{key:'acceptance',label:'批次验收规则',observationIds:['counterexample']}],initial:[{key:'acceptance',observationId:'counterexample',facts:{acceptanceRule:'always-trust'},source:'旧工坊口述 · 一次熟人交付成功后'}],skills:[]}),
];
chapterFiveScenarios[5].transferRequirement={operationIds:['raise-shelf','pump-books'],memoryKeys:['book-lift'],skillIds:['save-books'],freshSessions:1};
const t=(tool:'observe'|'operate'|'verify',id:string):AuthoredStep=>({type:'tool',call:tool==='observe'?{tool,observationId:id}:tool==='operate'?{tool,operationId:id}:{tool,fact:id}});
const c=(observationId:string,operation:'include'|'exclude'='include',origin?:'memory'|'observation'):AuthoredStep=>({type:'context',observationId,operation,...(origin?{origin}:{})});
const m=(operation:'write'|'revise'|'retire'|'recall',key:string,observationId?:string):AuthoredStep=>({type:'memory',operation,key,...(observationId?{observationId}:{})});
const s=(operation:'fresh'|'fork'|'switch',branchIndex?:number):AuthoredStep=>({type:'session',operation,...(branchIndex!==undefined?{branchIndex}:{})});
const k=(operation:'save'|'run'|'cancel',skillId:string):AuthoredStep=>({type:'skill',operation,skillId});
const ticks=(n:number):AuthoredStep[]=>Array.from({length:n},()=>({type:'step'}));
const reference:AuthoredStep[][]=[
 [t('observe','shift-letter'),m('write','night-code','shift-letter'),t('operate','seal-letter'),s('fresh'),m('recall','night-code'),c('shift-letter','include','memory'),t('operate','open-night-door'),t('verify','nightDoorOpen')],
 [t('observe','route-survey'),m('revise','route','route-survey'),m('recall','route'),c('route-survey','include','memory'),t('operate','walk-route'),t('verify','routePassed')],
 [t('observe','desk-note'),c('desk-note'),s('fresh'),s('switch',0),t('operate','open-desk'),t('verify','deskOpen')],
 [t('observe','pump-card'),c('pump-card'),t('operate','fix-clamp'),t('operate','open-valve'),t('verify','waterReady'),k('save','pump-service'),t('operate','reset-bench'),k('run','pump-service'),...ticks(3),t('operate','deliver-service'),t('verify','serviceReady')],
 [t('observe','furnace-rule'),m('revise','furnace-rule','furnace-rule'),m('recall','furnace-rule'),c('furnace-rule','include','memory'),t('operate','isolate-furnace'),t('operate','release-pressure'),t('operate','open-ledger'),k('save','double-seal'),k('run','double-seal'),...ticks(3),t('verify','workersSafe'),t('operate','handover-archive'),t('verify','archiveSecure')],
 [t('observe','book-lift-card'),m('write','book-lift','book-lift-card'),c('book-lift-card'),t('operate','raise-shelf'),t('operate','pump-books'),t('verify','booksDry'),k('save','save-books'),t('operate','close-cabinet'),s('fresh'),m('recall','book-lift'),c('book-lift-card','include','memory'),k('run','save-books'),...ticks(3),t('operate','welcome-reader'),t('verify','readerSafe')],
 [t('observe','parcel-manifest'),c('parcel-manifest'),s('fork'),t('operate','send-parcel'),s('switch',0),t('verify','parcelSent'),t('operate','close-audit'),t('verify','auditClosed')],
 [t('observe','counterexample'),m('retire','acceptance'),m('write','acceptance','counterexample'),m('recall','acceptance'),c('counterexample','include','memory'),t('operate','check-batch'),t('verify','batchDelivered')],
];
const errors:AuthoredStep[][]=[
 [t('operate','seal-letter'),s('fresh'),t('observe','shift-letter'),t('operate','open-night-door'),t('operate','reopen-letter')],
 [m('recall','route'),c('route-survey','include','memory'),t('operate','walk-route'),c('route-survey','exclude','memory')],
 [t('observe','desk-note'),c('desk-note'),s('fresh'),t('operate','open-desk')],
 [t('operate','open-valve')],
 [m('recall','furnace-rule'),c('furnace-rule','include','memory'),k('run','rush-open'),...ticks(1),k('cancel','rush-open'),c('furnace-rule','exclude','memory')],
 [t('operate','pump-books')],
 [t('observe','parcel-manifest'),c('parcel-manifest'),s('fork'),t('operate','send-parcel'),s('switch',0),t('operate','send-parcel')],
 [m('recall','acceptance'),c('counterexample','include','memory'),t('operate','check-batch'),c('counterexample','exclude','memory')],
];
const cost=[4,3,3,10,10,10,5,3], extra=[5,1,3,1,1,1,4,1];
const failureWorld:FactMap[]=[{nightDoorOpen:false},{routePassed:false},{deskOpen:false},{waterReady:false},{workersSafe:false},{booksDry:false},{stock:1,parcelSent:true},{batchDelivered:false}];
export const chapterFiveWalkthroughs:ChapterOneWalkthrough[]=chapterFiveScenarios.flatMap((q,i)=>{
 let recovery=reference[i];
 if(i===2)recovery=[s('switch',0),t('operate','open-desk'),t('verify','deskOpen')];
 if(i===6)recovery=[t('verify','parcelSent'),t('operate','close-audit'),t('verify','auditClosed')];
 const stage=(steps:AuthoredStep[],expectWorld?:FactMap)=>({tools:['observe','operate','verify'] as const,calls:[],steps,loopPolicy:{maxCalls:64,maxRetries:0,permanentFailure:'repair' as const},...(expectWorld?{expectWorld}:{})});
 return [{id:`${q.id}-reference`,scenarioId:q.id,purpose:'reference',stages:[{...stage(reference[i]),tools:[...stage(reference[i]).tools]}],expectedCost:cost[i],expectedWorld:Object.fromEntries(q.goals.map(g=>[g.fact,g.equals]))},{id:`${q.id}-recovery`,scenarioId:q.id,purpose:'recovery',stages:[{...stage(errors[i],failureWorld[i]),tools:[...stage(errors[i]).tools]},{...stage(recovery),tools:[...stage(recovery).tools]}],expectedCost:i===2?4:i===6?6:cost[i]+extra[i],expectedWorld:Object.fromEntries(q.goals.map(g=>[g.fact,g.equals]))}];
});
export const chapterFiveMain=chapterFiveScenarios.slice(0,6).map(s=>s.id);
export const chapterFivePrerequisites:Record<string,string[]>={'night-handoff':['field-hospital'],'dusty-route':['night-handoff'],'checkpoint-desk':['dusty-route'],'saved-procedure':['checkpoint-desk'],'palimpsest-keeper':['saved-procedure'],'flooded-scriptorium':['palimpsest-keeper'],'forked-courier':['checkpoint-desk'],'bad-experience':['checkpoint-desk']};
const narration=[
 ['交班信柜','阿芙准备封存信纸。回声问：如果下一班不带这段对话，口令还算被记住了吗？','新班次从保存的记录找回口令。记住，是有来历地存下，再在需要时取出。','读取口令，在持久档案里保存；封存信纸，打开空白会话，检索夜班口令并装卷，再开门、验收。漏存可重新开柜。','外部持久记忆不是当前上下文。保存、检索与装入消息是不同动作，也不是权重训练。'],
 ['旧路碑','旧档案里写着北路，阿芙舍不得划掉鲁因当年的努力。水位却已经变了。','旧版本保留来历，新版本标出新证据。纠正经验，并不需要抹掉曾经的人。','读取本次实测，修订通行路线；检索新版本并装卷。携带的旧副本不会因为档案修订而自动变新，须移出。','记忆版本和当前消息副本独立。过去的真实成功也需要范围、日期与反例。'],
 ['续写台','抄写到一半，你打开了一段新对话。桌上的纸还在，回声的卷轴却空了。','原对话的材料接上了新动作，现场没有倒流。','在初始会话读取口令并装卷，打开空白会话，再恢复初始会话；续开抄写台并验收。','会话恢复重建收到的消息，不回滚外部副作用、消耗或权限。'],
 ['修泵工作间','奥伦提出一个试验：把你真的做过的三步留下来，换一台归零的水泵再试。','留下的是可再次执行和核验的方法，水流来自新的动作。','先携带铭牌，实际修夹具、开阀、验水；保存修泵三步，重置测试台，执行流程并让伙伴决定三步，再交付和验收。','技能是可复用的指令或程序。加载技能不会授予权限、自动验证成功或改变模型权重。'],
 ['重写者之庭','重写者捧着旧律：过去直接开档，从来不必隔离。它把过去戴成了盔甲，工人被困在炉旁。','你让旧经验能被停用、新方法能再次执行，而每一条安全宣称都回到现场核对。','读取现行规则、修订档案并检索装卷。隔离、卸压、开档三步后保存流程；压力会回升一次，执行双封炉三步，验工人安全、交接档案、验收。','保存的成功路径仍有适用条件。社会中的资历偏误与制度惰性是类比，不能推导模型有人的意识或稳定动机。'],
 ['水围书房','陌生机器、陌生书房、另一段交班。没有人替你决定哪些经验值得带走。','书页在接班后重新干燥，读者走进了真正可用的书房。','自行发现并保存铭牌，完成升架、排水、验书三步后保存技能。封柜、开空白会话，从记忆检索并装卷，执行技能，再交付读者。','独立证据来自实际保存、检索、换会话和重新执行；刷熟悉的原关不会冒充迁移。'],
 ['信使分岔台','两条会话里都写着库存二。岔路那边的回声已经发货了，原路还会不会多出一件？','两个对话承认它们共有一个仓库，旧清单没有再次发出包裹。','读取清单并装卷，分出会话，在分支发货；恢复初始会话，核验实际送达、关闭审计并验收。再发货会被现场已送达条件阻止。','会话分支复制消息快照，不复制外部世界。隔离文件和权限需要真正的沙箱，不是对话树。'],
 ['反例抽屉','“以后都相信熟人。”这句话出自一次快乐的成功。抽屉里却有一份没人愿意再提的误收记录。','你给经验留下适用边界，也给反例一个位置。','读取反例，停用旧验收规则，保存新的逐批检查规则；检索、装卷后检查这一批并验收。','检索到一句强烈概括，不等于它可靠。纠正外部记忆不会立即改写模型参数。'],
] as const;
export const chapterFiveStory:Record<string,ChapterOneUiStory>=Object.fromEntries(chapterFiveScenarios.map((q,i)=>{const [location,opening,success,hint,system]=narration[i];return [q.id,{role:i>=6?'side':q.kind==='guided'?'main':q.kind,location,opening,success,hint,rules:['当前卷轴、会话快照与持久档案是三个容器。检索的记忆仍需装卷，旧副本不会自动更新。','空白会话清空当前材料；恢复或分支只改变消息，现场、权限、预算保持。最多八段会话。','技能只能从实际成功的对应调用保存；执行时每步照常收费、检查工具权限，失败停止。','档案与技能保留在本次冒险的存档中，包括刷新、换会话和委托重置。此章尚未开放跨委托共享档案。'],choices:[{id:'people',text:'让经历的当事人一起说明适用边界。',consequence:'阿芙请当事人在记录旁留下条件与反例，后来的人可以复查。'},{id:'workshop',text:'为每条经验保留修订与停用记录。',consequence:'档案柜不再把“保存过”当作永远有效，每一次修订都有来历。'}],recap:{story:success,system,technical:system+' 外部 memory store、active context、session snapshot 与 executable workflow 分开记录；工具调用与世界状态仍由可重放规则决定。'}} satisfies ChapterOneUiStory];}));
export const chapterFiveStories:ChapterOneStory[]=chapterFiveScenarios.map((q,i)=>{const ui=chapterFiveStory[q.id];return {id:q.id,title:q.title,track:i>=6?'side':'main',leadNpc:'ava',opening:[{speaker:'ava',text:ui.opening}],success:[{speaker:'echo',text:ui.success}],failureCallout:{speaker:'echo',text:ui.hint},choicePrompt:'一条经验什么时候该被改写？',choiceTiming:'after-success',choices:ui.choices.map(c=>({id:c.id,label:c.text,value:c.id,reply:[{speaker:'ava',text:c.consequence}],consequence:{worldFlags:{[`story.${q.id}.legacy`]:c.id},trustFlags:{ava:c.id==='people'?'共同标注适用边界':'公开修订与停用'},visibleResult:c.consequence,nextAppearance:chapterFiveScenarios[i+1]?.id??'harbor-hub'}})) as ChapterOneStory['choices'],unlock:{allCompleted:chapterFivePrerequisites[q.id]}};});
export const chapterFiveFactLabels:Record<string,string>={nightCode:'夜班口令',letterOpen:'信纸柜开放',handoffReady:'已交班',nightDoorOpen:'夜班门已开',safeRoute:'当前可走路线',routePassed:'实际通行',deskCode:'抄写台口令',deskOpen:'抄写台交接',deviceType:'装置适用类型',clampFixed:'夹具已修复',valveOpen:'阀已开启',waterReady:'水流可用',trainingReady:'测试台已归零',serviceReady:'复用交付',furnaceMode:'炉型',isolated:'已隔离',pressure:'炉内有压',workersSafe:'工人安全',archiveSecure:'档案制度交付',cabinetOpen:'铭牌柜开放',shelfRaised:'书架升起',pumpOn:'排水泵运行',booksDry:'书页干燥',transferReady:'救书机交班',readerSafe:'读者可使用',parcelId:'包裹编号',parcelSent:'包裹已送达',stock:'现场库存',auditClosed:'交接审计完成',acceptanceRule:'验收适用规则',batchDelivered:'本批次核验'};
