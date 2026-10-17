import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client';
import { LessonInputSchema, LessonSchema, lessonSource } from '@oquplay/shared';
import type { DB } from './db';
import { requireUser } from './auth';
import { AppError } from './errors';
import { reserveGeneration } from './generationJobs';
import { generateLesson, type LessonProvider } from './lessonGeneration';
import { lessonPresentation } from './presentation';

export async function registerLessonRoutes(app: FastifyInstance, options: { db: DB; mode: 'demo' | 'live'; provider: LessonProvider; testing?: boolean }) {
 const { db, mode, provider } = options;
 const owned = async (id: string, ownerId: string) => {
  const record = await db.lesson.findFirst({ where: { id, ownerId } });
  if (!record) throw new AppError('not_found', 404);
  return { id: record.id, gameId: record.gameId, content: LessonSchema.parse(record.content), createdAt: record.createdAt.toISOString() };
 };
 const idParam = (params: unknown) => z.object({ id: z.string().uuid() }).parse(params).id;

 app.get('/api/lessons', async req => {
  const user = await requireUser(db, req);
  const records = await db.lesson.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return records.map(record => { const { game } = LessonSchema.parse(record.content); return { id: record.id, gameId: record.gameId, title: game.title, subject: game.subject, language: game.language, grade: game.grade, createdAt: record.createdAt.toISOString() }; });
 });
 app.get('/api/lessons/:id', async req => owned(idParam(req.params), (await requireUser(db, req)).id));
 app.get('/api/lessons/:id/presentation.pptx', async (req, reply) => {
  const lesson = await owned(idParam(req.params), (await requireUser(db, req)).id);
  return reply.type('application/vnd.openxmlformats-officedocument.presentationml.presentation')
   .header('Content-Disposition', `attachment; filename="oquplay-${lesson.id}.pptx"`)
   .send(await lessonPresentation(lesson.content));
 });
 app.post('/api/lessons/generate', { config: { rateLimit: { max: options.testing ? 10000 : 6, timeWindow: '1 minute' } } }, async req => {
  const user = await requireUser(db, req);
  const input = LessonInputSchema.parse(req.body);
  if (mode !== 'live') throw new AppError('live_required', 403);
  const key = z.string().uuid().parse(req.headers['idempotency-key']);
  const { job, fresh } = await reserveGeneration(db, user.id, key, `lesson:${JSON.stringify(input)}`, mode);
  if (!fresh) return owned(z.object({ lessonId: z.string().uuid() }).parse(job.result).lessonId, user.id);
  try {
   const content = await generateLesson(provider, input);
   const record = await db.$transaction(async tx => {
    const game = await tx.game.create({ data: { ownerId: user.id, title: input.topic, subject: content.game.subject, gameType: input.gameType, draft: content.game as Prisma.InputJsonValue, source: lessonSource(content), isDemo: false } });
    const lesson = await tx.lesson.create({ data: { ownerId: user.id, gameId: game.id, content: content as Prisma.InputJsonValue } });
    await tx.generationJob.update({ where: { id: job.id }, data: { state: 'COMPLETED', result: { lessonId: lesson.id } } });
    return lesson;
   });
   return { id: record.id, gameId: record.gameId, content, createdAt: record.createdAt.toISOString() };
  } catch (error) {
   await db.generationJob.update({ where: { id: job.id }, data: { state: 'FAILED', errorCode: error instanceof AppError ? error.code : 'invalid_generation' } });
   throw error;
  }
 });
}
