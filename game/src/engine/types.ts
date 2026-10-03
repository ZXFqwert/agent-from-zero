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
  document?: { units: number; source: string; summaries?: Array<{id: string; label: string; units: number; retain: string[]}> };
  availableWhen?: FactMap;
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
  protocol?: ToolProtocol;
  failureKind?: 'temporary' | 'permanent';
  /** Authored clock: after N rejected attempts the physical device becomes ready. */
  retryWindow?: { attempts: number; readyFact: string };
  /** Inputs extracted from the active documents, distinct from physical prerequisites. */
  contextRequires?: FactMap;
  contextMatches?: string[];
  memoryRequires?: string[];
  sessionRequires?: { fresh?: number; restored?: number; forks?: number; activeId?: 'session-1'; activeKind?: 'fresh' | 'fork' | 'initial' };
  skillRequires?: { skillId: string; afterOperationId?: string };
}

export interface ParameterField {
  name: string; label: string; type: 'string' | 'integer' | 'boolean'; required: boolean;
  choices: Array<{label: string; value: FactValue}>;
  enum?: FactValue[]; minimum?: number; maximum?: number;
}
export interface ToolProtocol {
  parameters: ParameterField[];
  defaults: FactMap;
  delivery?: 'immediate' | 'deferred' | 'lost-once';
  /** Effects of matching a real receipt into the local coordination register. */
  receiptEffects?: FactMap;
  variants: Array<{when: FactMap; effects?: FactMap; deltas?: Record<string, number>;
    guards?: Array<{fact: string; atLeast: number}>; text?: string}>;
}
export interface ProtocolReceipt {
  id: string; callId: string; operationId: string; success: boolean; text: string; facts: FactMap;
  receiptEffects: FactMap; collected: boolean;
}
export interface ProtocolLedgerEntry { key: string; fingerprint: string; receipt: ProtocolReceipt; }

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
  art?: 'harbor' | 'warehouse' | 'tide' | 'ferry' | 'forge' | 'clock' | 'corridor' | 'archive';
  chapter: number;
  kind: 'guided' | 'transfer' | 'boss';
  initialWorld: FactMap;
  observations: ObservationDefinition[];
  operations: OperationDefinition[];
  goals: GoalDefinition[];
  concepts: string[];
  /** Existing v1 adventures retain their original reducer and replay format. */
  engineVersion?: 1 | 2 | 3 | 4 | 5 | 6;
  contextCapacity?: number;
  memory?: { slots: Array<{key: string; label: string; observationIds: string[]}>; initial: MemorySeed[]; skills: SkillDefinition[]; initialSkills?: string[] };
  limits?: ScenarioLimits;
  hooks?: WorldHook[];
  transferRequirement?: { operationIds?: string[]; reconfiguration?: boolean; receiptCount?: number; contextIds?: string[]; summaryIds?: string[]; memoryKeys?: string[]; skillIds?: string[]; freshSessions?: number };
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
  toolArguments?: Record<string, FactMap>;
  stableRequestKeys?: boolean;
  loopPolicy?: LoopPolicy;
}

export interface LoopPolicy { maxCalls: number; maxRetries: number; permanentFailure: 'stop' | 'repair'; }

export interface ObservationRecord {
  value: FactValue;
  source: 'observation' | 'receipt' | 'verification' | 'memory';
  eventId: string;
}

export interface GameEvent {
  id: string;
  sequence: number;
  attempt: number;
  type: 'configured' | 'dispatched' | 'request' | 'observation' | 'result' | 'claim' | 'verified' | 'victory' | 'paused' | 'resumed' | 'exhausted' | 'blocked' | 'reset' | 'world-change' | 'untrusted-message' | 'environment' | 'policy-stop' | 'context-change' | 'memory-change' | 'session-change' | 'skill-change';
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
  arguments?: FactMap;
  requestKey?: string;
  receiptId?: string;
  replayed?: boolean;
  failureKind?: 'temporary' | 'permanent';
}

export interface LearningEvidence {
  concept: string;
  scenarioId: string;
  level: 'seen' | 'guided' | 'independent-transfer';
  eventIds: string[];
}

export type GameStatus = 'ready' | 'running' | 'paused' | 'stalled' | 'exhausted' | 'won';

export interface GameState {
  kernelVersion: 1 | 2 | 3 | 4 | 5 | 6;
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
  context?: { records: ContextRecord[]; activeIds: string[]; capacity: number; reply?: {facts: FactMap; source: ObservationRecord['source']; eventId: string} };
  memory?: { entries: MemoryEntry[]; skills: Array<{id: string; source: string; actionIds: string[]}>;
    queue?: {skillId: string; cursor: number; status: 'running' | 'failed'};
    runs: Array<{skillId: string; actionId: string; sequence: number}> };
  sessions?: { activeId: string; branches: Array<{id: string; label: string; parentId?: string; context: NonNullable<GameState['context']>}>;
    fresh: number; restored: number; forks: number };
  protocol?: { receipts: ProtocolReceipt[]; ledger: ProtocolLedgerEntry[]; droppedOperations: string[] };
  control?: { dispatchCalls: number; failures: Record<string, number>; attempts: Record<string, number>;
    lastFailure?: { operationId: string; call: ToolCall; kind: 'temporary' | 'permanent'; eventId: string };
    stopReason?: 'call-limit' | 'retry-limit' | 'permanent-failure' };
  runtime?: {
    missionRemaining: number;
    toolCalls: number;
    triggeredHookIds: string[];
    executionMode: 'manual' | 'automatic';
    actionHistory: GameAction[];
  };
}

export interface ContextRecord {
  id: string; observationId: string; label: string; source: string; text: string;
  eventId: string; facts: FactMap; units: number; summaryId?: string;
  origin?: {kind: 'memory'; memoryId: string; revision: number};
}

export interface MemorySeed { key: string; observationId: string; facts: FactMap; source: string; }
export interface MemoryEntry extends MemorySeed { id: string; label: string; units: number; revision: number; status: 'active' | 'retired'; sourceActionId?: string; }
export interface SkillDefinition { id: string; label: string; description: string; applicability: FactMap; steps: ToolCall[]; }

export type ToolCall =
  | { tool: 'observe'; observationId: string }
  | { tool: 'operate'; operationId: string; arguments?: FactMap; requestKey?: string }
  | { tool: 'verify'; fact: string };

export type GameAction =
  | { id: string; type: 'configure'; blueprint: AgentBlueprint }
  | { id: string; type: 'dispatch'; mode?: 'manual' | 'automatic' }
  | { id: string; type: 'step'; source?: 'player' | 'scheduler' }
  | { id: string; type: 'pause' }
  | { id: string; type: 'resume'; mode?: 'manual' | 'automatic' }
  | { id: string; type: 'tool'; call: ToolCall }
  | { id: string; type: 'receive'; callId: string; receiptId: string }
  | { id: string; type: 'context'; operation: 'include' | 'exclude' | 'summarize' | 'expand'; recordId: string; summaryId?: string }
  | { id: string; type: 'memory'; operation: 'write' | 'revise' | 'retire' | 'recall'; key: string; recordId?: string }
  | { id: string; type: 'session'; operation: 'fresh' | 'fork' | 'switch'; branchId?: string; label?: string }
  | { id: string; type: 'skill'; operation: 'save' | 'run' | 'cancel'; skillId: string }
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
