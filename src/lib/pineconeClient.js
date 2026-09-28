import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { EMBEDDING_MODEL } from './openaiClient.js';

const DIMENSIONS = { 'text-embedding-3-small': 1536, 'text-embedding-3-large': 3072 };

for (const key of ['PINECONE_API_KEY', 'PINECONE_INDEX_NAME']) {
  if (!process.env[key]) throw new Error(`${key} is not set`);
}

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
let indexPromise = null;

async function initIndex() {
  const name = process.env.PINECONE_INDEX_NAME;
  const dimension = DIMENSIONS[EMBEDDING_MODEL];
  if (!dimension) throw new Error(`Unknown dimension for embedding model "${EMBEDDING_MODEL}"`);

  const { indexes = [] } = await pinecone.listIndexes();
  const existing = indexes.find((i) => i.name === name);

  if (!existing) {
    await pinecone.createIndex({
      name,
      dimension,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
      waitUntilReady: true,
      suppressConflicts: true,
    });
  } else if (existing.dimension !== dimension) {
    throw new Error(`Index "${name}" has dimension ${existing.dimension}, but ${EMBEDDING_MODEL} produces ${dimension}`);
  }

  return pinecone.index(name);
}

export function getIndex() {
  indexPromise ??= initIndex();
  return indexPromise;
}
