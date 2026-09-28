import { appendFile, mkdir, readdir, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS ?? 30);

// USD per 1M tokens
const PRICING = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'omni-moderation-latest': { input: 0, output: 0 },
};

const warnedModels = new Set();
let pruned = false;

function estimateCost(model, promptTokens = 0, completionTokens = 0) {
  const rates = PRICING[model];
  if (!rates) {
    if (!warnedModels.has(model)) console.warn(`No pricing for model "${model}"; cost logged as null`);
    warnedModels.add(model);
    return null;
  }
  return (promptTokens * rates.input + completionTokens * rates.output) / 1_000_000;
}

const logPath = (date = new Date()) => path.join(LOG_DIR, `audit-${date.toISOString().slice(0, 10)}.jsonl`);

export function redact(text) {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[PHONE]')
    .replace(/\b(sk|lw_live|lw_test)[-_][\w-]{8,}/g, '[SECRET]');
}

async function pruneOldLogs() {
  if (pruned) return;
  pruned = true;
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  for (const file of await readdir(LOG_DIR)) {
    const match = /^audit-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(file);
    if (match && Date.parse(match[1]) < cutoff) await unlink(path.join(LOG_DIR, file));
  }
}

async function write(entry) {
  await mkdir(LOG_DIR, { recursive: true });
  await pruneOldLogs();
  await appendFile(logPath(), JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n');
  return entry;
}

export function logUsage({ type, model, promptTokens, completionTokens = 0, latencyMs, userId = 'system', requestId, meta = {} }) {
  return write({
    type,
    userId,
    model,
    requestId,
    promptTokens,
    completionTokens,
    estimatedCostUSD: estimateCost(model, promptTokens, completionTokens),
    latencyMs,
    meta,
  });
}

export function logEvent(type, { userId = 'system', ...meta } = {}) {
  return write({ type, userId, meta });
}

export const logError = (meta) => logEvent('error', meta);

export async function getSpendTodayUSD(userId) {
  const file = logPath();
  if (!existsSync(file)) return 0;
  return (await readFile(file, 'utf-8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((e) => e.userId === userId)
    .reduce((sum, e) => sum + (e.estimatedCostUSD ?? 0), 0);
}
