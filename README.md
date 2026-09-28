# G3 POC — Knowledge Base Q&A (RAG)

POC for the "AI Product Integration" goal. Demonstrates RAG using OpenAI (chat + embeddings) and Pinecone (vector store), with guardrail system prompts, token/cost tracking, exponential backoff, audit logging, and embedding cache.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `OPENAI_API_KEY` and `PINECONE_API_KEY`.
3. (Optional) `npm run generate-mock-data` — expands `data/qa-pairs.json` into 10k grounded Q&A pairs in `data/qa-pairs-bulk.json` (see Mock Data below).
4. `npm run ingest` — token-chunks + batch-embeds docs, upserts into Pinecone and deletes stale chunks of edited docs (embeddings cached in `data/embeddings-cache.json`, keyed by model).
5. `npm run query -- [--user <id>] "your question"` — moderates the question, retrieves chunks above `MIN_SCORE`, returns a grounded structured answer with sources.
6. `npm run evaluate` — runs `data/qa-pairs.json` across `EVAL_MODELS` × `EVAL_TEMPERATURES`, grades answers with an LLM judge, prints accuracy / retrieval hit rate / cost / latency per variant. Set `EVAL_QA_PATH=data/qa-pairs-bulk.json EVAL_LIMIT=500` for volume runs (raise `DAILY_BUDGET_USD_PER_USER` accordingly).

> Upgrading from the previous version: vector IDs changed to `<file>#<i>-<hash>`. Delete the Pinecone index (or its vectors) once so old-format IDs don't linger.

## Mock Data

`data/documents/*.md` are 50 docs (~230KB, ~170 chunks) for a fictional webhook API product ("Loopwire") — core guides, API references, SDKs/CLI/tooling, account & security, and troubleshooting/ops — with concrete, checkable facts (exact limits, status codes, retry schedules) kept consistent across docs.

`data/qa-pairs.json` is 215 curated questions tagged by complexity (`simple-fact`, `multi-step-reasoning`, `edge-case`) with reference answers and the source doc, including one deliberately out-of-scope question to verify the system prompt's refusal behavior. Faker-generated lorem-ipsum text was tried first but produced semantically meaningless content that couldn't validate real retrieval or answer quality — real docs/questions are needed to demonstrate the RAG pipeline actually works, not just that it runs.

`npm run generate-mock-data` uses `@faker-js/faker` (seeded, `QA_COUNT` default 10k) to paraphrase each curated seed (persona prefixes, suffixes, lowercase, typos) so `referenceAnswer`/`source` still apply, plus ~10% out-of-scope / prompt-injection questions that must be refused.

## Development

TypeScript (strict, ESM/NodeNext), run directly with `tsx` — no build step. Requires Node 22+.

- `npm run typecheck` — `tsc` (strict, `noUncheckedIndexedAccess`, no emit)
- `npm run lint` — ESLint with `typescript-eslint` strict type-checked rules
- `npm run format` / `npm run format:check` — Prettier
- `npm run check` — all three; run before committing

## Structure

- `src/types.ts` — shared types (`QaPair`, `AnswerResult`, `ChunkMetadata`, ...).

- `scripts/generateMockData.ts` — generates 10k grounded Q&A pairs via `@faker-js/faker`.
- `scripts/evaluate.ts` — prompt/model/temperature evaluation harness.
- `src/lib/openaiClient.ts` — OpenAI client init (SDK retries disabled) and model config.
- `src/lib/pineconeClient.ts` — Pinecone client + index init (waits until ready, validates dimension).
- `src/lib/embeddings.ts` — batched, cached embedding generation.
- `src/lib/embeddingCache.ts` — model-keyed local cache, written atomically once per run.
- `src/lib/retry.ts` — exponential backoff with jitter, `Retry-After`, max delay; retries 429/5xx/network errors (OpenAI + Pinecone), not `insufficient_quota`.
- `src/lib/auditLog.ts` — daily `logs/audit-YYYY-MM-DD.jsonl` (usage, cost, retries/errors, cache hits, moderation violations) with per-user IDs, PII redaction, `LOG_RETENTION_DAYS` pruning, and per-user daily spend.
- `src/ingest.ts` — chunk documents, embed, upsert to Pinecone.
- `src/query.ts` — budget check, input/output moderation, similarity search with score threshold, token-budgeted context, few-shot + injection-hardened system prompt, JSON-schema structured output, `max_tokens` and `finish_reason` handling.

## Learning areas covered

- OpenAI API basics (auth, configurable model selection, error handling, quota/budget management)
- Chat completions, system prompts, few-shot examples, structured output
- Token counting (`js-tiktoken`) before requests + cost estimation
- Rate limiting with exponential backoff
- Vector embeddings, Pinecone storage, similarity search, RAG
- Safety: content moderation, prompt-injection guardrails, PII redaction, log retention, per-user cost tracking
- Testing prompt variations across models/temperatures
- Audit logging, embedding caching
