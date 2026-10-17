import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { LessonInputSchema, LessonSchema, evidenceIssues, lessonMarkdown, lessonSource } from '@oquplay/shared';
import { generateLesson, OpenAILessonProvider } from '../src/lessonGeneration';
import { lessonPresentation } from '../src/presentation';
import { lessonFixture, lessonInput } from './lessonFixture';

test('topic generation requires no source text and allows subject inference', async () => {
 const input = LessonInputSchema.parse({ ...lessonInput(), subject: undefined });
 assert.equal(input.subject, ''); assert.equal('source' in input, false);
 const lesson = await generateLesson({ generate: async () => ({ status: 'ok', lesson: lessonFixture() }) }, input);
 assert.equal(lesson.game.subject, lessonFixture().game.subject);
 assert.equal(LessonInputSchema.safeParse({ ...input, source: 'Unexpected input' }).success, false);
});
test('lesson validation covers bilingual tasks and verbatim generated material evidence', async () => {
 for (const lang of ['kk', 'ru'] as const) for (const type of ['quiz', 'matching', 'ordering'] as const) {
  const content = lessonFixture(lang, type); assert.ok(LessonSchema.safeParse(content).success);
  const result = await generateLesson({ generate: async () => ({ status: 'ok', lesson: content }) }, lessonInput(lang, type));
  assert.deepEqual(evidenceIssues(result.game, lessonSource(result)), []);
 }
});
test('lesson repair rejects wrong metadata, unsupported evidence and broken answers', async () => {
 for (const mutation of ['title', 'grade', 'subject', 'language', 'count', 'evidence', 'answer', 'slide'] as const) {
  const content = lessonFixture();
  if (mutation === 'title') content.game.title = 'Wrong topic';
  if (mutation === 'grade') content.game.grade = 3;
  if (mutation === 'subject') content.game.subject = 'Wrong subject';
  if (mutation === 'language') content.game.language = 'ru';
  if (mutation === 'count') content.game.items.pop();
  if (mutation === 'evidence') content.game.items[0]!.evidence = 'Fabricated evidence absent from material';
  if (mutation === 'answer' && content.game.gameType === 'quiz') content.game.items[0]!.correctOptionId = 'missing';
  if (mutation === 'slide') content.slides[0]!.bullets[0] = 'x'.repeat(121);
  let calls = 0;
  await assert.rejects(() => generateLesson({ generate: async (_input, repair) => { calls++; if (calls === 2) assert.ok(repair); return { status: 'ok', lesson: content }; } }, lessonInput()), { message: 'invalid_generation' });
  assert.equal(calls, 2, mutation);
 }
});
test('one repair recovers; refusals and provider errors never fall back to demo', async () => {
 let calls = 0;
 const result = await generateLesson({ generate: async () => ++calls === 1 ? {} : { status: 'ok', lesson: lessonFixture() } }, lessonInput());
 assert.equal(result.game.items.length, 5); assert.equal(calls, 2);
 calls = 0;
 await assert.rejects(() => generateLesson({ generate: async () => { calls++; return { status: 'insufficient', lesson: null }; } }, lessonInput()), { message: 'lesson_topic_unclear' });
 assert.equal(calls, 1);
 await assert.rejects(() => generateLesson({ generate: async () => { throw new Error('provider failed'); } }, lessonInput()), { message: 'provider failed' });
});
test('OpenAI lesson adapter requests the complete strict schema without a source or storage', async () => {
 const original = globalThis.fetch;
 try {
  globalThis.fetch = async (_url, init) => {
   const body = JSON.parse(String(init?.body)); assert.equal(body.store, false);
   assert.equal(body.text.format.strict, true); assert.equal(body.text.format.schema.additionalProperties, false);
   const input = JSON.parse(body.input[1].content); assert.equal(input.parameters.topic, lessonInput().topic); assert.equal('source' in input.parameters, false);
   assert.ok(body.text.format.schema.properties.lesson);
   return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ status: 'ok', lesson: lessonFixture() }) }] }] }));
  };
  assert.equal((await generateLesson(new OpenAILessonProvider(), lessonInput())).slides.length, 4);
  globalThis.fetch = async () => new Response('invalid upstream JSON');
  await assert.rejects(() => new OpenAILessonProvider().generate(lessonInput()), { message: 'provider_incomplete' });
 } finally { globalThis.fetch = original; }
});
test('PowerPoint export is a valid package with all slide text and speaker notes', async () => {
 for (const lang of ['kk', 'ru'] as const) {
  const lesson = lessonFixture(lang), bytes = await lessonPresentation(lesson), zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file('[Content_Types].xml'));
  assert.equal(Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).length, lesson.slides.length);
  for (let i = 0; i < lesson.slides.length; i++) {
   const xml = await zip.file(`ppt/slides/slide${i + 1}.xml`)!.async('text');
   assert.ok(xml.includes(lesson.slides[i]!.title));
   for (const bullet of lesson.slides[i]!.bullets) assert.ok(xml.includes(bullet));
   assert.ok((await zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`)!.async('text')).includes(lesson.slides[i]!.notes));
  }
 }
});
test('downloaded material contains explanations and glossary without exposing answer keys', () => {
 const content = lessonFixture(), markdown = lessonMarkdown(content);
 assert.ok(markdown.includes(content.sections[0]!.body)); assert.ok(markdown.includes(content.glossary[0]!.definition));
 assert.ok(markdown.includes(content.homework)); assert.doesNotMatch(markdown, /correctOptionId|LLM_API_KEY/);
});
