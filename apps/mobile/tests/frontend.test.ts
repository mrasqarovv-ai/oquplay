import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { demoGame, demoSource, type GenerationInput, type User } from '@oquplay/shared';
import { canRegenerateItem, generationSettings } from '../src/generation';
import { applySession, type SessionData } from '../src/session';
import { remainingSeconds } from '../src/timer';

const teacher: User = { id: 'teacher', email: 'teacher@example.test', name: 'Teacher', role: 'TEACHER' };
const form: GenerationInput = { source: demoSource('kk'), subject: 'Edited subject', topic: 'Edited topic', grade: 8, language: 'kk', difficulty: 'B', gameType: 'quiz', count: 10 };

for (const gameType of ['quiz', 'matching', 'ordering'] as const) {
 for (const language of ['kk', 'ru'] as const) {
  test(`${gameType}/${language} demo regeneration uses sample topic after editing and reloading the title`, () => {
   const sample = demoGame(gameType, language);
   const content = { ...sample, title: 'My classroom title', instructions: 'My classroom instructions' };
   const savedForm: GenerationInput = { ...form, source: demoSource(language), topic: content.title, count: 5 };
   const before = structuredClone(content);
   const settings = generationSettings(savedForm, content, 'demo', sample.items[0]!.id);
   assert.equal(settings.topic, sample.title);
   assert.equal(settings.subject, sample.subject);
   assert.equal(settings.gameType, gameType);
   assert.equal(settings.language, language);
   assert.equal(settings.source, demoSource(language));
   assert.equal(settings.grade, 6);
   assert.equal(settings.difficulty, 'A');
   assert.deepEqual(content, before);
  });
 }
}

test('full demo generation keeps user settings for server validation', () => {
 const content = demoGame('quiz', 'kk');
 assert.equal(generationSettings(form, content, 'demo'), form);
 assert.equal(generationSettings(form, null, 'demo'), form);
});

test('live regeneration uses the edited title and content metadata', () => {
 const content = { ...demoGame('ordering', 'ru'), title: 'Edited lesson', grade: 9, difficulty: 'C' as const };
 const settings = generationSettings(form, content, 'live', content.items[0]!.id);
 assert.equal(settings.topic, content.title);
 assert.equal(settings.language, content.language);
 assert.equal(settings.gameType, content.gameType);
 assert.equal(settings.grade, 9);
 assert.equal(settings.difficulty, 'C');
});

test('demo regeneration is unavailable for custom task IDs while live regeneration stays available', () => {
 for (const gameType of ['quiz', 'matching', 'ordering'] as const) {
  for (const language of ['kk', 'ru'] as const) {
   const content = demoGame(gameType, language);
   assert.equal(canRegenerateItem(content, content.items[0]!.id, 'demo'), true);
   assert.equal(canRegenerateItem(content, 'custom-task', 'demo'), false);
   assert.equal(canRegenerateItem(content, 'custom-task', 'live'), true);
  }
 }
});

test('logout updates active session observers and removes private data without losing server mode', async () => {
 const client = new QueryClient();
 client.setQueryData<SessionData>(['session'], { user: teacher });
 client.setQueryData(['health'], { mode: 'live' });
 client.setQueryData(['games'], ['private game']);
 client.setQueryData(['history'], ['private attempt']);
 const observer = new QueryObserver<SessionData>(client, { queryKey: ['session'], queryFn: async () => ({ user: teacher }), staleTime: Infinity });
 const unsubscribe = observer.subscribe(() => {});
 try {
  await applySession(client, { user: null });
  assert.deepEqual(observer.getCurrentResult().data, { user: null });
  assert.deepEqual(client.getQueryData(['session']), { user: null });
  assert.deepEqual(client.getQueryData(['health']), { mode: 'live' });
  assert.equal(client.getQueryData(['games']), undefined);
  assert.equal(client.getQueryData(['history']), undefined);
 } finally { unsubscribe(); client.clear(); }
});

test('changing accounts cancels old session fetches while preserving an in-flight health check', async () => {
 const client = new QueryClient();
 let finishSession!: (session: SessionData) => void;
 let finishHealth!: (health: { mode: string }) => void;
 const staleFetch = client.fetchQuery({ queryKey: ['session'], queryFn: () => new Promise<SessionData>(resolve => { finishSession = resolve; }) });
 const cancelled = staleFetch.catch(() => undefined);
 const healthFetch = client.fetchQuery({ queryKey: ['health'], queryFn: () => new Promise<{ mode: string }>(resolve => { finishHealth = resolve; }) });
 const nextUser: User = { ...teacher, id: 'student', role: 'STUDENT' };
 try {
  await applySession(client, { user: nextUser });
  finishSession({ user: teacher });
  finishHealth({ mode: 'live' });
  await cancelled;
  await healthFetch;
  assert.deepEqual(client.getQueryData(['session']), { user: nextUser });
  assert.deepEqual(client.getQueryData(['health']), { mode: 'live' });
 } finally { client.clear(); }
});

for (const clientSkew of [-3_600_000, 0, 3_600_000]) {
 test(`cached timer keeps elapsed time after remount with ${clientSkew} ms client clock skew`, t => {
  const serverNow = Date.parse('2026-01-01T12:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: serverNow + clientSkew });
  const client = new QueryClient();
  const timing = { serverNow: new Date(serverNow).toISOString(), expiresAt: new Date(serverNow + 300_000).toISOString(), receivedAt: Date.now() };
  const key = ['attempt', 'timed-attempt'];
  client.setQueryData(key, timing);
  try {
   assert.equal(remainingSeconds(timing), 300);
   t.mock.timers.tick(240_000);
   const cached = client.getQueryData<typeof timing>(key)!;
   assert.equal(remainingSeconds(cached), 60);
   t.mock.timers.tick(60_000);
   assert.equal(remainingSeconds(cached), 0);
   t.mock.timers.tick(10_000);
   assert.equal(remainingSeconds(cached), 0);
   assert.equal(cached.receivedAt, serverNow + clientSkew);
  } finally { client.clear(); }
 });
}

test('untimed attempts have no countdown', () => {
 assert.equal(remainingSeconds({ serverNow: '2026-01-01T12:00:00Z', expiresAt: null, receivedAt: Date.now() }), null);
});
