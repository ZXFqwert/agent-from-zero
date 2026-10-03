import { chapterSevenMainOrder as chapterSevenMain, chapterSevenPrerequisites, chapterSevenScenarios } from './chapterSeven';
import { chapterSixMain, chapterSixPrerequisites, chapterSixScenarios } from './chapterSix';
import { chapterFiveMain, chapterFivePrerequisites, chapterFiveScenarios } from './chapterFive';
import { chapterFourMain, chapterFourPrerequisites, chapterFourScenarios } from './chapterFour';
/** Unlocks are a graph: side quests never gate the main journey. Legacy wins remain valid. */
export const journeyOrder = ['harbor-light', 'warehouse-gate', 'tide-ledger', 'last-ferry', 'hollow-regent', 'after-tide', 'etched-door', 'cooling-furnace', 'paired-valves', 'missing-crate', 'doubled-clerk', 'courier-lock', 'brass-order', 'cooling-pulse', 'one-crystal-left', 'broken-escapement', 'endless-warden', 'rescue-rope', ...chapterFourMain, ...chapterFiveMain,...chapterSixMain,...chapterSevenMain,...chapterSevenScenarios.slice(6).map(s=>s.id),...chapterSixScenarios.slice(6).map(s=>s.id),...chapterFiveScenarios.slice(6).map(s=>s.id), ...chapterFourScenarios.slice(6).map(s=>s.id), 'fog-bell', 'medicine-detour', 'backyard-address', 'reusable-scale', 'quiet-hours', 'lantern-shift'];
export const prerequisites: Record<string, string[]> = {
  'harbor-light': [], 'warehouse-gate': ['harbor-light'],
  'hollow-regent': ['warehouse-gate'], // Preserve access granted by the original adventure.
  'tide-ledger': ['warehouse-gate'], 'last-ferry': ['tide-ledger'],
  'after-tide': ['last-ferry', 'hollow-regent'],
  'etched-door': ['after-tide'], 'cooling-furnace': ['etched-door'], 'paired-valves': ['cooling-furnace'],
  'missing-crate': ['paired-valves'], 'doubled-clerk': ['missing-crate'], 'courier-lock': ['doubled-clerk'],
  'backyard-address': ['paired-valves'], 'reusable-scale': ['paired-valves'],
  'brass-order':['courier-lock'],'cooling-pulse':['brass-order'],'one-crystal-left':['cooling-pulse'],'broken-escapement':['one-crystal-left'],'endless-warden':['broken-escapement'],'rescue-rope':['endless-warden'],'quiet-hours':['one-crystal-left'],'lantern-shift':['one-crystal-left'],
  ...chapterFourPrerequisites,...chapterFivePrerequisites,...chapterSixPrerequisites,...chapterSevenPrerequisites,
  'fog-bell': ['tide-ledger'], 'medicine-detour': ['tide-ledger'],
};
export const chapterOneMain = ['harbor-light', 'warehouse-gate', 'tide-ledger', 'last-ferry', 'hollow-regent', 'after-tide'];
export function isUnlocked(id: string, completed: readonly string[]): boolean {
  return Object.hasOwn(prerequisites, id) && prerequisites[id].every(previous => completed.includes(previous));
}
export const chapterTwoMain = ['etched-door', 'cooling-furnace', 'paired-valves', 'missing-crate', 'doubled-clerk', 'courier-lock'];
export const chapterThreeMain=['brass-order','cooling-pulse','one-crystal-left','broken-escapement','endless-warden','rescue-rope'];
export const mainScenarioIds = [...chapterOneMain, ...chapterTwoMain, ...chapterThreeMain,...chapterFourMain,...chapterFiveMain,...chapterSixMain,...chapterSevenMain];
export function chapterComplete(completed: readonly string[], chapter = 1): boolean {
  const main=[chapterOneMain,chapterTwoMain,chapterThreeMain,chapterFourMain,chapterFiveMain,chapterSixMain,chapterSevenMain][chapter-1]??[];
  return main.length>0&&main.every(id=>completed.includes(id));
}
export function nextMission(current: string, completed: readonly string[], available: readonly string[]): string | undefined {
  const start = journeyOrder.indexOf(current);
  const candidates = [...journeyOrder.slice(start + 1), ...journeyOrder.slice(0, start + 1)];
  return candidates.find(id => available.includes(id) && !completed.includes(id) && isUnlocked(id, completed));
}
