import {validateGameState} from '../engine';
import type {GameEvent, GameState, ScenarioDefinition} from '../engine/types';
import {scenarios} from '../content/scenarios';
import {mainScenarioIds} from '../content/progression';
import {CORE_CONCEPTS, type CoreCheckpoint, type CoreConceptDefinition, type CoreStageId} from './catalog';
import {courierLearningProofs} from '../courierProgress';
export {CORE_CONCEPTS} from './catalog';
export type {CoreCheckpoint, CoreConceptDefinition, CoreStageId} from './catalog';

export interface CoreProof {scenarioId: string; title: string; eventIds: string[]; hintUsed: boolean; sourceKind?: 'courier-module';}
export interface CoreStage {
  id: CoreStageId; label: string; status: 'pending' | 'evidenced'; scenarioIds: string[];
  proofs: CoreProof[]; explanation: string; gap?: string;
}
export interface CoreConceptProgress extends CoreConceptDefinition {stages: CoreStage[]; nextScenarioId?: string; nextNeedsReplay?: boolean;}
export interface CoreCurriculum {
  concepts: CoreConceptProgress[];
  counts: {concepts: number; totalStages: number; evidencedStages: number; pendingStages: number; transferConcepts: number; revisitedConcepts: number};
  ignoredRecordCount: number;
}
export interface CoreCurriculumOptions {
  /** Earlier entries can support operation stages, but have no attested chronological order. */
  revisitStartIndex?: number;
  /** A separate authored encounter is replayed internally, never accepted as a caller badge. */
  courierProgress?: unknown;
}
interface RecordEntry {source: ScenarioDefinition; game: GameState; index: number; fingerprint: string;}
const sourceById = new Map(scenarios.map(source => [source.id, source]));
const mainIds = new Set(mainScenarioIds);
const STAGES: readonly CoreStageId[] = ['guided', 'independent', 'transfer', 'revisit'];
const labels: Record<CoreStageId, string> = {guided: '引导实操', independent: '无提示实操', transfer: '陌生情境迁移', revisit: '间隔重遇实操'};
const explanations: Record<CoreStageId, string> = {
  guided: '在指定教学任务中实际执行机制并完成现场验收；仅查看文案或派遣不计。',
  independent: '指定任务中未使用游戏提示，并留下机制操作和验收记录；与引导共用任务时，必须重新完成一份不同的动作记录。这不判断是否照抄外部答案。',
  transfer: '独立的作者迁移任务通过本关机制合同，且未使用提示；换种子与重复同关不增加迁移种类。',
  revisit: '已执行该机制后，经过两个其他主线任务的首次胜利，再用一份新动作记录无提示完成重遇；这是进度间隔，不是日历或记忆测量。',
};
const successful = (event: GameEvent) => event.success === true;
const operative = (event: GameEvent) => (event.type === 'request' || event.type === 'lab-request') && event.tool === 'operate';
const verified = (event: GameEvent) => event.type === 'verified' && successful(event) && event.realm !== 'sandbox';

/** Checkpoint IDs project known events only. No world values, answers or action payloads escape. */
function checkpointEvents(checkpoint: CoreCheckpoint, record: RecordEntry): GameEvent[] {
  const {game, source} = record, events = game.events;
  const operations = events.filter(operative), liveChecks = events.filter(verified);
  if (!operations.length || !liveChecks.length) return [];
  let selected: GameEvent[] = [];
  switch (checkpoint) {
    case 'cycle': selected = events.filter(event => operative(event) || event.type === 'result' && successful(event) && event.delivered !== false); break;
    case 'contract': if (source.goals.length > 1 || source.operations.some(operation => operation.requires)) selected = [...operations, ...liveChecks]; break;
    case 'schema': selected = operations.filter(event => event.arguments && Object.keys(event.arguments).length > 0 && source.operations.some(operation => operation.id === event.operationId && operation.protocol?.parameters.length)); break;
    case 'correlation': selected = events.filter(event => event.callId && (event.type === 'request' || event.type === 'result')); if (!selected.some(event => event.type === 'result' && successful(event) && event.delivered === true)) selected = []; break;
    case 'idempotency': selected = events.filter(event => Boolean(event.requestKey) && (operative(event) || event.type === 'result')); if (!selected.some(event => event.replayed && successful(event))) selected = []; break;
    case 'bounded-loop': if (source.limits?.missionBudget !== undefined && events.some(event => event.cost && event.cost > 0)) selected = events.filter(event => operative(event) || event.type === 'result' && event.delivered !== false || ['paused', 'resumed', 'policy-stop', 'environment'].includes(event.type)); break;
    case 'context': selected = events.filter(event => event.type === 'context-change' && event.delivered === true); break;
    case 'compression': {
      const summarizedIds = new Set(game.context?.records.filter(record => record.summaryId).map(record => record.eventId));
      selected = events.filter(event => event.type === 'context-change' && (summarizedIds.has(event.id) || game.runtime?.actionHistory.some(action => action.id === event.actionId && action.type === 'context' && action.operation === 'summarize'))); break;
    }
    case 'memory': selected = events.filter(event => event.type === 'memory-change' || event.type === 'lab-change' && event.labPhase === 'snapshot'); break;
    case 'session': selected = events.filter(event => event.type === 'session-change' || event.type === 'lab-change' && event.labPhase === 'restored'); break;
    case 'skill': selected = events.filter(event => event.type === 'skill-change'); if (!game.memory?.runs.length) selected = []; break;
    case 'trust': if (game.blueprint.instructionPolicy === 'data-only' && source.observations.some(observation => observation.directiveOperationId || observation.provenance === 'external')) selected = events.filter(event => event.type === 'observation' || event.type === 'context-change'); break;
    case 'identity': selected = events.filter(event => event.type === 'security-change' && event.principalId && successful(event)); break;
    case 'isolation': selected = events.filter(event => successful(event) && (event.permitId || event.labPermitId || event.type === 'verified' && event.realm === 'sandbox')); break;
    case 'team-input': selected = events.filter(event => event.type === 'team-change' && event.teamPhase === 'received' && successful(event)); break;
    case 'queue': selected = events.filter(event => event.type === 'team-change' && ['queued', 'waiting', 'received'].includes(event.teamPhase ?? '') || event.type === 'lab-change' && ['queued', 'completed', 'cancelled'].includes(event.labPhase ?? '')); if (!selected.some(event => event.teamPhase === 'received' || event.labPhase === 'completed')) selected = []; break;
    case 'integration': selected = events.filter(event => event.type === 'team-change' && event.teamPhase === 'merged' && successful(event)); break;
    case 'evaluation': selected = events.filter(event => event.type === 'evaluation-change' && event.evaluationPhase === 'certified' && successful(event)); break;
    case 'holdout': selected = events.filter(event => Boolean(event.evaluationRunId) && (event.firstSeen === true || event.type === 'evaluation-change' && event.evaluationPhase === 'completed')); if (!game.evaluation?.runs.some(run => run.firstSeen && run.status === 'completed' && (source.evaluation?.cases.some(item => item.id === run.caseId && (item.category === 'holdout' || item.category === 'exception')) || source.transferRequirement?.evaluation?.freshCaseIds?.includes(run.caseId) || run.report === 'unknown'))) selected = []; break;
    case 'modules': selected = events.filter(event => event.type === 'lab-change' && ['configured', 'activated', 'unloaded', 'restored'].includes(event.labPhase ?? '')); break;
  }
  if (!selected.length) return [];
  return [...new Map([...selected, ...liveChecks, ...events.filter(event => event.type === 'victory' && successful(event))].map(event => [event.id, event])).values()];
}

function proof(record: RecordEntry, events: readonly GameEvent[]): CoreProof {
  return {scenarioId: record.source.id, title: record.source.title, eventIds: events.map(event => event.id), hintUsed: record.game.hintUsed};
}
function isComplete(record: RecordEntry): boolean {
  return record.game.status === 'won' && record.game.learningEvidence.some(evidence => evidence.scenarioId === record.source.id && evidence.level !== 'seen');
}
function distinctProofs(records: readonly RecordEntry[], concept: CoreConceptDefinition, stage: CoreStageId, revisitStartIndex: number): CoreProof[] {
  const candidates = records.filter(record => concept.routes[stage].includes(record.source.id) && isComplete(record));
  // A source may offer both teaching and replay. One action trace is one encounter, not two.
  const guidedAnchor = records.find(record => concept.routes.guided.includes(record.source.id) && isComplete(record) && checkpointEvents(concept.checkpoint, record).length > 0);
  const accepted: CoreProof[] = [];
  for (const record of candidates) {
    if (stage === 'guided' && record.fingerprint !== guidedAnchor?.fingerprint) continue;
    if (stage !== 'guided' && (record.game.hintUsed || record.game.kernelVersion === 1)) continue;
    if (stage === 'independent' && concept.routes.guided.includes(record.source.id) && (!guidedAnchor || record.fingerprint === guidedAnchor.fingerprint)) continue;
    if (stage === 'transfer' && (record.source.kind !== 'transfer' || !record.game.learningEvidence.some(item => item.level === 'independent-transfer'))) continue;
    if (stage === 'revisit') {
      if (record.index < revisitStartIndex) continue;
      const initial = records.find(earlier => earlier.index >= revisitStartIndex && earlier.index < record.index && isComplete(earlier) && Object.values(concept.routes).some(ids => ids.includes(earlier.source.id)) && checkpointEvents(concept.checkpoint, earlier).length > 0);
      if (!initial) continue;
      const firstMainWins = new Map<string, RecordEntry>();
      for (const item of records) if (item.index >= revisitStartIndex && isComplete(item) && mainIds.has(item.source.id) && !firstMainWins.has(item.source.id)) firstMainWins.set(item.source.id, item);
      const intervening = [...firstMainWins.values()].filter(item => item.index > initial.index && item.index < record.index && item.source.id !== initial.source.id && item.source.id !== record.source.id);
      if (intervening.length < 2) continue;
    }
    const checkpoints = checkpointEvents(concept.checkpoint, record);
    if (checkpoints.length) accepted.push(proof(record, checkpoints));
  }
  return accepted;
}

/** Legacy envelopes and official replay validation stay unchanged; no caller definitions are trusted. */
export function deriveCoreCurriculum(games: readonly GameState[], options: CoreCurriculumOptions = {}): CoreCurriculum {
  const records: RecordEntry[] = [], unique = new Map<string, number>();
  let ignoredRecordCount = 0;
  const revisitStartIndex = Number.isSafeInteger(options.revisitStartIndex) && options.revisitStartIndex! >= 0 ? options.revisitStartIndex! : 0;
  for (const [index, game] of games.entries()) {
    try {
      const source = sourceById.get(game.scenarioId);
      if (!source || !validateGameState(source, game)) {ignoredRecordCount++; continue;}
      // A new seed with the same action IDs is still the same submitted operation record.
      const fingerprint = JSON.stringify([source.id, game.attempt, game.processedActionIds]);
      const duplicate = unique.get(fingerprint);
      if (duplicate !== undefined) {
        // The current profile may also contain the exact completion just committed to history.
        // Its first attested history occurrence replaces the unordered projection, not the proof.
        if (index >= revisitStartIndex && records[duplicate].index < revisitStartIndex) records[duplicate] = {source, game, index, fingerprint};
        continue;
      }
      unique.set(fingerprint, records.length); records.push({source, game, index, fingerprint});
    } catch {ignoredRecordCount++;}
  }
  records.sort((left, right) => left.index - right.index);
  const courierProofs = courierLearningProofs(options.courierProgress).map(proof => ({scenarioId: proof.scenarioId, title: proof.title, eventIds: [...proof.eventIds], hintUsed: false, sourceKind: 'courier-module' as const}));
  const concepts = CORE_CONCEPTS.map(concept => {
    const stages = STAGES.map(id => {
      const proofs = distinctProofs(records, concept, id, revisitStartIndex);
      if (concept.id === 'idempotent-effects' && id === 'transfer') proofs.push(...courierProofs);
      return {id, label: labels[id], status: proofs.length ? 'evidenced' : 'pending', scenarioIds: [...concept.routes[id]], proofs, explanation: explanations[id],
        ...(id === 'transfer' && concept.transferGap && !proofs.length ? {gap: concept.transferGap} : {}),
      } satisfies CoreStage;
    });
    const nextScenarioId = stages.find(stage => stage.status === 'pending' && stage.scenarioIds.length)?.scenarioIds[0];
    const nextNeedsReplay = nextScenarioId ? records.some(record => record.source.id === nextScenarioId && isComplete(record)) : false;
    return {...concept, aliases: [...concept.aliases], prerequisites: [...concept.prerequisites], routes: structuredClone(concept.routes), stages, ...(nextScenarioId ? {nextScenarioId, nextNeedsReplay} : {})};
  });
  const evidencedStages = concepts.reduce((total, concept) => total + concept.stages.filter(stage => stage.status === 'evidenced').length, 0);
  return {concepts, counts: {concepts: concepts.length, totalStages: concepts.length * STAGES.length, evidencedStages, pendingStages: concepts.length * STAGES.length - evidencedStages,
    transferConcepts: concepts.filter(concept => concept.stages.find(stage => stage.id === 'transfer')!.status === 'evidenced').length,
    revisitedConcepts: concepts.filter(concept => concept.stages.find(stage => stage.id === 'revisit')!.status === 'evidenced').length}, ignoredRecordCount};
}
