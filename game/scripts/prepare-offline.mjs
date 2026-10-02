import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const basePath = '/play/';
const placeholder = 'null /* ECHO_OFFLINE_MANIFEST */';
const sha256 = (input) => createHash('sha256').update(input).digest('hex');
const template = await readFile(join(root, 'public', 'sw.js'), 'utf8');
if (!template.includes(placeholder)) throw new Error('Service worker manifest placeholder is missing.');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : Promise.resolve([path]);
  }));
  return groups.flat();
}

const extensions = new Set(['.html', '.js', '.css', '.svg', '.png', '.webmanifest', '.webp', '.woff', '.woff2', '.json']);
const files = (await walk(dist)).filter((file) => {
  const name = relative(dist, file).replaceAll('\\', '/');
  return extensions.has(extname(file)) && !['sw.js', 'offline-manifest.json'].includes(name);
}).sort();
const assets = await Promise.all(files.map(async (file) => {
  const contents = await readFile(file);
  return { url: basePath + relative(dist, file).replaceAll('\\', '/'), bytes: contents.byteLength, sha256: sha256(contents) };
}));

// Check the real HTML references as well as including all emitted chunks (including lazy imports).
const index = await readFile(join(dist, 'index.html'), 'utf8');
const urls = new Set(assets.map((asset) => asset.url));
for (const match of index.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const target = new URL(match[1], 'https://echo.invalid' + basePath);
  if (target.origin !== 'https://echo.invalid' || target.hash || target.pathname === basePath) continue;
  if (!target.pathname.startsWith(basePath) || !urls.has(target.pathname)) {
    throw new Error(`An index.html dependency is missing from the offline bundle: ${match[1]}`);
  }
}
if (!urls.has(basePath + 'index.html')) throw new Error('Built index.html is missing.');
if (!assets.some((asset) => asset.url.endsWith('.webp'))) throw new Error('The game art bundle is missing.');

const version = sha256(JSON.stringify(assets) + '\n' + template).slice(0, 24);
const manifest = {
  schema: 1,
  chapterId: 'chapter-01',
  basePath,
  version,
  totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  assets,
};
await writeFile(join(dist, 'offline-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(dist, 'sw.js'), template.replace(placeholder, JSON.stringify(manifest)));
process.stdout.write(`Offline chapter ${version}: ${assets.length} files, ${(manifest.totalBytes / 1024 / 1024).toFixed(2)} MiB.\n`);
