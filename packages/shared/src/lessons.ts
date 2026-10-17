import { z } from 'zod';
import { GameSchema, GenerationSchema, rawSchemas, type GameContent } from './schemas';

export const LessonInputSchema = GenerationSchema.omit({ source: true, subject: true }).extend({ subject: z.string().trim().max(100).default('') });
export type LessonInput = z.infer<typeof LessonInputSchema>;
const section = z.strictObject({ heading: z.string().trim().min(1).max(100), body: z.string().trim().min(80).max(1800) });
export const SlideSchema = z.strictObject({
 title: z.string().trim().min(1).max(90),
 bullets: z.array(z.string().trim().min(1).max(120)).min(2).max(3),
 notes: z.string().trim().min(20).max(800),
});
const lessonFields = {
 objectives: z.array(z.string().trim().min(10).max(200)).min(2).max(4),
 sections: z.array(section).min(3).max(5),
 glossary: z.array(z.strictObject({ term: z.string().trim().min(1).max(80), definition: z.string().trim().min(5).max(300) })).min(3).max(6),
 homework: z.string().trim().min(20).max(800),
 slides: z.array(SlideSchema).min(4).max(8),
};
export const LessonSchema = z.strictObject({ ...lessonFields, game: GameSchema });
export const rawLessonSchema = (type: GameContent['gameType']) => z.strictObject({ ...lessonFields, game: rawSchemas[type] });
export type LessonContent = z.infer<typeof LessonSchema>;
export type LessonSlide = z.infer<typeof SlideSchema>;
export interface LessonDetail { id: string; gameId: string; content: LessonContent; createdAt: string }
export interface LessonSummary { id: string; gameId: string; title: string; subject: string; language: string; grade: number; createdAt: string }

export function lessonSource(lesson: LessonContent): string {
 return lesson.sections.map(s => `${s.heading}\n${s.body}`).join('\n\n');
}
export function lessonMarkdown(lesson: LessonContent): string {
 const kk = lesson.game.language === 'kk';
 return [
  `# ${lesson.game.title}`, `${lesson.game.subject} · ${lesson.game.grade} ${kk ? 'сынып' : 'класс'}`,
  `## ${kk ? 'Оқу мақсаттары' : 'Учебные цели'}`, ...lesson.objectives.map(s => `- ${s}`),
  ...lesson.sections.flatMap(s => [`## ${s.heading}`, s.body]),
  `## ${kk ? 'Негізгі ұғымдар' : 'Ключевые понятия'}`, ...lesson.glossary.map(s => `- **${s.term}**: ${s.definition}`),
  `## ${kk ? 'Үй тапсырмасы' : 'Домашнее задание'}`, lesson.homework,
  kk ? 'ЖИ дайындаған материал. Сабақта қолданбас бұрын фактілерді тексеріңіз.' : 'Материал подготовлен ИИ. Проверьте факты перед использованием на уроке.',
 ].join('\n\n');
}
