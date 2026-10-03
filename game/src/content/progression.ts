/** Unlocks are a graph: side quests never gate the main journey. Legacy wins remain valid. */
export const journeyOrder = ['harbor-light', 'warehouse-gate', 'tide-ledger', 'last-ferry', 'hollow-regent', 'after-tide', 'fog-bell', 'medicine-detour'];
export const prerequisites: Record<string, string[]> = {
  'harbor-light': [], 'warehouse-gate': ['harbor-light'],
  'hollow-regent': ['warehouse-gate'], // Preserve access granted by the original adventure.
  'tide-ledger': ['warehouse-gate'], 'last-ferry': ['tide-ledger'],
  'after-tide': ['last-ferry', 'hollow-regent'],
  'fog-bell': ['tide-ledger'], 'medicine-detour': ['tide-ledger'],
};
export const chapterOneMain = ['harbor-light', 'warehouse-gate', 'tide-ledger', 'last-ferry', 'hollow-regent', 'after-tide'];
export function isUnlocked(id: string, completed: readonly string[]): boolean {
  return Object.hasOwn(prerequisites, id) && prerequisites[id].every(previous => completed.includes(previous));
}
export function chapterComplete(completed: readonly string[]): boolean {
  return chapterOneMain.every(id => completed.includes(id));
}
export function nextMission(current: string, completed: readonly string[], available: readonly string[]): string | undefined {
  const start = journeyOrder.indexOf(current);
  const candidates = [...journeyOrder.slice(start + 1), ...journeyOrder.slice(0, start + 1)];
  return candidates.find(id => available.includes(id) && !completed.includes(id) && isUnlocked(id, completed));
}
