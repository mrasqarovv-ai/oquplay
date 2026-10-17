import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { evidenceIssues, type LessonDetail } from '@oquplay/shared';
import { lessonFixture, lessonInput } from './lessonFixture';
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to an isolated migrated PostgreSQL database.');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/app');
const { prisma } = await import('../src/db');
let calls = 0;
const live = await buildApp({ testing: true, mode: 'live', provider: { generate: async () => ({ status: 'ok', message: '', game: lessonFixture().game }) }, lessonProvider: { generate: async input => { calls++; await delay(40); return { status: 'ok', lesson: lessonFixture(input.language, input.gameType) }; } } });
const demo = await buildApp({ testing: true, mode: 'demo' });
after(async () => { await live.close(); await demo.close(); await prisma.$disconnect(); });
const request = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown, key?: string, app = live) => app.inject({ method, url: `/api${url}`, headers: { 'x-oquplay-client': 'native', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(key ? { 'idempotency-key': key } : {}) }, ...(payload === undefined ? {} : { payload: payload as object }) });
async function register(role = 'TEACHER') {
 const response = await request('POST', '/auth/register', undefined, { email: `${randomUUID()}@example.test`, password: 'Lesson-test-password-2026', name: 'Lesson learner', role });
 assert.equal(response.statusCode, 200, response.body); return response.json() as { token: string; user: { id: string } };
}
test('topic generation is authenticated; demo does not consume a reservation or fabricate content', async () => {
 const user = await register();
 assert.equal((await request('POST', '/lessons/generate', undefined, lessonInput(), randomUUID())).statusCode, 401);
 const response = await request('POST', '/lessons/generate', user.token, lessonInput(), randomUUID(), demo);
 assert.equal(response.statusCode, 403); assert.equal(response.json().error, 'live_required');
 assert.equal(await prisma.generationJob.count({ where: { userId: user.user.id } }), 0);
 assert.equal((await request('POST', '/lessons/generate', user.token, { ...lessonInput(), topic: '' }, randomUUID())).statusCode, 422);
});
test('concurrent requests generate once and atomically save a lesson with an editable game', async () => {
 const user = await register(), key = randomUUID(), before = calls;
 const responses = await Promise.all([request('POST', '/lessons/generate', user.token, lessonInput(), key), request('POST', '/lessons/generate', user.token, lessonInput(), key)]);
 assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
 assert.equal(calls, before + 1);
 const result = responses.find(r => r.statusCode === 200)!.json<LessonDetail>();
 const retry = await request('POST', '/lessons/generate', user.token, lessonInput(), key); assert.equal(retry.statusCode, 200, retry.body); assert.deepEqual(retry.json(), result); assert.equal(calls, before + 1);
 assert.equal(await prisma.lesson.count({ where: { ownerId: user.user.id } }), 1);
 assert.equal(await prisma.game.count({ where: { ownerId: user.user.id } }), 1);
 const game = (await request('GET', `/games/${result.gameId}`, user.token)).json();
 assert.equal(game.isDemo, false); assert.equal(game.status, 'DRAFT'); assert.deepEqual(evidenceIssues(game.draft, game.source), []);
 const conflict = await request('POST', '/lessons/generate', user.token, { ...lessonInput(), topic: 'Another topic' }, key); assert.equal(conflict.statusCode, 409); assert.equal(conflict.json().error, 'idempotency_conflict');
});
test('saved lessons and PPTX files remain private; student generated games cannot be published', async () => {
 const owner = await register('STUDENT'), stranger = await register(), created = await request('POST', '/lessons/generate', owner.token, lessonInput(), randomUUID());
 assert.equal(created.statusCode, 200, created.body); const lesson = created.json<LessonDetail>();
 for (const suffix of ['', '/presentation.pptx']) assert.equal((await request('GET', `/lessons/${lesson.id}${suffix}`, stranger.token)).statusCode, 404);
 assert.equal((await request('GET', `/lessons/${lesson.id}`)).statusCode, 401);
 assert.equal((await request('GET', '/lessons', stranger.token)).json().length, 0);
 const list = await request('GET', '/lessons', owner.token); assert.equal(list.json().length, 1); assert.equal('content' in list.json()[0], false);
 assert.deepEqual((await request('GET', `/lessons/${lesson.id}`, owner.token)).json(), lesson);
 const download = await request('GET', `/lessons/${lesson.id}/presentation.pptx`, owner.token); assert.equal(download.statusCode, 200); assert.match(String(download.headers['content-type']), /presentationml/); assert.equal(download.rawPayload.subarray(0, 2).toString(), 'PK');
 assert.equal((await request('POST', `/games/${lesson.gameId}/publish`, owner.token, { reviewed: true, revision: 1 })).statusCode, 403);
 assert.equal((await request('POST', `/games/${lesson.gameId}/practice`, owner.token, undefined, randomUUID())).statusCode, 200);
});
test('failed generation saves no partial lesson; retrying its key does not call the provider again', async () => {
 let failures = 0;
 const broken = await buildApp({ testing: true, mode: 'live', lessonProvider: { generate: async () => { failures++; return {}; } } });
 try {
  const user = await register(), key = randomUUID();
  for (let i = 0; i < 2; i++) { const response = await request('POST', '/lessons/generate', user.token, lessonInput(), key, broken); assert.equal(response.statusCode, 422); assert.equal(response.json().error, 'invalid_generation'); }
  assert.equal(failures, 2); assert.equal(await prisma.lesson.count({ where: { ownerId: user.user.id } }), 0); assert.equal(await prisma.game.count({ where: { ownerId: user.user.id } }), 0);
 } finally { await broken.close(); }
});
test('lessons and games share one daily budget under concurrent requests', async () => {
 const user = await register();
 await prisma.generationJob.createMany({ data: Array.from({ length: 9 }, () => ({ userId: user.user.id, requestKey: randomUUID(), requestHash: 'reserved-test-budget', mode: 'demo', state: 'COMPLETED', result: {} })) });
 const { lessonSource } = await import('@oquplay/shared');
 const settings = { ...lessonInput(), source: lessonSource(lessonFixture()) };
 const responses = await Promise.all([request('POST', '/lessons/generate', user.token, lessonInput(), randomUUID()), request('POST', '/generations', user.token, { settings }, randomUUID())]);
 assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 429]);
 assert.equal(responses.find(r => r.statusCode === 429)!.json().error, 'generation_limit');
 assert.equal(await prisma.generationJob.count({ where: { userId: user.user.id } }), 10);
});
