import { openai, EMBEDDING_MODEL } from './openaiClient.js';
import { withBackoff } from './retry.js';
import { getCachedEmbedding, setCachedEmbedding } from './embeddingCache.js';
import { logUsage, logEvent } from './auditLog.js';

const BATCH_SIZE = 100;

// Embeds texts in order, serving cache hits locally and batching misses into one API call per BATCH_SIZE.
export async function embedTexts(texts, { userId } = {}) {
  const results = await Promise.all(texts.map((t) => getCachedEmbedding(EMBEDDING_MODEL, t)));
  const misses = results.flatMap((r, i) => (r ? [] : [i]));
  if (misses.length < texts.length) {
    await logEvent('embed_cache_hit', { userId, count: texts.length - misses.length, model: EMBEDDING_MODEL });
  }

  for (let b = 0; b < misses.length; b += BATCH_SIZE) {
    const batch = misses.slice(b, b + BATCH_SIZE);
    const started = Date.now();
    const response = await withBackoff(
      () => openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch.map((i) => texts[i]) }),
      { label: 'openai.embeddings' },
    );
    await logUsage({
      type: 'embed',
      userId,
      model: EMBEDDING_MODEL,
      promptTokens: response.usage.total_tokens,
      latencyMs: Date.now() - started,
      meta: { count: batch.length },
    });
    for (const d of response.data) {
      const i = batch[d.index];
      results[i] = d.embedding;
      await setCachedEmbedding(EMBEDDING_MODEL, texts[i], d.embedding);
    }
  }
  return results;
}
