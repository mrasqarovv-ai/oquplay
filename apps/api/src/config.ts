import 'dotenv/config';
import { z } from 'zod';
export const config = z.object({
 NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
 PORT: z.coerce.number().int().default(3001), HOST: z.string().default('0.0.0.0'),
 DATABASE_URL: z.string().default('postgresql://oquplay:local_only@localhost:5432/oquplay'),
 DB_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
 WEB_ORIGIN: z.string().url().default('http://localhost:8081'),
 LLM_MODE: z.enum(['demo', 'live']).default('demo'), LLM_API_KEY: z.string().default(''),
 LLM_BASE_URL: z.string().url().default('https://api.openai.com/v1'), LLM_MODEL: z.string().default(''),
 LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(90000).default(45000),
 LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1000).max(20000).default(12000),
 GENERATION_DAILY_LIMIT: z.coerce.number().int().min(1).default(10),
 GENERATION_GLOBAL_DAILY_LIMIT: z.coerce.number().int().min(1).default(100),
 STATIC_WEB_DIR: z.string().default(''),
}).parse(process.env);
if (config.LLM_MODE === 'live' && (!config.LLM_API_KEY || !config.LLM_MODEL)) throw new Error('Live mode requires LLM_API_KEY and LLM_MODEL in the server environment.');
if (config.NODE_ENV === 'production' && !config.WEB_ORIGIN.startsWith('https://')) throw new Error('Production WEB_ORIGIN must use HTTPS');
