import { lessonMarkdown, type LessonContent, type LessonSlide } from '@oquplay/shared';
import { ApiError } from './api';

function save(blob: Blob, name: string): void {
 const url = URL.createObjectURL(blob), link = document.createElement('a');
 link.href = url; link.download = name; link.style.display = 'none';
 document.body.appendChild(link); link.click(); link.remove();
 setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function downloadPresentation(id: string): Promise<void> {
 const base = process.env.EXPO_PUBLIC_API_URL ?? '';
 const response = await fetch(`${base}/api/lessons/${encodeURIComponent(id)}/presentation.pptx`, { credentials: 'include', signal: AbortSignal.timeout(30000) }).catch(() => { throw new ApiError('network_error'); });
 if (!response.ok) { const error = await response.json().catch(() => ({})); throw new ApiError(error.error ?? 'server_error'); }
 save(await response.blob(), `oquplay-${id}.pptx`);
}
export function downloadMaterial(lesson: LessonContent): void {
 save(new Blob([lessonMarkdown(lesson)], { type: 'text/markdown;charset=utf-8' }), 'oquplay-lesson.md');
}
const mime = () => typeof MediaRecorder === 'undefined' ? undefined : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
export const videoSupported = () => typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && !!mime();

function lines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
 const result: string[] = []; let line = '';
 for (const word of text.split(/\s+/)) {
  if (context.measureText(word).width > maxWidth) {
   if (line) { result.push(line); line = ''; }
   let part = '';
   for (const character of word) {
    if (part && context.measureText(part + character).width > maxWidth) { result.push(part); part = ''; }
    part += character;
   }
   line = part;
  } else if (line && context.measureText(`${line} ${word}`).width > maxWidth) { result.push(line); line = word; }
  else line = line ? `${line} ${word}` : word;
 }
 if (line) result.push(line);
 return result;
}
function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number, startSize: number, minSize: number, weight: string) {
 let size = startSize, wrapped: string[];
 do { context.font = `${weight} ${size}px Arial, sans-serif`; wrapped = lines(context, text, maxWidth); if (wrapped.length <= maxLines || size <= minSize) break; size -= 2; } while (true);
 return { lines: wrapped, lineHeight: size * 1.25 };
}
export function drawLessonSlide(context: CanvasRenderingContext2D, slide: LessonSlide, index: number, total: number, progress: number): void {
 context.fillStyle = '#172642'; context.fillRect(0, 0, 1280, 720);
 context.fillStyle = '#9C8AFF'; context.fillRect(0, 0, 12, 720);
 context.fillStyle = '#BEB5F7'; context.font = '22px Arial, sans-serif'; context.fillText(`OquPlay · ${index + 1}/${total}`, 64, 47);
 context.fillStyle = '#FFFFFF';
 const title = fitText(context, slide.title, 1150, 2, 46, 24, 'bold');
 title.lines.forEach((line, i) => context.fillText(line, 64, 105 + i * title.lineHeight));
 slide.bullets.forEach((bullet, j) => {
  const text = fitText(context, bullet, 1090, 3, 32, 18, 'normal');
  context.fillStyle = '#9C8AFF'; context.fillRect(68, 223 + j * 136, 9, 9);
  context.fillStyle = '#E5E7F0'; text.lines.forEach((line, i) => context.fillText(line, 100, 238 + j * 136 + i * text.lineHeight));
 });
 context.fillStyle = '#6951DD'; context.fillRect(0, 710, 1280 * progress, 10);
}
export async function downloadVideo(lesson: LessonContent, options: { signal: AbortSignal; onProgress: (progress: number) => void; secondsPerSlide?: number }): Promise<void> {
 const type = mime();
 if (!videoSupported() || !type) throw new ApiError('video_unsupported');
 if (document.hidden) throw new ApiError('video_interrupted');
 if (options.signal.aborted) throw new ApiError('video_cancelled');
 const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
 const context = canvas.getContext('2d'); if (!context) throw new ApiError('video_unsupported');
 // captureStream can emit an initial frame immediately; paint before capturing.
 drawLessonSlide(context, lesson.slides[0]!, 0, lesson.slides.length, 0);
 const stream = canvas.captureStream(12);
 let recorder: MediaRecorder | undefined, frame = 0, watchdog: ReturnType<typeof setTimeout> | undefined;
 let cancel = () => {}, visibility = () => {};
 try {
  recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1500000 });
  const active = recorder, chunks: Blob[] = [], duration = lesson.slides.length * (options.secondsPerSlide ?? 8) * 1000;
  const result = new Promise<Blob>((resolve, reject) => {
   let failure: Error | undefined;
   const stop = (error?: Error) => {
    if (error) failure = error;
    cancelAnimationFrame(frame);
    if (active.state !== 'inactive') active.stop();
   };
   cancel = () => stop(new ApiError('video_cancelled'));
   visibility = () => { if (document.hidden) stop(new ApiError('video_interrupted')); };
   options.signal.addEventListener('abort', cancel, { once: true });
   document.addEventListener('visibilitychange', visibility);
   active.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
   active.onerror = () => { stop(new ApiError('video_failed')); reject(new ApiError('video_failed')); };
   active.onstop = () => failure ? reject(failure) : chunks.length ? resolve(new Blob(chunks, { type })) : reject(new ApiError('video_failed'));
   const started = performance.now();
   const tick = () => {
    if (active.state === 'inactive') return;
    const progress = Math.min(1, (performance.now() - started) / duration), index = Math.min(lesson.slides.length - 1, Math.floor(progress * lesson.slides.length));
    drawLessonSlide(context, lesson.slides[index]!, index, lesson.slides.length, progress);
    options.onProgress(Math.round(progress * 100));
    if (progress >= 1) stop(); else frame = requestAnimationFrame(tick);
   };
   active.start(500); tick();
   watchdog = setTimeout(() => stop(new ApiError('video_interrupted')), duration + 15000);
  });
  save(await result, `oquplay-lesson.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
 } finally {
  cancelAnimationFrame(frame); if (watchdog) clearTimeout(watchdog);
  options.signal.removeEventListener('abort', cancel); document.removeEventListener('visibilitychange', visibility);
  if (recorder?.state !== 'inactive') recorder?.stop();
  stream.getTracks().forEach(track => track.stop());
 }
}
