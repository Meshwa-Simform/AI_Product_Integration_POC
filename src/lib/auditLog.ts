import { existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

type Meta = Record<string, unknown>;

interface Rates {
  input: number;
  output: number;
}

interface NewLogEntry {
  type: string;
  userId: string;
  estimatedCostUSD?: number | null;
  [key: string]: unknown;
}

type LogEntry = NewLogEntry & { timestamp: string };

interface UsageInput {
  type: string;
  model: string;
  promptTokens: number;
  completionTokens?: number;
  latencyMs: number;
  userId?: string | undefined;
  requestId?: string;
  meta?: Meta;
}

const LOG_DIR = path.join(process.cwd(), 'logs');
const RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS ?? 30);
const DAY_MS = 86_400_000;

// USD per 1M tokens
const PRICING: Record<string, Rates> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'omni-moderation-latest': { input: 0, output: 0 },
};

const warnedModels = new Set<string>();
let pruned = false;

function estimateCost(model: string, promptTokens: number, completionTokens: number): number | null {
  const rates = PRICING[model];
  if (!rates) {
    if (!warnedModels.has(model)) console.warn(`No pricing for model "${model}"; cost logged as null`);
    warnedModels.add(model);
    return null;
  }
  return (promptTokens * rates.input + completionTokens * rates.output) / 1_000_000;
}

const logPath = (date = new Date()): string => path.join(LOG_DIR, `audit-${date.toISOString().slice(0, 10)}.jsonl`);

export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[PHONE]')
    .replace(/\b(sk|lw_live|lw_test)[-_][\w-]{8,}/g, '[SECRET]');
}

async function pruneOldLogs(): Promise<void> {
  if (pruned) return;
  pruned = true;
  const cutoff = Date.now() - RETENTION_DAYS * DAY_MS;
  for (const file of await readdir(LOG_DIR)) {
    const date = /^audit-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(file)?.[1];
    if (date && Date.parse(date) < cutoff) await unlink(path.join(LOG_DIR, file));
  }
}

async function write(entry: NewLogEntry): Promise<LogEntry> {
  await mkdir(LOG_DIR, { recursive: true });
  await pruneOldLogs();
  const full: LogEntry = { timestamp: new Date().toISOString(), ...entry };
  await appendFile(logPath(), JSON.stringify(full) + '\n');
  return full;
}

export async function logUsage({
  type,
  model,
  promptTokens,
  completionTokens = 0,
  latencyMs,
  userId = 'system',
  requestId,
  meta = {},
}: UsageInput): Promise<{ estimatedCostUSD: number | null; latencyMs: number }> {
  const estimatedCostUSD = estimateCost(model, promptTokens, completionTokens);
  await write({ type, userId, model, requestId, promptTokens, completionTokens, estimatedCostUSD, latencyMs, meta });
  return { estimatedCostUSD, latencyMs };
}

export async function logEvent(
  type: string,
  { userId = 'system', ...meta }: Meta & { userId?: string } = {},
): Promise<void> {
  await write({ type, userId, meta });
}

export const logError = (meta: Meta): Promise<void> => logEvent('error', meta);

export async function getSpendTodayUSD(userId: string): Promise<number> {
  const file = logPath();
  if (!existsSync(file)) return 0;
  return (await readFile(file, 'utf-8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogEntry)
    .filter((e) => e.userId === userId)
    .reduce((sum, e) => sum + (e.estimatedCostUSD ?? 0), 0);
}
