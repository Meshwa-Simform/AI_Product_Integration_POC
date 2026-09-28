import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Cache = Record<string, number[]>;

const CACHE_PATH = path.join(process.cwd(), 'data', 'embeddings-cache.json');

let cache: Cache | null = null;
let dirty = false;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  try {
    cache = existsSync(CACHE_PATH) ? (JSON.parse(await readFile(CACHE_PATH, 'utf-8')) as Cache) : {};
  } catch (err) {
    console.warn(`Embedding cache unreadable, starting empty: ${(err as Error).message}`);
    cache = {};
  }
  return cache;
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const cacheKey = (model: string, text: string): string => `${model}:${hashText(text)}`;

export async function getCachedEmbedding(model: string, text: string): Promise<number[] | null> {
  const c = await loadCache();
  return c[cacheKey(model, text)] ?? null;
}

export async function setCachedEmbedding(model: string, text: string, embedding: number[]): Promise<void> {
  const c = await loadCache();
  c[cacheKey(model, text)] = embedding;
  dirty = true;
}

// Write once per run (not per entry), atomically via temp file + rename.
export async function flushCache(): Promise<void> {
  if (!dirty || !cache) return;
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(cache));
  await rename(tmp, CACHE_PATH);
  dirty = false;
}
