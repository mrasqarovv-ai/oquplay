import { z } from 'zod';
import brand from '../../../brand.json';

export const APP_NAME = brand.name;
export const LanguageSchema = z.enum(['kk', 'ru']);
export const GameTypeSchema = z.enum(['quiz', 'matching', 'ordering']);
export type Language = z.infer<typeof LanguageSchema>;
export type GameType = z.infer<typeof GameTypeSchema>;
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const text = z.string().trim().min(1).max(2000);
const commonItem = { id, explanation: text, evidence: text };
export const OptionSchema = z.strictObject({ id, text });
export const QuizItemSchema = z.strictObject({ ...commonItem, question: text, options: z.array(OptionSchema).min(2).max(6), correctOptionId: id });
export const PairSchema = z.strictObject({ ...commonItem, left: OptionSchema, right: OptionSchema });
export const OrderItemSchema = z.strictObject({ ...commonItem, prompt: text, elements: z.array(OptionSchema).min(3).max(8), correctOrder: z.array(id).min(3).max(8) });
const base = {
  schemaVersion: z.literal(1), title: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(100), grade: z.number().int().min(1).max(12),
  language: LanguageSchema, difficulty: z.enum(['A', 'B', 'C']), instructions: text,
};
export const rawSchemas = {
  quiz: z.strictObject({ ...base, gameType: z.literal('quiz'), items: z.array(QuizItemSchema).min(1).max(30) }),
  matching: z.strictObject({ ...base, gameType: z.literal('matching'), items: z.array(PairSchema).min(2).max(30) }),
  ordering: z.strictObject({ ...base, gameType: z.literal('ordering'), items: z.array(OrderItemSchema).min(1).max(30) }),
};
export const GameSchema = z.discriminatedUnion('gameType', [rawSchemas.quiz, rawSchemas.matching, rawSchemas.ordering]).superRefine((game, ctx) => {
  const seen = new Set<string>();
  const addId = (value: string, path: (string | number)[]) => {
    if (seen.has(value)) ctx.addIssue({ code: 'custom', message: 'duplicate_id', path });
    seen.add(value);
  };
  game.items.forEach((item, i) => addId(item.id, ['items', i, 'id']));
  if (game.gameType === 'quiz') game.items.forEach((item, i) => {
    item.options.forEach((o, j) => addId(o.id, ['items', i, 'options', j, 'id']));
    if (!item.options.some(o => o.id === item.correctOptionId)) ctx.addIssue({ code: 'custom', message: 'missing_answer', path: ['items', i, 'correctOptionId'] });
    if (new Set(item.options.map(o => o.text.toLocaleLowerCase())).size !== item.options.length) ctx.addIssue({ code: 'custom', message: 'duplicate_text', path: ['items', i, 'options'] });
  });
  if (game.gameType === 'matching') {
    const left = new Set<string>(), right = new Set<string>();
    game.items.forEach((p, i) => {
      addId(p.left.id, ['items', i, 'left', 'id']); addId(p.right.id, ['items', i, 'right', 'id']);
      for (const side of ['left', 'right'] as const) {
        const set = side === 'left' ? left : right, value = p[side].text.toLocaleLowerCase();
        if (set.has(value)) ctx.addIssue({ code: 'custom', message: 'ambiguous_pair', path: ['items', i, side, 'text'] });
        set.add(value);
      }
    });
  }
  if (game.gameType === 'ordering') game.items.forEach((item, i) => {
    item.elements.forEach((e, j) => addId(e.id, ['items', i, 'elements', j, 'id']));
    if (item.correctOrder.length !== item.elements.length || new Set(item.correctOrder).size !== item.elements.length || item.correctOrder.some(key => !item.elements.some(e => e.id === key))) ctx.addIssue({ code: 'custom', message: 'invalid_order', path: ['items', i, 'correctOrder'] });
    if (new Set(item.elements.map(e => e.text.toLocaleLowerCase())).size !== item.elements.length) ctx.addIssue({ code: 'custom', message: 'duplicate_text', path: ['items', i, 'elements'] });
  });
});
export type GameContent = z.infer<typeof GameSchema>;
export type QuizItem = z.infer<typeof QuizItemSchema>;
export type MatchItem = z.infer<typeof PairSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export const GenerationSchema = z.strictObject({
  source: z.string().trim().min(80).max(18000), subject: base.subject, topic: base.title,
  grade: base.grade, language: LanguageSchema, difficulty: base.difficulty, gameType: GameTypeSchema,
  count: z.union([z.literal(5), z.literal(10), z.literal(15)]),
});
export type GenerationInput = z.infer<typeof GenerationSchema>;
export const DraftSchema = z.strictObject({
  content: GameSchema, source: z.string().trim().min(1).max(18000),
  timeLimitSec: z.number().int().min(30).max(7200).nullable(), isDemo: z.boolean(),
});
export type Draft = z.infer<typeof DraftSchema>;
export const SubmissionSchema = z.strictObject({ answers: z.record(id, z.union([id, z.array(id).max(30)])).refine(a => Object.keys(a).length <= 100, 'too_many_answers') });
export type Answers = z.infer<typeof SubmissionSchema>['answers'];
export function evidenceIssues(game: GameContent, source: string) {
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  return game.items.flatMap((item, i) => normalize(source).includes(normalize(item.evidence)) ? [] : [{ path: ['items', i, 'evidence'], message: 'evidence_not_in_source' }]);
}
export type PublicGame = Pick<GameContent, 'schemaVersion' | 'title' | 'subject' | 'grade' | 'language' | 'difficulty' | 'instructions'> & (
  | { gameType: 'quiz'; items: { id: string; question: string; options: { id: string; text: string }[] }[] }
  | { gameType: 'matching'; left: { id: string; text: string }[]; right: { id: string; text: string }[] }
  | { gameType: 'ordering'; items: { id: string; prompt: string; elements: { id: string; text: string }[] }[] }
);
export interface ReviewRow { id: string; prompt: string; correct: boolean; expected: string; given: string; explanation: string; evidence: string }
export interface AttemptResult { id: string; gameId: string; title: string; score: number; total: number; percent: number; elapsedSec: number; timedOut: boolean; review: ReviewRow[]; completedAt: string; isDemo: boolean }
export interface User { id: string; email: string; name: string; role: 'TEACHER' | 'STUDENT' }
export interface GameSummary { id: string; title: string; subject: string; gameType: GameType; status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; archived: boolean; isDemo: boolean; updatedAt: string; shareCode?: string | null }
export interface GameDetail extends GameSummary { draft: GameContent; source: string; timeLimitSec: number | null; revision: number; shareCode: string | null }
