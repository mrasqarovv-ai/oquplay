import pptxgen from 'pptxgenjs';
import type { LessonContent } from '@oquplay/shared';

export async function lessonPresentation(lesson: LessonContent): Promise<Buffer> {
 const pptx = new pptxgen();
 pptx.layout = 'LAYOUT_WIDE';
 pptx.author = 'OquPlay';
 pptx.subject = lesson.game.subject;
 pptx.title = lesson.game.title;
 const lang = lesson.game.language === 'kk' ? 'kk-KZ' : 'ru-RU';
 pptx.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
 lesson.slides.forEach((content, i) => {
  const slide = pptx.addSlide();
  slide.background = { color: '172642' };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: '9C8AFF' }, line: { transparency: 100 } });
  slide.addText(content.title, { x: 0.65, y: 0.55, w: 12, h: 1.1, fontSize: 30, bold: true, color: 'FFFFFF', breakLine: false, fit: 'shrink', valign: 'middle', lang });
  content.bullets.forEach((bullet, j) => slide.addText(`•  ${bullet}`, { x: 0.8, y: 2 + j * 1.25, w: 11.6, h: 1.1, fontSize: 24, color: 'E5E7F0', fit: 'shrink', valign: 'middle', margin: 0, lang }));
  slide.addText(`OquPlay · ${lesson.game.subject} · ${i + 1}/${lesson.slides.length}`, { x: 0.8, y: 6.95, w: 11.7, h: 0.25, fontSize: 10, color: 'BEB5F7', margin: 0 });
  slide.addNotes(content.notes);
 });
 return Buffer.from(await pptx.write({ outputType: 'nodebuffer', compression: true }) as Buffer);
}
