export interface OfflineProgress {
  completed: number;
  total: number;
  bytes: number;
  totalBytes: number;
}

export interface OfflineStatus {
  supported: boolean;
  registered: boolean;
  chapterAvailable: boolean;
  version: string | null;
  bytes: number;
  totalAssets: number;
  updateAvailable: boolean;
  chapterStatuses: Record<string,boolean>;
  error?: string;
}

type WorkerStatus = Pick<OfflineStatus, 'chapterAvailable' | 'version' | 'bytes' | 'totalAssets' | 'chapterStatuses'>;
type WorkerReply = { type: string; status?: WorkerStatus; progress?: OfflineProgress; error?: string };
let registration: ServiceWorkerRegistration | undefined;
let registering: Promise<OfflineStatus> | undefined;
let downloading = false;
const updateListeners = new Set<(available: boolean) => void>();
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext;
const empty = (): OfflineStatus => ({ supported: supported(), registered: false, chapterAvailable: false, version: null, bytes: 0, totalAssets: 0, updateAvailable: false, chapterStatuses:{} });

function send(worker: ServiceWorker, type: string, onProgress?: (progress: OfflineProgress) => void, chapterId = 'chapter-01'): Promise<WorkerReply> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: Error, data?: WorkerReply) => {
      clearTimeout(timer);
      channel.port1.close();
      if (error) reject(error); else resolve(data!);
    };
    const armTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new Error('离线服务响应超时，请保持页面打开并重试。')), type === 'DOWNLOAD_CHAPTER' ? 60000 : 10000);
    };
    channel.port1.onmessage = (event: MessageEvent<WorkerReply>) => {
      const data = event.data;
      if (data.type === 'DOWNLOAD_PROGRESS' && data.progress) {
        armTimeout();
        onProgress?.(data.progress);
      } else if (data.type === 'ERROR') finish(new Error(data.error || '离线操作失败。'));
      else finish(undefined, data);
    };
    channel.port1.onmessageerror = () => finish(new Error('离线服务返回了无效消息。'));
    armTimeout();
    worker.postMessage({ type, chapterId }, [channel.port2]);
  });
}

function notifyUpdate() {
  const available = Boolean(registration?.waiting);
  for (const listener of updateListeners) listener(available);
}

function waitForActive(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const worker = reg.installing || reg.waiting;
    if (!worker) return reject(new Error('离线服务暂不可用。'));
    const timeout = setTimeout(() => { worker.removeEventListener('statechange', changed); reject(new Error('离线服务安装超时。')); }, 15000);
    function changed() {
      if (worker!.state === 'activated') {
        clearTimeout(timeout);
        worker!.removeEventListener('statechange', changed);
        resolve();
      } else if (worker!.state === 'redundant') {
        clearTimeout(timeout);
        worker!.removeEventListener('statechange', changed);
        reject(new Error('离线服务安装失败。'));
      }
    }
    worker.addEventListener('statechange', changed);
    changed();
  });
}

/** Register only in a built production app. Does not download content or activate an update. */
export async function registerOffline(onUpdate?: (available: boolean) => void): Promise<OfflineStatus> {
  if (onUpdate) updateListeners.add(onUpdate);
  if (!supported() || !import.meta.env.PROD) return empty();
  if (registration) { notifyUpdate(); return getOfflineStatus(); }
  if (registering) return registering;
  registering = (async () => {
    try {
      registration = await navigator.serviceWorker.register('/play/sw.js', { scope: '/play/', updateViaCache: 'none' });
      registration.addEventListener('updatefound', () => {
        const worker = registration?.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') notifyUpdate(); });
      });
      await waitForActive(registration);
      notifyUpdate();
      return await getOfflineStatus();
    } catch (error) {
      registration = undefined;
      return { ...empty(), error: error instanceof Error ? error.message : '无法启用离线服务。' };
    } finally { registering = undefined; }
  })();
  return registering;
}

export async function getOfflineStatus(chapterId = 'chapter-01'): Promise<OfflineStatus> {
  if (!supported() || !import.meta.env.PROD) return empty();
  const reg = registration || await navigator.serviceWorker.getRegistration('/play/');
  if (!reg?.active || !reg.scope.endsWith('/play/')) return empty();
  registration = reg;
  try {
    const data = await send(reg.active, 'GET_OFFLINE_STATUS', undefined, chapterId);
    return { ...empty(), ...data.status, registered: true, updateAvailable: Boolean(reg.waiting) };
  } catch (error) {
    return { ...empty(), registered: true, updateAvailable: Boolean(reg.waiting), error: error instanceof Error ? error.message : '无法读取离线状态。' };
  }
}

/** Explicit user action. Mainline play never depends on this download succeeding. */
export async function downloadChapter(onProgress?: (progress: OfflineProgress) => void, chapterId = 'chapter-01'): Promise<OfflineStatus> {
  if (downloading) throw new Error('章节正在下载，请稍候。');
  downloading = true;
  try {
    const current = await registerOffline();
    if (!registration?.active) throw new Error(current.error || '请在 HTTPS 正式游戏页面下载离线章节。');
    onProgress?.({ completed: 0, total: current.totalAssets, bytes: 0, totalBytes: current.bytes });
    const data = await send(registration.active, 'DOWNLOAD_CHAPTER', onProgress, chapterId);
    return { ...empty(), ...data.status, registered: true, updateAvailable: Boolean(registration.waiting) };
  } finally { downloading = false; }
}

/** Call only after committing a safe checkpoint; the caller then reloads the page. */
export async function activateUpdate(): Promise<void> {
  const reg = registration || (supported() ? await navigator.serviceWorker.getRegistration('/play/') : undefined);
  const worker = reg?.waiting;
  if (!worker) return;
  await send(worker, 'ACTIVATE_UPDATE');
  if (worker.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { worker.removeEventListener('statechange', changed); reject(new Error('更新尚未完成，请稍后重试。')); }, 15000);
      const changed = () => {
        if (worker.state === 'activated') { clearTimeout(timeout); worker.removeEventListener('statechange', changed); resolve(); }
        else if (worker.state === 'redundant') { clearTimeout(timeout); worker.removeEventListener('statechange', changed); reject(new Error('更新失败，当前版本仍可继续游玩。')); }
      };
      worker.addEventListener('statechange', changed);
      changed();
    });
  }
  notifyUpdate();
}
