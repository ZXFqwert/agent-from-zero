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
}

export interface OperationDefinition {
  id: string;
  target: string;
  label: string;
  requires?: FactMap;
  effects: FactMap;
  successText: string;
  failureText: string;
}

export interface GoalDefinition {
  fact: string;
  equals: FactValue;
  label: string;
  operationId: string;
}

export interface ScenarioDefinition {
  id: string;
  version?: number;
  title: string;
  subtitle: string;
  brief: string;
  npc: string;
  location: 'lighthouse' | 'warehouse' | 'boss';
  chapter: number;
  kind: 'guided' | 'transfer' | 'boss';
  initialWorld: FactMap;
  observations: ObservationDefinition[];
  operations: OperationDefinition[];
  goals: GoalDefinition[];
  concepts: string[];
}

export interface AgentBlueprint {
  tools: ToolName[];
  feedback: boolean;
  verification: boolean;
  budget: number;
  /** '*' grants access to every authored virtual target. */
  permissions: string[];
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
  type: 'configured' | 'dispatched' | 'request' | 'observation' | 'result' | 'claim' | 'verified' | 'victory' | 'paused' | 'resumed' | 'exhausted' | 'blocked' | 'reset';
  text: string;
  tool?: ToolName;
  target?: string;
  operationId?: string;
  callId?: string;
  facts?: FactMap;
  success?: boolean;
  /** Whether facts in this event were supplied to the companion. */
  delivered?: boolean;
}

export interface LearningEvidence {
  concept: string;
  scenarioId: string;
  level: 'seen' | 'guided' | 'independent-transfer';
  eventIds: string[];
}

export type GameStatus = 'ready' | 'running' | 'paused' | 'stalled' | 'exhausted' | 'won';

export interface GameState {
  kernelVersion: 1;
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
}

export type ToolCall =
  | { tool: 'observe'; observationId: string }
  | { tool: 'operate'; operationId: string }
  | { tool: 'verify'; fact: string };

export type GameAction =
  | { id: string; type: 'configure'; blueprint: AgentBlueprint }
  | { id: string; type: 'dispatch' }
  | { id: string; type: 'step' }
  | { id: string; type: 'pause' }
  | { id: string; type: 'resume' }
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
