import type { ExecutionRealm, FactMap, GameEvent, ObservationRecord, SourceProvenance, ToolCall, ToolName } from './types';

/** Finite teaching host contracts. These are neither real product plugins nor model internals. */
export interface LabRule {tool:ToolName|'*';target:string;decision:'allow'|'ask'|'deny';}
export interface LabProvider {id:string;label:string;models:Array<{id:string;label:string;adapter:'tool-v1'|'text-only'}>;}
export interface LabRole {id:string;label:string;tools:ToolName[];rules:LabRule[];}
export interface LabSource {
 senderId:string;channelId:string;accountId:string;peerId:string;displayName:string;replyTarget:string;
}
export interface LabStep {call:ToolCall;whenKnown?:FactMap;}
export interface LabMessage {
 id:string;label:string;source:LabSource;
 /** Authored incoming statements, not an implicit read of the world or identity authority. */
 facts:FactMap;steps:LabStep[];tools:ToolName[];targets:string[];
}
export type LabRouting='main'|'sender'|'channel-sender';
export type LabQueueMode='followup'|'collect'|'interrupt'|'steer';
export interface LabModule {
 id:string;label:string;kind:'model'|'loop'|'tools'|'storage'|'extension';
 interfaceVersion:1|2;requires:string[];tools?:ToolName[];operationIds?:string[];
 projectResource?:boolean;initialRealm?:ExecutionRealm;mountableTargets?:string[];initialMounts?:string[];
 logFormat?:1|2;
}
export interface BlueprintLabDefinition {
 providers?:LabProvider[];roles?:LabRole[];
 /** Write reachability is independent of role rules and request approval. */
 workspaceTargets?:string[];messages?:LabMessage[];memorySnapshot?:boolean;
 modules?:LabModule[];interfaceVersion?:1|2;
 initial?:{providerId?:string;modelId?:string;roleId?:string;workspaceTargets?:string[];routing?:LabRouting;moduleIds?:string[];projectTrusted?:boolean};
}
export interface LabOperation {moduleId?:string;/** Only a queued original sender can use this reply. */reply?:boolean;}
export interface LabSnapshotRecord {memoryId:string;key:string;revision:number;facts:FactMap;provenance?:SourceProvenance;}
export interface LabTask {
 id:string;messageId:string;sessionKey:string;source:LabSource;steps:LabStep[];
 providerId:string;modelId:string;roleId:string;rules:LabRule[];tools:ToolName[];targets:string[];
 cursor:number;status:'queued'|'running'|'waiting-approval'|'succeeded'|'failed'|'cancelled';
 observed:Record<string,ObservationRecord>;eventIds:string[];started:boolean;
}
export interface LabPermit {
 id:string;call:ToolCall;taskId?:string;moduleId?:string;roleId:string;realm:ExecutionRealm;
 configurationRevision:number;worldRevision:number;consumed:boolean;
}
export interface BlueprintLabState {
 providerId:string;modelId:string;roleId:string;rules:Record<string,LabRule[]>;
 workspaceTargets:string[];configurationRevision:number;permits:LabPermit[];
 routing:LabRouting;tasks:LabTask[];nextTask:number;generation:number;
 sessions:Record<string,{observed:Record<string,ObservationRecord>;messageIds:string[]}>;
 storeVersion:number;snapshots:Record<string,{storeVersion:number;records:LabSnapshotRecord[]}>;
 projectTrusted:boolean;activeModuleIds:string[];
 moduleScopes:Record<string,{realm:ExecutionRealm;mounts:string[]}>;
 registrations:Array<{moduleId:string;kind:'tool'|'listener';name:string}>;
 log:{format:1;providerId?:string;entries:GameEvent[];committedSequence:number};
 uiSignal?:string;
}
export type LabAction =
 | {id:string;type:'lab';operation:'select-model';providerId:string;modelId:string}
 | {id:string;type:'lab';operation:'select-role';roleId:string}
 | {id:string;type:'lab';operation:'rules';roleId:string;rules:LabRule[]}
 | {id:string;type:'lab';operation:'workspace';targets:string[]}
 | {id:string;type:'lab';operation:'approve';call:ToolCall;taskId?:string;moduleId?:string}
 | {id:string;type:'lab';operation:'router';routing:LabRouting}
 | {id:string;type:'lab';operation:'enqueue';messageId:string;mode:LabQueueMode}
 | {id:string;type:'lab';operation:'tick';taskId:string}
 | {id:string;type:'lab';operation:'cancel';taskId:string}
 | {id:string;type:'lab';operation:'trust-project';trusted:boolean}
 | {id:string;type:'lab';operation:'activate';moduleIds:string[]}
 | {id:string;type:'lab';operation:'module-scope';moduleId:string;realm:ExecutionRealm;mounts:string[]}
 | {id:string;type:'lab';operation:'invoke';moduleId:string;call:Extract<ToolCall,{tool:'operate'}>}
 | {id:string;type:'lab';operation:'commit'}
 | {id:string;type:'lab';operation:'power-cycle'}
 | {id:string;type:'lab';operation:'ui-signal';signal:string};
export type LabEventType='lab-change'|'lab-request'|'lab-observation'|'lab-result'|'lab-verified';
export interface LabEventFields {
 labTaskId?:string;labMessageId?:string;labSessionKey?:string;labSource?:LabSource;labModuleId?:string;
 labPhase?:'configured'|'routed'|'queued'|'input'|'started'|'skipped'|'waiting'|'failed'|'completed'|'cancelled'|'approved'|'activated'|'unloaded'|'snapshot'|'committed'|'restored'|'ui';
 labConfigurationRevision?:number;labStoreVersion?:number;labSnapshotVersion?:number;
 labProviderId?:string;labModelId?:string;labRoleId?:string;labPermitId?:string;labQueueMode?:LabQueueMode;
 labModuleIds?:string[];
 labFieldProvenance?:Record<string,SourceProvenance>;
}
export interface LabTransferRequirement {messageIds?:string[];queueModes?:LabQueueMode[];modelIds?:string[];roleIds?:string[];moduleIds?:string[];snapshotReload?:boolean;approvalUsed?:boolean;committedRestore?:boolean;}
