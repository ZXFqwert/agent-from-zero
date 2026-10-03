export type FactValue = boolean | number | string;
export type FactMap = Record<string, FactValue>;
export type ToolName = 'observe' | 'operate' | 'verify';

export interface ObservationDefinition {
  id: string;
  target: string;
  label: string;
  /** Only these facts enter the companion's context. */
  facts: string[];
  text: string;
  cost?: number;
}

export interface OperationDefinition {
  id: string;
  target: string;
  label: string;
  requires?: FactMap;
  effects: FactMap;
  successText: string;
  failureText: string;
  cost?: number;
  /** Actual cost when physical prerequisites fail; defaults to the normal cost. */
  failureCost?: number;
}

export interface GoalDefinition {
  fact: string;
  equals: FactValue;
  label: string;
  operationId: string;
  verifyCost?: number;
}

export interface ScenarioLimits {
  toolCapacity?: 1 | 2 | 3;
  toolCosts?: Partial<Record<ToolName, number>>;
  maxBudget?: number;
  missionBudget?: number;
  maxPermissionTargets?: Partial<Record<ToolName, number>>;
}

export interface WorldHook {
  id: string;
  trigger: { type: 'after-call'; call: number } | { type: 'after-operation'; operationId: string };
  when?: FactMap;
  effects?: FactMap;
  notice?: { text: string; trust: 'environment' | 'untrusted'; reportedFacts?: FactMap };
}

export interface ScenarioDefinition {
  id: string;
  version?: number;
  title: string;
  subtitle: string;
  brief: string;
  npc: string;
  location: 'lighthouse' | 'warehouse' | 'boss';
  art?: 'harbor' | 'warehouse' | 'tide' | 'ferry';
  chapter: number;
  kind: 'guided' | 'transfer' | 'boss';
  initialWorld: FactMap;
  observations: ObservationDefinition[];
  operations: OperationDefinition[];
  goals: GoalDefinition[];
  concepts: string[];
  /** Existing v1 adventures retain their original reducer and replay format. */
  engineVersion?: 1 | 2;
  limits?: ScenarioLimits;
  hooks?: WorldHook[];
  transferRequirement?: { operationIds?: string[]; reconfiguration?: boolean };
}

export interface AgentBlueprint {
  tools: ToolName[];
  feedback: boolean;
  verification: boolean;
  budget: number;
  /** '*' grants access to every authored virtual target. */
  permissions: string[];
  goalOrder?: string[];
  toolPermissions?: Partial<Record<ToolName, string[]>>;
}

export interface ObservationRecord {
  value: FactValue;
  source: 'observation' | 'receipt' | 'verification';
  eventId: string;
}

export interface GameEvent {
  id: string;
  sequence: number;
  attempt: number;
  type: 'configured' | 'dispatched' | 'request' | 'observation' | 'result' | 'claim' | 'verified' | 'victory' | 'paused' | 'resumed' | 'exhausted' | 'blocked' | 'reset' | 'world-change' | 'untrusted-message' | 'environment';
  text: string;
  tool?: ToolName;
  target?: string;
  operationId?: string;
  callId?: string;
  actionId?: string;
  facts?: FactMap;
  success?: boolean;
  /** Whether facts in this event were supplied to the companion. */
  delivered?: boolean;
  hookId?: string;
  cost?: number;
  reportedFacts?: FactMap;
}

export interface LearningEvidence {
  concept: string;
  scenarioId: string;
  level: 'seen' | 'guided' | 'independent-transfer';
  eventIds: string[];
}

export type GameStatus = 'ready' | 'running' | 'paused' | 'stalled' | 'exhausted' | 'won';

export interface GameState {
  kernelVersion: 1 | 2;
  scenarioId: string;
  scenarioVersion: number;
  seed: number;
  world: FactMap;
  observed: Record<string, ObservationRecord>;
  blueprint: AgentBlueprint;
  status: GameStatus;
  budgetRemaining: number;
  attempt: number;
  events: GameEvent[];
  verifiedGoals: string[];
  processedActionIds: string[];
  learningEvidence: LearningEvidence[];
  hintUsed: boolean;
  runtime?: {
    missionRemaining: number;
    toolCalls: number;
    triggeredHookIds: string[];
    executionMode: 'manual' | 'automatic';
    actionHistory: GameAction[];
  };
}

export type ToolCall =
  | { tool: 'observe'; observationId: string }
  | { tool: 'operate'; operationId: string }
  | { tool: 'verify'; fact: string };

export type GameAction =
  | { id: string; type: 'configure'; blueprint: AgentBlueprint }
  | { id: string; type: 'dispatch'; mode?: 'manual' | 'automatic' }
  | { id: string; type: 'step'; source?: 'player' | 'scheduler' }
  | { id: string; type: 'pause' }
  | { id: string; type: 'resume'; mode?: 'manual' | 'automatic' }
  | { id: string; type: 'tool'; call: ToolCall }
  | { id: string; type: 'hint' }
  | { id: string; type: 'reset'; preserveBlueprint?: boolean };

export interface SaveEnvelope {
  saveVersion: 1;
  kernelVersion: 1;
  contentVersion: string;
  savedAt: string;
  currentScenarioId: string;
  games: Record<string, GameState>;
  completedScenarioIds: string[];
  evidence: LearningEvidence[];
  checkpoints: Array<{ scenarioId: string; state: GameState }>;
}
