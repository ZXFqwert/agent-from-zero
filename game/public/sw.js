/* Replaced by scripts/prepare-offline.mjs after Vite builds. */
const RELEASE = null /* ECHO_OFFLINE_MANIFEST */;
const CACHE_PREFIX = 'echo-workshop-pack-';
const cacheName = (chapterId) => CACHE_PREFIX + (RELEASE?.version || 'unbuilt') + '-' + chapterId;
const BASE = '/play/';
const markerUrl = (chapterId) => new URL(BASE + '__offline_complete__/' + chapterId, self.location.origin).href;
const chapterFor = (chapterId) => {const chapter=RELEASE?.chapters.find(chapter=>chapter.chapterId===chapterId);if(!chapter)throw new Error('未知章节离线包。');return chapter;};
let downloadTask = null;

function assertRelease() {
  if (!RELEASE || RELEASE.schema !== 2 || RELEASE.basePath !== BASE || !Array.isArray(RELEASE.assets) || !Array.isArray(RELEASE.chapters)) {
    throw new Error('离线清单尚未构建。');
  }
}

function reply(port, data) {
  try { port?.postMessage(data); } catch { /* The requesting page can close during a download. */ }
}

async function status(chapterId = 'chapter-01') {
  assertRelease();
  const chapter = chapterFor(chapterId);
  const cache = await caches.open(cacheName(chapterId));
  const response = await cache.match(markerUrl(chapterId));
  let chapterAvailable = false;
  if (response) {
    try {
      const marker = await response.json();
      chapterAvailable = marker.version === RELEASE.version && marker.files === chapter.assets.length;
      // A completion marker alone cannot hide partial browser eviction.
      if (chapterAvailable) {
        for (const url of chapter.assets) {
          if (!(await cache.match(new URL(url, self.location.origin).href))) {
            chapterAvailable = false;
            await cache.delete(markerUrl(chapterId));
            break;
          }
        }
      }
    } catch { chapterAvailable = false; }
  }
  return { version: RELEASE.version, chapterAvailable, bytes: chapter.totalBytes, totalAssets: chapter.assets.length };
}

async function download(port, chapterId) {
  const chapter = chapterFor(chapterId);
  assertRelease();
  if (downloadTask) throw new Error('另一处窗口正在下载本章节，请稍后再试。');
  const run = async () => {
    const existing = await status(chapterId);
    if (existing.chapterAvailable) return existing;
    // Only this release's incomplete cache is replaced. Previous complete releases survive.
    await caches.delete(cacheName(chapterId));
    const cache = await caches.open(cacheName(chapterId));
    let bytes = 0;
    let completed = 0;
    try {
      for (const asset of RELEASE.assets.filter(asset=>chapter.assets.includes(asset.url))) {
        const url = new URL(asset.url, self.location.origin);
        if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) throw new Error('离线资源超出了游戏范围。');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);
        let response;
        let body;
        try {
          response = await fetch(url.href, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
          if (!response.ok || response.type === 'opaque' || response.redirected) throw new Error(`资源下载失败：${url.pathname}`);
          body = await response.arrayBuffer();
        } finally { clearTimeout(timer); }
        const digest = await crypto.subtle.digest('SHA-256', body);
        const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
        if (body.byteLength !== asset.bytes || hash !== asset.sha256) throw new Error('发布版本已变化或资源不完整，请在检查点更新后重新下载。');
        const headers = new Headers(response.headers);
        headers.delete('content-encoding');
        headers.delete('content-length');
        await cache.put(url.href, new Response(body, { status: 200, headers }));
        bytes += body.byteLength;
        completed += 1;
        reply(port, { type: 'DOWNLOAD_PROGRESS', progress: { completed, total: chapter.assets.length, bytes, totalBytes: chapter.totalBytes } });
      }
      await cache.put(markerUrl(chapterId), new Response(JSON.stringify({ version: RELEASE.version, files: completed }), { headers: { 'content-type': 'application/json' } }));
      return await status(chapterId);
    } catch (error) {
      await caches.delete(cacheName(chapterId));
      throw error;
    }
  };
  downloadTask = run();
  try { return await downloadTask; } finally { downloadTask = null; }
}

self.addEventListener('install', (event) => {
  // No prefetch and no skipWaiting: installation alone must not replace an active adventure.
  event.waitUntil(Promise.resolve().then(assertRelease));
});

self.addEventListener('activate', (event) => {
  // Keep old complete caches for rollback and already-open pages. No automatic clients.claim().
  event.waitUntil(Promise.resolve().then(assertRelease));
});

self.addEventListener('message', (event) => {
  const port = event.ports[0];
  const type = event.data?.type;
  const chapterId = event.data?.chapterId ?? 'chapter-01';
  if (!['GET_OFFLINE_STATUS', 'DOWNLOAD_CHAPTER', 'ACTIVATE_UPDATE'].includes(type)) return;
  event.waitUntil((async () => {
    try {
      if (type === 'GET_OFFLINE_STATUS') reply(port, { type: 'OFFLINE_STATUS', status: {...await status(chapterId),chapterStatuses:Object.fromEntries(await Promise.all(RELEASE.chapters.map(async chapter=>[chapter.chapterId,(await status(chapter.chapterId)).chapterAvailable]))) } });
      if (type === 'DOWNLOAD_CHAPTER') reply(port, { type: 'DOWNLOAD_COMPLETE', status: {...await download(port, chapterId),chapterStatuses:Object.fromEntries(await Promise.all(RELEASE.chapters.map(async chapter=>[chapter.chapterId,(await status(chapter.chapterId)).chapterAvailable]))) } });
      if (type === 'ACTIVATE_UPDATE') {
        // Only the UI's safe-checkpoint action sends this message.
        await self.skipWaiting();
        reply(port, { type: 'UPDATE_ACTIVATED' });
      }
    } catch (error) {
      reply(port, { type: 'ERROR', error: error instanceof Error ? error.message : '离线操作失败。' });
    }
  })());
});

async function completeCaches() {
  const result=[];
  for(const chapter of RELEASE.chapters) {
    const cache=await caches.open(cacheName(chapter.chapterId));
    if(await cache.match(markerUrl(chapter.chapterId)))result.push(cache);
  }
  return result;
}
async function savedResponse(url) {
  for(const cache of await completeCaches()){const response=await cache.match(url);if(response)return response;}
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  // Never cache or intercept real-model APIs, server events, the SW itself, or the mutable release manifest.
  if (url.pathname.startsWith(BASE + 'api/') || [BASE + 'sw.js', BASE + 'offline-manifest.json'].includes(url.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) return response;
        return (await savedResponse(new URL(BASE + 'index.html', self.location.origin).href)) || response;
      } catch {
        return (await savedResponse(new URL(BASE + 'index.html', self.location.origin).href)) || new Response('本章节尚未下载。联网后打开游戏，在旅程菜单下载离线章节。', { status: 503, headers: { 'content-type': 'text/plain;charset=utf-8' } });
      }
    })());
    return;
  }
  if (!RELEASE?.assets.some((asset) => asset.url === url.pathname)) return;
  event.respondWith((async () => {
    const saved = await savedResponse(url.origin + url.pathname);
    return saved || fetch(request);
  })());
});
