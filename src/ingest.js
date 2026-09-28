import 'dotenv/config';
import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { getEncoding } from 'js-tiktoken';
import { getIndex } from './lib/pineconeClient.js';
import { withBackoff } from './lib/retry.js';
import { hashText, flushCache } from './lib/embeddingCache.js';
import { embedTexts } from './lib/embeddings.js';

const DOCS_DIR = path.join(process.cwd(), 'data', 'documents');
const CHUNK_TOKENS = 400;
const OVERLAP_TOKENS = 50;
const UPSERT_BATCH = 100;

// text-embedding-3-* use cl100k_base
const encoder = getEncoding('cl100k_base');

// Token-based windows with overlap; stops once a window reaches the end so no chunk is fully contained in the previous one.
function chunkText(text) {
  const tokens = encoder.encode(text);
  const chunks = [];
  for (let start = 0; start < tokens.length; start += CHUNK_TOKENS - OVERLAP_TOKENS) {
    chunks.push(encoder.decode(tokens.slice(start, start + CHUNK_TOKENS)));
    if (start + CHUNK_TOKENS >= tokens.length) break;
  }
  return chunks.map((c) => c.trim()).filter(Boolean);
}

async function listIds(index, prefix) {
  const ids = [];
  let paginationToken;
  do {
    const page = await withBackoff(() => index.listPaginated({ prefix, paginationToken }), { label: 'pinecone.list' });
    ids.push(...(page.vectors ?? []).map((v) => v.id));
    paginationToken = page.pagination?.next;
  } while (paginationToken);
  return ids;
}

async function main() {
  const index = await getIndex();
  const files = (await readdir(DOCS_DIR)).filter((f) => f.endsWith('.md'));

  let totalChunks = 0;
  for (const file of files) {
    const chunks = chunkText(await readFile(path.join(DOCS_DIR, file), 'utf-8'));
    const prefix = `${file}#`;
    const existingIds = await listIds(index, prefix);

    const embeddings = await embedTexts(chunks);
    const vectors = chunks.map((chunk, i) => ({
      id: `${prefix}${i}-${hashText(chunk).slice(0, 8)}`,
      values: embeddings[i],
      metadata: { text: chunk, source: file },
    }));

    for (let b = 0; b < vectors.length; b += UPSERT_BATCH) {
      await withBackoff(() => index.upsert(vectors.slice(b, b + UPSERT_BATCH)), { label: 'pinecone.upsert' });
    }

    const newIds = new Set(vectors.map((v) => v.id));
    const staleIds = existingIds.filter((id) => !newIds.has(id));
    if (staleIds.length) await withBackoff(() => index.deleteMany(staleIds), { label: 'pinecone.delete' });

    totalChunks += chunks.length;
    console.log(`Ingested ${file}: ${chunks.length} chunks${staleIds.length ? `, removed ${staleIds.length} stale` : ''}`);
  }

  await flushCache();
  console.log(`Done. Total chunks ingested: ${totalChunks}`);
}

main().catch(async (err) => {
  await flushCache();
  console.error(err);
  process.exit(1);
});
