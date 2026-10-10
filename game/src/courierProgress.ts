import {createCourier, deriveCourierProof, reduceCourier, validateCourierSave} from './transfer/courier';
import type {CourierAction, CourierState} from './transfer/courier';

export const COURIER_SOURCE_IDS = ['courier-storm-transfer', 'courier-night-transfer'] as const;
export type CourierSourceId = typeof COURIER_SOURCE_IDS[number];
export interface CourierProgress {
  kind: 'echo-courier-progress';
  version: 1;
  revision: number;
  current: CourierState;
  deliveries: CourierState[];
  hintExposureIds: CourierSourceId[];
}
export const MAX_COURIER_BACKUP_BYTES = 512_000;
const MAX_DELIVERIES = 3;
const fields = ['kind', 'version', 'revision', 'current', 'deliveries', 'hintExposureIds'];
const exposed = (state: CourierState) => state.actions.some(action => action.type === 'hint');
export const courierAttemptFingerprint = (state: CourierState) => JSON.stringify([state.scenarioId, state.actions]);

export function emptyCourierProgress(): CourierProgress {
  return {kind: 'echo-courier-progress', version: 1, revision: 0, current: createCourier(17, crypto.randomUUID()), deliveries: [], hintExposureIds: []};
}

/** Imported badges and world snapshots are never trusted; every included run is replayed. */
export function validateCourierProgress(value: unknown): CourierProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('签收站备份不是有效对象。');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== fields.length || Object.keys(input).some(key => !fields.includes(key)) || input.kind !== 'echo-courier-progress' || input.version !== 1 || !Number.isSafeInteger(input.revision) || (input.revision as number) < 0) throw new Error('签收站备份版本不兼容；原记录保持不变。');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_COURIER_BACKUP_BYTES) throw new Error('签收站备份超过容量。');
  if (!Array.isArray(input.deliveries) || input.deliveries.length > MAX_DELIVERIES || !Array.isArray(input.hintExposureIds) || input.hintExposureIds.length > COURIER_SOURCE_IDS.length || new Set(input.hintExposureIds).size !== input.hintExposureIds.length || input.hintExposureIds.some(id => !COURIER_SOURCE_IDS.includes(id))) throw new Error('签收站记录的数量或提示来源无效。');
  const current = validateCourierSave(input.current);
  if (!current) throw new Error('当前签收记录不能从动作重放。');
  if (exposed(current) && !input.hintExposureIds.includes(current.scenarioId)) throw new Error('备份不能删除已发生的提示曝光。');
  const deliveries: CourierState[] = [], seen = new Set<string>();
  for (const record of input.deliveries) {
    const state = validateCourierSave(record);
    if (!state || !deriveCourierProof(state)) throw new Error('迁移记录没有满足作者委托的真实行动证据。');
    const id = courierAttemptFingerprint(state);
    if (seen.has(id)) throw new Error('迁移记录包含同一行动的副本。');
    seen.add(id); deliveries.push(state);
  }
  return {kind: 'echo-courier-progress', version: 1, revision: input.revision as number, current, deliveries, hintExposureIds: [...input.hintExposureIds]};
}

function retainDeliveries(records: readonly CourierState[]): CourierState[] {
  const unique = new Map<string, CourierState>();
  for (const state of records) if (!unique.has(courierAttemptFingerprint(state))) unique.set(courierAttemptFingerprint(state), state);
  // Secure the first genuine proof of each author scenario before retaining recent practice.
  const anchors = new Map<string, CourierState>();
  for (const state of unique.values()) if (!anchors.has(state.scenarioId)) anchors.set(state.scenarioId, state);
  const secured = [...anchors.values()];
  const others = [...unique.values()].filter(state => !secured.includes(state));
  return [...secured, ...others.slice(-(MAX_DELIVERIES - secured.length))].map(state => structuredClone(state));
}

function recordCurrent(progress: CourierProgress): CourierProgress {
  const next = structuredClone(progress);
  if (exposed(next.current) && !next.hintExposureIds.includes(next.current.scenarioId as CourierSourceId)) next.hintExposureIds.push(next.current.scenarioId as CourierSourceId);
  if (!next.hintExposureIds.includes(next.current.scenarioId as CourierSourceId) && deriveCourierProof(next.current)) next.deliveries = retainDeliveries([...next.deliveries, next.current]);
  return next;
}

export function applyCourierAction(progress: CourierProgress, action: CourierAction): CourierProgress {
  const current = validateCourierProgress(progress), reduction = reduceCourier(current.current, action);
  if (!reduction.accepted) throw new Error(reduction.reason ?? '这个行动尚不能执行，进度没有改变。');
  return recordCurrent({...current, current: reduction.state});
}

export function beginCourierAttempt(progress: CourierProgress, sourceId: CourierSourceId = progress.current.scenarioId as CourierSourceId): CourierProgress {
  const current = recordCurrent(validateCourierProgress(progress));
  if (!COURIER_SOURCE_IDS.includes(sourceId)) throw new Error('没有这份作者委托。');
  return {...current, current: createCourier(17, crypto.randomUUID(), sourceId)};
}

export function restoreCourierCheckpoint(progress: CourierProgress): CourierProgress {
  const old = validateCourierProgress(progress), next = beginCourierAttempt(old);
  const firstSubmission = old.current.actions.findIndex(action => action.type === 'submit');
  const prefix = firstSubmission < 0 ? old.current.actions : old.current.actions.slice(0, firstSubmission);
  for (const action of prefix) {
    const replayed = reduceCourier(next.current, {...action, id: crypto.randomUUID()});
    if (!replayed.accepted) throw new Error('这份发货前检查点暂不能恢复；原进度保留。');
    next.current = replayed.state;
  }
  return recordCurrent(next);
}

/** Restoring an older backup cannot forget hints or erase an already earned proof. */
export function mergeCourierBackup(existing: CourierProgress, incoming: CourierProgress): CourierProgress {
  const previous = validateCourierProgress(existing), imported = validateCourierProgress(incoming);
  const known = new Set(previous.deliveries.map(courierAttemptFingerprint));
  const allowed = imported.deliveries.filter(state => !previous.hintExposureIds.includes(state.scenarioId as CourierSourceId) || known.has(courierAttemptFingerprint(state)));
  const result: CourierProgress = {...imported, revision: previous.revision, deliveries: retainDeliveries([...previous.deliveries, ...allowed]), hintExposureIds: [...new Set([...previous.hintExposureIds, ...imported.hintExposureIds])]};
  return recordCurrent(result);
}

/** Only this module's validated source can add one supplemental concept/stage. */
export function courierLearningProofs(value: unknown) {
  try {
    const progress = validateCourierProgress(value);
    const candidates = [...progress.deliveries, ...(!progress.hintExposureIds.includes(progress.current.scenarioId as CourierSourceId) ? [progress.current] : [])];
    const proofs = new Map<string, NonNullable<ReturnType<typeof deriveCourierProof>>>();
    for (const state of candidates) {
      const proof = deriveCourierProof(state);
      if (proof && !proofs.has(state.scenarioId)) proofs.set(state.scenarioId, proof);
    }
    return [...proofs.values()];
  } catch {return [];}
}

let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  return connection ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {reject(new Error('此浏览器没有签收站存储。')); return;}
    const request = indexedDB.open('echo-courier-workshop', 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('progress');
    request.onerror = () => {connection = undefined; reject(request.error ?? new Error('签收站数据库暂不可读。'));};
    request.onblocked = () => {blocked = true; connection = undefined; reject(new Error('另一个页面阻挡签收站存储，请关闭旧页后重试。'));};
    request.onsuccess = () => {if (blocked) {request.result.close(); return;} request.result.onversionchange = () => {request.result.close(); connection = undefined;}; resolve(request.result);};
  });
}

async function transact(expectedRevision?: number, change?: (progress: CourierProgress) => CourierProgress): Promise<CourierProgress> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('progress', 'readwrite'), store = transaction.objectStore('progress');
    const request = store.get('courier-v1');
    let next: CourierProgress | undefined, failure: unknown;
    request.onsuccess = () => {
      try {
        const previous = request.result === undefined ? emptyCourierProgress() : validateCourierProgress(request.result);
        if (expectedRevision !== undefined && previous.revision !== expectedRevision) throw new Error('另一处页面已更新签收记录。请重新读取，再决定下一步。');
        next = change ? validateCourierProgress({...change(previous), revision: previous.revision + 1}) : previous;
        if (change || request.result === undefined) store.put(next, 'courier-v1');
      } catch (error) {failure = error; transaction.abort();}
    };
    transaction.oncomplete = () => resolve(next!);
    transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('签收记录未写入。'));
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('签收保存中断，原记录保持不变。'));
  });
}

export const readCourierProgress = () => transact();
export const commitCourierProgress = (expectedRevision: number, change: (progress: CourierProgress) => CourierProgress) => transact(expectedRevision, change);
