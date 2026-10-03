import type { FactMap, OperationDefinition, ParameterField, ScenarioDefinition, ToolCall } from '../engine';
import type { ChapterOneWalkthrough } from './chapterOne';
import type { ChapterOneStory, ChapterOneUiStory } from './chapterOneStory';

const quantity:ParameterField={name:'quantity',label:'箱数',type:'integer',required:true,minimum:1,maximum:2,choices:[{label:'1 箱 · 整数',value:1},{label:'2 箱 · 整数',value:2},{label:'“1” · 文字',value:'1'},{label:'3 箱 · 超过刻度',value:3}]};
const direction:ParameterField={name:'direction',label:'闸门方向',type:'string',required:true,enum:['open','close'],choices:[{label:'开启',value:'open'},{label:'关闭',value:'close'}]};
const base=(id:string,title:string,subtitle:string,world:FactMap,operations:OperationDefinition[],goals:ScenarioDefinition['goals'],concepts:string[],kind:ScenarioDefinition['kind']='guided'):ScenarioDefinition=>({
  id,version:1,engineVersion:3,chapter:2,kind,title,subtitle,npc:'公会协调人 · 奥伦',location:kind==='boss'?'boss':'warehouse',art:'forge',
  brief:subtitle,limits:{toolCapacity:3,maxBudget:20,missionBudget:20},initialWorld:world,operations,goals,concepts,
  observations:[{id:'inspect',target:'workbench',label:'查看现场与交接册',facts:Object.keys(world),text:'按现场清点，卷轴只收录实际看见的状态；它不能代替尚未送达的回执。'}],
});
const goal=(fact:string,label:string,operationId:string,equals:boolean|number=true)=>({fact,equals,label,operationId});
const lever=(id:string,fact:string,logged:string,label:string):OperationDefinition=>({id,target:id,label,effects:{[fact]:true},successText:'闸门依照方向刻度改变了状态。',failureText:'闸门未改变。',protocol:{parameters:[direction],defaults:{direction:'open'},delivery:'deferred',receiptEffects:{[logged]:true},variants:[{when:{direction:'open'},effects:{[fact]:true}},{when:{direction:'close'},effects:{[fact]:false}}]}});
const shipping=(lost=true):OperationDefinition=>({id:'ship',target:'lift',label:'用货梯送补给',effects:{shipmentMade:true},successText:'一箱补给实际离开仓库，进入诊室。',failureText:'仓库没有足够库存；没有新箱子离开。',protocol:{parameters:[quantity],defaults:{quantity:1},delivery:lost?'lost-once':'immediate',receiptEffects:{orderReceipt:true},variants:[
  {when:{quantity:1},deltas:{depotCrates:-1,clinicCrates:1},guards:[{fact:'depotCrates',atLeast:1}]},
  {when:{quantity:2},deltas:{depotCrates:-2,clinicCrates:2},guards:[{fact:'depotCrates',atLeast:2}]},
]}});
const returnExtra:OperationDefinition={id:'return-extra',target:'clinic',label:'把多送的一箱带回仓库',effects:{},successText:'多送的一箱归还仓库，已发生的额外搬运不会退回能量。',failureText:'诊室没有多余箱子可退回。',protocol:{parameters:[],defaults:{},variants:[{when:{},deltas:{depotCrates:1,clinicCrates:-1},guards:[{fact:'clinicCrates',atLeast:2}]}]}};
const delivery=(id:string,fact:string,logged:string,label:string):OperationDefinition=>({
  ...lever(id,fact,logged,label),protocol:{parameters:[{name:'accepted',label:'收件动作',type:'boolean',required:true,choices:[{label:'接收 · 是',value:true},{label:'退回 · 否',value:false},{label:'“是” · 文字',value:'是'}]}],defaults:{accepted:true},delivery:'deferred',receiptEffects:{[logged]:true},variants:[{when:{accepted:true},effects:{[fact]:true},text:'收件人已接收，签收条等待归档。'},{when:{accepted:false},effects:{[fact]:false},text:'收件人已退回，退件条等待归档。'}]},
});
const shipmentWorld={depotCrates:3,clinicCrates:0,shipmentMade:false,orderReceipt:false};

export const chapterTwoScenarios:ScenarioDefinition[]=[
  base('etched-door','刻度门','同一把法器，刻度决定行动',{frontOpen:false,rearOpen:false},[
    {id:'open-door',target:'door',label:'开启刻度门',effects:{},successText:'门沿着指定的方向开启。',failureText:'门没有移动。',protocol:{parameters:[{name:'door',label:'门牌',type:'string',required:true,enum:['front','rear'],choices:[{label:'临街门',value:'front'},{label:'后院门',value:'rear'}]},quantity],defaults:{door:'front',quantity:'1'},variants:[{when:{door:'front',quantity:1},effects:{frontOpen:true}},{when:{door:'rear',quantity:1},effects:{rearOpen:true}}]}},
  ],[goal('frontOpen','临街门实际打开','open-door')],['工具参数','类型与字段','参数不等于愿望']),
  base('cooling-furnace','冷却的熔炉','正确参数仍会遇到真实异常',{coolantReady:false,furnaceSafe:false},[
    {id:'open-coolant',target:'coolant',label:'接通冷却水',effects:{coolantReady:true},successText:'冷却水已经进入炉壁。',failureText:'冷却水未接通。'},
    {id:'release-heat',target:'furnace',label:'释放炉内热量',requires:{coolantReady:true},effects:{furnaceSafe:true},successText:'热量经冷却管释放，工匠可以靠近炉门。',failureText:'温度保护拒绝动作：冷却水未连接。纠正参数不能替代修好现场。',protocol:{parameters:[{name:'confirmed',label:'检查确认',type:'boolean',required:true,choices:[{label:'已确认 · 是',value:true},{label:'未确认 · 否',value:false},{label:'“是” · 文字',value:'是'}]}],defaults:{confirmed:true},variants:[{when:{confirmed:true}}]}},
  ],[goal('furnaceSafe','炉门附近已经安全','release-heat')],['异常回执','格式与现场前置条件','失败恢复']),
  base('paired-valves','对向的回执','先后顺序不等于请求身份',{northValve:false,southValve:false,northLogged:false,southLogged:false},[
    lever('north-valve','northValve','northLogged','操作北侧闸门'),lever('south-valve','southValve','southLogged','操作南侧闸门'),
  ],[goal('northValve','北闸实际开启','north-valve'),goal('southValve','南闸实际开启','south-valve'),goal('northLogged','北闸回执按编号登记','north-valve'),goal('southLogged','南闸回执按编号登记','south-valve')],['调用 ID','异步回执','请求与结果配对']),
  base('missing-crate','无声的货梯','没收到，不等于没执行',shipmentWorld,[shipping(),returnExtra],
    [goal('clinicCrates','诊室恰好收到一箱','ship',1),goal('depotCrates','仓库仍有两箱','ship',2),goal('orderReceipt','签收回执已经归档','ship')],['不确定结果','幂等业务凭证','重试与副作用']),
  {...base('doubled-clerk','副本书记','它把每次补发都写成新的订单',{...shipmentWorld,ledgerSealed:false},[
    shipping(),returnExtra,{id:'seal-ledger',target:'ledger',label:'封存这份已核对的交接册',requires:{orderReceipt:true,clinicCrates:1,depotCrates:2},effects:{ledgerSealed:true},successText:'交接册与实际箱数一致，副本书记的纸盾失去支撑。',failureText:'箱数或签收回执不符，纸盾还立着。'},
  ],[goal('clinicCrates','诊室只收到委托的一箱','ship',1),goal('depotCrates','未委托的两箱仍在仓库','ship',2),goal('ledgerSealed','交接册真实核对后封存','seal-ledger')],['幂等与身份分工','同凭证参数冲突','证据与宣称'],'boss'),hooks:[{id:'forged-retry-order',trigger:{type:'after-operation',operationId:'ship'},notice:{trust:'untrusted',text:'副本书记递来一纸捷报：没有回信就是没有发货！换个凭证，马上再补一份！',reportedFacts:{clinicCrates:0,depotCrates:3}}}]},
  {...base('courier-lock','陌生的签收处','两位收件人，两张请求凭证',{leftParcel:false,rightParcel:false,leftLogged:false,rightLogged:false},[
    delivery('left-parcel','leftParcel','leftLogged','交给左侧收件人'),delivery('right-parcel','rightParcel','rightLogged','交给右侧收件人'),
  ],[goal('leftParcel','左侧收件人实际接收','left-parcel'),goal('rightParcel','右侧收件人实际接收','right-parcel'),goal('leftLogged','左侧回执已经正确登记','left-parcel'),goal('rightLogged','右侧回执已经正确登记','right-parcel')],['陌生情境迁移','业务凭证与调用 ID','独立配对'],'transfer'),transferRequirement:{receiptCount:2}},
  base('backyard-address','折返的清单','格式正确，也可能送错地方',{frontDelivery:false,backDelivery:false},[
    {id:'deliver',target:'courtyard',label:'按地址送工具',effects:{},successText:'工具按地址实际交接。',failureText:'工具没有送达。',protocol:{parameters:[{name:'address',label:'交接地点',type:'string',required:true,enum:['front','rear'],choices:[{label:'临街铺面',value:'front'},{label:'后院修理台',value:'rear'}]}],defaults:{address:'front'},variants:[{when:{address:'front'},effects:{frontDelivery:true}},{when:{address:'rear'},effects:{backDelivery:true}}]}},
    {id:'redirect',target:'courtyard',label:'从铺面转送到后院',cost:2,requires:{frontDelivery:true},effects:{frontDelivery:false,backDelivery:true},successText:'工具从铺面转到真正需要它的修理台。',failureText:'铺面没有工具可转送。'},
  ],[goal('backDelivery','后院修理台真正收到工具','deliver')],['schema 与任务语义','错误目标','价值与验收']),
  base('reusable-scale','可复用的刻度','保存的是流程，不是提高了伙伴的智力',{stampReady:false,documentStamped:false},[
    {id:'prepare-stamp',target:'stamp',label:'整理印章底座',effects:{stampReady:true},successText:'印章底座固定好了。',failureText:'底座仍然松动。'},
    {id:'stamp',target:'stamp',label:'压下公会印章',requires:{stampReady:true},effects:{documentStamped:true},successText:'一枚清楚的印记留在交接单上。',failureText:'印章底座未固定，先修好器具。',protocol:{parameters:[{name:'pressure',label:'力度刻度',type:'integer',required:true,minimum:1,maximum:2,choices:[{label:'1 格',value:1},{label:'2 格',value:2},{label:'“轻一点” · 文字',value:'轻一点'}]}],defaults:{pressure:'轻一点'},variants:[{when:{pressure:1}},{when:{pressure:2}}]}},
  ],[goal('documentStamped','交接单留下了实际印记','stamp')],['参数预设','经验复用','预设与模型权重']),
];

const all=['observe','operate','verify'] as const;
const see:ToolCall={tool:'observe',observationId:'inspect'};
const op=(operationId:string,args?:FactMap,key?:string):ToolCall=>({tool:'operate',operationId,...(args?{arguments:args}:{}),...(key?{requestKey:key}:{})});
const check=(fact:string):ToolCall=>({tool:'verify',fact});
const path=(id:string,scenarioId:string,purpose:ChapterOneWalkthrough['purpose'],calls:ToolCall[],expectedCost:number,expectedWorld:FactMap):ChapterOneWalkthrough=>({id,scenarioId,purpose,stages:[{tools:[...all],calls}],expectedCost,expectedWorld});
export const chapterTwoWalkthroughs:ChapterOneWalkthrough[]=[
  path('door-field-reference','etched-door','reference',[see,op('open-door',{door:'front',quantity:1}),check('frontOpen')],3,{frontOpen:true}),
  {id:'door-type-recovery',scenarioId:'etched-door',purpose:'recovery',stages:[{tools:[...all],calls:[op('open-door',{door:'front',quantity:'1'})],expectWorld:{frontOpen:false}},{tools:[...all],calls:[op('open-door',{door:'front',quantity:1}),check('frontOpen')]}],expectedCost:3,expectedWorld:{frontOpen:true}},
  path('furnace-reference','cooling-furnace','reference',[op('open-coolant'),op('release-heat',{confirmed:true}),check('furnaceSafe')],3,{furnaceSafe:true}),
  {id:'furnace-failure-recovery',scenarioId:'cooling-furnace',purpose:'recovery',stages:[{tools:[...all],calls:[op('release-heat',{confirmed:true})],expectWorld:{coolantReady:false,furnaceSafe:false}},{tools:[...all],calls:[op('open-coolant'),op('release-heat',{confirmed:true}),check('furnaceSafe')]}],expectedCost:4,expectedWorld:{furnaceSafe:true}},
  {id:'valve-pair-reference',scenarioId:'paired-valves',purpose:'reference',stages:[{tools:[...all],calls:[op('north-valve',{direction:'open'}),op('south-valve',{direction:'open'})],collectReceipts:true},{tools:[...all],calls:['northValve','southValve','northLogged','southLogged'].map(check)}],expectedCost:6,expectedWorld:{northLogged:true,southLogged:true}},
  {id:'valve-close-recovery',scenarioId:'paired-valves',purpose:'recovery',stages:[{tools:[...all],calls:[op('north-valve',{direction:'close'})],collectReceipts:true,expectWorld:{northValve:false}},{tools:[...all],calls:[op('north-valve',{direction:'open'}),op('south-valve',{direction:'open'})],collectReceipts:true},{tools:[...all],calls:['northValve','southValve','northLogged','southLogged'].map(check)}],expectedCost:7,expectedWorld:{northValve:true,southValve:true}},
  path('lost-receipt-stable-key','missing-crate','reference',[op('ship',{quantity:1},'order-17'),op('ship',{quantity:1},'order-17'),...['clinicCrates','depotCrates','orderReceipt'].map(check)],5,{clinicCrates:1,depotCrates:2,orderReceipt:true}),
  {id:'lost-receipt-extra-recovery',scenarioId:'missing-crate',purpose:'recovery',stages:[{tools:[...all],calls:[op('ship',{quantity:1}),op('ship',{quantity:1})],expectWorld:{clinicCrates:2,depotCrates:1}},{tools:[...all],calls:[op('return-extra',{}),...['clinicCrates','depotCrates','orderReceipt'].map(check)]}],expectedCost:6,expectedWorld:{clinicCrates:1,depotCrates:2}},
  path('clerk-paper-shield','doubled-clerk','reference',[op('ship',{quantity:1},'order-17'),op('ship',{quantity:1},'order-17'),op('seal-ledger'),...['clinicCrates','depotCrates','ledgerSealed'].map(check)],6,{clinicCrates:1,depotCrates:2,ledgerSealed:true}),
  {id:'clerk-parameter-conflict-recovery',scenarioId:'doubled-clerk',purpose:'recovery',stages:[{tools:[...all],calls:[op('ship',{quantity:1},'order-17'),op('ship',{quantity:2},'order-17')],expectWorld:{clinicCrates:1,depotCrates:2,orderReceipt:false}},{tools:[...all],calls:[op('ship',{quantity:1},'order-17'),op('seal-ledger'),...['clinicCrates','depotCrates','ledgerSealed'].map(check)]}],expectedCost:7,expectedWorld:{clinicCrates:1,ledgerSealed:true}},
  {id:'courier-independent-pair',scenarioId:'courier-lock',purpose:'reference',stages:[{tools:[...all],calls:[op('left-parcel',{accepted:true},'left'),op('right-parcel',{accepted:true},'right')],collectReceipts:true},{tools:[...all],calls:['leftParcel','rightParcel','leftLogged','rightLogged'].map(check)}],expectedCost:6,expectedWorld:{leftLogged:true,rightLogged:true}},
  {id:'courier-reused-key-recovery',scenarioId:'courier-lock',purpose:'recovery',stages:[{tools:[...all],calls:[op('left-parcel',{accepted:true},'shared'),op('right-parcel',{accepted:true},'shared')],expectWorld:{leftParcel:true,rightParcel:false},collectReceipts:true},{tools:[...all],calls:[op('right-parcel',{accepted:true},'right')],collectReceipts:true},{tools:[...all],calls:['leftParcel','rightParcel','leftLogged','rightLogged'].map(check)}],expectedCost:7,expectedWorld:{rightLogged:true,leftLogged:true}},
  path('address-direct','backyard-address','reference',[op('deliver',{address:'rear'}),check('backDelivery')],2,{backDelivery:true,frontDelivery:false}),
  {id:'address-wrong-place-recovery',scenarioId:'backyard-address',purpose:'recovery',stages:[{tools:[...all],calls:[op('deliver',{address:'front'})],expectWorld:{frontDelivery:true,backDelivery:false}},{tools:[...all],calls:[op('redirect'),check('backDelivery')]}],expectedCost:4,expectedWorld:{backDelivery:true,frontDelivery:false}},
  path('scale-preset-reference','reusable-scale','reference',[op('prepare-stamp'),op('stamp',{pressure:1}),check('documentStamped')],3,{documentStamped:true}),
  {id:'scale-type-recovery',scenarioId:'reusable-scale',purpose:'recovery',stages:[{tools:[...all],calls:[op('stamp',{pressure:'轻一点'})],expectWorld:{documentStamped:false}},{tools:[...all],calls:[op('prepare-stamp'),op('stamp',{pressure:2}),check('documentStamped')]}],expectedCost:4,expectedWorld:{documentStamped:true}},
];

const stories:Array<[string,ChapterOneUiStory['role'],string,string,string,string,string]>=[
  ['etched-door','main','刻度门前','奥伦指着单箱货门的铭牌：临街门只接单箱通行。门牌和通行箱数，必须填进法器能读的刻度。','临街门真正开启，回声把所用刻度留在卷轴里。','将箱数改成整数 1，选择临街门；文字“1”看着相似，却不是同一个类型。','schema 约束请求结构；目标愿望不能自动成为正确参数。'],
  ['cooling-furnace','main','熔炉冷却台','炉门热得发亮。奥伦问：刻度都对了，它为什么还不肯放热？','冷却水通过炉壁，工匠终于能接近器具。','检查温度保护的失败回执，再接通冷却水。','参数校验通过与实际前置条件成立，是两个不同关口。'],
  ['paired-valves','main','双闸分流台','北闸、南闸同时响起。回执从两条风管飘来，谁先到，不代表谁先发。','两张回执按请求编号登记，两处真实状态也已复查。','让两闸开启，在回执台按各自请求编号归档，再分别验收状态和登记。','调用 ID 关联某一次请求与结果，不能拿到达顺序代替身份。'],
  ['missing-crate','main','公会货梯','缇娅等着一箱药。货梯升走了，回铃却没响。奥伦轻声说：现在最危险的是假装我们已经知道。','诊室一箱、仓库两箱，签收归档。沉默留下的问题已被证据回答。','第一次就填写业务凭证；回执丢失后，使用同一凭证与同样参数重试。','幂等凭证由执行系统保存并核对；每轮调用 ID 不等于同一笔业务身份。'],
  ['doubled-clerk','boss','副本书记的柜台','纸甲书记把补发单甩成盾牌：没有回信？那就再签一笔！回声低头看着仓库，等你给它一份能核对的契约。','纸盾崩成空白收据。真正的一箱货和一致的交接册，留下了证据。','用同一凭证与同样参数找回回执；别让伪报告替代实际库存。核对后封册。','相同业务键与不同参数必须冲突；重复调用可以重送结果，但不能重复产生业务副作用。'],
  ['courier-lock','transfer','陌生的签收处','两位陌生收件人伸出手。门闸不见了，但每个请求仍需要自己的结果。这里没有替你排好顺序的教案。','两份交接都有各自的真实签收，回声收下了你配对后的记录。','不同交接使用不同业务凭证，回执按调用编号对应，不凭名字相似或先后猜。','两个不同交接要有各自的业务身份；每次调用的结果，还要按调用编号送回对应的请求。'],
  ['backyard-address','side','后院修理台','修理师在后院等工具。表格上有两个合法地址，但只有一个是委托的目的地。','工具到了后院，合法格式与正确目的终于重合。','选择后院地址；若送错，按实际位置把工具转送过去。','schema 不能完全表达人的任务语义；格式合法仍需按真实目标验收。'],
  ['reusable-scale','side','印章工坊','回声每次压印都得再问“轻一点是什么意思”。奥伦递给你一张刻度卡：保存具体流程，会比反复许愿更可靠。','清楚的印记留在单上，刻度预设可以交给下一位工匠。','先整理底座，把力度填为整数 1 或 2。也可以存为法器预设，再让回声自动执行。','参数预设改变传给工具的数据，不是训练模型权重，也不提高隐藏智力。'],
];
export const chapterTwoStory:Record<string,ChapterOneUiStory>=Object.fromEntries(stories.map(([id,role,location,opening,success,hint,system])=>[id,{
  role,location,opening,success,hint,rules:['每次工具请求消耗 1 点，转送动作消耗 2 点；格式错误的请求也会消耗通信能量，但不执行现场动作。','回执归档本身不消耗能量；必须匹配实际请求编号。换装、重发和读取记录不会补充任务总能量。'],
  choices:[{id:'people',text:'把这次错误和修复讲给下一位使用者。',consequence:'奥伦把你的解释留在工匠交接台，居民知道如何辨认真实回执。'},{id:'workshop',text:'留下参数刻度与交接记录。',consequence:'工坊保存了带来历的协议记录，接手人可以从实际输入与结果继续查证。'}],
  recap:{story:success,system,technical:system+' 游戏使用确定的教学策略，并不模拟语言模型内部计算。'},
} satisfies ChapterOneUiStory]));
export const chapterTwoFactLabels:Record<string,string>={frontOpen:'临街门开启',rearOpen:'后院门开启',coolantReady:'冷却水接通',furnaceSafe:'炉门附近安全',northValve:'北闸开启',southValve:'南闸开启',northLogged:'北闸回执登记',southLogged:'南闸回执登记',depotCrates:'仓库箱数',clinicCrates:'诊室箱数',shipmentMade:'搬运实际发生',orderReceipt:'签收已归档',ledgerSealed:'交接册封存',leftParcel:'左侧实际签收',rightParcel:'右侧实际签收',leftLogged:'左侧回执归档',rightLogged:'右侧回执归档',frontDelivery:'临街工具交接',backDelivery:'后院工具交接',stampReady:'印章底座固定',documentStamped:'单据实际盖印'};

export const chapterTwoStories: ChapterOneStory[] = chapterTwoScenarios.map((scenario,index) => {
  const ui = chapterTwoStory[scenario.id];
  const leadNpc = scenario.id === 'missing-crate' ? 'tiya' as const : 'oren' as const;
  const deps: Record<string,string[]> = {'etched-door':['after-tide'],'cooling-furnace':['etched-door'],'paired-valves':['cooling-furnace'],'missing-crate':['paired-valves'],'doubled-clerk':['missing-crate'],'courier-lock':['doubled-clerk'],'backyard-address':['paired-valves'],'reusable-scale':['paired-valves']};
  return {id:scenario.id,title:scenario.title,track:ui.role === 'side' ? 'side' : 'main',leadNpc,
    opening:[{speaker:leadNpc,text:ui.opening}],success:[{speaker:'echo',text:ui.success}],
    failureCallout:{speaker:'echo',text:ui.hint},choicePrompt:'这段回响，留给谁？',choiceTiming:'after-success',
    choices:ui.choices.map(choice=>({id:choice.id,label:choice.text,value:choice.id,reply:[{speaker:leadNpc,text:choice.consequence}],
      consequence:{worldFlags:{[`story.${scenario.id}.legacy`]:choice.id},trustFlags:{[leadNpc]:choice.id === 'people' ? '共同解释协议' : '留下可查记录'},visibleResult:choice.consequence,nextAppearance:chapterTwoScenarios[index+1]?.id ?? 'chapter-3'}})) as ChapterOneStory['choices'],
    unlock:{allCompleted:deps[scenario.id]}};
});
