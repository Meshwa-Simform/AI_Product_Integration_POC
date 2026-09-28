import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const CACHE_PATH = path.join(process.cwd(), 'data', 'embeddings-cache.json');

let cache = null;
let dirty = false;

async function loadCache() {
  if (cache) return cache;
  try {
    cache = existsSync(CACHE_PATH) ? JSON.parse(await readFile(CACHE_PATH, 'utf-8')) : {};
  } catch (err) {
    console.warn(`Embedding cache unreadable, starting empty: ${err.message}`);
    cache = {};
  }
  return cache;
}

export function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

const cacheKey = (model, text) => `${model}:${hashText(text)}`;

export async function getCachedEmbedding(model, text) {
  const c = await loadCache();
  return c[cacheKey(model, text)] ?? null;
}

export async function setCachedEmbedding(model, text, embedding) {
  const c = await loadCache();
  c[cacheKey(model, text)] = embedding;
  dirty = true;
}

// Write once per run (not per entry), atomically via temp file + rename.
export async function flushCache() {
  if (!dirty) return;
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(cache));
  await rename(tmp, CACHE_PATH);
  dirty = false;
}
