import type { AgentBlueprint, GameAction, GameState, ScenarioDefinition, ToolCall } from './types';
import * as legacy from './legacy-v1';
import * as current from './v2';
export type * from './types';
export const defaultBlueprint=legacy.defaultBlueprint;
const engine=(scenario:ScenarioDefinition)=>scenario.engineVersion===2?current:legacy;
export const createGame=(scenario:ScenarioDefinition,seed=1):GameState=>engine(scenario).createGame(scenario,seed);
export const validateScenario=(scenario:ScenarioDefinition):string[]=>engine(scenario).validateScenario(scenario);
export const reduceGame=(scenario:ScenarioDefinition,state:GameState,action:GameAction):GameState=>{
  if((scenario.engineVersion??1)!==state.kernelVersion)return state;
  return (state.kernelVersion===2?current:legacy).reduceGame(scenario,state,action);
};
export const chooseNextCall=(scenario:ScenarioDefinition,state:GameState):ToolCall|null=>(state.kernelVersion===2?current:legacy).chooseNextCall(scenario,state);
export const validateGameState=(scenario:ScenarioDefinition,state:unknown):state is GameState=>engine(scenario).validateGameState(scenario,state);
export const getRemainingBudget=current.getRemainingBudget;
export const getToolCost=(scenario:ScenarioDefinition,call:ToolCall):number=>scenario.engineVersion===2?current.getToolCost(scenario,call):1;
export function validateBlueprint(scenario:ScenarioDefinition,blueprint:AgentBlueprint):string[]{
  if(scenario.engineVersion===2)return current.validateBlueprint(scenario,blueprint);
  try{const initial=legacy.createGame(scenario);return legacy.reduceGame(scenario,initial,{id:'validate-blueprint',type:'configure',blueprint})===initial?['法器、预算或访问契约格式不正确。']:[];}catch{return ['关卡或构筑格式不正确。'];}
}
export function replayGame(scenario:ScenarioDefinition,seed:number,actions:readonly GameAction[]):GameState|null {
  if(scenario.engineVersion===2)return current.replayGame(scenario,seed,actions);
  if(!Array.isArray(actions)||actions.length>10000)return null;
  try{let state=legacy.createGame(scenario,seed);for(const action of actions){const next=legacy.reduceGame(scenario,state,action);if(next===state)return null;state=next;}return state;}catch{return null;}
}
