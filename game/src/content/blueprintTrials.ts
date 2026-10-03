/** Separate content entry point. Registration, storage and UI are owned by the application. */
import { blueprintFrozenFactLabels, blueprintFrozenPrerequisites, blueprintFrozenScenarios, blueprintFrozenStories, blueprintFrozenUiStories, blueprintFrozenWalkthroughs } from './blueprintTrialsFrozen';
import { blueprintLabFactLabels, blueprintLabPrerequisites, blueprintLabScenarios, blueprintLabStories, blueprintLabUiStories, blueprintLabWalkthroughs } from './blueprintTrialsLab';
import { blueprintTrialPairs } from './blueprintTrialSources';
import type { BlueprintTrialScenario, BlueprintTrialWalkthrough } from './blueprintTrialTypes';

export * from './blueprintTrialSources';
export * from './blueprintTrialTypes';
export const blueprintTrialOrder: string[] = blueprintTrialPairs.flatMap(pair => [...pair.scenarioIds]);
export const blueprintTrialScenarios: BlueprintTrialScenario[] = [...blueprintFrozenScenarios, ...blueprintLabScenarios].sort((a, b) => blueprintTrialOrder.indexOf(a.id) - blueprintTrialOrder.indexOf(b.id));
export const blueprintTrialWalkthroughs: BlueprintTrialWalkthrough[] = [...blueprintFrozenWalkthroughs, ...blueprintLabWalkthroughs];
export const blueprintTrialStories = [...blueprintFrozenStories, ...blueprintLabStories].sort((a, b) => blueprintTrialOrder.indexOf(a.id) - blueprintTrialOrder.indexOf(b.id));
export const blueprintTrialUiStories = {...blueprintFrozenUiStories, ...blueprintLabUiStories};
export const blueprintTrialFactLabels: Record<string, string> = {...blueprintFrozenFactLabels, ...blueprintLabFactLabels};
export const blueprintTrialPrerequisites: Record<string, string[]> = {...blueprintFrozenPrerequisites, ...blueprintLabPrerequisites};
