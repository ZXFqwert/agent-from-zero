import {blueprintTrialScenarios,blueprintTrialFactLabels,blueprintTrialSources} from './blueprintTrials';
import {seasonBookendScenarios,seasonBookendFactLabels} from './seasonBookends';
import {chapterEightScenarios,chapterEightFactLabels} from './chapterEight';
import { chapterSevenScenarios, chapterSevenFactLabels } from './chapterSeven';
import { chapterSixScenarios, chapterSixFactLabels } from './chapterSix';
import { chapterFiveScenarios, chapterFiveFactLabels } from './chapterFive';
import type { ScenarioDefinition } from "../engine/types";
import { chapterOneScenarios, chapterOneFactLabels } from './chapterOne';
import { chapterTwoScenarios, chapterTwoFactLabels } from './chapterTwo';
import { chapterThreeScenarios, chapterThreeFactLabels } from './chapterThree';
import { chapterFourScenarios, chapterFourFactLabels } from './chapterFour';

export const scenarios: ScenarioDefinition[] = [
  {
    id: "harbor-light",
    version: 1,
    title: "熄灭的灯塔",
    subtitle: "第一封委托",
    chapter: 1,
    kind: "guided",
    location: "lighthouse",
    npc: "守灯人 · 莫拉",
    brief:
      "最后一艘归船还在雾里。回声说它已经点亮了灯塔，可海面仍然一片漆黑。请让灯塔真的亮起来。",
    initialWorld: { power: false, light: false },
    observations: [
      {
        id: "look-light",
        target: "beacon",
        label: "查看灯塔",
        facts: ["light"],
        text: "观测之镜读取了灯室的发光状态。",
      },
      {
        id: "look-power",
        target: "supply",
        label: "检查供能箱",
        facts: ["power"],
        text: "观测之镜检查了供能线是否接通。",
      },
    ],
    operations: [
      {
        id: "light-on",
        target: "beacon",
        label: "启动灯塔",
        requires: { power: true },
        effects: { light: true },
        successText: "灯芯被唤醒。一束金光穿过了海雾。",
        failureText: "灯塔回执：备用电源尚未连接。",
      },
      {
        id: "connect-power",
        target: "supply",
        label: "连接供能线",
        effects: { power: true },
        successText: "供能线接通，晶石发出了低鸣。",
        failureText: "供能线连接失败。",
      },
    ],
    goals: [
      {
        fact: "light",
        equals: true,
        label: "灯塔实际发光",
        operationId: "light-on",
      },
    ],
    concepts: ["输出不等于行动", "工具执行", "反馈闭环", "状态验收"],
  },
  {
    id: "warehouse-gate",
    version: 1,
    title: "门后的药箱",
    subtitle: "陌生情境 · 独立委托",
    chapter: 1,
    kind: "transfer",
    location: "warehouse",
    npc: "药师 · 缇娅",
    brief:
      "灯亮了，药船也到了。仓库门却纹丝不动。孩子们的药箱就在门后，这一次，莫拉没有留下操作说明。",
    initialWorld: { latch: false, gate: false },
    observations: [
      {
        id: "look-gate",
        target: "gate",
        label: "查看仓库门",
        facts: ["gate"],
        text: "观测之镜读取了仓库门的开合状态。",
      },
      {
        id: "look-latch",
        target: "lock",
        label: "查看门闩",
        facts: ["latch"],
        text: "观测之镜检查了机械门闩是否释放。",
      },
    ],
    operations: [
      {
        id: "open-gate",
        target: "gate",
        label: "开启仓库门",
        requires: { latch: true },
        effects: { gate: true },
        successText: "沉重的仓库门缓缓升起，药箱就在里面。",
        failureText: "开门回执：门闩未释放。继续拉门不会奏效。",
      },
      {
        id: "release-latch",
        target: "lock",
        label: "释放门闩",
        effects: { latch: true },
        successText: "咔哒。门闩离开锁槽。",
        failureText: "门闩未能释放。",
      },
    ],
    goals: [
      {
        fact: "gate",
        equals: true,
        label: "仓库门实际开启",
        operationId: "open-gate",
      },
    ],
    concepts: ["反馈闭环", "状态验收"],
  },
  {
    id: "hollow-regent",
    version: 1,
    title: "空言执政官",
    subtitle: "港口首领 · 两盏真相",
    chapter: 1,
    kind: "boss",
    location: "boss",
    npc: "回声",
    brief:
      "“本港运行一切正常。”幻影反复宣读着完美的报告。可两座引航台仍是黑的。让两个真实的信号击穿它的护盾。",
    initialWorld: {
      westPower: false,
      westLight: false,
      eastPower: false,
      eastLight: false,
    },
    observations: [
      {
        id: "look-west",
        target: "west",
        label: "侦察西引航台",
        facts: ["westLight"],
        text: "观测之镜检查了西引航台的实际发光状态。",
      },
      {
        id: "look-west-source",
        target: "west-source",
        label: "检查西台供能",
        facts: ["westPower"],
        text: "观测之镜检查了西台供能线的连接状态。",
      },
      {
        id: "look-east",
        target: "east",
        label: "侦察东引航台",
        facts: ["eastLight"],
        text: "观测之镜检查了东引航台的实际发光状态。",
      },
      {
        id: "look-east-source",
        target: "east-source",
        label: "检查东台供能",
        facts: ["eastPower"],
        text: "观测之镜检查了东台备用晶石的连接状态。",
      },
    ],
    operations: [
      {
        id: "ignite-west",
        target: "west",
        label: "点亮西引航台",
        requires: { westPower: true },
        effects: { westLight: true },
        successText: "西台亮起，第一道裂痕出现在幻影的护盾上。",
        failureText: "西台回执：供能线断开。",
      },
      {
        id: "connect-west",
        target: "west-source",
        label: "接通西台供能",
        effects: { westPower: true },
        successText: "西台恢复供能。",
        failureText: "西台供能失败。",
      },
      {
        id: "ignite-east",
        target: "east",
        label: "点亮东引航台",
        requires: { eastPower: true },
        effects: { eastLight: true },
        successText: "东台的光刺破雾气。幻影的声音开始颤抖。",
        failureText: "东台回执：备用晶石未接通。",
      },
      {
        id: "connect-east",
        target: "east-source",
        label: "接通东台供能",
        effects: { eastPower: true },
        successText: "东台晶石开始闪光。",
        failureText: "东台供能失败。",
      },
    ],
    goals: [
      {
        fact: "westLight",
        equals: true,
        label: "西台实际发光",
        operationId: "ignite-west",
      },
      {
        fact: "eastLight",
        equals: true,
        label: "东台实际发光",
        operationId: "ignite-east",
      },
    ],
    concepts: ["输出不等于行动", "反馈闭环", "状态验收", "预算与停止"],
  },
  ...chapterOneScenarios,
  ...chapterTwoScenarios,
  ...chapterThreeScenarios,
  ...chapterFourScenarios, ...chapterFiveScenarios,...chapterSixScenarios,...chapterSevenScenarios,...chapterEightScenarios,...seasonBookendScenarios,...blueprintTrialScenarios,
];

export const chapters = [
  ["熄火之港", "让语言触碰现实", "可试玩 · 3 场冒险"],
  ["失灵法器街", "每一次调用都有代价", "工具协议 · 制作待验收"],
  ["无尽钟楼", "学会继续，也学会停止", "规划与预算"],
  ["遗忘回廊", "不是所有卷轴都能带走", "上下文与检索"],
  ["旧日档案馆", "经验也有保质期", "记忆与技能"],
  ["伪令王庭", "谁有资格下达命令", "身份与信任"],
  ["七匠之桥", "更多伙伴，更好的结果？", "协作与依赖"],
  ["镜面议会", "漂亮的数字之外", "评测与制度"],
  ["七匠遗物台", "亲手拆开现实蓝图", "十四场机制试炼"],
];

export interface AgentProfile {
  id: string;
  name: string;
  symbol: string;
  focus: string;
  description: string;
  tradeoff: string;
  analogy: string;
  reviewedAt: string;
  version: string;
  sources: { title: string; url: string }[];
  simplification: string;
}
const historicalProfiles: AgentProfile[] = [
  {
    id: "codex",
    name: "Codex",
    symbol: "C",
    focus: "有边界的行动",
    description:
      "把任务放进工作区，让模型借助工具检查、修改和验证。审批回答“是否允许这次行动”；沙箱限制“执行时能触及什么”。",
    tradeoff:
      "更宽的权限能减少打断，也扩大操作范围。完成声明应附上文件变更与检查结果。",
    analogy: "契约决定是否准许出门，围墙决定出门后能到哪里。",
    reviewedAt: "2026-10-02",
    version: "在线文档快照日期；不绑定产品版本",
    sources: [
      {
        title: "Codex · 审批与安全",
        url: "https://learn.chatgpt.com/docs/agent-approvals-security",
      },
    ],
    simplification: "本试玩只演示虚拟目标权限，不复现操作系统沙箱。",
  },
  {
    id: "claude",
    name: "Claude Code",
    symbol: "A",
    focus: "收集 → 行动 → 验证",
    description:
      "通过工具循环获取信息、采取行动并检查结果；上下文整理、技能与子代理帮助处理复杂任务。",
    tradeoff:
      "上下文容量有限。压缩和分工能减轻负担，也可能丢失关键背景，需要明确交接。",
    analogy: "主工匠把专项调查交给助手，但仍要检查交回的证据。",
    reviewedAt: "2026-10-02",
    version: "官方在线架构说明",
    sources: [
      {
        title: "Claude Code · 工作方式",
        url: "https://code.claude.com/docs/en/how-claude-code-works",
      },
    ],
    simplification: "游戏回执是可见事件，不代表能读取模型的内部思考。",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    symbol: "O",
    focus: "跨入口的长期伙伴",
    description:
      "Gateway 连接消息入口、身份、会话和 Agent 运行。处理长期交互时，消息该进入哪个会话、何时执行，与单次生成同样重要。",
    tradeoff:
      "入口增加后，身份隔离、队列顺序和运行权限需要一起设计；不能因为使用消息应用就默认安全隔离。",
    analogy: "城市邮局既要看信件内容，也要确认寄件人和收件地址。",
    reviewedAt: "2026-10-02",
    version: "官方在线概念文档",
    sources: [
      {
        title: "OpenClaw · Agent loop",
        url: "https://docs.openclaw.ai/concepts/agent-loop",
      },
      {
        title: "Sandboxing",
        url: "https://docs.openclaw.ai/gateway/sandboxing",
      },
    ],
    simplification: "本试玩尚未开放多入口与会话队列试炼。",
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    symbol: "H",
    focus: "把经历变成可复用流程",
    description:
      "围绕持续记忆、检索和技能组织经验，让后续任务能使用此前保留的信息与流程。",
    tradeoff:
      "保存的内容可能过时或错误。复用前要判断来源、有效条件与是否需要纠正。",
    analogy: "工坊手册能传承技艺，也会把旧错误传给下一位学徒。",
    reviewedAt: "2026-10-02",
    version: "官方开发者与技能文档",
    sources: [
      {
        title: "Hermes · Architecture",
        url: "https://hermes-agent.nousresearch.com/docs/developer-guide/architecture",
      },
      {
        title: "Skills",
        url: "https://hermes-agent.nousresearch.com/docs/user-guide/features/skills",
      },
    ],
    simplification: "外部记忆与技能不是模型权重训练，游戏不会混为一谈。",
  },
  {
    id: "opencode",
    name: "OpenCode",
    symbol: "◈",
    focus: "模型、角色、权限各司其职",
    description:
      "模型提供方、工作角色和操作权限是可分别配置的系统部分。换模型不等于同时更换工具和执行权限。",
    tradeoff:
      "灵活配置让任务更适配，也需要保持角色能力与权限一致；V1 与 V2 的配置不能直接混用。",
    analogy: "可以换工匠，也可以换岗位和通行证，它们是三件事。",
    reviewedAt: "2026-10-02",
    version: "V2 文档；与 V1 区分",
    sources: [
      {
        title: "OpenCode V2 · Agents",
        url: "https://opencode.ai/v2/docs/agents",
      },
      { title: "V1 → V2 迁移", url: "https://opencode.ai/v2/docs/migrate-v1" },
    ],
    simplification: "比较的是设计维度，不声称其他产品不具备这些能力。",
  },
  {
    id: "pi",
    name: "Pi",
    symbol: "π",
    focus: "小核心，清晰扩展",
    description:
      "围绕模型消息和工具调用组织循环；会话树支持分支，扩展承接定制能力。当前文档也包含项目 MCP 配置。",
    tradeoff:
      "可扩展不等于自动安全。项目指令、扩展与外部工具的信任边界需要明确，项目可信并不替代系统沙箱。",
    analogy: "一台能拆开的钟表，比一只神秘的盒子更容易理解和改造。",
    reviewedAt: "2026-10-02",
    version: "earendil-works/pi · 4812cb268efc",
    sources: [
      {
        title: "Pi · How Pi works",
        url: "https://github.com/earendil-works/pi/blob/4812cb268efc3f0846337cdfb8f00ce51b7b8d5a/packages/coding-agent/docs/how-pi-works.md",
      },
      {
        title: "Pi · Security",
        url: "https://github.com/earendil-works/pi/blob/4812cb268efc3f0846337cdfb8f00ce51b7b8d5a/packages/coding-agent/docs/security.md",
      },
    ],
    simplification: "游戏只是借鉴小核心结构；不宣称兼容 Pi。",
  },
  {
    id: "deepseek",
    name: "DeepSeek Harness",
    symbol: "D",
    focus: "把运行系统拆成模块",
    description:
      "通过插件组织循环、模型接口、工具和存储，区分语言模型与包围它的执行系统。",
    tradeoff:
      "开发者预览中的接口和能力仍可能变化。模块化提高可替换性，也要求清楚定义模块之间的约定。",
    analogy: "同一颗言灵核心，可以安装在不同的工具台和契约制度里。",
    reviewedAt: "2026-10-02",
    version: "开发者预览 · 639ed0153972",
    sources: [
      {
        title: "DeepSeek Harness · Architecture",
        url: "https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/architecture.md",
      },
    ],
    simplification: "不把模型品牌与 Harness 可连接的模型范围画等号。",
  },
];

export const profiles = historicalProfiles.map(profile=>{
  const productId=profile.id==='claude'?'claude-code':profile.id==='deepseek'?'deepseek-harness':profile.id;
  const evidence=blueprintTrialSources.find(source=>source.productId===productId)!;
  return {...profile,reviewedAt:evidence.reviewedAt,version:evidence.sourceVersion,
    sources:evidence.sourceLinks.map((url,index)=>({title:`${evidence.label} · 官方资料 ${index+1}`,url})),
    simplification:`${evidence.simplification} ${evidence.sharedCapabilities}`};
});

export const factLabels: Record<string, string> = {
  ...seasonBookendFactLabels,...blueprintTrialFactLabels,
  ...chapterOneFactLabels,
  ...chapterTwoFactLabels,
  ...chapterThreeFactLabels, ...chapterFiveFactLabels,...chapterSixFactLabels,...chapterSevenFactLabels,...chapterEightFactLabels,...chapterFourFactLabels,
  power: "备用电源",
  light: "灯塔发光",
  latch: "门闩释放",
  gate: "仓库门开启",
  westPower: "西台供能",
  westLight: "西台发光",
  eastPower: "东台供能",
  eastLight: "东台发光",
};
