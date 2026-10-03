import type {GameAction,GameState,ScenarioDefinition} from '../engine/types';
import type {ChapterOneWalkthrough} from '../content/chapterOne';
/** Factory versions are frozen alongside their source scenarios and reducers. */
export interface ChallengeSpec {factoryVersion:1;templateId:string;seed:number;}
export interface ChallengeTemplate {id:string;label:string;mechanism:string;sourceScenarioId:string;tier:1|2|3;decision:string;}
export interface ChallengeInstance {spec:ChallengeSpec;id:string;template:ChallengeTemplate;decisionVariantKey:string;scenario:ScenarioDefinition;routes:ChapterOneWalkthrough[];referenceCost:number;recoveryCost:number;}
export interface ChallengeReplay {state:GameState;actions:GameAction[];cost:number;rejected:number;failedEvents:number;faultEventIds:string[];}
export interface ChallengeValidation {valid:boolean;errors:string[];routeCosts:Record<string,number>;}
export interface ExpeditionSpec {factoryVersion:1;seed:number;}
export interface ExpeditionDefinition {spec:ExpeditionSpec;id:string;floors:[ChallengeSpec,ChallengeSpec,ChallengeSpec];initialBudget:number;referenceCost:number;}
export interface ExpeditionAttempt {floor:0|1|2;spec:ChallengeSpec;initialBudget:number;game:GameState;actions:GameAction[];cost:number;}
export interface ExpeditionState {version:1;definition:ExpeditionDefinition;floor:0|1|2;floorStartBudget:number;remaining:number;status:'active'|'cleared'|'abandoned';game:GameState;currentActions:GameAction[];attempts:ExpeditionAttempt[];finished:ExpeditionAttempt[];history:ExpeditionAction[];}
export type ExpeditionAction={type:'game';action:GameAction}|{type:'advance'}|{type:'retry-floor'}|{type:'abandon'};

/** firstEncounter is optional legacy display metadata, never learning evidence. */
export interface ChallengeRecord {spec:ChallengeSpec;game:GameState;firstEncounter?:boolean;}
export interface CapabilityGrowth {mechanism:string;level:'unseen'|'seen'|'guided'|'independent-transfer';freshWins:number;practiceWins:number;variantKeys:string[];}
