import type {FactValue,GameEvent,GameState,ScenarioDefinition,SourceProvenance} from '../engine/types';

/** Background effects are internal truth. A recorded observation or receipt is a disclosure. */
function factsWereDisclosed(event:GameEvent):boolean {
 return ['observation','result','verified','lab-observation','lab-result','lab-verified','evaluation-observation','evaluation-result','evaluation-verified'].includes(event.type)
  ||event.type==='team-change'&&['received','published','merged'].includes(event.teamPhase??'')
  ||event.type==='lab-change'&&event.labPhase==='input';
}
export function journalPublicEvents(replay:GameState,hideUnobservedWorld=false):GameEvent[] {
 if(!hideUnobservedWorld)return replay.events;
 return replay.events.map(event=>{
  const {facts,reportedFacts,...metadata}=event;
  return {...metadata,...(facts&&factsWereDisclosed(event)?{facts}:{}),...(reportedFacts&&['environment','untrusted-message'].includes(event.type)?{reportedFacts}:{})};
 });
}
export interface JournalFactDisclosure {
 fact:string;value:FactValue;eventId:string;sequence:number;realm:'live'|'sandbox';source:string;
 actorId?:string;caseId?:string;runId?:string;provenance?:SourceProvenance;
}
export function journalFactDisclosures(replay:GameState,scenario:ScenarioDefinition):JournalFactDisclosure[] {
 return journalPublicEvents(replay,true).flatMap(event=>{
  const isReport=event.type==='environment'||event.type==='untrusted-message';
  return Object.entries(isReport?event.reportedFacts??{}:event.facts??{}).map(([fact,value])=>{
   const card=replay.context?.records.find(r=>r.eventId===event.id),observation=event.tool==='observe'?scenario.observations.find(o=>o.target===event.target&&o.facts.includes(fact)):undefined;
   const provenance=event.labFieldProvenance?.[fact]??card?.fieldProvenance?.[fact]??card?.provenance??(observation?{observationId:observation.id,trust:observation.provenance??'external',realm:event.realm??'live'} as SourceProvenance:undefined);
   return {fact,value,eventId:event.id,sequence:event.sequence,realm:provenance?.realm??event.realm??'live',source:isReport?'环境转述 · 尚待核实':event.tool==='observe'?'观测报告':event.tool==='verify'?'实际检查记录':event.teamPhase==='received'?'伙伴交接':event.teamPhase==='published'?'共享板发布':event.teamPhase==='merged'?'文档合并回执':event.labPhase==='input'?'原始来信正文':'行动回执',...(event.actorId?{actorId:event.actorId}:{}),...(event.evaluationCaseId?{caseId:event.evaluationCaseId}:{}),...(event.evaluationRunId?{runId:event.evaluationRunId}:{}),...(provenance?{provenance}:{})};
  });
 });
}

/** Explicit public lifecycle fields prevent newly added private state from entering a host dump. */
export function journalTechnicalProjection(replay:GameState,hideUnobservedWorld=false):Record<string,unknown> {
 const base={blueprint:replay.blueprint,context:replay.observed,events:journalPublicEvents(replay,hideUnobservedWorld).slice(-8)};
 if(!hideUnobservedWorld)return {...base,...(replay.lab?{host:replay.lab}:{}),...(replay.team?{team:replay.team}:{}),...(replay.evaluation?{evaluation:replay.evaluation}:{})};
 return {...base,
  ...(replay.lab?{host:{providerId:replay.lab.providerId,modelId:replay.lab.modelId,roleId:replay.lab.roleId,configurationRevision:replay.lab.configurationRevision,rules:replay.lab.rules,workspaceTargets:replay.lab.workspaceTargets,routing:replay.lab.routing,projectTrusted:replay.lab.projectTrusted,activeModuleIds:replay.lab.activeModuleIds,moduleScopes:replay.lab.moduleScopes,registrations:replay.lab.registrations,storeVersion:replay.lab.storeVersion,
   tasks:replay.lab.tasks.map(t=>({id:t.id,messageId:t.messageId,sessionKey:t.sessionKey,providerId:t.providerId,modelId:t.modelId,roleId:t.roleId,cursor:t.cursor,status:t.status,started:t.started,eventIds:t.eventIds})),
   snapshots:Object.fromEntries(Object.entries(replay.lab.snapshots).map(([id,s])=>[id,{storeVersion:s.storeVersion,recordCount:s.records.length}])),
   log:{providerId:replay.lab.log.providerId,format:replay.lab.log.format,committedSequence:replay.lab.log.committedSequence,eventIds:replay.lab.log.entries.map(e=>e.id)},
  }}:{}),
  ...(replay.team?{team:{actors:replay.team.actors.map(actor=>({id:actor.id,blueprint:actor.blueprint})),scheduler:replay.team.scheduler,
   tasks:replay.team.tasks.map(t=>({id:t.id,jobId:t.jobId,actorId:t.actorId,sequence:t.sequence,blueprint:t.blueprint,sourceRecordIds:t.sourceRecordIds,afterTaskIds:t.afterTaskIds,cursor:t.cursor,status:t.status,remainingBudget:t.remainingBudget,eventIds:t.eventIds,waitingReason:t.waitingReason,failureReason:t.failureReason,resultId:t.resultId})),
   results:replay.team.results.map(r=>({id:r.id,taskId:r.taskId,actorId:r.actorId,jobId:r.jobId,sourceEventIds:r.sourceEventIds,received:r.received,recordId:r.recordId})),
   proposals:replay.team.proposals.map(p=>({id:p.id,taskId:p.taskId,actorId:p.actorId,artifactId:p.artifactId,baseRevision:p.baseRevision,sourceEventId:p.sourceEventId,merged:p.merged})),
   board:replay.team.board.map(b=>({id:b.id,revision:b.revision,publishedEventId:b.publishedEventId})),artifacts:replay.team.artifacts.map(a=>({id:a.id,revision:a.revision,mergeEventIds:a.mergeEventIds})),
  }}:{}),
  ...(replay.evaluation?{evaluation:{candidateId:replay.evaluation.candidateId,criterionIds:replay.evaluation.criterionIds,aggregation:replay.evaluation.aggregation,candidateRevision:replay.evaluation.candidateRevision,contractRevision:replay.evaluation.contractRevision,activeRunId:replay.evaluation.activeRunId,seenCaseIds:replay.evaluation.seenCaseIds,seal:replay.evaluation.seal,certificate:replay.evaluation.certificate,
   runs:replay.evaluation.runs.map(r=>({id:r.id,caseId:r.caseId,candidateId:r.candidateId,candidateRevision:r.candidateRevision,contractRevision:r.contractRevision,criterionIds:r.criterionIds,aggregation:r.aggregation,firstSeen:r.firstSeen,cursor:r.cursor,metricCursor:r.metricCursor,status:r.status,toolFailed:r.toolFailed,checks:r.checks,report:r.report,eventIds:r.eventIds})),
  }}:{}),
 };
}
