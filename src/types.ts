export type Complexity = 'simple-fact' | 'multi-step-reasoning' | 'edge-case';

export interface QaPair {
  id: number;
  complexity: Complexity;
  question: string;
  referenceAnswer: string;
  /** Source file name, comma-separated file names, or "none" for out-of-scope questions. */
  source: string;
}

export interface BulkQaPair extends QaPair {
  seedId: number | null;
  variant: 'plain' | 'lowercase' | 'typos' | 'out-of-scope';
}

export interface ChunkMetadata {
  [key: string]: string;
  text: string;
  source: string;
}

export interface RetrievedChunk {
  source: string;
  score: number | undefined;
}

export interface AnswerResult {
  answered: boolean;
  answer: string;
  sources: string[];
  retrieved?: RetrievedChunk[];
  flagged?: boolean;
  error?: string;
  costUSD?: number | null;
  latencyMs?: number;
}

export interface AnswerOptions {
  userId?: string;
  model?: string;
  temperature?: number;
}
