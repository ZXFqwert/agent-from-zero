import {validateBlueprint, validateGameState, validateScenario} from './engine';
import type {AgentBlueprint, GameState, LoopPolicy, ScenarioDefinition, ToolName} from './engine/types';
import {scenarios} from './content/scenarios';
import {canonical, generateChallenge, scenarioForExpedition, type ExpeditionState} from './challenges';
import {validatePostSeason} from './postSeason';

/** Input records, never UI completion IDs or a caller-supplied source blueprint. */
export interface BuildReuseInput {
  mainGames: readonly GameState[];
  postSeason?: unknown;
}
export interface ReusableBuildKnobs {
  tools: ToolName[];
  feedback: boolean;
  verification: boolean;
  budget: number;
  stableRequestKeys?: boolean;
  loopPolicy?: LoopPolicy;
  instructionPolicy?: AgentBlueprint['instructionPolicy'];
}
export interface ReusableBuildSource {
  id: string;
  scope: 'author' | 'challenge' | 'expedition';
  scenarioId: string;
  title: string;
  sourceVersion: number;
  kernelVersion: GameState['kernelVersion'];
  seed: number;
  attempt: number;
  hintUsed: boolean;
  victoryEventIds: string[];
  configureEventId?: string;
  configureActionId?: string;
  templateId?: string;
  expeditionId?: string;
  floor?: 1 | 2 | 3;
  /** Provenance only; never assigned to the new mission's pool. */
  floorStartBudget?: number;
  /** Final configuration at delivery; not a claim that no other build was used. */
  knobs: ReusableBuildKnobs;
}
export interface ReusableBuildCatalogue {
  sources: ReusableBuildSource[];
  ignoredRecordCount: number;
  omittedSourceCount: number;
  postSeasonRejected: boolean;
}
export interface ReusableBuildPreview {
  source: ReusableBuildSource;
  targetId: string;
  targetVersion: number;
  draft: AgentBlueprint;
  warnings: string[];
  /** Includes capacity errors: the player can adjust these in the Workshop. */
  blueprintErrors: string[];
  requiresPermissionSign: true;
}
export const MAX_REUSE_SOURCES = 144;
const MAX_AUTHOR_RECORDS = scenarios.length * 2; // One completed and one current record per frozen source.
const official = new Map(scenarios.map(source => [source.id, source]));

/** Project only structural settings. No permissions, target IDs, parameters or material values. */
function knobsOf(blueprint: AgentBlueprint, kernel: GameState['kernelVersion']): ReusableBuildKnobs {
  return {
    tools: [...blueprint.tools], feedback: blueprint.feedback, verification: blueprint.verification,
    budget: blueprint.budget,
    ...(kernel < 3 || blueprint.stableRequestKeys === undefined ? {} : {stableRequestKeys: blueprint.stableRequestKeys}),
    ...(kernel < 4 || blueprint.loopPolicy === undefined ? {} : {loopPolicy: {...blueprint.loopPolicy}}),
    ...(kernel < 7 || blueprint.instructionPolicy === undefined ? {} : {instructionPolicy: blueprint.instructionPolicy}),
  };
}
function sourceOf(scope: ReusableBuildSource['scope'], scenario: ScenarioDefinition, game: GameState,
  extra: Pick<ReusableBuildSource, 'templateId' | 'expeditionId' | 'floor' | 'floorStartBudget'> = {}): ReusableBuildSource | null {
  if (game.status !== 'won' || !validateGameState(scenario, game)) return null;
  const victories = game.events.filter(event => event.type === 'victory' && event.attempt === game.attempt);
  if (!victories.length) return null;
  const delivery = victories[victories.length - 1];
  const configuration = game.events.filter(event => event.type === 'configured' && event.sequence < delivery.sequence).at(-1);
  const knobs = knobsOf(game.blueprint, game.kernelVersion);
  // The ID locates a validated record; preview always derives it again from the input proofs.
  const id = canonical([scope, scenario.id, game.seed, game.attempt, game.hintUsed, extra.expeditionId ?? null,
    extra.floor ?? null, extra.floorStartBudget ?? null, configuration?.id ?? null, victories.map(event => event.id), knobs]);
  return {
    id, scope, scenarioId: scenario.id, title: scenario.title, sourceVersion: scenario.version ?? 1,
    kernelVersion: game.kernelVersion, seed: game.seed, attempt: game.attempt, hintUsed: game.hintUsed,
    victoryEventIds: victories.map(event => event.id), knobs, ...extra,
    ...(configuration ? {configureEventId: configuration.id,
      ...(configuration.actionId ? {configureActionId: configuration.actionId} : {})} : {}),
  };
}
function expeditionSources(expedition: ExpeditionState): ReusableBuildSource[] {
  const sources: ReusableBuildSource[] = [];
  for (const attempt of expedition.finished) {
    const scenario = generateChallenge(attempt.spec).scenario;
    scenario.limits = {...scenario.limits, missionBudget: attempt.initialBudget,
      maxBudget: Math.min(scenario.limits?.maxBudget ?? 64, attempt.initialBudget)};
    const source = sourceOf('expedition', scenario, attempt.game, {templateId: attempt.spec.templateId,
      expeditionId: expedition.definition.id, floor: (attempt.floor + 1) as 1 | 2 | 3, floorStartBudget: attempt.initialBudget});
    if (source) sources.push(source);
  }
  const current = sourceOf('expedition', scenarioForExpedition(expedition), expedition.game, {
    templateId: expedition.definition.floors[expedition.floor].templateId,
    expeditionId: expedition.definition.id, floor: (expedition.floor + 1) as 1 | 2 | 3, floorStartBudget: expedition.floorStartBudget});
  if (current) sources.push(current);
  return sources;
}

/**
 * Author wins use the frozen official definition. Ordinary and expedition wins are
 * admitted only inside a strictly replayed parent PostSeasonState, including unlocks
 * and the expedition's consumed shared budget. No standalone attempt is accepted.
 */
export function deriveReusableBuilds(input: BuildReuseInput): ReusableBuildCatalogue {
  const sources: ReusableBuildSource[] = [], validAuthors: GameState[] = [];
  let ignoredRecordCount = 0, postSeasonRejected = false;
  const records = Array.isArray(input?.mainGames) ? input.mainGames : [];
  ignoredRecordCount += Math.max(0, records.length - MAX_AUTHOR_RECORDS);
  for (const game of records.slice(-MAX_AUTHOR_RECORDS)) {
    try {
      const scenario = official.get(game?.scenarioId);
      if (!scenario || !validateGameState(scenario, game)) {ignoredRecordCount++; continue;}
      validAuthors.push(game);
      const source = sourceOf('author', scenario, game);
      if (source) sources.push(source);
    } catch {ignoredRecordCount++;}
  }
  if (input?.postSeason !== undefined) {
    try {
      const post = validatePostSeason(input.postSeason, validAuthors);
      for (const record of post.wonProofs) {
        const source = sourceOf('challenge', generateChallenge(record.spec).scenario, record.game,
          {templateId: record.spec.templateId});
        if (source) sources.push(source);
      }
      if (post.latestClearedExpedition) sources.push(...expeditionSources(post.latestClearedExpedition));
      // Current records follow historical ones, so a finite catalogue cannot hide
      // the configuration just delivered. Record order is not a knowledge grade.
      if (post.currentChallenge) {
        const record = post.currentChallenge;
        const source = sourceOf('challenge', generateChallenge(record.spec).scenario, record.game, {templateId: record.spec.templateId});
        if (source) sources.push(source);
      }
      if (post.activeExpedition) sources.push(...expeditionSources(post.activeExpedition));
    } catch {postSeasonRejected = true;}
  }
  const recent = new Map<string, ReusableBuildSource>();
  for (const source of sources) {recent.delete(source.id); recent.set(source.id, source);}
  const unique = [...recent.values()];
  return {sources: unique.slice(-MAX_REUSE_SOURCES), ignoredRecordCount,
    omittedSourceCount: Math.max(0, unique.length - MAX_REUSE_SOURCES), postSeasonRejected};
}

/**
 * The caller supplies its canonical current scenario (official/factory reconstructed,
 * and for expeditions with the validated floor budget). validateScenario checks the
 * destination schema; it is not a substitute for parent save validation. sourceId is
 * only a selector: metadata or edited UI knobs are never trusted as source proof.
 * Returning a draft executes no action and restores no crystals or learned inputs.
 */
export function previewReusableBuild(input: BuildReuseInput, sourceId: string,
  target: ScenarioDefinition): ReusableBuildPreview | null {
  try {
    if (validateScenario(target).length) return null;
    const source = deriveReusableBuilds(input).sources.find(item => item.id === sourceId);
    if (!source) return null;
    const settings = source.knobs, kernel = target.engineVersion ?? 1;
    const maxBudget = Math.min(target.limits?.maxBudget ?? 64, target.limits?.missionBudget ?? 64);
    const draft: AgentBlueprint = {tools: [...settings.tools], feedback: settings.feedback,
      verification: settings.verification, budget: Math.min(settings.budget, maxBudget), permissions: []};
    const warnings = [
      '新现场的访问契约从空白开始，请在工坊逐项签订；同名目标与原来的全部访问权限也不会继承。',
      '委托顺序、工具参数与请求编号须按新任务设置；卷轴、记忆、身份、审批、伙伴私有输入与模块配置没有复制。',
      '这是交付时的配置，原任务可能经过换装。它是你的构筑记录，不是伙伴的持久记忆，也不证明已经掌握新任务。',
      '这里只调整单次派遣预算，不增加本次委托已经剩下的晶石。',
    ];
    if (draft.budget !== settings.budget) warnings.push(`派遣预算从 ${settings.budget} 收到新任务上限 ${draft.budget}。`);
    if (settings.stableRequestKeys !== undefined) {
      if (kernel >= 3) draft.stableRequestKeys = settings.stableRequestKeys;
      else warnings.push('新任务不支持稳定请求键策略，此项没有带入。');
    }
    if (settings.loopPolicy !== undefined) {
      if (kernel >= 4) draft.loopPolicy = {...settings.loopPolicy};
      else warnings.push('新任务不支持有限回路配置，此项没有带入。');
    }
    if (settings.instructionPolicy !== undefined) {
      if (kernel >= 7) draft.instructionPolicy = settings.instructionPolicy;
      else warnings.push('新任务不支持资料指令策略，此项没有带入。');
      if (kernel >= 7 && settings.instructionPolicy === 'follow-documents') {
        warnings.push('原构筑会遵从资料附带的指令；这仍是显式教学策略，请检查新任务的信任边界。');
      }
    }
    const capacity = target.limits?.toolCapacity ?? 3;
    if (draft.tools.length > capacity) warnings.push(`原构筑有 ${draft.tools.length} 件法器，新任务只能携带 ${capacity} 件；请自己选择，没有替你删掉任何法器。`);
    return {source, targetId: target.id, targetVersion: target.version ?? 1, draft, warnings,
      blueprintErrors: validateBlueprint(target, draft), requiresPermissionSign: true};
  } catch {return null;}
}
