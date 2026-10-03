import type { AgentBlueprint, GameAction, GameState, ScenarioDefinition, ToolCall } from './types';
import * as legacy from './legacy-v1';
import * as current from './v2';
import * as protocol from './v3';
import * as bounded from './v4';
import * as contextual from './v5';
import * as memorable from './v6';
import * as secured from './v7';
import * as collaborative from './v8';
import * as evaluated from './v9';
export type * from './types';
export const defaultBlueprint=legacy.defaultBlueprint;
const engine=(scenario:ScenarioDefinition)=>scenario.engineVersion===9?evaluated:scenario.engineVersion===8?collaborative:scenario.engineVersion===7?secured:scenario.engineVersion===6?memorable:scenario.engineVersion===5?contextual:scenario.engineVersion===4?bounded:scenario.engineVersion===3?protocol:scenario.engineVersion===2?current:legacy;
export const createGame=(scenario:ScenarioDefinition,seed=1):GameState=>engine(scenario).createGame(scenario,seed);
export const validateScenario=(scenario:ScenarioDefinition):string[]=>engine(scenario).validateScenario(scenario);
export const reduceGame=(scenario:ScenarioDefinition,state:GameState,action:GameAction):GameState=>{
  if((scenario.engineVersion??1)!==state.kernelVersion)return state;
  return engine(scenario).reduceGame(scenario,state,action);
};
export const chooseNextCall=(scenario:ScenarioDefinition,state:GameState):ToolCall|null=>engine(scenario).chooseNextCall(scenario,state);
export const validateGameState=(scenario:ScenarioDefinition,state:unknown):state is GameState=>engine(scenario).validateGameState(scenario,state);
export const getRemainingBudget=current.getRemainingBudget;
export const getToolCost=(scenario:ScenarioDefinition,call:ToolCall):number=>scenario.engineVersion===9?evaluated.getToolCost(scenario,call):scenario.engineVersion===8?collaborative.getToolCost(scenario,call):scenario.engineVersion===7?secured.getToolCost(scenario,call):scenario.engineVersion===6?memorable.getToolCost(scenario,call):scenario.engineVersion===5?contextual.getToolCost(scenario,call):scenario.engineVersion===4?bounded.getToolCost(scenario,call):scenario.engineVersion===3?protocol.getToolCost(scenario,call):scenario.engineVersion===2?current.getToolCost(scenario,call):1;
export function validateBlueprint(scenario:ScenarioDefinition,blueprint:AgentBlueprint):string[]{
  if(scenario.engineVersion===9)return evaluated.validateBlueprint(scenario,blueprint);
  if(scenario.engineVersion===8)return collaborative.validateBlueprint(scenario,blueprint);
  if(scenario.engineVersion===7)return secured.validateBlueprint(scenario,blueprint);
  if(scenario.engineVersion===6)return memorable.validateBlueprint(scenario,blueprint);
  if(scenario.engineVersion===5)return contextual.validateBlueprint(scenario,blueprint);
  if(scenario.engineVersion===4)return bounded.validateBlueprint(scenario,blueprint);
  if(scenario.engineVersion===3)return protocol.validateBlueprint(scenario,blueprint);
  if(scenario.engineVersion===2)return current.validateBlueprint(scenario,blueprint);
  try{const initial=legacy.createGame(scenario);return legacy.reduceGame(scenario,initial,{id:'validate-blueprint',type:'configure',blueprint})===initial?['法器、预算或访问契约格式不正确。']:[];}catch{return ['关卡或构筑格式不正确。'];}
}
export function replayGame(scenario:ScenarioDefinition,seed:number,actions:readonly GameAction[]):GameState|null {
  if(scenario.engineVersion===9)return evaluated.replayGame(scenario,seed,actions);
  if(scenario.engineVersion===8)return collaborative.replayGame(scenario,seed,actions);
  if(scenario.engineVersion===7)return secured.replayGame(scenario,seed,actions);
  if(scenario.engineVersion===6)return memorable.replayGame(scenario,seed,actions);
  if(scenario.engineVersion===5)return contextual.replayGame(scenario,seed,actions);
  if(scenario.engineVersion===4)return bounded.replayGame(scenario,seed,actions);
  if(scenario.engineVersion===3)return protocol.replayGame(scenario,seed,actions);
  if(scenario.engineVersion===2)return current.replayGame(scenario,seed,actions);
  if(!Array.isArray(actions)||actions.length>10000)return null;
  try{let state=legacy.createGame(scenario,seed);for(const action of actions){const next=legacy.reduceGame(scenario,state,action);if(next===state)return null;state=next;}return state;}catch{return null;}
}
