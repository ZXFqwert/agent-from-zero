import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { scenarios, profiles } from '../src/content/scenarios';
import { chapterOneWalkthroughs } from '../src/content/chapterOne';
import { chapterTwoWalkthroughs } from '../src/content/chapterTwo';
import { chapterThreeWalkthroughs } from '../src/content/chapterThree';
import { chapterFourWalkthroughs } from '../src/content/chapterFour';
import { stories, uiStories } from '../src/content/stories';
import { chapterOneNpcs } from '../src/content/chapterOneStory';
import { prerequisites, journeyOrder, mainScenarioIds } from '../src/content/progression';
import { createGame, reduceGame, validateGameState, validateScenario } from '../src/engine';
import type { GameAction, GameState, ScenarioDefinition } from '../src/engine';

/** Trusted repository modules construct data; external author files are JSON.parse-only. */
export const contentBundle = {
  scenarios, prerequisites, journeyOrder, mainScenarioIds,
  stories, uiStories, npcs: chapterOneNpcs,
  profiles, walkthroughs: [...chapterOneWalkthroughs,...chapterTwoWalkthroughs,...chapterThreeWalkthroughs,...chapterFourWalkthroughs],
};
export type ContentBundle = typeof contentBundle;
export interface ContentReport { errors: string[]; counts: { scenarios: number; stories: number; profiles: number; paths: number; art: number }; }

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const identifier = /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const sameSet = (left: readonly string[], right: readonly string[]) => [...left].sort().join('\0') === [...right].sort().join('\0');

/** Reject functions, accessors and non-JSON values before serialization could silently erase them. */
function assertDataOnly(value: unknown, path = 'content', ancestors = new Set<object>(), depth = 0): void {
  if (depth > 40) throw new Error(`${path}: 数据嵌套超过 40 层`);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') throw new Error(`${path}: 内容只能包含 JSON 数据，不能包含 ${typeof value}`);
  if (ancestors.has(value)) throw new Error(`${path}: 内容不能循环引用`);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error(`${path}: 只允许普通数据对象`);
  if (Object.getOwnPropertySymbols(value).length) throw new Error(`${path}: 不允许 Symbol 属性`);
  ancestors.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === 'length') continue;
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`${path}.${key}: 保留字段不能用作内容键`);
    if (!own(descriptor, 'value')) throw new Error(`${path}.${key}: 不允许 getter 或 setter`);
    assertDataOnly(descriptor.value, `${path}.${key}`, ancestors, depth + 1);
  }
  if (Array.isArray(value) && Object.keys(value).length !== value.length) throw new Error(`${path}: 数组不能缺项或包含自定义属性`);
  ancestors.delete(value);
}

/** Validate authored data, then execute only the fixed reducer with declarative action fixtures. */
export function validateContent(input: unknown, root = projectRoot): ContentReport {
  const report: ContentReport = { errors: [], counts: { scenarios: 0, stories: 0, profiles: 0, paths: 0, art: 0 } };
  const fail = (path: string, message: string) => report.errors.push(`${path}: ${message}`);
  const check = (condition: unknown, path: string, message: string) => { if (!condition) fail(path, message); };
  const text = (value: unknown, path: string, max = 10000) => check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, path, `必须为非空文字（最多 ${max} 字符）`);
  const integer = (value: unknown, path: string, max = 64, minimum = 1) => check(Number.isInteger(value) && Number(value) >= minimum && Number(value) <= max, path, `必须为 ${minimum}–${max} 的整数`);
  const keys = (value: unknown, path: string, allowed: string[], required: string[] = []): value is Record<string, unknown> => {
    if (!record(value)) { fail(path, '必须为对象'); return false; }
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key}`, '未知字段；新增机制必须先扩展内核与校验器');
    for (const key of required) if (!own(value, key)) fail(`${path}.${key}`, '缺少必需字段');
    return true;
  };
  const list = (value: unknown, path: string, minimum = 0): value is unknown[] => {
    if (!Array.isArray(value)) { fail(path, '必须为数组'); return false; }
    check(value.length >= minimum, path, `至少需要 ${minimum} 项`); return true;
  };
  const strings = (value: unknown, path: string, minimum = 0): value is string[] => {
    if (!list(value, path, minimum)) return false;
    value.forEach((item, index) => text(item, `${path}[${index}]`, 1000));
    check(new Set(value).size === value.length, path, '包含重复项'); return value.every(item => typeof item === 'string');
  };
  const validId = (value: unknown, path: string) => check(typeof value === 'string' && identifier.test(value), path, 'ID 必须为稳定的字母开头标识符');
  const factMap = (value: unknown, path: string, known?: Record<string, unknown>, minimum = 0) => {
    if (!record(value)) { fail(path, '事实必须是对象'); return; }
    check(Object.keys(value).length >= minimum, path, `至少需要 ${minimum} 个事实`);
    for (const [fact, item] of Object.entries(value)) {
      validId(fact, `${path}.${fact}`);
      check(typeof item === 'boolean' || (typeof item === 'string' && item.length <= 1000) || (typeof item === 'number' && Number.isFinite(item)), `${path}.${fact}`, '事实值只允许布尔值、有限数字或短字符串');
      if (known) check(own(known, fact), `${path}.${fact}`, '引用了 initialWorld 中不存在的事实');
    }
  };
  const uniqueIds = (items: unknown[], path: string): string[] => {
    const ids = items.map((item, index) => { const id = record(item) ? item.id : undefined; validId(id, `${path}[${index}].id`); return String(id); });
    check(new Set(ids).size === ids.length, path, '同一全局集合中的 ID 重复'); return ids;
  };
  try { assertDataOnly(input); } catch (error) { fail('content', String(error)); return report; }
  const bundleKeys = ['scenarios', 'prerequisites', 'journeyOrder', 'mainScenarioIds', 'stories', 'uiStories', 'npcs', 'profiles', 'walkthroughs'];
  if (!keys(input, 'content', bundleKeys, bundleKeys)) return report;
  for (const key of ['scenarios', 'stories', 'npcs', 'profiles', 'walkthroughs']) if (!list(input[key], key, 1)) return report;
  if (!record(input.prerequisites) || !record(input.uiStories)) { fail('content', 'prerequisites 与 uiStories 必须为对象'); return report; }
  const bundle = input as unknown as ContentBundle;
  const scenarioIds = uniqueIds(bundle.scenarios, 'scenarios'), profileIds = uniqueIds(bundle.profiles, 'profiles');
  const storyIds = uniqueIds(bundle.stories, 'stories'), npcIds = uniqueIds([...bundle.npcs], 'npcs');
  uniqueIds(bundle.walkthroughs, 'walkthroughs');
  report.counts.scenarios = scenarioIds.length; report.counts.stories = storyIds.length; report.counts.profiles = profileIds.length;
  check(scenarioIds.length >= 8, 'scenarios', '不能遗漏已交付的第一章 8 个任务');
  check(bundle.walkthroughs.length >= 12, 'walkthroughs', '不能遗漏第一章 12 条参考、替代与恢复路线');

  for (const scenario of bundle.scenarios) {
    const path = `scenario/${scenario?.id}`, before = report.errors.length;
    if (!keys(scenario, path, ['id', 'version', 'engineVersion', 'title', 'subtitle', 'brief', 'npc', 'location', 'art', 'chapter', 'kind', 'initialWorld', 'observations', 'operations', 'goals', 'concepts', 'limits', 'hooks', 'transferRequirement','contextCapacity'], ['id', 'title', 'subtitle', 'brief', 'npc', 'location', 'chapter', 'kind', 'initialWorld', 'observations', 'operations', 'goals', 'concepts'])) continue;
    for (const key of ['title', 'subtitle', 'brief', 'npc']) text(scenario[key as keyof ScenarioDefinition], `${path}.${key}`);
    integer(scenario.chapter, `${path}.chapter`, 8); if (scenario.version !== undefined) integer(scenario.version, `${path}.version`, 10000);
    check([undefined, 1, 2, 3, 4, 5].includes(scenario.engineVersion), path, '未知内核版本');
    check(['lighthouse', 'warehouse', 'boss'].includes(scenario.location), path, '未知 location');
    check(['guided', 'transfer', 'boss'].includes(scenario.kind), path, '未知 kind');
    if (scenario.art !== undefined) check(['harbor', 'warehouse', 'tide', 'ferry', 'forge', 'clock', 'corridor'].includes(scenario.art), path, '未知 art');
    factMap(scenario.initialWorld, `${path}.initialWorld`, undefined, 1);
    strings(scenario.concepts, `${path}.concepts`, 1);
    if (!list(scenario.observations, `${path}.observations`) || !list(scenario.operations, `${path}.operations`, 1) || !list(scenario.goals, `${path}.goals`, 1) || !record(scenario.initialWorld)) continue;
    uniqueIds(scenario.observations, `${path}.observations`); uniqueIds(scenario.operations, `${path}.operations`);
    for (const observation of scenario.observations) {
      const at = `${path}.observation/${observation?.id}`;
      if (!keys(observation, at, ['id', 'target', 'label', 'facts', 'text', 'cost','document'], ['id', 'target', 'label', 'facts', 'text'])) continue;
      validId(observation.target, `${at}.target`); text(observation.label, `${at}.label`); text(observation.text, `${at}.text`);
      if (strings(observation.facts, `${at}.facts`, 1)) for (const fact of observation.facts) check(own(scenario.initialWorld, fact), at, `观察引用未知事实 ${fact}`);
      if (observation.cost !== undefined) integer(observation.cost, `${at}.cost`);
      if(observation.document!==undefined&&keys(observation.document,`${at}.document`,['units','source','summaries'],['units','source'])) {
        check(scenario.engineVersion===5,at,'资料卷轴需内核 5');integer(observation.document.units,at,16);text(observation.document.source,at);
        if(observation.document.summaries!==undefined&&list(observation.document.summaries,at,1))for(const summary of observation.document.summaries)if(keys(summary,at,['id','label','units','retain'],['id','label','units','retain'])){validId(summary.id,at);text(summary.label,at);integer(summary.units,at,16);if(strings(summary.retain,at,1))for(const f of summary.retain)check(observation.facts.includes(f),at,'摘要不能创造原件之外的事实');}
      }
    }
    for (const operation of scenario.operations) {
      const at = `${path}.operation/${operation?.id}`;
      if (!keys(operation, at, ['id', 'target', 'label', 'requires', 'effects', 'successText', 'failureText', 'cost', 'failureCost', 'protocol', 'failureKind', 'retryWindow','contextRequires','contextMatches'], ['id', 'target', 'label', 'effects', 'successText', 'failureText'])) continue;
      validId(operation.target, `${at}.target`);
      for (const key of ['label', 'successText', 'failureText'] as const) text(operation[key], `${at}.${key}`);
      factMap(operation.effects, `${at}.effects`, scenario.initialWorld, operation.protocol ? 0 : 1);
      if(operation.protocol !== undefined) {
        check((scenario.engineVersion??1)>=3, at, '工具协议必须由 v3 或更新内核执行');
        const p=operation.protocol;
        if(keys(p, `${at}.protocol`, ['parameters','defaults','delivery','receiptEffects','variants'], ['parameters','defaults','variants'])) {
          if(list(p.parameters, `${at}.parameters`)) for(const field of p.parameters) {
            if(keys(field, `${at}.parameter`, ['name','label','type','required','choices','enum','minimum','maximum'], ['name','label','type','required','choices'])) {
              text(field.name, at, 40); text(field.label, at, 100);
              if(list(field.choices, `${at}.choices`,1)) for(const choice of field.choices) if(keys(choice, at, ['label','value'], ['label','value'])) text(choice.label, at, 100);
            }
          }
          factMap(p.defaults, `${at}.defaults`);
          if(p.receiptEffects !== undefined) factMap(p.receiptEffects, `${at}.receiptEffects`, scenario.initialWorld);
          if(list(p.variants, `${at}.variants`,1)) for(const variant of p.variants) if(keys(variant, at, ['when','effects','deltas','guards','text'], ['when'])) {
            factMap(variant.when, `${at}.when`);
            if(variant.effects !== undefined) factMap(variant.effects, `${at}.variant.effects`, scenario.initialWorld);
            if(variant.deltas !== undefined) factMap(variant.deltas, `${at}.deltas`, scenario.initialWorld);
            if(variant.guards !== undefined && list(variant.guards, `${at}.guards`)) for(const guard of variant.guards) keys(guard, at, ['fact','atLeast'], ['fact','atLeast']);
            if(variant.text !== undefined) text(variant.text, at);
          }
        }
      }
      if(operation.failureKind!==undefined) check((scenario.engineVersion??1)>=4&&['temporary','permanent'].includes(operation.failureKind),at,'故障分类只由 v4 回路执行');
      if(operation.retryWindow!==undefined&&keys(operation.retryWindow,at,['attempts','readyFact'],['attempts','readyFact'])) {integer(operation.retryWindow.attempts,at,8);check((scenario.engineVersion??1)>=4,at,'冷却窗口仅由 v4 执行');}
      if (operation.requires !== undefined) factMap(operation.requires, `${at}.requires`, scenario.initialWorld);
      if(operation.contextRequires!==undefined){check(scenario.engineVersion===5,at,'资料输入需内核 5');factMap(operation.contextRequires,at,scenario.initialWorld,1);}
      if(operation.contextMatches!==undefined&&strings(operation.contextMatches,at,1)){check(scenario.engineVersion===5,at,'动态资料输入需内核 5');for(const f of operation.contextMatches)check(own(scenario.initialWorld,f),at,'未知动态字段');}
      for (const key of ['cost', 'failureCost'] as const) if (operation[key] !== undefined) integer(operation[key], `${at}.${key}`);
    }
    for (const goal of scenario.goals) {
      const at = `${path}.goal/${goal?.fact}`;
      if (!keys(goal, at, ['fact', 'equals', 'label', 'operationId', 'verifyCost'], ['fact', 'equals', 'label', 'operationId'])) continue;
      text(goal.label, `${at}.label`); validId(goal.operationId, `${at}.operationId`);
      factMap({[goal.fact]: goal.equals}, at, scenario.initialWorld);
      if (goal.verifyCost !== undefined) integer(goal.verifyCost, `${at}.verifyCost`);
    }
    if(scenario.contextCapacity!==undefined){check(scenario.engineVersion===5,path,'资料容量需内核 5');integer(scenario.contextCapacity,path,16);}
    if (scenario.limits !== undefined && keys(scenario.limits, `${path}.limits`, ['toolCapacity', 'toolCosts', 'maxBudget', 'missionBudget', 'maxPermissionTargets'])) {
      const limits = scenario.limits;
      if (limits.toolCapacity !== undefined) integer(limits.toolCapacity, `${path}.limits.toolCapacity`, 3);
      if (limits.maxBudget !== undefined) integer(limits.maxBudget, `${path}.limits.maxBudget`);
      if (limits.missionBudget !== undefined) integer(limits.missionBudget, `${path}.limits.missionBudget`, 256);
      for (const key of ['toolCosts', 'maxPermissionTargets'] as const) if (limits[key] !== undefined && keys(limits[key], `${path}.limits.${key}`, ['observe', 'operate', 'verify'])) for (const [tool, amount] of Object.entries(limits[key]!)) integer(amount, `${path}.limits.${key}.${tool}`, key === 'toolCosts' ? 64 : 100, key === 'toolCosts' ? 1 : 0);
    }
    if (scenario.hooks !== undefined && list(scenario.hooks, `${path}.hooks`)) {
      uniqueIds(scenario.hooks, `${path}.hooks`);
      for (const hook of scenario.hooks) {
        const at = `${path}.hook/${hook?.id}`;
        if (!keys(hook, at, ['id', 'trigger', 'when', 'effects', 'notice'], ['id', 'trigger'])) continue;
        if (keys(hook.trigger, `${at}.trigger`, hook.trigger?.type === 'after-call' ? ['type', 'call'] : ['type', 'operationId'], ['type'])) {
          if (hook.trigger.type === 'after-call') integer(hook.trigger.call, `${at}.trigger.call`, 10000);
          else if (hook.trigger.type === 'after-operation') check(scenario.operations.some(operation => operation?.id === hook.trigger.operationId), at, '事件引用未知操作');
          else fail(at, '世界事件只支持 after-call 或 after-operation');
        }
        for (const key of ['when', 'effects'] as const) if (hook[key] !== undefined) factMap(hook[key], `${at}.${key}`, scenario.initialWorld);
        if (hook.notice !== undefined && keys(hook.notice, `${at}.notice`, ['text', 'trust', 'reportedFacts'], ['text', 'trust'])) {
          text(hook.notice.text, `${at}.notice.text`, 5000); check(['environment', 'untrusted'].includes(hook.notice.trust), at, '必须明确通知的信任级别');
          if (hook.notice.reportedFacts !== undefined) factMap(hook.notice.reportedFacts, `${at}.notice.reportedFacts`, scenario.initialWorld);
        }
      }
    }
    if (scenario.transferRequirement !== undefined && keys(scenario.transferRequirement, `${path}.transferRequirement`, ['operationIds', 'reconfiguration', 'receiptCount','contextIds','summaryIds'])) {
      check(scenario.kind === 'transfer', path, '只有迁移任务能声明迁移证据要求');
      if (scenario.transferRequirement.operationIds !== undefined && strings(scenario.transferRequirement.operationIds, `${path}.transferRequirement.operationIds`, 1)) for (const id of scenario.transferRequirement.operationIds) check(scenario.operations.some(operation => operation?.id === id), path, `迁移证据引用未知操作 ${id}`);
      if (scenario.transferRequirement.receiptCount !== undefined) integer(scenario.transferRequirement.receiptCount, `${path}.transferRequirement.receiptCount`, 12);
      for(const key of ['contextIds','summaryIds'] as const)if(scenario.transferRequirement[key]!==undefined)strings(scenario.transferRequirement[key],path,1);
      if (scenario.transferRequirement.reconfiguration !== undefined) check(typeof scenario.transferRequirement.reconfiguration === 'boolean', path, 'reconfiguration 必须为布尔值');
    }
    if ((scenario.engineVersion ?? 1) === 1) check(!scenario.limits && !scenario.hooks && !scenario.transferRequirement && [...scenario.operations, ...scenario.observations].every(item => item.cost === undefined) && scenario.operations.every(item => item.failureCost === undefined) && scenario.goals.every(goal => goal.verifyCost === undefined), path, 'v1 不执行 v2 成本或事件，不能静默使用这些字段');
    if (report.errors.length === before) for (const error of validateScenario(scenario)) fail(path, error);
  }

  // Validate the dependency graph independently of array order or completed-save behavior.
  check(sameSet(Object.keys(bundle.prerequisites), scenarioIds), 'prerequisites', '每个任务必须恰好有一条解锁定义');
  for (const [id, previous] of Object.entries(bundle.prerequisites)) if (strings(previous, `prerequisites.${id}`)) for (const dependency of previous) check(scenarioIds.includes(dependency), `prerequisites.${id}`, `未知前置任务 ${dependency}`);
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string, trail: string[]) => {
    if (visiting.has(id)) { fail('prerequisites', `解锁环：${[...trail, id].join(' → ')}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const dependencies = bundle.prerequisites[id];
    if (Array.isArray(dependencies)) for (const dependency of dependencies) if (scenarioIds.includes(dependency)) visit(dependency, [...trail, id]);
    visiting.delete(id); visited.add(id);
  };
  scenarioIds.forEach(id => visit(id, []));
  if (strings(bundle.journeyOrder, 'journeyOrder', 1)) check(sameSet(bundle.journeyOrder, scenarioIds), 'journeyOrder', '旅程排序必须恰好包含所有任务');
  if (strings(bundle.mainScenarioIds, 'mainScenarioIds', 1)) for (const id of bundle.mainScenarioIds) {
    check(scenarioIds.includes(id), 'mainScenarioIds', `未知任务 ${id}`);
    const dependencies = bundle.prerequisites[id];
    if (Array.isArray(dependencies)) for (const dependency of dependencies) check(bundle.mainScenarioIds.includes(dependency), `prerequisites.${id}`, '主线不能由支线解锁');
  }

  check(sameSet(storyIds, scenarioIds), 'stories', '每个场景必须恰好有一份剧情');
  check(sameSet(Object.keys(bundle.uiStories), scenarioIds), 'uiStories', '每个场景必须恰好有一份可显示的剧情与复盘');
  const speakers = new Set([...npcIds, 'echo', 'regent', 'narrator']);
  const dialogue = (value: unknown, path: string) => { if (list(value, path, 1)) value.forEach((line, index) => { if (keys(line, `${path}[${index}]`, ['speaker', 'text'], ['speaker', 'text'])) { check(speakers.has(String(line.speaker)), path, '未知说话角色'); text(line.text, path); } }); };
  for (const story of bundle.stories) {
    const path = `story/${story?.id}`;
    if (!keys(story, path, ['id', 'title', 'track', 'leadNpc', 'opening', 'success', 'failureCallout', 'choicePrompt', 'choiceTiming', 'choices', 'unlock', 'legacyScenario'], ['id', 'title', 'track', 'leadNpc', 'opening', 'success', 'failureCallout', 'choicePrompt', 'choiceTiming', 'choices', 'unlock'])) continue;
    text(story.title, `${path}.title`); text(story.choicePrompt, `${path}.choicePrompt`); check(npcIds.includes(story.leadNpc), path, '未知主 NPC');
    check(story.track === (bundle.mainScenarioIds.includes(story.id) ? 'main' : 'side'), path, '剧情主支线与完成条件不一致');
    check(story.choiceTiming === 'after-success', path, '当前 UI 只支持通关后的价值选择');
    dialogue(story.opening, `${path}.opening`); dialogue(story.success, `${path}.success`); dialogue([story.failureCallout], `${path}.failureCallout`);
    if (keys(story.unlock, `${path}.unlock`, ['allCompleted'], ['allCompleted']) && strings(story.unlock.allCompleted, `${path}.unlock.allCompleted`)) check(sameSet(story.unlock.allCompleted, bundle.prerequisites[story.id] ?? []), path, '剧情前置与解锁图不一致');
    if (list(story.choices, `${path}.choices`, 2)) {
      check(story.choices.length === 2 && sameSet(story.choices.map(choice => choice?.id), ['people', 'workshop']), path, '当前存档协议要求 people / workshop 两个不同选择');
      for (const choice of story.choices) {
        const at = `${path}.choice/${choice?.id}`;
        if (!keys(choice, at, ['id', 'label', 'value', 'reply', 'consequence'], ['id', 'label', 'value', 'reply', 'consequence'])) continue;
        text(choice.label, `${at}.label`); text(choice.value, `${at}.value`); dialogue(choice.reply, `${at}.reply`);
        if (keys(choice.consequence, `${at}.consequence`, ['worldFlags', 'trustFlags', 'visibleResult', 'nextAppearance'], ['worldFlags', 'trustFlags', 'visibleResult', 'nextAppearance'])) {
          const result = choice.consequence; text(result.visibleResult, `${at}.visibleResult`);
          check([...scenarioIds, 'harbor-hub', 'chapter-2', 'chapter-3', 'chapter-4'].includes(result.nextAppearance), at, '后续呼应引用未知地点');
          if (record(result.worldFlags)) for (const [flag, value] of Object.entries(result.worldFlags)) { check(flag.startsWith('story.'), at, '叙事旗标必须在 story. 命名空间'); check(typeof value === 'string' || typeof value === 'boolean', at, '叙事旗标只能为字符串或布尔值'); } else fail(at, '缺少叙事世界旗标');
          if (record(result.trustFlags)) for (const [npc, value] of Object.entries(result.trustFlags)) { check(npcIds.includes(npc), at, '信任关系引用未知 NPC'); text(value, at); } else fail(at, '缺少信任关系旗标');
        }
      }
    }
    const ui = bundle.uiStories[story.id], at = `${path}.ui`;
    if (!keys(ui, at, ['role', 'opening', 'success', 'hint', 'rules', 'location', 'choices', 'recap', 'next', 'outcomes'], ['role', 'opening', 'success', 'hint', 'rules', 'location', 'choices', 'recap'])) continue;
    check(['main', 'transfer', 'boss', 'side'].includes(ui.role), at, '未知剧情角色类型');
    for (const key of ['opening', 'success', 'hint', 'location'] as const) text(ui[key], `${at}.${key}`);
    strings(ui.rules, `${at}.rules`, 1);
    if (ui.next !== undefined) check(scenarioIds.includes(ui.next), at, 'next 引用未知场景');
    if (keys(ui.recap, `${at}.recap`, ['story', 'system', 'technical'], ['story', 'system', 'technical'])) for (const key of ['story', 'system', 'technical'] as const) text(ui.recap[key], `${at}.recap.${key}`);
    if (list(ui.choices, `${at}.choices`, 2)) {
      check(ui.choices.length === 2 && sameSet(ui.choices.map(choice => choice?.id), ['people', 'workshop']), at, 'UI 选择必须与存档协议一致');
      for (const choice of ui.choices) if (keys(choice, at, ['id', 'text', 'consequence'], ['id', 'text', 'consequence'])) { text(choice.text, at); text(choice.consequence, at); }
    }
    if (ui.outcomes !== undefined && list(ui.outcomes, `${at}.outcomes`)) for (const outcome of ui.outcomes) if (keys(outcome, at, ['fact', 'equals', 'text'], ['fact', 'equals', 'text'])) { const scenario = bundle.scenarios.find(item => item.id === story.id); if (scenario) factMap({[outcome.fact]: outcome.equals}, at, scenario.initialWorld); text(outcome.text, at); }
  }

  const official: Record<string, Array<[string, string?]>> = {
    codex: [['learn.chatgpt.com'], ['developers.openai.com'], ['openai.com'], ['github.com', '/openai/']],
    claude: [['code.claude.com'], ['docs.anthropic.com'], ['anthropic.com']],
    openclaw: [['docs.openclaw.ai'], ['github.com', '/openclaw/']],
    hermes: [['hermes-agent.nousresearch.com'], ['github.com', '/NousResearch/']],
    opencode: [['opencode.ai'], ['github.com', '/anomalyco/opencode/']],
    pi: [['github.com', '/earendil-works/pi/']], deepseek: [['github.com', '/deepseek-ai/deepseek-harness/']],
  };
  for (const id of Object.keys(official)) check(profileIds.includes(id), 'profiles', `缺少 ${id} 官方档案`);
  for (const profile of bundle.profiles) {
    const path = `profile/${profile?.id}`;
    if (!keys(profile, path, ['id', 'name', 'symbol', 'focus', 'description', 'tradeoff', 'analogy', 'reviewedAt', 'version', 'sources', 'simplification'], ['id', 'name', 'symbol', 'focus', 'description', 'tradeoff', 'analogy', 'reviewedAt', 'version', 'sources', 'simplification'])) continue;
    for (const key of ['name', 'symbol', 'focus', 'description', 'tradeoff', 'analogy', 'version', 'simplification'] as const) text(profile[key], `${path}.${key}`);
    const date = typeof profile.reviewedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(profile.reviewedAt) ? new Date(`${profile.reviewedAt}T00:00:00Z`) : new Date(NaN);
    check(Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === profile.reviewedAt && date.valueOf() <= Date.now(), path, '核查日期无效或在未来');
    if (list(profile.sources, `${path}.sources`, 1)) for (const source of profile.sources) {
      if (!keys(source, `${path}.source`, ['title', 'url'], ['title', 'url'])) continue;
      text(source.title, `${path}.source.title`);
      try { const url = new URL(source.url); check(url.protocol === 'https:' && !url.username && !url.password && (official[profile.id] ?? []).some(([host, prefix]) => url.hostname === host && (!prefix || url.pathname.startsWith(prefix))), path, `非已登记官方来源 ${source.url}`); } catch { fail(path, '来源 URL 无效'); }
    }
  }

  // Read the actual Phaser preload declarations with the TypeScript parser; never execute Scene.tsx.
  try {
    const file = ts.createSourceFile('Scene.tsx', readFileSync(join(root, 'src', 'Scene.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const art = new Map<string, string>();
    const walk = (node: ts.Node) => {
      if (ts.isForOfStatement(node) && ts.isArrayLiteralExpression(node.expression) && node.statement.getText(file).includes('this.load.image')) {
        for (const item of node.expression.elements) {
          if (!ts.isArrayLiteralExpression(item) || item.elements.length !== 2 || !item.elements.every(ts.isStringLiteral)) { fail('art', 'preload 资源必须显式声明 key/file 字符串对'); continue; }
          const [key, name] = item.elements as unknown as [ts.StringLiteral, ts.StringLiteral];
          check(!art.has(key.text), 'art', `重复纹理 ID ${key.text}`); check(/^[a-z0-9-]+$/.test(name.text), 'art', '资源路径必须在 public/art 内'); art.set(key.text, name.text);
        }
        check(node.statement.getText(file).includes('art/${file}.webp'), 'art', 'preload URL 约定已改变，请同步资源校验');
      }
      ts.forEachChild(node, walk);
    };
    walk(file); check(art.size >= 8, 'art', '未完整识别当前 8 个 Phaser 资源');
    for (const [key, name] of art) {
      try { const path = join(root, 'public', 'art', `${name}.webp`), file = readFileSync(path); check(statSync(path).isFile() && file.length > 12 && file.toString('ascii', 0, 4) === 'RIFF' && file.toString('ascii', 8, 12) === 'WEBP', 'art', `${key} 不是有效 WebP 文件`); } catch { fail('art', `缺少 ${name}.webp`); }
    }
    for (const scenario of bundle.scenarios) { const key = scenario.art ?? (scenario.location === 'warehouse' ? 'warehouse' : 'harbor'); check(art.has(key), `scenario/${scenario.id}`, `未加载纹理 ${key}`); }
    for (const key of ['warehouse-open', 'ferry-far', 'echo', 'phantom']) check(art.has(key), 'art', `缺少状态纹理 ${key}`);
    const packs=JSON.parse(readFileSync(join(root,'chapter-packs.json'),'utf8'));
    check(packs.schema===1&&Array.isArray(packs.chapters)&&Array.isArray(packs.commonArt),'packs','离线分包配置不完整');
    if(Array.isArray(packs.chapters)&&Array.isArray(packs.commonArt)) {
      const numbers=[...new Set(bundle.scenarios.map(scenario=>scenario.chapter))];
      check(sameSet(packs.chapters.map((pack:{number:number})=>String(pack.number)),numbers.map(String)),'packs','每个已制作章节必须恰好有一个离线分包');
      for(const scenario of bundle.scenarios){const pack=packs.chapters.find((pack:{number:number})=>pack.number===scenario.chapter);const key=scenario.art??(scenario.location==='warehouse'?'warehouse':'harbor');check(pack&&[...packs.commonArt,...pack.art].includes(art.get(key)),`scenario/${scenario.id}`,'场景未归入所属章节离线包');}
    }
    report.counts.art = art.size;
  } catch (error) { fail('art', `无法检查场景资源：${String(error)}`); }

  // Invalid structure must not reach the reducer. Fixture calls are data, never callbacks.
  if (report.errors.length) return report;
  for (const route of bundle.walkthroughs) {
    const path = `walkthrough/${route.id}`, before = report.errors.length;
    if (!keys(route, path, ['id', 'scenarioId', 'purpose', 'stages', 'expectedCost', 'expectedWorld'], ['id', 'scenarioId', 'purpose', 'stages', 'expectedCost', 'expectedWorld'])) continue;
    const scenario = bundle.scenarios.find(item => item.id === route.scenarioId);
    if (!scenario) { fail(path, '引用未知场景'); continue; }
    check(['reference', 'alternative', 'recovery'].includes(route.purpose), path, '未知参考路线用途'); integer(route.expectedCost, `${path}.expectedCost`, 10000); factMap(route.expectedWorld, `${path}.expectedWorld`, scenario.initialWorld, 1);
    if (!list(route.stages, `${path}.stages`, 1)) continue;
    if (route.purpose === 'recovery') check(route.stages.some(stage => stage.expectWorld && Object.keys(stage.expectWorld).length), path, '恢复路线必须断言失败后的中间世界状态');
    for (const [index, stage] of route.stages.entries()) {
      const at = `${path}.stages[${index}]`;
      if (!keys(stage, at, ['tools', 'calls', 'collectReceipts', 'expectWorld', 'absentProofs', 'loopPolicy','contextChanges'], ['tools', 'calls'])) continue;
      if (strings(stage.tools, `${at}.tools`, 1)) check(stage.tools.every(tool => ['observe', 'operate', 'verify'].includes(tool)), at, '未知法器');
      if(stage.loopPolicy!==undefined)check((scenario.engineVersion??1)>=4,at,'回路配置需要 v4 或更新内核');
      if(stage.contextChanges!==undefined&&list(stage.contextChanges,at,1)){check(scenario.engineVersion===5,at,'装卷路径需内核 5');for(const c of stage.contextChanges)if(keys(c,at,['observationId','operation','summaryId'],['observationId','operation'])){check(scenario.observations.some(o=>o.id===c.observationId),at,'未知资料');check(['include','exclude','summarize','expand'].includes(c.operation),at,'未知装卷操作');if(c.summaryId!==undefined)validId(c.summaryId,at);}}
      if (stage.collectReceipts !== undefined) check(typeof stage.collectReceipts === 'boolean', at, 'collectReceipts 必须为布尔值');
      if (stage.expectWorld !== undefined) factMap(stage.expectWorld, `${at}.expectWorld`, scenario.initialWorld);
      if (stage.absentProofs !== undefined && strings(stage.absentProofs, `${at}.absentProofs`)) for (const fact of stage.absentProofs) check(scenario.goals.some(goal => goal.fact === fact), at, 'absentProofs 引用未知完成条件');
      if (list(stage.calls, `${at}.calls`, 1)) for (const call of stage.calls) {
        if (!record(call)) { fail(at, '工具请求必须为对象'); continue; }
        const argument = call.tool === 'observe' ? 'observationId' : call.tool === 'operate' ? 'operationId' : 'fact';
        keys(call, `${at}.call`, call.tool === 'operate' && (scenario.engineVersion??1)>=3 ? ['tool', argument, 'arguments', 'requestKey'] : ['tool', argument], ['tool', argument]);
        if(call.arguments !== undefined) factMap(call.arguments, `${at}.arguments`);
        if(call.requestKey !== undefined) text(call.requestKey, `${at}.requestKey`, 64); check(['observe', 'operate', 'verify'].includes(String(call.tool)), at, '未知工具请求'); validId(call[argument], `${at}.${argument}`);
      }
    }
    if (report.errors.length !== before) continue;
    try {
      let state = createGame(scenario, 1), cost = 0;
      const action = (data: Omit<GameAction, 'id'>) => {
        const input = {...data, id: `content-${state.processedActionIds.length}`} as GameAction;
        const next = reduceGame(scenario, state, input);
        if (next === state) throw new Error(`内核拒绝 ${JSON.stringify(data)}`);
        cost += next.events.slice(state.events.length).filter(event => event.type === 'request').reduce((sum, event) => sum + (event.cost ?? 1), 0); state = next;
      };
      for (const stage of route.stages) {
        if (state.status === 'running') action({type: 'pause'});
        action({type: 'configure', blueprint: {tools: stage.tools, feedback: true, verification: true, budget: scenario.limits?.maxBudget ?? 12, permissions: ['*'],...(stage.loopPolicy?{loopPolicy:stage.loopPolicy}:{})}} as GameAction);
        action({type: 'dispatch', mode: 'manual'} as GameAction);
        for(const c of stage.contextChanges??[]){const card=[...(state.context?.records??[])].reverse().find(r=>r.observationId===c.observationId);if(!card)throw new Error('路径在读取之前装卷');action({type:'context',recordId:card.id,operation:c.operation,...(c.summaryId?{summaryId:c.summaryId}:{})} as GameAction);}
        for (const call of stage.calls) action({type: 'tool', call} as GameAction);
        if(stage.collectReceipts) for(const receipt of state.protocol?.receipts.filter(receipt=>!receipt.collected) ?? []) action({type:'receive',callId:receipt.callId,receiptId:receipt.id} as GameAction);
        for (const [fact, expected] of Object.entries(stage.expectWorld ?? {})) check(state.world[fact] === expected, path, `中间事实 ${fact} 应为 ${JSON.stringify(expected)}，实际 ${JSON.stringify(state.world[fact])}`);
        for (const fact of stage.absentProofs ?? []) check(!state.verifiedGoals.includes(fact), path, `${fact} 的旧证明应该失效`);
      }
      check(state.status === 'won' && scenario.goals.every(goal => state.world[goal.fact] === goal.equals && state.verifiedGoals.includes(goal.fact)), path, '未真实完成每项验收');
      check(cost === route.expectedCost, path, `预计成本 ${route.expectedCost}，实际 ${cost}`);
      if (state.runtime) check((scenario.limits?.missionBudget ?? 64) - state.runtime.missionRemaining === cost, path, '任务总资源与动作成本不符');
      for (const [fact, expected] of Object.entries(route.expectedWorld)) check(state.world[fact] === expected, path, `最终事实 ${fact} 与参考结果不同`);
      check(validateGameState(scenario, state), path, '最终存档不能通过确定重放'); report.counts.paths++;
    } catch (error) { fail(path, String(error)); }
  }
  for (const scenario of bundle.scenarios.filter(item => (item.engineVersion ?? 1) >= 2)) {
    const routes = bundle.walkthroughs.filter(route => route.scenarioId === scenario.id);
    for (const purpose of ['reference', 'recovery']) check(routes.some(route => route.purpose === purpose), `scenario/${scenario.id}`, `缺少 ${purpose} 路线`);
  }
  // v1 is frozen. Its existing generic reference uses the original kernel, not v2 costs/hooks.
  for (const scenario of bundle.scenarios.filter(item => (item.engineVersion ?? 1) === 1)) {
    let state: GameState = createGame(scenario);
    state = reduceGame(scenario, state, {id: 'reference-build', type: 'configure', blueprint: {tools: ['observe', 'operate', 'verify'], feedback: true, verification: true, budget: 16, permissions: ['*']}});
    state = reduceGame(scenario, state, {id: 'reference-dispatch', type: 'dispatch'});
    for (let step = 0; state.status === 'running' && step < 64; step++) state = reduceGame(scenario, state, {id: `reference-${step}`, type: 'step'});
    check(state.status === 'won' && validateGameState(scenario, state), `scenario/${scenario.id}`, '冻结版参考策略不能通关');
  }
  return report;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { process.stdout.write('用法：npm run validate:content [-- --json <完整内容包.json>]\n默认检查本地注册表、参考路径和美术；--json 只解析 JSON，不执行外部代码。\n'); return; }
  if (args.length && (args.length !== 2 || args[0] !== '--json')) throw new Error('参数无效；使用 --help 查看用法。');
  let input: unknown = contentBundle;
  if (args[0] === '--json') {
    const path = resolve(args[1]); if (statSync(path).size > 8_000_000) throw new Error('内容 JSON 不能超过 8 MB。');
    input = JSON.parse(readFileSync(path, 'utf8'));
  }
  const result = validateContent(input);
  if (result.errors.length) { process.stderr.write(`内容校验失败（${result.errors.length} 项）：\n${result.errors.map(error => `- ${error}`).join('\n')}\n`); process.exitCode = 1; return; }
  const {scenarios, stories, profiles, paths, art} = result.counts;
  process.stdout.write(`内容校验通过：${scenarios} 个任务，${stories} 份剧情，${profiles} 份官方档案，${paths} 条参考/替代/恢复路线，${art} 项场景美术。\n范围：已制作的第一至四章；不代表完整第一季、真人学习效果或真机验收。官方链接仅校验来源归属与元数据，未重新联网核查正文。\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { process.stderr.write(`内容校验失败：${String(error)}\n`); process.exitCode = 1; }
}
