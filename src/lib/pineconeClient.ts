import 'dotenv/config';
import { Pinecone, type Index } from '@pinecone-database/pinecone';
import type { ChunkMetadata } from '../types.js';
import { EMBEDDING_MODEL } from './openaiClient.js';

const DIMENSIONS: Record<string, number> = { 'text-embedding-3-small': 1536, 'text-embedding-3-large': 3072 };

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

const pinecone = new Pinecone({ apiKey: requireEnv('PINECONE_API_KEY') });
const indexName = requireEnv('PINECONE_INDEX_NAME');
let indexPromise: Promise<Index<ChunkMetadata>> | null = null;

async function initIndex(): Promise<Index<ChunkMetadata>> {
  const dimension = DIMENSIONS[EMBEDDING_MODEL];
  if (!dimension) throw new Error(`Unknown dimension for embedding model "${EMBEDDING_MODEL}"`);

  const { indexes = [] } = await pinecone.listIndexes();
  const existing = indexes.find((i) => i.name === indexName);

  if (!existing) {
    await pinecone.createIndex({
      name: indexName,
      dimension,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
      waitUntilReady: true,
      suppressConflicts: true,
    });
  } else if (existing.dimension !== dimension) {
    throw new Error(
      `Index "${indexName}" has dimension ${existing.dimension}, but ${EMBEDDING_MODEL} produces ${dimension}`,
    );
  }

  return pinecone.index<ChunkMetadata>(indexName);
}

export function getIndex(): Promise<Index<ChunkMetadata>> {
  indexPromise ??= initIndex();
  return indexPromise;
}
