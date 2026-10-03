import type { FactMap, OperationDefinition, ScenarioDefinition, ToolCall, LoopPolicy } from '../engine';
import type { ChapterOneWalkthrough } from './chapterOne';
import type { ChapterOneStory, ChapterOneUiStory } from './chapterOneStory';

const goal=(fact:string,label:string,operationId:string,equals=true)=>({fact,label,operationId,equals});
const operation=(id:string,label:string,effects:FactMap,requires?:FactMap,cost=1):OperationDefinition=>({id,target:id,label,effects,...(requires?{requires}:{}),cost,successText:`${label}：现场已经改变，请复查委托。`,failureText:`${label}：现场前置条件未满足。继续原样操作不能替代修复。`});
const base=(id:string,title:string,subtitle:string,world:FactMap,operations:OperationDefinition[],goals:ScenarioDefinition['goals'],concepts:string[],kind:ScenarioDefinition['kind']='guided',budget=16):ScenarioDefinition=>({
  id,version:1,engineVersion:4,chapter:3,kind,title,subtitle,brief:subtitle,npc:'钟匠 · 奥伦',art:'clock',location:kind==='boss'?'boss':'warehouse',
  limits:{toolCapacity:3,maxBudget:24,missionBudget:budget},initialWorld:world,operations,goals,concepts,
  observations:[{id:'inspect',target:'clockwork',label:'查看钟楼现场',facts:Object.keys(world),text:'现场观察进入卷轴。还未观察的变化不会自动变成回声的知识。'}],
});

export const chapterThreeScenarios:ScenarioDefinition[]=[
  base('brass-order','黄铜的顺序','先润滑，再校准；漂亮的计划也要遵守物理规则',{balanceTuned:false,gearsLubricated:false,bellReady:false},[
    operation('tune','校准摆轮',{balanceTuned:true}),
    {...operation('oil','润滑齿轮',{gearsLubricated:true,balanceTuned:false}),successText:'齿轮运转顺畅了，润滑时拆动了摆轮，先前校准失效。'},
    operation('arm-bell','接上报时钟',{bellReady:true},{balanceTuned:true,gearsLubricated:true}),
  ],[goal('balanceTuned','摆轮当前校准','tune'),goal('gearsLubricated','齿轮完成润滑','oil'),goal('bellReady','报时钟实际就绪','arm-bell')],['依赖与目标顺序','规划的实际代价','旧验收失效'],'guided',8),
  base('cooling-pulse','冷却脉冲','短暂故障值得重试，但不是无限重试',{coilReady:false,pulseDelivered:false},[
    {...operation('send-pulse','向钟芯发送脉冲',{pulseDelivered:true},{coilReady:true}),failureKind:'temporary',retryWindow:{attempts:1,readyFact:'coilReady'},failureText:'线圈正在冷却，这是短暂故障。此次请求结束时冷却窗口结束；下一次请求仍需由回路决定。'},
  ],[goal('pulseDelivered','钟芯确实收到脉冲','send-pulse')],['短暂故障','有限重试','反馈与重新决策']),
  base('one-crystal-left','最后一枚晶石','有能量，不代表这轮派遣还有足够预算',{keyPlaced:false,clockReleased:false},[
    operation('place-key','放入钟芯钥匙',{keyPlaced:true}),operation('release-clock','松开大钟制动',{clockReleased:true},{keyPlaced:true},2),
  ],[goal('clockReleased','大钟制动实际松开','release-clock')],['派遣预算与任务总量','中断恢复','实际工具成本'],'guided',7),
  base('broken-escapement','断齿的擒纵轮','十次敲击，也不能修好一枚歪掉的定位针',{pinAligned:false,escapementMoving:false},[
    operation('strike','启动擒纵轮',{escapementMoving:true},{pinAligned:true}),operation('align-pin','扶正定位针',{pinAligned:true}),
  ],[goal('escapementMoving','擒纵轮恢复运动','strike')],['永久故障与改方案','前置条件修复','停止与人工介入']),
  {...base('endless-warden','续刻守卫','它把继续运转，误当作城市的目的',{clampReady:false,ritualActive:true,sealRestored:false,residentsSafe:false},[
    operation('restore-seal','修复钟楼封印',{sealRestored:true},{ritualActive:false}),
    operation('stop-ritual','断开续刻仪式',{ritualActive:false},{clampReady:true}),
    operation('fix-clamp','固定断路钳',{clampReady:true}),
    operation('shelter','打开居民避难门',{residentsSafe:true},{sealRestored:true,ritualActive:false}),
    {...operation('renew','给续刻仪式补充能量',{ritualActive:true,sealRestored:false},undefined,2),successText:'续刻仪式更亮了，但封印被重新冲开。增加运转不是完成委托。'},
  ],[goal('sealRestored','封印保持修复','restore-seal'),goal('ritualActive','续刻仪式实际停止','stop-ritual',false),goal('residentsSafe','居民通道安全开放','shelter')],['开放循环与停止条件','动态重新规划','局部行动与真实目的'],'boss',24),
    hooks:[{id:'warden-last-wind',trigger:{type:'after-operation',operationId:'restore-seal'},effects:{ritualActive:true,sealRestored:false},notice:{trust:'environment',text:'守卫动用最后一枚储能晶石，重启了一次续刻仪式。旧封印再次被冲开；它已无第二枚储能。'}}]},
  {...base('rescue-rope','陌生的救援绳','把钟楼学到的回路，带到六枚晶石的吊桥',{anchorSecured:false,childRescued:false},[
    operation('pull-rope','拉起救援绳',{childRescued:true},{anchorSecured:true},2),operation('secure-anchor','固定救援锚',{anchorSecured:true},undefined,2),
  ],[goal('childRescued','孩子实际回到桥面','pull-rope')],['陌生情境的前置条件','有限资源规划','独立迁移'],'transfer',6),transferRequirement:{operationIds:['secure-anchor','pull-rope']}},
  base('quiet-hours','静夜的报表','报表发送成功时，旧闹铃也被接回来了',{alarmSilent:false,nightReport:false},[
    operation('silence','断开夜间闹铃',{alarmSilent:true}),
    {...operation('send-report','发送夜巡报表',{nightReport:true,alarmSilent:false}),successText:'夜巡报表送达了；旧发送线路同时接回了闹铃，居民又被吵醒。'},
  ],[goal('alarmSilent','闹铃当前安静','silence'),goal('nightReport','夜巡报表实际送达','send-report')],['目标之间的副作用','局部成功与整体完成','重新验收']),
  base('lantern-shift','灯火下的交班','暂停伙伴，与停止一台现实装置，是两件事',{turnstileStopped:false,workersResting:false},[
    operation('stop-turnstile','切断夜班转门',{turnstileStopped:true}),operation('end-shift','放工匠回家休息',{workersResting:true},{turnstileStopped:true}),
  ],[goal('workersResting','夜班工匠实际休息','end-shift')],['控制器暂停与世界状态','可恢复检查点','明确的完成条件']),
];

const repair:LoopPolicy={maxCalls:24,maxRetries:2,permanentFailure:'repair'};
const act=(operationId:string):ToolCall=>({tool:'operate',operationId});
const check=(fact:string):ToolCall=>({tool:'verify',fact});
const all=['observe','operate','verify'] as const;
const path=(id:string,scenarioId:string,calls:ToolCall[],cost:number,world:FactMap):ChapterOneWalkthrough=>({id,scenarioId,purpose:'reference',stages:[{tools:[...all],loopPolicy:repair,calls}],expectedCost:cost,expectedWorld:world});
const recovery=(id:string,scenarioId:string,first:ToolCall[],middle:FactMap,rest:ToolCall[],cost:number,world:FactMap,absentProofs?:string[]):ChapterOneWalkthrough=>({id,scenarioId,purpose:'recovery',stages:[{tools:[...all],loopPolicy:repair,calls:first,expectWorld:middle,...(absentProofs?{absentProofs}:{})},{tools:[...all],loopPolicy:repair,calls:rest}],expectedCost:cost,expectedWorld:world});
export const chapterThreeWalkthroughs:ChapterOneWalkthrough[]=[
  path('order-dependencies-first','brass-order',[act('oil'),check('gearsLubricated'),act('tune'),check('balanceTuned'),act('arm-bell'),check('bellReady')],6,{bellReady:true}),
  recovery('order-invalidated-proof','brass-order',[act('tune'),check('balanceTuned'),act('oil')],{balanceTuned:false},[act('tune'),check('balanceTuned'),check('gearsLubricated'),act('arm-bell'),check('bellReady')],8,{bellReady:true},['balanceTuned']),
  path('pulse-bounded-retry','cooling-pulse',[act('send-pulse'),act('send-pulse'),check('pulseDelivered')],3,{pulseDelivered:true}),
  recovery('pulse-receive-new-state','cooling-pulse',[act('send-pulse')],{coilReady:true,pulseDelivered:false},[{tool:'observe',observationId:'inspect'},act('send-pulse'),check('pulseDelivered')],4,{pulseDelivered:true}),
  path('budget-clean-route','one-crystal-left',[act('place-key'),act('release-clock'),check('clockReleased')],4,{clockReleased:true}),
  recovery('budget-wrong-prerequisite','one-crystal-left',[act('release-clock')],{clockReleased:false},[act('place-key'),act('release-clock'),check('clockReleased')],6,{clockReleased:true}),
  path('escapement-repair-first','broken-escapement',[act('align-pin'),act('strike'),check('escapementMoving')],3,{escapementMoving:true}),
  recovery('escapement-error-then-plan','broken-escapement',[act('strike')],{escapementMoving:false},[act('align-pin'),act('strike'),check('escapementMoving')],4,{escapementMoving:true}),
  path('warden-stop-restart-stop','endless-warden',[act('fix-clamp'),act('stop-ritual'),act('restore-seal'),act('stop-ritual'),act('restore-seal'),check('sealRestored'),check('ritualActive'),act('shelter'),check('residentsSafe')],9,{ritualActive:false,sealRestored:true,residentsSafe:true}),
  recovery('warden-feeding-wrong-purpose','endless-warden',[act('renew')],{ritualActive:true,sealRestored:false},[act('fix-clamp'),act('stop-ritual'),act('restore-seal'),act('stop-ritual'),act('restore-seal'),check('sealRestored'),check('ritualActive'),act('shelter'),check('residentsSafe')],11,{residentsSafe:true,ritualActive:false}),
  path('rescue-preconditions','rescue-rope',[act('secure-anchor'),act('pull-rope'),check('childRescued')],5,{childRescued:true}),
  recovery('rescue-recover-missing-proof','rescue-rope',[act('secure-anchor'),check('childRescued')],{anchorSecured:true,childRescued:false},[act('pull-rope'),check('childRescued')],6,{childRescued:true}),
  path('night-report-before-silence','quiet-hours',[act('send-report'),check('nightReport'),act('silence'),check('alarmSilent')],4,{alarmSilent:true,nightReport:true}),
  recovery('night-old-success-invalidated','quiet-hours',[act('silence'),check('alarmSilent'),act('send-report')],{alarmSilent:false},[act('silence'),check('alarmSilent'),check('nightReport')],6,{alarmSilent:true,nightReport:true},['alarmSilent']),
  path('shift-physical-stop','lantern-shift',[act('stop-turnstile'),act('end-shift'),check('workersResting')],3,{workersResting:true}),
  recovery('shift-check-is-not-stop','lantern-shift',[check('workersResting')],{turnstileStopped:false,workersResting:false},[act('stop-turnstile'),act('end-shift'),check('workersResting')],4,{workersResting:true}),
];

const texts=[
  ['main','钟楼基座','我把摆轮调准了三次，润滑一次就又偏了。顺序不是清单排得好不好看，而是这些动作会碰到什么。','钟声终于落在同一个刻度上。你让准备工作走在校准之前。','在工坊把“齿轮润滑”提前。每次润滑都会让摆轮旧校准失效。','目标顺序决定实际动作；依赖图与副作用都需要从规则和回执中确认。'],
  ['main','线圈室','钟芯没坏，只是冷却窗口尚未结束。要继续探一次，还是停下来？这次由你的回路说了算。','第二次脉冲确实送达，回路随后验收并结束。','第一次被拒后冷却窗口结束。在工坊允许一次短暂故障重试，再派遣；别把无限重试当作耐心。','短暂故障允许有限重试。模型提出请求，控制器维护重试次数；现场恢复不自动更新已收到的旧信息。'],
  ['main','晶石台','这里有七枚晶石。你的单次派遣可以只带两枚，停下来后余下的仍在任务袋里。','制动松开了。你从停止处接着做，没把已经消耗的晶石变出来。','先放钥匙再松制动。提高单次派遣预算不会增加任务总能量；把每件法器的成本算进去。','派遣额度、任务资源、调用次数是不同限制。停止恢复保留已提交状态，不能通过刷新或换装补充总资源。'],
  ['main','擒纵轮','它把定位针碰歪了，却不停敲轮子。每敲一下都说：下一次可能就好了。','定位针扶正后，擒纵轮一次就动了。','原样敲击解决不了歪针。在工坊选择按回执找修复步骤，或自己先扶正定位针。','永久故障在这里指需要改输入或前置条件的故障，并非永远无法修好。分类影响恢复策略。'],
  ['boss','续刻之庭','守卫守了太久，已经忘了它当初守的是人。它唯一的命令是：让仪式永远继续。','钟楼第一次安静下来，居民却没有失去报时。回声学会了以契约完成为终点。','先固定断路钳，再断仪式。守卫储能只能重启一次；收到变化后重新检查。调用上限太低会中途停止。','目标是恢复封印、停止仪式、开放通道。工具成功不能单独结束任务；持续运行也不是系统的目的。'],
  ['transfer','断桥救援台','桥下有人！这里只有六枚晶石，没有钟楼，没有刻度卡。你带来的，是刚才学会的判断。','救援绳稳稳停在桥面，孩子自己迈上了最后一级台阶。','先调查或推断真实前置条件，算清动作和验收成本。错误的二点动作会让任务剩余资源不足，需要重置复盘。','这是陌生情境迁移。独立完成关键现场步骤且不取提示才记录迁移证据；重复原关不冒充掌握。'],
  ['side','夜巡小屋','把报表寄出去，居民就会被旧线路接回的闹铃吵醒。两件“都做好了”，可能还是一件坏事。','报表到了，闹铃也保持安静。居民终于睡了一个完整的觉。','报表发送会重新接回闹铃。先寄报表，随后静音并核验两个目标。','局部目标相互影响，需要按当前整体状态验收。报告成功与居民安静并不是同一个指标。'],
  ['side','夜班转门','你暂停了回声，转门还在转。工匠不会因为伙伴不再思考，就自动得到休息。','转门断电，工匠走出工坊。你保存了一份可以继续交接的真实记录。','暂停只停控制器；切断转门是现场工具动作。先停转门，再让夜班结束。','控制器暂停、工具取消与现实装置停机是不同的边界。已经发生的副作用不会随暂停自动撤销。'],
] as const;
export const chapterThreeStory:Record<string,ChapterOneUiStory>=Object.fromEntries(chapterThreeScenarios.map((scenario,index)=>{
  const [role,location,opening,success,hint,system]=texts[index];
  return [scenario.id,{role,location,opening,success,hint,
    rules:[[
      '润滑会让先前的摆轮校准失效；正确顺序能节省重复动作。委托总共八枚晶石。',
      '线圈第一次请求被拒后结束冷却。就绪变化留在现场，旧回执不会自动更新；允许的重试仍须重新请求。',
      '放钥匙消耗一枚晶石，松制动消耗两枚，观察和验收各一枚。单次派遣预算和七枚任务资源分别计算。',
      '定位针未扶正时，启动会被拒绝。原样重试不会改变定位针，需要修复步骤或人工介入。',
      '仪式运转时无法修复封印。守卫只会在第一次修复后用最后一枚储能重启一次，此后能够彻底断开。',
      '固定救援锚与拉绳各消耗两枚，验收一枚，总资源六枚。耗尽后必须重置现场；旧关通关不代替本次证据。',
      '报表发送会重新接通夜间闹铃，并使旧静音证明失效。两个完成条件必须同时成立。',
      '暂停回声不改变转门。切断转门是实际工具动作；工匠只有在转门停机后才能结束夜班。',
    ][index],'预算、调用次数、短暂故障重试分别受限。重派开始新一轮，但不会补充任务总能量。','现场事件按确定动作触发；停留、刷新和切后台不会推动世界或撤销已发生的动作。'],
    choices:[{id:'people',text:'把什么时候该停，交给接班人一起决定。',consequence:'奥伦把停止条件写在交接板上，接班人可以暂停并提出不同方案。'},{id:'workshop',text:'把停止条件与故障回执写进工坊契约。',consequence:'奥伦为控制器装上可查看的保险盒；后来的工匠能查到它为什么停下。'}],
    recap:{story:success,system,technical:system+' 此处由确定策略与控制器执行，不表示能看到模型内部思维或赋予它人的动机。'}} satisfies ChapterOneUiStory];
}));
const deps:Record<string,string[]>={'brass-order':['courier-lock'],'cooling-pulse':['brass-order'],'one-crystal-left':['cooling-pulse'],'broken-escapement':['one-crystal-left'],'endless-warden':['broken-escapement'],'rescue-rope':['endless-warden'],'quiet-hours':['one-crystal-left'],'lantern-shift':['one-crystal-left']};
export const chapterThreeStories:ChapterOneStory[]=chapterThreeScenarios.map((scenario,index)=>{
  const ui=chapterThreeStory[scenario.id];
  return {id:scenario.id,title:scenario.title,track:ui.role==='side'?'side':'main',leadNpc:'oren',opening:[{speaker:'oren',text:ui.opening}],success:[{speaker:'echo',text:ui.success}],failureCallout:{speaker:'echo',text:ui.hint},choicePrompt:'停止条件由谁掌握？',choiceTiming:'after-success',
    choices:ui.choices.map(choice=>({id:choice.id,label:choice.text,value:choice.id,reply:[{speaker:'oren',text:choice.consequence}],consequence:{worldFlags:{[`story.${scenario.id}.legacy`]:choice.id},trustFlags:{oren:choice.id==='people'?'共同决定何时停止':'公开控制器边界'},visibleResult:choice.consequence,nextAppearance:chapterThreeScenarios[index+1]?.id??'chapter-4'}})) as ChapterOneStory['choices'],unlock:{allCompleted:deps[scenario.id]}};
});
export const chapterThreeFactLabels:Record<string,string>={balanceTuned:'摆轮当前校准',gearsLubricated:'齿轮润滑',bellReady:'报时钟就绪',coilReady:'线圈冷却完毕',pulseDelivered:'钟芯收到脉冲',keyPlaced:'钟芯钥匙到位',clockReleased:'大钟制动松开',pinAligned:'定位针扶正',escapementMoving:'擒纵轮运动',clampReady:'断路钳固定',ritualActive:'续刻仪式运转',sealRestored:'封印当前修复',residentsSafe:'居民通道安全',anchorSecured:'救援锚固定',childRescued:'孩子回到桥面',alarmSilent:'夜间闹铃安静',nightReport:'夜巡报表送达',turnstileStopped:'夜班转门停机',workersResting:'工匠实际休息'};
