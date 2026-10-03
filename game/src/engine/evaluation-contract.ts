import type { FactMap, FactValue, ObservationRecord, SourceProvenance, ToolCall } from './types';

/** Proposed v9 contract; this file does not route or change any published kernel. */
export interface EvaluationStep { call: ToolCall; whenKnown?: FactMap; }
export interface EvaluationCandidate {
 id: string; label: string; description: string; steps: EvaluationStep[];
 /** Explicit tool boundary, independent of the city's authenticated player identity. */
 tools: Array<'observe'|'operate'|'verify'>; permissions: string[];
}
export interface EvaluationCase {
 id: string; label: string; description: string;
 /** Authored finite fixture, isolated from the actual city; never a success lookup. */
 initialOverrides: FactMap; category: 'normal'|'boundary'|'exception'|'holdout';
}
export interface EvaluationMetric { id: string; label: string; observationId: string; fact: string; }
export interface EvaluationCriterion {
 id: string; label: string; metricId: string;
 /** Exactly one equality test or numeric bounds; unknown never passes. */
 equals?: FactValue; atLeast?: number; atMost?: number;
}
export interface EvaluationDefinition {
 /** A design/configuration fact, never a task success condition. */
 candidateFact: string;
 candidates: EvaluationCandidate[]; cases: EvaluationCase[];
 metrics: EvaluationMetric[]; criteria: EvaluationCriterion[];
 gate: { caseIds: string[]; criterionIds: string[]; requireAll?: boolean };
}
export interface EvaluationMeasurement {
 metricId: string; known: boolean; value?: FactValue; eventId: string;
 provenance: SourceProvenance;
}
export interface EvaluationRun {
 id: string; caseId: string; candidateId: string; candidateRevision: number; contractRevision: number;
 criterionIds: string[]; aggregation: 'all'|'any'; firstSeen: boolean;
 world: FactMap; observed: Record<string,ObservationRecord>;
 cursor: number; metricCursor: number;
 status: 'queued'|'running'|'measuring'|'completed'|'cancelled'|'exhausted';
 toolFailed: boolean; measurements: EvaluationMeasurement[];
 checks: Array<{ criterionId: string; status: 'pass'|'fail'|'unknown' }>;
 report?: 'pass'|'fail'|'unknown'; eventIds: string[];
}
export interface EvaluationState {
 candidateId?: string; criterionIds: string[]; aggregation: 'all'|'any';
 candidateRevision: number; contractRevision: number;
 runs: EvaluationRun[]; activeRunId?: string;
 nextRun: number; generation: number; seenCaseIds: string[];
 seal?: {candidateId: string; candidateRevision: number; contractRevision: number};
 certificate?: { id: string; candidateId: string; candidateRevision: number; contractRevision: number; runIds: string[]; eventId: string };
}
export type EvaluationAction =
 | { id: string; type: 'evaluation'; operation: 'configure'; candidateId: string; criterionIds: string[]; aggregation: 'all'|'any' }
 | { id: string; type: 'evaluation'; operation: 'seal' }
 | { id: string; type: 'evaluation'; operation: 'run'; caseId: string }
 | { id: string; type: 'evaluation'; operation: 'tick' }
 | { id: string; type: 'evaluation'; operation: 'cancel' }
 | { id: string; type: 'evaluation'; operation: 'certify' }
 | { id: string; type: 'evaluation'; operation: 'mark-seen'; caseIds: string[] };

/** Dedicated event families prevent fixture success becoming city/identity/skill proof. */
export type EvaluationEventType = 'evaluation-change'|'evaluation-request'|'evaluation-observation'|'evaluation-result'|'evaluation-verified';
export interface EvaluationEventFields {
 evaluationRunId?: string; evaluationCaseId?: string; evaluationCandidateId?: string;
 evaluationPhase?: 'configured'|'sealed'|'queued'|'started'|'skipped'|'measuring'|'completed'|'cancelled'|'certified'|'rejected'|'exposed';
 candidateRevision?: number; contractRevision?: number; metricId?: string; firstSeen?: boolean;
}
