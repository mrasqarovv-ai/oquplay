import { createHash } from 'node:crypto';
import type { DB } from './db';
import { config } from './config';
import { AppError } from './errors';

// All generation routes share reservations and budgets, including retries.
export async function reserveGeneration(db: DB, userId: string, key: string, fingerprint: string, mode: 'demo' | 'live') {
 const digest = createHash('sha256').update(fingerprint).digest('hex');
 const reservation = await db.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7320191)`;
  const old = await tx.generationJob.findUnique({ where: { userId_requestKey: { userId, requestKey: key } } });
  if (old) return { job: old, fresh: false };
  const since = new Date(Date.now() - 86400000);
  const [personal, global] = await Promise.all([
   tx.generationJob.count({ where: { userId, createdAt: { gte: since } } }),
   tx.generationJob.count({ where: { mode: 'live', createdAt: { gte: since } } }),
  ]);
  if (personal >= config.GENERATION_DAILY_LIMIT || (mode === 'live' && global >= config.GENERATION_GLOBAL_DAILY_LIMIT)) throw new AppError('generation_limit', 429);
  return { job: await tx.generationJob.create({ data: { userId, requestKey: key, requestHash: digest, mode } }), fresh: true };
 });
 if (reservation.job.requestHash !== digest) throw new AppError('idempotency_conflict', 409);
 if (!reservation.fresh && reservation.job.state !== 'COMPLETED') {
  const job = reservation.job;
  if (job.state === 'FAILED') throw new AppError(job.errorCode ?? 'invalid_generation', 422);
  throw new AppError(Date.now() - job.createdAt.getTime() > Math.max(180000, config.LLM_TIMEOUT_MS * 2 + 10000) ? 'generation_interrupted' : 'generation_running', 409);
 }
 return reservation;
}
