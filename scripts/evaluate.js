import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { answer } from '../src/query.js';
import { openai } from '../src/lib/openaiClient.js';
import { withBackoff } from '../src/lib/retry.js';
import { logUsage } from '../src/lib/auditLog.js';

// Runs curated Q&A pairs through the RAG pipeline across model x temperature variants,
// grades each answer against its referenceAnswer with an LLM judge, and reports accuracy/cost/latency.

const QA_PATH = process.env.EVAL_QA_PATH ?? path.join(process.cwd(), 'data', 'qa-pairs.json');
const MODELS = (process.env.EVAL_MODELS ?? 'gpt-4o,gpt-4o-mini').split(',');
const TEMPERATURES = (process.env.EVAL_TEMPERATURES ?? '0,0.2,0.7').split(',').map(Number);
const LIMIT = Number(process.env.EVAL_LIMIT ?? Infinity);
const JUDGE_MODEL = 'gpt-4o-mini';
const EVAL_USER = 'eval';

async function judge(qa, result) {
  const started = Date.now();
  const completion = await withBackoff(
    () =>
      openai.chat.completions.create({
        model: JUDGE_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Grade whether the candidate answer is factually consistent with the reference answer. A correct refusal counts as correct when the reference is a refusal. Respond as JSON: {"correct": boolean, "reason": string}.',
          },
          { role: 'user', content: `Question: ${qa.question}\nReference: ${qa.referenceAnswer}\nCandidate: ${result.answer}` },
        ],
      }),
    { label: 'openai.judge' },
  );
  await logUsage({
    type: 'judge',
    userId: EVAL_USER,
    model: JUDGE_MODEL,
    requestId: completion.id,
    promptTokens: completion.usage.prompt_tokens,
    completionTokens: completion.usage.completion_tokens,
    latencyMs: Date.now() - started,
  });
  return JSON.parse(completion.choices[0].message.content);
}

async function main() {
  const qaPairs = JSON.parse(await readFile(QA_PATH, 'utf-8')).slice(0, LIMIT);
  const rows = [];

  for (const model of MODELS) {
    for (const temperature of TEMPERATURES) {
      for (const qa of qaPairs) {
        const result = await answer(qa.question, { userId: EVAL_USER, model, temperature });
        const verdict = await judge(qa, result);
        const expected = qa.source.split(',').map((s) => s.trim()).filter((s) => s.endsWith('.md'));
        const retrievalHit = expected.length === 0 || expected.some((s) => result.retrieved?.some((r) => r.source === s));
        rows.push({ model, temperature, id: qa.id, complexity: qa.complexity, correct: verdict.correct, retrievalHit, reason: verdict.reason, answer: result.answer, costUSD: result.costUSD ?? 0, latencyMs: result.latencyMs ?? 0 });
      }
    }
  }

  const summary = Object.values(
    Object.groupBy(rows, (r) => `${r.model}@${r.temperature}`),
  ).map((group) => ({
    variant: `${group[0].model} @ t=${group[0].temperature}`,
    accuracy: `${((group.filter((r) => r.correct).length / group.length) * 100).toFixed(1)}%`,
    retrievalHit: `${((group.filter((r) => r.retrievalHit).length / group.length) * 100).toFixed(1)}%`,
    avgCostUSD: (group.reduce((s, r) => s + r.costUSD, 0) / group.length).toFixed(6),
    avgLatencyMs: Math.round(group.reduce((s, r) => s + r.latencyMs, 0) / group.length),
  }));
  console.table(summary);

  const outPath = path.join(process.cwd(), 'logs', `eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ summary, rows }, null, 2));
  console.log(`Full results: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
