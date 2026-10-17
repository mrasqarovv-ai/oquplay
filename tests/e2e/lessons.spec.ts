import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { lessonSource, type LessonDetail, type LessonInput } from '@oquplay/shared';
import { lessonFixture, lessonInput } from '../../apps/api/tests/lessonFixture';
import { lessonPresentation } from '../../apps/api/src/presentation';

// The paid generation boundary is controlled here. Ownership, persistence and
// reservation concurrency are exercised against real Postgres in lessons-api.test.ts.
async function setup(page: Page, failure = false) {
 const content = lessonFixture();
 let detail: LessonDetail | undefined;
 await page.route('**/api/health', route => route.fulfill({ json: { ok: true, mode: 'live' } }));
 await page.route('**/api/lessons**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (path === '/api/lessons/generate') {
   const input = request.postDataJSON() as LessonInput;
   expect(input.topic).toBe(lessonInput().topic); expect(input.subject).toBe(''); expect('source' in input).toBe(false);
   if (failure) return route.fulfill({ status: 502, json: { error: 'provider_unavailable' } });
   const game = await page.request.post('/api/games', { headers: { Origin: new URL(page.url()).origin }, data: { content: content.game, source: lessonSource(content), isDemo: false, timeLimitSec: null } });
   expect(game.status()).toBe(200);
   detail = { id: randomUUID(), gameId: (await game.json()).id, content, createdAt: new Date().toISOString() };
   return route.fulfill({ json: detail });
  }
  if (path === '/api/lessons') return route.fulfill({ json: detail ? [{ id: detail.id, gameId: detail.gameId, title: content.game.title, subject: content.game.subject, grade: content.game.grade, language: content.game.language, createdAt: detail.createdAt }] : [] });
  if (detail && path.endsWith('/presentation.pptx')) return route.fulfill({ contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', body: await lessonPresentation(content) });
  if (detail && path === `/api/lessons/${detail.id}`) return route.fulfill({ json: detail });
  return route.fulfill({ status: 404, json: { error: 'not_found' } });
 });
 await page.goto('/'); await page.getByRole('button', { name: 'Мұғаліммін', exact: true }).click();
 await page.getByRole('textbox', { name: 'Атыңыз немесе лақап атыңыз', exact: true }).fill('Lesson Teacher');
 await page.getByRole('textbox', { name: 'Электрондық пошта', exact: true }).fill(`lesson-browser-${randomUUID()}@example.test`);
 await page.getByLabel('Құпиясөз', { exact: true }).fill('Browser-password-2026');
 await page.getByRole('button', { name: 'Тіркелу', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Шығу', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Тақырыптан сабақ құрастыру', exact: true }).click();
 await page.getByRole('textbox', { name: 'Тақырып', exact: true }).fill(content.game.title);
 return content;
}
async function generate(page: Page) {
 await page.getByRole('button', { name: 'Тақырыптан сабақ құрастыру', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Материалды жүктеу', exact: true })).toBeVisible();
}
test('topic-only lesson shows learning material, downloads PPTX and opens its saved game', async ({ page }) => {
 const content = await setup(page); await generate(page);
 await expect(page.getByText(content.sections[1]!.body, { exact: true })).toBeVisible();
 const materialDownload = page.waitForEvent('download');
 await page.getByRole('button', { name: 'Материалды жүктеу', exact: true }).click();
 const material = await materialDownload;
 expect(await readFile(await material.path(), 'utf8')).toContain(content.sections[0]!.body);
 await page.getByRole('radio', { name: 'Слайдтар', exact: true }).click();
 await expect(page.getByText(content.slides[0]!.title, { exact: true })).toBeVisible();
 const presentationDownload = page.waitForEvent('download');
 await page.getByRole('button', { name: 'Презентацияны жүктеу · PPTX', exact: true }).click();
 const file = await presentationDownload; expect(file.suggestedFilename()).toMatch(/\.pptx$/);
 expect((await readFile(await file.path())).subarray(0, 2).toString()).toBe('PK');
 await page.reload(); await expect(page.getByRole('button', { name: 'Материалды жүктеу', exact: true })).toBeVisible();
 await page.getByRole('radio', { name: 'Тапсырма', exact: true }).click();
 await page.getByRole('button', { name: 'Ойын редакторын ашу', exact: true }).click();
 await expect(page.getByRole('textbox', { name: 'Ойын атауы', exact: true })).toHaveValue(content.game.title);
 await page.getByRole('button', { name: 'Шығу', exact: true }).click();
 await page.goto('/lessons'); await expect(page.getByText('Алдымен аккаунтқа кіріңіз.', { exact: true })).toBeVisible();
});
test('generation failure preserves the topic, including after switching interface language', async ({ page }) => {
 const content = await setup(page, true);
 await page.getByRole('button', { name: 'Тақырыптан сабақ құрастыру', exact: true }).click();
 await expect(page.getByText('ЖИ қызметі жауап бермеді. Демо нәтижемен алмастырылған жоқ.', { exact: true })).toBeVisible();
 await expect(page.getByRole('textbox', { name: 'Тақырып', exact: true })).toHaveValue(content.game.title);
 await page.getByRole('button', { name: 'ҚАЗ / РУС', exact: true }).click();
 await expect(page.getByRole('textbox', { name: 'Тема', exact: true })).toHaveValue(content.game.title);
 await expect(page.getByRole('button', { name: 'Создать урок по теме', exact: true })).toBeEnabled();
});
test('browser records a playable slide video, supports cancellation and fits a phone viewport', async ({ page }, testInfo) => {
 await page.setViewportSize({ width: 390, height: 844 }); await setup(page); await generate(page);
 const videoButton = page.getByRole('button', { name: 'Оқу видеосын жасау', exact: true });
 await expect(videoButton).toBeEnabled(); await videoButton.click();
 await page.getByRole('button', { name: 'Бас тарту', exact: true }).click();
 await expect(videoButton).toBeEnabled();
 const download = page.waitForEvent('download', { timeout: 60000 }); await videoButton.click();
 const file = await download, bytes = await readFile(await file.path());
 await file.saveAs(testInfo.outputPath(file.suggestedFilename()));
 expect(file.suggestedFilename()).toMatch(/\.(webm|mp4)$/); expect(bytes.length).toBeGreaterThan(10000);
 const metadata = await page.evaluate(async encoded => {
  const data = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([data], { type: 'video/webm' })), video = document.createElement('video');
  video.muted = true; video.src = url; video.style.width = '320px'; document.body.appendChild(video);
  try {
   await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('video_decode_failed')); });
   await video.play();
   await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('video_frame_not_presented')), 5000);
    video.requestVideoFrameCallback(() => { clearTimeout(deadline); resolve(); });
   });
   const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
   const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0);
   return { width: video.videoWidth, height: video.videoHeight, pixel: Array.from(context.getImageData(500, 690, 1, 1).data), frame: canvas.toDataURL('image/png') };
  } finally { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); URL.revokeObjectURL(url); }
 }, bytes.toString('base64'));
 await writeFile(testInfo.outputPath('video-frame.png'), Buffer.from(metadata.frame.split(',')[1]!, 'base64'));
 expect(metadata.width).toBe(1280); expect(metadata.height).toBe(720); expect(metadata.pixel[3]).toBe(255); expect(metadata.pixel.slice(0, 3).every(v => v < 100)).toBe(true);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
