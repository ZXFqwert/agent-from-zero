/**
 * Original narrative metadata. This file does not execute game rules, change a
 * ScenarioDefinition, or award learning evidence. Story flags live outside the
 * engine's world facts and are applied only after the relevant mission succeeds.
 */
export type ChapterOneTaskId =
  | 'harbor-light' | 'warehouse-gate' | 'tide-ledger' | 'last-ferry'
  | 'hollow-regent' | 'after-tide' | 'fog-bell' | 'medicine-detour';
export type NpcId = 'mora' | 'tiya' | 'ruin' | 'ava' | 'cen' | 'oren';
export type StorySpeaker = NpcId | 'echo' | 'regent' | 'narrator';
export interface StoryLine { speaker: StorySpeaker; text: string; }
export interface StoryChoice {
  id: 'people' | 'workshop';
  label: string;
  value: string;
  reply: StoryLine[];
  consequence: {
    /** Narrative world flags, never engine FactMap values. */
    worldFlags: Record<string, string | boolean>;
    /** Describes the form of trust, not a universal good/bad score. */
    trustFlags: Partial<Record<NpcId, string>>;
    visibleResult: string;
    nextAppearance: string;
  };
}
export interface ChapterOneStory {
  id: string;
  title: string;
  track: 'main' | 'side';
  leadNpc: NpcId;
  opening: StoryLine[];
  success: StoryLine[];
  failureCallout: StoryLine;
  choicePrompt: string;
  choiceTiming: 'after-success' | 'before-dispatch';
  choices: [StoryChoice, StoryChoice];
  unlock: { allCompleted: string[] };
  legacyScenario?: { id: 'harbor-light' | 'warehouse-gate' | 'hollow-regent'; version: 1 };
}

export const chapterOneNpcs = [
  {
    id: 'mora' as const, name: '莫拉', role: '守灯人', firstChapter: 1,
    voice: '话少，常先指向一个具体的人或东西，再开口。',
    wants: '让每一艘归船都有能信得过的灯。',
    fear: '自己一旦离开灯室，港口就会再次黑下去。',
    blindSpot: '习惯亲自补救，容易把交接当作耽误。',
    arc: '从独自守灯，到愿意让别人带着完整记录接班。',
  },
  {
    id: 'tiya' as const, name: '缇娅', role: '药师', firstChapter: 1,
    voice: '直白、利落，记得人的名字，也记得箱子放在哪里。',
    wants: '让需要物资的人确实拿到，而不是账上写着已经送到。',
    fear: '整齐的清单会把不在清单上的人藏起来。',
    blindSpot: '事情紧急时容易相信熟人，不再核对交接。',
    arc: '把对人的照顾写进能被接手、核查和纠正的日常流程。',
  },
  {
    id: 'ruin' as const, name: '鲁因', role: '渡船人', firstChapter: 1,
    voice: '爱拿船和绳子开玩笑，到了启航时却很认真。',
    wants: '恢复渡船，让港口不再只靠少数人勉强运转。',
    fear: '一次好看的捷报，会让大家忘记水势随时会变。',
    blindSpot: '经验丰富，却常把自己知道的细节省略不说。',
    arc: '从“跟着我就行”，到把条件讲清楚并接受别人复查。',
  },
  {
    id: 'ava' as const, name: '阿芙', role: '档案员', firstChapter: 4,
    voice: '温和而准确，会追问一句“这是哪一天留下的”。',
    wants: '让被遗忘的经历仍能帮到后来的人。',
    fear: '纠正旧卷宗会抹掉曾经努力过的人。',
    blindSpot: '起初更擅长保存，不擅长决定何时淘汰。',
    arc: '学会保留来历，也公开记录何时不再适用。',
  },
  {
    id: 'cen' as const, name: '岑', role: '巡城人', firstChapter: 6,
    voice: '不轻易许诺，明确说清自己能做与不能做的事。',
    wants: '让没有权势的人也能依靠相同的边界。',
    fear: '一次好心的通融，会变成别人无法拒绝的先例。',
    blindSpot: '起初把熟悉的印章看得比可核对的来历更重。',
    arc: '从认印章，走向验证请求者、目标和授权范围。',
  },
  {
    id: 'oren' as const, name: '奥伦', role: '钟匠与公会联络人', firstChapter: 2,
    voice: '会把抽象争论变成一件能拆开看的小东西。',
    wants: '让钟楼停在该停的时刻，而不是永远响下去。',
    fear: '承认该停手，会被当成承认技艺不够好。',
    blindSpot: '喜欢修复杂装置，偶尔忘了先问它是否还需要运转。',
    arc: '从追求不停运转，走向愿意为明确目的选择继续或停止。',
  },
] as const;

export const chapterOneMainOrder: ChapterOneTaskId[] = [
  'harbor-light', 'warehouse-gate', 'tide-ledger', 'last-ferry', 'hollow-regent', 'after-tide',
];
export const chapterOneSideTasks: ChapterOneTaskId[] = ['fog-bell', 'medicine-detour'];

export const chapterOneStories: ChapterOneStory[] = [
  {
    id: 'harbor-light', title: '熄灭的灯塔', track: 'main', leadNpc: 'mora',
    legacyScenario: {id: 'harbor-light', version: 1}, unlock: {allCompleted: []},
    opening: [
      {speaker: 'mora', text: '最后一艘船还在外面。你听，那不是风，是它的回港铃。'},
      {speaker: 'echo', text: '灯塔已经点亮。请放心。'},
      {speaker: 'mora', text: '我也想放心。可你看海面——一点光都没有。'},
    ],
    success: [
      {speaker: 'narrator', text: '金光穿过雾，远处的铃声终于有了回应。'},
      {speaker: 'mora', text: '这次我看见了。把灯留着，我们去接人。'},
      {speaker: 'echo', text: '我会把这一次，和刚才那一句，分开记。'},
    ],
    failureCallout: {speaker: 'mora', text: '别急着再喊一遍。先看看，哪一处还没有回应你。'},
    choicePrompt: '归船正在靠岸，你先去做什么？', choiceTiming: 'after-success',
    choices: [
      {id: 'people', label: '先把归船上的人接回家。', value: '先回应眼前的人', reply: [{speaker: 'mora', text: '那盏手灯给你。我留在这里，等最后一个人上岸。'}], consequence: {worldFlags: {'story.harbor.firstCare': 'landing'}, trustFlags: {mora: '愿意把归船的人托付给你'}, visibleResult: '码头出现迎船手灯；莫拉在下一次见面时提起你帮过的归船。', nextAppearance: 'fog-bell'}},
      {id: 'workshop', label: '把灯塔的行动回路画下来。', value: '让下一位接手的人少走弯路', reply: [{speaker: 'mora', text: '画在这块木板背面吧。值夜的人，一抬头就能看见。'}], consequence: {worldFlags: {'story.harbor.firstCare': 'handoff'}, trustFlags: {mora: '愿意与你一起安排守灯交接'}, visibleResult: '灯室挂起回路木牌；后续巡港时值夜人会主动接过一段工作。', nextAppearance: 'after-tide'}},
    ],
  },
  {
    id: 'warehouse-gate', title: '门后的药箱', track: 'main', leadNpc: 'tiya',
    legacyScenario: {id: 'warehouse-gate', version: 1}, unlock: {allCompleted: ['harbor-light']},
    opening: [
      {speaker: 'tiya', text: '我看见灯了。药船也到了，可药箱还在这扇门后面。'},
      {speaker: 'echo', text: '我记得灯塔的办法。先点亮——'},
      {speaker: 'tiya', text: '这里没有灯芯。你愿意先看看这扇门吗？'},
    ],
    success: [
      {speaker: 'narrator', text: '门闩落下，仓库门慢慢升起。缇娅先伸手摸了摸箱角。'},
      {speaker: 'tiya', text: '干的。现在能搬了。谢谢你没有只给我一张“已经开门”的纸。'},
    ],
    failureCallout: {speaker: 'tiya', text: '门没有动。换个角度看看，别把每一次用力都当成进展。'},
    choicePrompt: '这次经验该怎么留下？', choiceTiming: 'after-success',
    choices: [
      {id: 'people', label: '记下条件与证据，供下次核对。', value: '把经验交给别人使用', reply: [{speaker: 'tiya', text: '我把它夹进交接簿。下次轮值的人会知道，这扇门是什么时候真开的。'}], consequence: {worldFlags: {'story.harbor.warehouseRecord': 'shared-log'}, trustFlags: {tiya: '愿意与你共享物资交接记录'}, visibleResult: '仓库桌面出现公开交接簿；送药支线中缇娅先展示清点结果。', nextAppearance: 'medicine-detour'}},
      {id: 'workshop', label: '给未来的自己留一份故障便笺。', value: '保留尚未解释清楚的细节', reply: [{speaker: 'tiya', text: '留一页空白。下次遇见不一样的门，再把它补上。'}], consequence: {worldFlags: {'story.harbor.warehouseRecord': 'field-notes'}, trustFlags: {tiya: '愿意告诉你记录之外的现场细节'}, visibleResult: '旅途便笺保留未解决的问题；送药支线中缇娅先带你看推车的磨损。', nextAppearance: 'medicine-detour'}},
    ],
  },
  {
    id: 'tide-ledger', title: '两本潮汐簿', track: 'main', leadNpc: 'ruin',
    unlock: {allCompleted: ['warehouse-gate']},
    opening: [
      {speaker: 'ruin', text: '一份说走北汊，一份说走南汊。好消息是，纸都很干。'},
      {speaker: 'echo', text: '哪一份的字写得更清楚？'},
      {speaker: 'ruin', text: '船底不认字。去水边看看，再替我挂航牌。'},
    ],
    success: [
      {speaker: 'narrator', text: '新的航牌转向了仍有水路的那一侧。鲁因用船篙轻点了一下浮标。'},
      {speaker: 'ruin', text: '现在我知道你看的是什么，也知道该怎么跟着走了。'},
    ],
    failureCallout: {speaker: 'ruin', text: '木牌指得很坚定，浅滩也很坚定。把它转回来，我们还来得及量水。'},
    choicePrompt: '那本旧潮汐簿怎么处置？', choiceTiming: 'after-success',
    choices: [
      {id: 'people', label: '留下旧簿，标清它失效的潮次。', value: '保留来历，让错误可追查', reply: [{speaker: 'ruin', text: '也好。让后来的人知道，它不是从来都错，是水已经变了。'}], consequence: {worldFlags: {'story.harbor.tideRecord': 'annotated-history'}, trustFlags: {ruin: '愿意把旧航线和失误一起讲给你'}, visibleResult: '渡口同时悬挂新旧潮记，旧簿有醒目标注；复查任务会呼应“水已经变了”。', nextAppearance: 'after-tide'}},
      {id: 'workshop', label: '把现行航牌放到入口，旧簿收进柜里。', value: '降低当前使用者的误读机会', reply: [{speaker: 'ruin', text: '入口只留一张。想查旧事的人，我带他去柜子前。'}], consequence: {worldFlags: {'story.harbor.tideRecord': 'current-first'}, trustFlags: {ruin: '愿意让你安排渡口的信息入口'}, visibleResult: '码头入口只显示现行航牌，资料柜仍可查看旧记录；离港时旅客少了一次询问。', nextAppearance: 'last-ferry'}},
    ],
  },
  {
    id: 'last-ferry', title: '最后一班渡船', track: 'main', leadNpc: 'ruin',
    unlock: {allCompleted: ['tide-ledger']},
    opening: [
      {speaker: 'ruin', text: '船能走了。别高兴太早——能走和该走，是两回事。'},
      {speaker: 'tiya', text: '药箱还在岸上，绳扣也没收紧。请把这两件事办完，再给他离岸的信号。'},
      {speaker: 'ruin', text: '我这人听信号很认真。你若挥手，我可真的会开。'},
    ],
    success: [
      {speaker: 'narrator', text: '药箱稳稳留在舱里。对岸亮起收货灯，渡船的回铃穿过海雾。'},
      {speaker: 'tiya', text: '到了。不是离开我们眼前，是到了该去的地方。'},
    ],
    failureCallout: {speaker: 'ruin', text: '船到了，不等于箱子交好了。先找出少了哪一步，再决定要不要叫我回来。'},
    choicePrompt: '下一班船的安排，你想先照顾哪件事？', choiceTiming: 'after-success',
    choices: [
      {id: 'people', label: '给临时求渡的人留一个位置。', value: '为无法预先登记的需要留余地', reply: [{speaker: 'ruin', text: '空位不写人名。有人来敲船沿，就先听听他要去哪儿。'}], consequence: {worldFlags: {'story.harbor.ferryPolicy': 'open-berth'}, trustFlags: {ruin: '愿意与你商量临时发生的需要'}, visibleResult: '船舱保留一个未标姓名的位置；后续港口回访出现一次临时求渡对话。', nextAppearance: 'harbor-hub'}},
      {id: 'workshop', label: '把固定班次与交接人写清楚。', value: '让等待的人能够提前安排', reply: [{speaker: 'ruin', text: '行。我也把“风大时另议”写上。别让一张表替我许下做不到的事。'}], consequence: {worldFlags: {'story.harbor.ferryPolicy': 'posted-turns'}, trustFlags: {ruin: '愿意把渡船交接安排交给你核对'}, visibleResult: '渡口出现带变更说明的班次木牌；后续回访中旅客按牌上的地点等待。', nextAppearance: 'harbor-hub'}},
    ],
  },
  {
    id: 'hollow-regent', title: '空言执政官', track: 'main', leadNpc: 'mora',
    legacyScenario: {id: 'hollow-regent', version: 1}, unlock: {allCompleted: ['warehouse-gate']},
    opening: [
      {speaker: 'regent', text: '本港运行一切正常。所有来访者，请以本报告为准。'},
      {speaker: 'mora', text: '两座引航台还黑着。它只是把这句话念得比以前更响。'},
      {speaker: 'echo', text: '我也曾这样说。现在，先让我看看灯。'},
    ],
    success: [
      {speaker: 'narrator', text: '两束光穿透护盾。空中的报告一张张失去字迹，落成潮湿的白纸。'},
      {speaker: 'echo', text: '它停下了。可这一次，我想先听听你们是否也看见了。'},
      {speaker: 'mora', text: '看见了。走吧——潮声又近了。'},
    ],
    failureCallout: {speaker: 'mora', text: '它少念一句话，不代表港口多了一盏灯。去看还黑着的那一侧。'},
    choicePrompt: '你想怎样留下这次修复的经过？', choiceTiming: 'after-success',
    choices: [
      {id: 'people', label: '把修复记录交给居民。', value: '让受影响的人能检查经过', reply: [{speaker: 'mora', text: '贴在告示栏上。灯有没有亮，不该只由守灯人来回答。'}], consequence: {worldFlags: {'story.harbor.regentRecord': 'public-account'}, trustFlags: {mora: '愿意让居民与你一起复查港口'}, visibleResult: '告示栏出现修复回执；复查开场由居民带来栈桥的变化。', nextAppearance: 'after-tide'}},
      {id: 'workshop', label: '给回声整理一份旅途手册。', value: '让伙伴保留可重用的经验', reply: [{speaker: 'echo', text: '请给每一页留出改写的地方。我不想再把旧话念成今天的答案。'}], consequence: {worldFlags: {'story.harbor.regentRecord': 'companion-notes'}, trustFlags: {mora: '愿意让你带着回声继续巡港'}, visibleResult: '回声的手册出现可补写页；复查开场由回声指出旧回执与眼前不一致。', nextAppearance: 'after-tide'}},
    ],
  },
  {
    id: 'after-tide', title: '天亮前的复查', track: 'main', leadNpc: 'mora',
    unlock: {allCompleted: ['hollow-regent', 'last-ferry']},
    opening: [
      {speaker: 'mora', text: '巡查单上都打了勾。我本来想坐一会儿，可栈桥又开始晃了。'},
      {speaker: 'ruin', text: '最后一车物资还得过去。看这道水痕——车到对岸时，回潮也该顶到桥脚了。'},
      {speaker: 'echo', text: '那张回执是真的。只是……现在呢？'},
      {speaker: 'mora', text: '天亮前，再陪我走一遍。'},
    ],
    success: [
      {speaker: 'narrator', text: '加固后的栈桥没有再摇晃。物资送到了，对岸的回灯和桥边的标尺都留在你看得见的地方。'},
      {speaker: 'mora', text: '这回我可以坐下了。不是因为以后不会再坏，是出了变化，有人知道该从哪里看起。'},
      {speaker: 'echo', text: '港口的这一夜，已经结束。我会记得，结束也需要一个现在。'},
    ],
    failureCallout: {speaker: 'ruin', text: '上一次量的时候它确实稳。别急着说谁撒了谎，先看看这一阵潮带来了什么。'},
    choicePrompt: '离港前，你想把这份照看怎样留下？', choiceTiming: 'after-success',
    choices: [
      {id: 'people', label: '陪莫拉守完这一班，再把新情况交给接班人。', value: '用陪伴完成一次完整交接', reply: [{speaker: 'mora', text: '那就坐这边。天快亮时，我把港里人的名字讲给你听。'}], consequence: {worldFlags: {'story.harbor.departure': 'shared-watch'}, trustFlags: {mora: '愿意在疲惫时向你开口求助'}, visibleResult: '章节结尾停在两人守夜的灯室；下一章来信先询问你旅途是否平安。', nextAppearance: 'chapter-2'}},
      {id: 'workshop', label: '和大家排好轮值，让莫拉今晚就能回去休息。', value: '把照看变成多人能接手的日常', reply: [{speaker: 'mora', text: '我得习惯一下，灯亮着的时候，也可以不是我站在旁边。'}], consequence: {worldFlags: {'story.harbor.departure': 'shared-rounds'}, trustFlags: {mora: '愿意把守灯职责交给共同的约定'}, visibleResult: '章节结尾出现换班的居民与回家的莫拉；下一章来信带来新的轮值回执。', nextAppearance: 'chapter-2'}},
    ],
  },
  {
    id: 'fog-bell', title: '雾中的回铃', track: 'side', leadNpc: 'mora',
    unlock: {allCompleted: ['tide-ledger']},
    opening: [
      {speaker: 'mora', text: '灯照不到雾背后。那边的人一直等着回铃，旧钟却卡住了。'},
      {speaker: 'ruin', text: '修这口大家伙，或者沿岸挂三只小铃。一个费力气，一个费脚程，我都听得见。'},
      {speaker: 'mora', text: '你只有这么大一只匣子。先决定怎么走，再往里塞。'},
    ],
    success: [
      {speaker: 'narrator', text: '钟声越过海雾，远处响起两声短铃。有人听见，也有人回答。'},
      {speaker: 'mora', text: '能来回传消息了。以后这边不必一直等我举灯。'},
    ],
    failureCallout: {speaker: 'ruin', text: '先听清哪里有回应。缺法器就回去换，别把每一声铃响都当成整条路通了。'},
    choicePrompt: '回铃接通后，怎样让它被好好使用？', choiceTiming: 'after-success',
    choices: [
      {id: 'people', label: '把呼叫与回铃的约定教给沿岸居民。', value: '让使用设施的人能够互相回应', reply: [{speaker: 'ruin', text: '我去找对岸的人。只教这边怎么喊，不教那边怎么答，还是白忙。'}], consequence: {worldFlags: {'story.harbor.bellCare': 'shared-signal'}, trustFlags: {mora: '愿意让你把报讯约定交给居民'}, visibleResult: '港口记录新增居民共用的呼叫约定；莫拉愿意让沿岸居民与你一起报讯。', nextAppearance: 'harbor-hub'}},
      {id: 'workshop', label: '给这条报讯线写好维护与换班记录。', value: '让下一位维护者知道怎样接手', reply: [{speaker: 'mora', text: '记上最后一次听见回应的时刻。轮到谁，也让他亲耳听一次。'}], consequence: {worldFlags: {'story.harbor.bellCare': 'maintenance-log'}, trustFlags: {mora: '愿意与你约定报讯设施的维护交接'}, visibleResult: '港口记录新增报讯维护契约；莫拉把下一班维护的核对交给你。', nextAppearance: 'harbor-hub'}},
    ],
  },
  {
    id: 'medicine-detour', title: '沿街的药灯', track: 'side', leadNpc: 'tiya',
    unlock: {allCompleted: ['tide-ledger']},
    opening: [
      {speaker: 'tiya', text: '两箱补给，一间诊室，还有一辆轮子松了的推车。今晚我没法同时照看每个地方。'},
      {speaker: 'ruin', text: '把东西收拢，找起来容易；留一车在码头，那边的人少走一段。'},
      {speaker: 'tiya', text: '两种都能帮上忙。选定了，就把东西真送到，别只替我在清单上换位置。'},
    ],
    success: [
      {speaker: 'narrator', text: '补给摆在约定的地方。缇娅摸过封条，又点亮了门边的小灯。'},
      {speaker: 'tiya', text: '我知道下一次该去哪里找，也知道谁接过了它。今晚能少一点奔跑了。'},
    ],
    failureCallout: {speaker: 'tiya', text: '清单上挪过去了，箱子却还在这边。先找出哪一次交接没有真的发生。'},
    choicePrompt: '物资交好后，怎样让需要的人找到它？', choiceTiming: 'after-success',
    choices: [
      {id: 'people', label: '沿街告诉晚归的人，补给现在在哪里。', value: '让清单之外的人也知道怎么找到服务', reply: [{speaker: 'tiya', text: '我去西巷，你去码头。记得说清现在的位置，别只说“已经安排好了”。'}], consequence: {worldFlags: {'story.harbor.supplyCare': 'street-notice'}, trustFlags: {tiya: '愿意与你照顾清单之外的临时需要'}, visibleResult: '港口记录新增沿街告知安排；缇娅愿意与你分头照看晚归的人。', nextAppearance: 'harbor-hub'}},
      {id: 'workshop', label: '和接手人逐箱核对，留下取用与补货记录。', value: '让服务能被下一班稳妥接手', reply: [{speaker: 'tiya', text: '我签这一班。下一班来时，先让他看箱子，再看我的字。'}], consequence: {worldFlags: {'story.harbor.supplyCare': 'handoff-ledger'}, trustFlags: {tiya: '愿意与你共享接班与补货记录'}, visibleResult: '港口记录新增补给交接约定；缇娅把补货记录向你开放。', nextAppearance: 'harbor-hub'}},
    ],
  },
];

export const chapterOneStoryById = Object.fromEntries(
  chapterOneStories.map(story => [story.id, story]),
) as Record<ChapterOneTaskId, ChapterOneStory>;

/** Existing completions remain valid even if a new prerequisite did not exist. */
export const chapterOneCompatibility = {
  preservedScenarioVersions: {'harbor-light': 1, 'warehouse-gate': 1, 'hollow-regent': 1},
  preservedChoiceIds: ['people', 'workshop'],
  legacyCompletionIsNotFullChapterCompletion: true,
  chapterCompletionRequires: chapterOneMainOrder,
  sideTasksRequiredForChapterCompletion: false,
  storyFlagsNeverAwardLearningEvidence: true,
} as const;

export interface ChapterOneUiStory {
  role: 'main' | 'transfer' | 'boss' | 'side';
  opening: string;
  success: string;
  hint: string;
  rules: string[];
  location: string;
  choices: Array<{id: 'people' | 'workshop'; text: string; consequence: string}>;
  recap: {story: string; system: string; technical: string};
  next?: string;
  /** Append only when this value exists in the actual completed world's facts. */
  outcomes?: Array<{fact: string; equals: string | number | boolean; text: string}>;
}

const chapterOneUiDetails: Record<ChapterOneTaskId, Omit<ChapterOneUiStory, 'opening' | 'success' | 'choices'>> = {
  'harbor-light': {
    role: 'main', location: '归航灯塔', next: 'warehouse-gate',
    hint: '先让回声看见灯和供能处，再让法器行动。收到回执之后，还要检查灯是否真的亮着。',
    rules: ['这座灯塔需要供能才能点亮。', '法器的回执必须送回伙伴；说“已经完成”不能点亮海面。'],
    recap: {story: '归船看到了灯，莫拉终于能去接人。', system: '伙伴负责提出行动，法器改变世界，回执帮助它选择下一步。', technical: '语言输出、工具调用、工具结果和最终验收是不同环节。这个关卡演示循环结构，不模拟模型内部思考。'},
  },
  'warehouse-gate': {
    role: 'transfer', location: '岸边药仓', next: 'tide-ledger',
    hint: '把灯塔的做法拆成“目标、前置条件、行动、验收”，再看看这里分别对应什么。门闩与门不是同一件东西。',
    rules: ['仓库门和门闩各有自己的状态。', '这是陌生委托：自己完成后再看复盘；主动求助会如实记录。'],
    recap: {story: '缇娅摸到了真正搬得动的药箱。', system: '同一个循环换了场景，仍要发现依赖，不能照搬上一关的对象名称。', technical: '迁移的是状态、前置条件与验证方法。一次迁移成功是本场景的学习证据，不等于掌握所有 Agent。'},
  },
  'tide-ledger': {
    role: 'main', location: '双汊量潮台', next: 'last-ferry',
    hint: '旧簿记录的是上一个潮次，鲁因只知道发生过变化。现场量潮花两点，能让你知道眼前哪条路可走。挂对航牌之后，仍要试航并验收。',
    rules: ['整趟共 10 点。旧簿与问话各 1 点，现场量潮 2 点；挂牌、试航与验收各 1 点。', '旧簿内容与当前水路分开记录，不会互相覆盖。', '错误航道的试航会折返；可改牌再试，已经花掉的预算不会退回。'],
    recap: {story: '鲁因跟随的是经过试航的航牌。旧记录留下来，也要说清是哪一阵潮。', system: '信息有来源和适用时间；便宜的旧记录、变化线索与现场观测各解决不同问题。', technical: '上下文里的事实陈述不必然等于当前世界状态。来源与时效需要保留，工具执行后仍须按目标验收。'},
  },
  'last-ferry': {
    role: 'main', location: '末班渡口', next: 'hollow-regent',
    hint: '先把“安全系固”和“对岸交付”排好先后。装箱、系固都要船在本岸；如果船先走了，召回它会再花两点。',
    rules: ['整趟共 16 点。启航与召回各 2 点，其他工具动作各 1 点。', '船收到启航信号就离岸，空船也会走；装箱和系固只能在本岸做。', '验收要分别确认药箱已系固、对岸已接货；船的位置不能代替货物交付。'],
    recap: {story: '药箱从码头进船舱，再进入对岸接货人的手里。', system: '一个最终目标有多个前置条件。可以执行的动作，不一定适合现在执行。', technical: '计划需要表达依赖顺序；工具成功只说明该工具的操作发生，不能自动上升为整个任务成功。失败恢复也会消耗预算。'},
  },
  'hollow-regent': {
    role: 'boss', location: '双台引航厅', next: 'after-tide',
    hint: '它的报告不能替代东西两台的状态。分别找供能、点亮、拿到各自的验收回执。',
    rules: ['东西两台必须分别点亮、分别验收。', '报告里的“一切正常”，不能替任何一盏真实的灯作证。'],
    recap: {story: '执政官的报告落成白纸，真正的光照进了海雾。', system: '完成声明必须对应多个独立的外部结果；一个结果不能替另一个作证。', technical: '把验收条件写成可检查的世界状态，逐项核验。报告的语气、长度和自信程度都不能替代执行证据。'},
  },
  'after-tide': {
    role: 'main', location: '回潮栈桥',
    hint: '旧桥板能让车通过。运车会触发一次回潮，旧桥面验收随之失效；此后按新潮位加撑架，再核对桥与货物。',
    rules: ['整趟共 12 点，每个工具动作 1 点。', '送车成功时只触发一次回潮：物资已到，桥脚却会重新松动。', '暂停、读对白和切后台不会推动潮水。桥与货物必须在最后的同一现场都满足条件。'],
    recap: {story: '莫拉可以坐下，不因为港口永远不会再坏，而因为变化能被别人看见、接手。', system: '证据描述某一刻。世界改变后，相关旧验收必须失效，不能永久盖章。', technical: '环境变化只修改真实状态，不自动更新伙伴的观察。重新观测、修复与验收，才能让上下文和完成条件重新对齐。'},
  },
  'fog-bell': {
    role: 'side', location: '雾后岸线',
    hint: '先选主钟或三铃路线。工具匣只能装两件：可带观察与操作出门，路线接通后回工坊换入验收。换装不补预算。',
    rules: ['工具容量 2 格，整趟共 7 点；可以暂停回工坊换装，但不会补满行动库存。', '主钟：查看 1、修钟 3、敲钟 1；卡梁未拆就强敲要花 3。岸铃：巡看 2、三处架铃各 1、沿线呼叫 1。两路都另需验收 1。', '两路都可通关，留下不同设施。昂贵的误操作可能需要重开本趟；实际线路由操作决定，结算对白不会替你换路线。'],
    outcomes: [{fact: 'bellRoute', equals: 'main', text: '你修好了港口主钟。集中报讯的钟声由这里越过雾。'}, {fact: 'bellRoute', equals: 'chain', text: '你沿岸架起三处小铃。雾后的回答沿着这条岸线传了回来。'}],
    recap: {story: '雾那边的人终于能回话，港口不必只等一盏手灯。', system: '有限工具容量需要分阶段装配；不同路线有不同操作、成本与世界结果。', technical: '工具集合与预算是运行系统的约束。通关不会自动成为独立迁移证据；本关还要求实际更换过工具组合，且未使用提示。'},
  },
  'medicine-detour': {
    role: 'side', location: '诊室与码头小巷',
    hint: '第一箱先交诊室。余箱可以再送诊室，或修车、装箱、推到码头后交接。若车停在半路，先看它的位置，再就地固轮继续走。',
    rules: ['整趟共 12 点。集中运送余箱与半路固轮各 2 点，其余动作各 1 点。', '两箱补给始终在仓库、诊室、码头或推车之一；重复交付不会复制箱子。', '未固轮也能推车出发，但会停在半路。诊室首批与余箱最终交接都要验收。'],
    outcomes: [{fact: 'supplyRoute', equals: 'clinic', text: '两箱都在诊室，补给集中清点。居民到同一个地点取用。'}, {fact: 'supplyRoute', equals: 'mobile', text: '诊室和码头各有一箱，牢固的推车让服务靠近晚归的人。'}],
    recap: {story: '缇娅知道物资在哪里，也知道谁真正接过了它。', system: '价值取舍会改变服务地点和行动路线。交接事实要由搬运与接收形成，清单不能凭空造箱子。', technical: '资源守恒与前置条件防止重复执行制造虚假交付。部分失败保留已经发生的世界变化，恢复要从当前状态继续。'},
  },
};

const speakerNames: Record<StorySpeaker, string> = {mora: '莫拉', tiya: '缇娅', ruin: '鲁因', ava: '阿芙', cen: '岑', oren: '奥伦', echo: '回声', regent: '执政官', narrator: ''};
const joinDialogue = (lines: StoryLine[]) => lines.map(line => speakerNames[line.speaker] ? `${speakerNames[line.speaker]}：${line.text}` : line.text).join('\n');

/** Stable UI contract. Every chapter task has exactly two post-success values. */
export const chapterOneStory: Record<string, ChapterOneUiStory> = Object.fromEntries(
  chapterOneStories.map(story => [story.id, {
    ...chapterOneUiDetails[story.id as ChapterOneTaskId],
    opening: joinDialogue(story.opening),
    success: joinDialogue(story.success),
    choices: story.choices.map(choice => ({
      id: choice.id,
      text: choice.label,
      consequence: `${joinDialogue(choice.reply)} ${choice.consequence.visibleResult}`,
    })),
  }]),
);
