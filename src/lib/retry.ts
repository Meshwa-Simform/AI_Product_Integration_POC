import { logError } from './auditLog.js';

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
}

/** Loose shape covering OpenAI APIError, Pinecone errors, and Node network errors. */
interface ErrorLike {
  name?: string;
  message?: string;
  status?: number;
  code?: string | null;
  cause?: { code?: string };
  headers?: Record<string, string | null | undefined>;
}

const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_SOCKET']);
const RETRYABLE_NAMES = new Set(['APIConnectionError', 'APIConnectionTimeoutError', 'PineconeConnectionError']);

const asErrorLike = (err: unknown): ErrorLike => (typeof err === 'object' && err !== null ? err : {});

// Pinecone errors carry no `.status`; unmapped ones (e.g. 429, 503) embed it in the message.
function getStatus(err: ErrorLike): number | undefined {
  if (err.status) return err.status;
  if (err.name === 'PineconeInternalServerError') return 500;
  const match = /Status: (\d{3})/.exec(err.message ?? '');
  return match?.[1] ? Number(match[1]) : undefined;
}

function isRetryable(err: ErrorLike): boolean {
  if (err.code === 'insufficient_quota') return false;
  const status = getStatus(err);
  if (status === 429 || (status !== undefined && status >= 500 && status < 600)) return true;
  const code = err.code ?? err.cause?.code;
  return RETRYABLE_NAMES.has(err.name ?? '') || (code != null && NETWORK_CODES.has(code));
}

function retryAfterMs(err: ErrorLike): number | null {
  const ms = err.headers?.['retry-after-ms'];
  const seconds = err.headers?.['retry-after'];
  const value = ms ? Number(ms) : seconds ? Number(seconds) * 1000 : NaN;
  return Number.isFinite(value) ? value : null;
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  { retries = 5, baseDelayMs = 500, maxDelayMs = 30_000, label = 'request' }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = asErrorLike(err);
      const retryable = isRetryable(e);
      await logError({ label, attempt, retryable, status: getStatus(e), message: e.message });
      if (!retryable || attempt >= retries) throw err;
      const backoff = baseDelayMs * 2 ** attempt;
      const delay = Math.min(maxDelayMs, retryAfterMs(e) ?? backoff + Math.random() * backoff);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
