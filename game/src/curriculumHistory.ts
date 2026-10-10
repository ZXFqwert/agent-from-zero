import {validateGameState} from './engine';
import type {GameState} from './engine';
import {scenarios} from './content/scenarios';

export interface CurriculumHistory {version: 1; records: GameState[];}
export const MAX_HISTORY_RECORDS = 96;
export const MAX_HISTORY_BYTES = 16_000_000;
const sources = new Map(scenarios.map(scenario => [scenario.id, scenario]));
const empty = (): CurriculumHistory => ({version: 1, records: []});

/** Seed, labels and timestamps cannot turn a copied action trace into another attempt. */
export const curriculumAttemptId = (game: GameState) => JSON.stringify([game.scenarioId, game.processedActionIds]);

export function validateCurriculumHistory(value: unknown): CurriculumHistory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('学习回访记录不是有效对象。');
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Array.isArray(input.records) || input.records.length > MAX_HISTORY_RECORDS || Object.keys(input).some(key => !['version', 'records'].includes(key))) throw new Error('学习回访记录的版本或容量不兼容。');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_HISTORY_BYTES) throw new Error('学习回访记录超过容量。');
  const ids = new Set<string>();
  for (const record of input.records) {
    const game = record as GameState;
    const source = sources.get(game?.scenarioId);
    if (!source || game.status !== 'won' || !validateGameState(source, game)) throw new Error('学习回访包含未通过委托验收的记录。');
    const id = curriculumAttemptId(game);
    if (ids.has(id)) throw new Error('学习回访包含重复的行动记录。');
    ids.add(id);
  }
  return structuredClone(value) as CurriculumHistory;
}

export function appendCurriculumHistory(history: CurriculumHistory, game: GameState): CurriculumHistory {
  const current = validateCurriculumHistory(history);
  const source = sources.get(game.scenarioId);
  if (!source || game.status !== 'won' || !validateGameState(source, game)) throw new Error('这份委托尚不能留下回访记录。');
  const id = curriculumAttemptId(game);
  if (current.records.some(record => curriculumAttemptId(record) === id)) return current;
  current.records.push(structuredClone(game));
  while (current.records.length > MAX_HISTORY_RECORDS || new TextEncoder().encode(JSON.stringify(current)).byteLength > MAX_HISTORY_BYTES) current.records.shift();
  return current;
}

/** Old proofs remain usable; the separate chronological history adds only retained new attempts. */
export function mergeCurriculumGames(oldGames: readonly GameState[], history: CurriculumHistory): GameState[] {
  const validated = validateCurriculumHistory(history);
  const retained = new Set(validated.records.map(curriculumAttemptId));
  const seen = new Set<string>();
  return [...oldGames.filter(game => !retained.has(curriculumAttemptId(game))), ...validated.records].filter(game => {
    const id = curriculumAttemptId(game);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

let connection: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {reject(new Error('此浏览器没有可用的学习工坊存储。')); return;}
    const request = indexedDB.open('echo-learning-workshop', 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('history');
    request.onsuccess = () => {
      if (blocked) {request.result.close(); return;}
      request.result.onversionchange = () => {request.result.close(); connection = undefined;};
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('学习工坊存储未能打开。'));
    request.onblocked = () => {blocked = true; reject(new Error('另一个页面正在更新学习工坊，请关闭后重试。'));};
  }).catch(error => {connection = undefined; throw error;});
}

export async function readCurriculumHistory(): Promise<CurriculumHistory> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('history', 'readonly');
    const request = transaction.objectStore('history').get('official-wins-v1');
    request.onsuccess = () => {try {resolve(request.result === undefined ? empty() : validateCurriculumHistory(request.result));} catch (error) {reject(error);}};
    request.onerror = () => reject(request.error ?? new Error('学习回访读取失败。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('学习回访读取被中断。'));
  });
}

export async function writeCurriculumHistory(history: CurriculumHistory): Promise<void> {
  const validated = validateCurriculumHistory(history), database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('history', 'readwrite');
    transaction.objectStore('history').put(validated, 'official-wins-v1');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('学习回访保存失败。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('学习回访保存被中断。'));
  });
}

/** One read/write transaction prevents rapid victories or another tab from losing an attempt. */
export async function recordCurriculumVictory(game: GameState): Promise<CurriculumHistory> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('history', 'readwrite');
    const store = transaction.objectStore('history'), request = store.get('official-wins-v1');
    let next: CurriculumHistory | undefined, failure: unknown;
    request.onsuccess = () => {
      try {
        next = appendCurriculumHistory(request.result === undefined ? empty() : request.result, game);
        store.put(next, 'official-wins-v1');
      } catch (error) {failure = error; transaction.abort();}
    };
    transaction.oncomplete = () => resolve(next!);
    transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('学习回访保存失败。'));
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('学习回访保存被中断。'));
  });
}
