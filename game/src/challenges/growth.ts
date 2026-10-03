import {validateGameState} from '../engine';
import {scenarios} from '../content/scenarios';
import type {GameState} from '../engine/types';
import {challengeTemplates} from './catalog';
import {canonical,generateChallenge} from './generator';
import type {CapabilityGrowth,ChallengeRecord} from './types';
/** Practice opens from a real source win, including guided wins; source titles/IDs alone cannot unlock it. */
export function deriveUnlockedTemplateIds(games:readonly GameState[]):string[] {
 const won=new Set<string>();for(const game of games){try{const source=scenarios.find(s=>s.id===game.scenarioId);if(source&&game.status==='won'&&validateGameState(source,game))won.add(source.id);}catch{continue;}}
 return challengeTemplates.filter(t=>won.has(t.sourceScenarioId)).map(t=>t.id);
}
/** Records must be validated by storage; this additionally refuses any fabricated inner state. */
export function deriveCapabilityGrowth(records:readonly ChallengeRecord[]):CapabilityGrowth[] {
 const result=challengeTemplates.map(t=>({mechanism:t.mechanism,level:'unseen' as CapabilityGrowth['level'],freshWins:0,practiceWins:0,variantKeys:[] as string[]})),completed=new Set<string>();
 for(const record of records){
  try{
   const instance=generateChallenge(record.spec);if(!validateGameState(instance.scenario,record.game))continue;
   const growth=result.find(g=>g.mechanism===instance.template.mechanism)!,key=canonical(record.spec);
   if(record.game.events.some(e=>['request','lab-request','evaluation-request'].includes(e.type))&&growth.level==='unseen')growth.level='seen';
   if(record.game.status!=='won'||completed.has(key))continue;completed.add(key);
   // All factory-1 templates derive from authored encounters. Neither a new seed nor
   // a caller-supplied firstEncounter can certify an unseen transfer.
   growth.practiceWins++;growth.level='guided';
   if(!growth.variantKeys.includes(instance.decisionVariantKey))growth.variantKeys.push(instance.decisionVariantKey);
  }catch{continue;}
 }
 for(const growth of result)growth.variantKeys.sort();return result;
}
