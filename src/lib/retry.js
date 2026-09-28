import { logError } from './auditLog.js';

const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_SOCKET']);

// Pinecone errors carry no `.status`; unmapped ones (e.g. 429, 503) embed it in the message.
function getStatus(err) {
  if (err?.status) return err.status;
  if (err?.name === 'PineconeInternalServerError') return 500;
  const match = /Status: (\d{3})/.exec(err?.message ?? '');
  return match ? Number(match[1]) : undefined;
}

function isRetryable(err) {
  if (err?.code === 'insufficient_quota') return false;
  const status = getStatus(err);
  if (status === 429 || (status >= 500 && status < 600)) return true;
  return (
    err?.name === 'APIConnectionError' ||
    err?.name === 'APIConnectionTimeoutError' ||
    err?.name === 'PineconeConnectionError' ||
    NETWORK_CODES.has(err?.code ?? err?.cause?.code)
  );
}

function retryAfterMs(err) {
  const header = err?.headers?.['retry-after-ms'] ?? err?.headers?.['retry-after'];
  if (!header) return null;
  const ms = err.headers['retry-after-ms'] ? Number(header) : Number(header) * 1000;
  return Number.isFinite(ms) ? ms : null;
}

export async function withBackoff(fn, { retries = 5, baseDelayMs = 500, maxDelayMs = 30_000, label = 'request' } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = isRetryable(err);
      await logError({ label, attempt, retryable, status: getStatus(err), message: err?.message });
      if (!retryable || attempt >= retries) throw err;
      const backoff = baseDelayMs * 2 ** attempt;
      const delay = Math.min(maxDelayMs, retryAfterMs(err) ?? backoff + Math.random() * backoff);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
