import 'dotenv/config';
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');

// SDK retries disabled: withBackoff() is the single retry layer.
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
export const CHAT_MODEL = process.env.CHAT_MODEL ?? 'gpt-4o';
export const MODERATION_MODEL = 'omni-moderation-latest';
