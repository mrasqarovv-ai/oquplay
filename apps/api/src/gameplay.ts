import { randomInt, randomUUID } from 'node:crypto';
import type { Answers, GameContent, PublicGame, ReviewRow } from '@oquplay/shared';
export function shuffle<T>(arr: readonly T[]): T[] {
 const out = [...arr]; for (let i = out.length - 1; i > 0; i--) { const j = randomInt(i + 1); [out[i], out[j]] = [out[j]!, out[i]!]; } return out;
}
export function prepareGame(original: GameContent): { key: GameContent; publicGame: PublicGame } {
 const key = structuredClone(original);
 const base = { schemaVersion: key.schemaVersion, title: key.title, subject: key.subject, grade: key.grade, language: key.language, difficulty: key.difficulty, instructions: key.instructions };
 if (key.gameType === 'quiz') {
  key.items.forEach(q => { q.options.forEach(o => { const old = o.id; o.id = randomUUID(); if (q.correctOptionId === old) q.correctOptionId = o.id; }); });
  return { key, publicGame: { ...base, gameType: 'quiz', items: key.items.map(q => ({ id: q.id, question: q.question, options: shuffle(q.options) })) } };
 }
 if (key.gameType === 'matching') {
  key.items.forEach(p => { p.left.id = randomUUID(); p.right.id = randomUUID(); });
  return { key, publicGame: { ...base, gameType: 'matching', left: shuffle(key.items.map(p => p.left)), right: shuffle(key.items.map(p => p.right)) } };
 }
 key.items.forEach(item => { const map = new Map(item.elements.map(e => [e.id, randomUUID()])); item.elements.forEach(e => e.id = map.get(e.id)!); item.correctOrder = item.correctOrder.map(id => map.get(id)!); });
 return { key, publicGame: { ...base, gameType: 'ordering', items: key.items.map(q => ({ id: q.id, prompt: q.prompt, elements: shuffle(q.elements) })) } };
}
export function gradeGame(game: GameContent, answers: Answers, timedOut = false) {
 const review: ReviewRow[] = [];
 if (game.gameType === 'quiz') for (const q of game.items) {
  const a = answers[q.id]; review.push({ id: q.id, prompt: q.question, correct: !timedOut && a === q.correctOptionId, expected: q.options.find(o => o.id === q.correctOptionId)!.text, given: q.options.find(o => o.id === a)?.text ?? '—', explanation: q.explanation, evidence: q.evidence });
 }
 if (game.gameType === 'matching') for (const p of game.items) {
  const a = answers[p.left.id]; review.push({ id: p.id, prompt: p.left.text, correct: !timedOut && a === p.right.id, expected: p.right.text, given: game.items.find(q => q.right.id === a)?.right.text ?? '—', explanation: p.explanation, evidence: p.evidence });
 }
 if (game.gameType === 'ordering') for (const q of game.items) {
  const a = answers[q.id], names = (ids: string[]) => ids.map(id => q.elements.find(e => e.id === id)?.text ?? '—').join(' → ');
  review.push({ id: q.id, prompt: q.prompt, correct: !timedOut && Array.isArray(a) && a.length === q.correctOrder.length && a.every((id, i) => id === q.correctOrder[i]), expected: names(q.correctOrder), given: Array.isArray(a) ? names(a) : '—', explanation: q.explanation, evidence: q.evidence });
 }
 return { score: review.filter(r => r.correct).length, total: review.length, review };
}
