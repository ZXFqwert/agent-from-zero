import type {GameAction,GameState,ScenarioDefinition} from '../engine/types';
import type {ChapterOneWalkthrough} from './chapterOne';
import {resolveAuthoredStep,type AuthoredStep,type AuthoredMessageRef} from './walkthrough';
export type BlueprintTrialScenario=ScenarioDefinition;
export type BlueprintMessageRef=AuthoredMessageRef;
export type BlueprintAuthoredStep=AuthoredStep;
export type BlueprintTrialStage=ChapterOneWalkthrough['stages'][number];
export type BlueprintTrialWalkthrough=ChapterOneWalkthrough;
/** Resolve recorded instances through the shared authoring contract, never synthetic facts. */
export function resolveBlueprintTrialStep(state:GameState,step:BlueprintAuthoredStep,id:string):GameAction {
  return resolveAuthoredStep(state,step,id);
}
