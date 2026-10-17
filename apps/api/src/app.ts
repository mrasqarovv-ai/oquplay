import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
import { hash, compare } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { DraftSchema, GameSchema, GenerationSchema, SubmissionSchema, demoGame, demoSource, evidenceIssues, type AttemptResult, type GameContent, type GenerationInput } from '@oquplay/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma, type DB } from './db';
import { config } from './config';
import { AppError } from './errors';
import { nativeRequest, newSession, publicUser, requireSession, requireUser, revokeSession, sessionFor } from './auth';
import { prepareGame, gradeGame } from './gameplay';
import { generateValidated, OpenAIResponsesProvider, type LLMProvider } from './llm';
import { replaceGeneratedItem } from './regeneration';
import { reserveGeneration } from './generationJobs';
import { OpenAILessonProvider, type LessonProvider } from './lessonGeneration';
import { registerLessonRoutes } from './lessonRoutes';

const json = (value: unknown) => value as Prisma.InputJsonValue;
const paramsId = (req: FastifyRequest) => z.object({ id: z.string().uuid() }).parse(req.params).id;
const requestKey = (req: FastifyRequest) => z.string().uuid().parse(req.headers['idempotency-key']);
const credentials = z.object({ email: z.string().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(10).max(72).refine(s => Buffer.byteLength(s) <= 72) });
type Tx = Prisma.TransactionClient;
async function lockAttemptStart(tx: Tx, participantKey: string, key: string) {
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(7320192, hashtext(${`${participantKey}:${key}`}))`;
}
async function ownGame(db: DB | Tx, gameId: string, userId: string) {
 const game = await db.game.findFirst({ where: { id: gameId, ownerId: userId } });
 if (!game) throw new AppError('not_found', 404); return game;
}
async function snapshot(tx: Tx, game: Awaited<ReturnType<typeof ownGame>>) {
 const last = await tx.gameVersion.aggregate({ where: { gameId: game.id }, _max: { number: true } });
 const content = GameSchema.parse(game.draft);
 const issues = evidenceIssues(content, game.source); if (issues.length) throw new AppError('validation_error', 422, issues);
 return tx.gameVersion.create({ data: { gameId: game.id, number: (last._max.number ?? 0) + 1, content: json(content), source: game.source, timeLimitSec: game.timeLimitSec, isDemo: game.isDemo,
  tasks: { create: content.items.map((item, i) => ({ contentId: item.id, position: i, content: json(item) })) },
 } });
}
const safeGame = (game: { id: string; title: string; subject: string; gameType: string; status: string; archived: boolean; isDemo: boolean; updatedAt: Date }) => ({ id: game.id, title: game.title, subject: game.subject, gameType: game.gameType, status: game.status, archived: game.archived, isDemo: game.isDemo, updatedAt: game.updatedAt });

export async function buildApp(options: { db?: DB; provider?: LLMProvider; lessonProvider?: LessonProvider; mode?: 'demo' | 'live'; testing?: boolean } = {}) {
 const db = options.db ?? prisma, mode = options.mode ?? config.LLM_MODE, provider = options.provider ?? new OpenAIResponsesProvider();
 const app = Fastify({ logger: options.testing ? false : { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] }, bodyLimit: 400000, trustProxy: false });
 await app.register(cookie);
 await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-Oquplay-Client', 'Idempotency-Key'] });
 await app.register(helmet, { contentSecurityPolicy: false });
 await app.register(rateLimit, { global: true, max: options.testing ? 10000 : 180, timeWindow: '1 minute', errorResponseBuilder: () => ({ error: 'rate_limit' }) });
 app.addHook('onRequest', async (req, reply) => {
  if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin !== config.WEB_ORIGIN && !nativeRequest(req)) throw new AppError('origin_forbidden', 403);
 });
 app.setErrorHandler((err, _req, reply) => {
  if (err instanceof z.ZodError) return reply.code(422).send({ error: 'validation_error', fields: err.issues.map(i => ({ path: i.path, message: i.message })) });
  if (err instanceof AppError) return reply.code(err.statusCode).send({ error: err.code, ...(err.fields ? { fields: err.fields } : {}) });
  const e = err as { code?: string; statusCode?: number };
  if (e.code === 'P2002') return reply.code(409).send({ error: 'conflict' });
  if (e.statusCode === 429) return reply.code(429).send({ error: 'rate_limit' });
  if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: 'invalid_request' });
  // Do not log bodies, provider errors, tokens, sources or Prisma query parameters.
  app.log.error({ code: e.code ?? 'internal' }, 'Request failed');
  return reply.code(500).send({ error: 'server_error' });
 });
 const authRate = { config: { rateLimit: { max: options.testing ? 10000 : 8, timeWindow: '1 minute' } } };
 app.get('/api/health', async () => { await db.$queryRaw`SELECT 1`; return { ok: true, mode }; });
 app.post('/api/auth/session', async (req, reply) => { const s = await sessionFor(db, req); return s ? { user: publicUser(s.user) } : newSession(db, req, reply); });
 app.post('/api/auth/register', authRate, async (req, reply) => {
  const body = credentials.extend({ name: z.string().trim().min(1).max(60), role: z.enum(['TEACHER', 'STUDENT']) }).strict().parse(req.body);
  const user = await db.user.create({ data: { email: body.email, name: body.name, role: body.role, passwordHash: await hash(body.password, 12) } });
  await revokeSession(db, req, reply); return newSession(db, req, reply, user.id);
 });
 const dummyHash = await hash('dummy-password-no-account', 12);
 app.post('/api/auth/login', authRate, async (req, reply) => {
  const body = credentials.strict().parse(req.body), user = await db.user.findUnique({ where: { email: body.email } });
  const valid = await compare(body.password, user?.passwordHash ?? dummyHash);
  if (!user || !valid) throw new AppError('invalid_credentials', 401);
  await revokeSession(db, req, reply); return newSession(db, req, reply, user.id);
 });
 app.post('/api/auth/logout', async (req, reply) => { await revokeSession(db, req, reply); return newSession(db, req, reply); });
 app.get('/api/demos/:type/:language', async req => { const p = z.object({ type: z.enum(['quiz', 'matching', 'ordering']), language: z.enum(['kk', 'ru']) }).parse(req.params); return { content: demoGame(p.type, p.language), source: demoSource(p.language), isDemo: true, timeLimitSec: null }; });

 app.post('/api/generations', { config: { rateLimit: { max: options.testing ? 10000 : 12, timeWindow: '1 minute' } } }, async req => {
  const user = await requireUser(db, req), key = requestKey(req);
  const body = z.strictObject({ settings: GenerationSchema, existing: GameSchema.optional(), replaceItemId: z.string().optional() }).parse(req.body);
  if (!!body.existing !== !!body.replaceItemId || (body.existing && (!body.existing.items.some(i => i.id === body.replaceItemId) || body.existing.gameType !== body.settings.gameType))) throw new AppError('invalid_request', 422);
  const { job, fresh } = await reserveGeneration(db, user.id, key, JSON.stringify(body), mode);
  if (!fresh) return job.result;
  try {
   let content: GameContent, source = body.settings.source;
   if (mode === 'demo') {
    const sample = demoGame(body.settings.gameType, body.settings.language);
    if (body.settings.count !== 5 || source.trim() !== demoSource(body.settings.language).trim() || body.settings.subject !== sample.subject || body.settings.topic !== sample.title || body.settings.grade !== 6 || body.settings.difficulty !== 'A') throw new AppError('demo_sample_only', 422);
    content = sample; source = demoSource(body.settings.language);
   } else content = await generateValidated(provider, body.settings, body.replaceItemId ? 1 : body.settings.count);
   if (body.existing && body.replaceItemId) {
    content = replaceGeneratedItem(body.existing, content, body.replaceItemId, mode);
   }
   const result = { content, source, isDemo: mode === 'demo', timeLimitSec: null, jobId: job.id };
   await db.generationJob.update({ where: { id: job.id }, data: { state: 'COMPLETED', result: json(result) } }); return result;
  } catch (error) {
   await db.generationJob.update({ where: { id: job.id }, data: { state: 'FAILED', errorCode: error instanceof AppError ? error.code : 'invalid_generation' } }); throw error;
  }
 });

 await registerLessonRoutes(app, { db, mode, provider: options.lessonProvider ?? new OpenAILessonProvider(), testing: options.testing });

 app.get('/api/games', async req => {
  const user = await requireUser(db, req);
  const games = await db.game.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: 'desc' }, take: 500 }); return games.map(safeGame);
 });
 app.post('/api/games', async req => {
  const user = await requireUser(db, req), body = DraftSchema.parse(req.body);
  const fields = evidenceIssues(body.content, body.source); if (fields.length) throw new AppError('validation_error', 422, fields);
  const game = await db.game.create({ data: { ownerId: user.id, title: body.content.title, subject: body.content.subject, gameType: body.content.gameType, draft: json(body.content), source: body.source, timeLimitSec: body.timeLimitSec, isDemo: body.isDemo } }); return { id: game.id, revision: game.revision };
 });
 app.get('/api/games/:id', async req => {
  const user = await requireUser(db, req), game = await ownGame(db, paramsId(req), user.id);
  const share = await db.shareSession.findFirst({ where: { gameId: game.id, active: true }, orderBy: { createdAt: 'desc' } });
  return { ...safeGame(game), draft: game.draft, source: game.source, timeLimitSec: game.timeLimitSec, revision: game.revision, shareCode: share?.code ?? null };
 });
 app.put('/api/games/:id', async req => {
  const user = await requireUser(db, req), id = paramsId(req), body = DraftSchema.extend({ revision: z.number().int().positive() }).parse(req.body);
  await ownGame(db, id, user.id); const fields = evidenceIssues(body.content, body.source); if (fields.length) throw new AppError('validation_error', 422, fields);
  const changed = await db.game.updateMany({ where: { id, ownerId: user.id, revision: body.revision }, data: { title: body.content.title, subject: body.content.subject, gameType: body.content.gameType, draft: json(body.content), source: body.source, timeLimitSec: body.timeLimitSec, isDemo: body.isDemo, revision: { increment: 1 } } });
  if (!changed.count) throw new AppError('revision_conflict', 409); return { id, revision: body.revision + 1 };
 });
 app.post('/api/games/:id/duplicate', async req => {
  const user = await requireUser(db, req), game = await ownGame(db, paramsId(req), user.id);
  const copy = await db.game.create({ data: { ownerId: user.id, title: game.title, subject: game.subject, gameType: game.gameType, draft: json(game.draft), source: game.source, timeLimitSec: game.timeLimitSec, isDemo: game.isDemo } }); return { id: copy.id };
 });
 app.post('/api/games/:id/publish', async req => {
  const user = await requireUser(db, req), id = paramsId(req), body = z.strictObject({ reviewed: z.literal(true), revision: z.number().int() }).parse(req.body);
  if (user.role !== 'TEACHER') throw new AppError('teacher_only', 403);
  return db.$transaction(async tx => {
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
   const game = await ownGame(tx, id, user.id);
   if (game.archived) throw new AppError('game_archived', 409);
   if (game.revision !== body.revision) throw new AppError('revision_conflict', 409);
   const version = await snapshot(tx, game);
   await tx.shareSession.updateMany({ where: { gameId: id, active: true }, data: { active: false } });
   const share = await tx.shareSession.create({ data: { gameId: id, versionId: version.id, code: randomBytes(8).toString('hex').toUpperCase() } });
   await tx.game.update({ where: { id }, data: { status: 'PUBLISHED' } }); return { code: share.code, version: version.number };
  });
 });
 for (const action of ['close', 'archive'] as const) app.post(`/api/games/:id/${action}`, async req => {
  const user = await requireUser(db, req), id = paramsId(req); await ownGame(db, id, user.id);
  await db.$transaction(async tx => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`; await tx.shareSession.updateMany({ where: { gameId: id }, data: { active: false } }); await tx.game.update({ where: { id }, data: { status: 'CLOSED', ...(action === 'archive' ? { archived: true } : {}) } }); }); return { ok: true };
 });

 const joinRate = { config: { rateLimit: { max: options.testing ? 10000 : 20, timeWindow: '1 minute' } } };
 app.post('/api/join', joinRate, async req => {
  const s = await requireSession(db, req), key = requestKey(req), body = z.strictObject({ code: z.string().trim().toUpperCase().regex(/^[A-F0-9]{16}$/), nickname: z.string().trim().min(1).max(40) }).parse(req.body);
  const participantKey = s.userId ? `user:${s.userId}` : `guest:${s.id}`;
  return db.$transaction(async tx => {
   await lockAttemptStart(tx, participantKey, key);
   const old = await tx.attempt.findUnique({ where: { participantKey_startKey: { participantKey, startKey: key } }, include: { share: true } });
   if (old) { if (old.share?.code !== body.code) throw new AppError('idempotency_conflict', 409); return { id: old.id }; }
   const share = await tx.shareSession.findUnique({ where: { code: body.code }, include: { version: true, game: true } });
   if (!share || !share.active || share.game.archived) throw new AppError('code_unavailable', 404);
   const prepared = prepareGame(GameSchema.parse(share.version.content));
   const attempt = await tx.attempt.create({ data: { versionId: share.versionId, shareId: share.id, sessionId: s.id, userId: s.userId, participantKey, nickname: body.nickname, startKey: key, playContent: json(prepared.key), presentation: json(prepared.publicGame), expiresAt: share.version.timeLimitSec ? new Date(Date.now() + share.version.timeLimitSec * 1000) : null } }); return { id: attempt.id };
  });
 });
 app.post('/api/games/:id/practice', async req => {
  const s = await requireSession(db, req); if (!s.user) throw new AppError('login_required', 401);
  const id = paramsId(req), key = requestKey(req), participantKey = `user:${s.user.id}`;
  return db.$transaction(async tx => {
   await lockAttemptStart(tx, participantKey, key);
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
   const game = await ownGame(tx, id, s.userId!);
   if (game.archived) throw new AppError('game_archived', 409);
   const old = await tx.attempt.findUnique({ where: { participantKey_startKey: { participantKey, startKey: key } }, include: { version: true } });
   if (old) { if (old.version.gameId !== id || old.shareId !== null) throw new AppError('idempotency_conflict', 409); return { id: old.id }; }
   const version = await snapshot(tx, game), prepared = prepareGame(GameSchema.parse(version.content));
   const attempt = await tx.attempt.create({ data: { versionId: version.id, sessionId: s.id, userId: s.userId, participantKey, nickname: s.user!.name, startKey: key, playContent: json(prepared.key), presentation: json(prepared.publicGame), expiresAt: version.timeLimitSec ? new Date(Date.now() + version.timeLimitSec * 1000) : null } }); return { id: attempt.id };
  });
 });
 async function ownAttempt(req: FastifyRequest) {
  const s = await requireSession(db, req), attempt = await db.attempt.findUnique({ where: { id: paramsId(req) }, include: { version: true } });
  if (!attempt || (attempt.userId ? attempt.userId !== s.userId : attempt.sessionId !== s.id)) throw new AppError('not_found', 404); return attempt;
 }
 app.get('/api/attempts/:id', async req => {
  const a = await ownAttempt(req); return { id: a.id, game: a.presentation, startedAt: a.startedAt, expiresAt: a.expiresAt, serverNow: new Date(), completed: !!a.completedAt, result: a.result, isDemo: a.version.isDemo };
 });
 app.post('/api/attempts/:id/submit', async req => {
  const a = await ownAttempt(req), body = SubmissionSchema.parse(req.body);
  return db.$transaction(async tx => {
   const current = await tx.attempt.findUniqueOrThrow({ where: { id: a.id } });
   if (current.completedAt) return current.result;
   const now = new Date(), timedOut = !!current.expiresAt && now.getTime() > current.expiresAt.getTime() + 5000;
   const grade = gradeGame(GameSchema.parse(current.playContent), body.answers, timedOut);
   const content = GameSchema.parse(a.version.content);
   const result: AttemptResult = { id: a.id, gameId: a.version.gameId, title: content.title, ...grade, percent: Math.round(grade.score / grade.total * 100), elapsedSec: Math.max(0, Math.floor((now.getTime() - current.startedAt.getTime()) / 1000)), timedOut, completedAt: now.toISOString(), isDemo: a.version.isDemo };
   const updated = await tx.attempt.updateMany({ where: { id: a.id, completedAt: null }, data: { completedAt: now, score: grade.score, total: grade.total, result: json(result) } });
   if (!updated.count) return (await tx.attempt.findUniqueOrThrow({ where: { id: a.id } })).result;
   const tasks = await tx.task.findMany({ where: { versionId: a.versionId } });
   await tx.answer.createMany({ data: grade.review.map(row => ({ attemptId: a.id, taskId: tasks.find(t => t.contentId === row.id)!.id, supplied: json({ shown: row.given }), correct: row.correct })) });
   return result;
  });
 });
 app.post('/api/attempts/:id/retry', async req => {
  const a = await ownAttempt(req), s = await requireSession(db, req), key = requestKey(req);
  if (!a.completedAt) throw new AppError('finish_attempt_first', 409);
  return db.$transaction(async tx => {
   await lockAttemptStart(tx, a.participantKey, key);
   const previous = await tx.attempt.findUnique({ where: { participantKey_startKey: { participantKey: a.participantKey, startKey: key } } });
   if (previous) {
    if (previous.id === a.id || previous.versionId !== a.versionId || previous.shareId !== a.shareId) throw new AppError('idempotency_conflict', 409);
    return { id: previous.id };
   }
   if (a.shareId) { const share = await tx.shareSession.findUnique({ where: { id: a.shareId }, include: { game: true } }); if (!share?.active || share.game.archived) throw new AppError('code_unavailable', 404); }
   else { const game = await tx.game.findUnique({ where: { id: a.version.gameId } }); if (game?.archived) throw new AppError('game_archived', 409); }
   const prepared = prepareGame(GameSchema.parse(a.version.content));
   const result = await tx.attempt.create({ data: { versionId: a.versionId, shareId: a.shareId, sessionId: s.id, userId: s.userId, participantKey: a.participantKey, nickname: a.nickname, startKey: key, playContent: json(prepared.key), presentation: json(prepared.publicGame), expiresAt: a.version.timeLimitSec ? new Date(Date.now() + a.version.timeLimitSec * 1000) : null } }); return { id: result.id };
  });
 });
 app.get('/api/history', async req => {
  const user = await requireUser(db, req); const attempts = await db.attempt.findMany({ where: { userId: user.id, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 200 }); return attempts.map(a => a.result);
 });
 app.get('/api/teacher/recent', async req => {
  const user = await requireUser(db, req); if (user.role !== 'TEACHER') throw new AppError('teacher_only', 403);
  const rows = await db.attempt.findMany({ where: { version: { game: { ownerId: user.id } }, shareId: { not: null }, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 8, include: { version: { select: { gameId: true, number: true } } } });
  return rows.map(row => { const r = row.result as unknown as AttemptResult; return { id: row.id, nickname: row.nickname, gameId: row.version.gameId, title: r.title, percent: r.percent, completedAt: row.completedAt }; });
 });
 app.get('/api/games/:id/analytics', async req => {
  const user = await requireUser(db, req); if (user.role !== 'TEACHER') throw new AppError('teacher_only', 403);
  const id = paramsId(req), game = await ownGame(db, id, user.id);
  const attempts = await db.attempt.findMany({ where: { version: { gameId: id }, shareId: { not: null }, completedAt: { not: null } }, orderBy: { completedAt: 'asc' }, include: { version: { select: { number: true } } } });
  const groups = new Map<string, { nickname: string; attempts: number; best: number; last: number; lastAt: Date | null }>();
  const errors = new Map<string, { prompt: string; version: number; wrong: number; tries: number }>();
  let sum = 0;
  for (const a of attempts) {
   const result = a.result as unknown as AttemptResult; sum += result.percent;
   const old = groups.get(a.participantKey); groups.set(a.participantKey, { nickname: a.nickname, attempts: (old?.attempts ?? 0) + 1, best: Math.max(old?.best ?? 0, result.percent), last: result.percent, lastAt: a.completedAt });
   for (const r of result.review) { const k = `${a.versionId}:${r.id}`, old = errors.get(k); errors.set(k, { prompt: r.prompt, version: a.version.number, wrong: (old?.wrong ?? 0) + (r.correct ? 0 : 1), tries: (old?.tries ?? 0) + 1 }); }
  }
  return { title: game.title, participants: groups.size, attempts: attempts.length, average: attempts.length ? Math.round(sum / attempts.length) : 0, rows: [...groups.values()], hardest: [...errors.values()].sort((a,b) => b.wrong / b.tries - a.wrong / a.tries) };
 });
 if (config.STATIC_WEB_DIR) {
  await app.register(staticFiles, { root: resolve(config.STATIC_WEB_DIR), wildcard: true });
  app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') ? reply.code(404).send({ error: 'not_found' }) : reply.sendFile('index.html'));
 }
 return app;
}
