import { randomUUID } from 'node:crypto';
import { GameSchema, type GameContent } from '@oquplay/shared';
import { AppError } from './errors';

export function replaceGeneratedItem(existing: GameContent, generated: GameContent, itemId: string, mode: 'demo' | 'live'): GameContent {
 if (!existing.items.some(item => item.id === itemId)) throw new AppError('invalid_request', 422);
 if (existing.gameType !== generated.gameType) throw new AppError('invalid_generation', 422);
 // Demo tasks retain their fixture IDs when the editor moves or deletes tasks.
 const replacement = mode === 'demo' ? generated.items.find(item => item.id === itemId) : generated.items[0];
 if (!replacement) throw new AppError(mode === 'demo' ? 'demo_sample_only' : 'invalid_generation', 422);
 const updated = structuredClone(replacement);
 if (mode === 'live') {
  // The provider only sees this task, so its IDs may collide with the saved game.
  const reserved = new Set(existing.items.flatMap(item => [item.id, ...('options' in item ? item.options.map(option => option.id) : 'left' in item ? [item.left.id, item.right.id] : item.elements.map(element => element.id))]));
  const freshId = () => { let id: string; do { id = randomUUID(); } while (reserved.has(id)); reserved.add(id); return id; };
  if ('options' in updated) {
   updated.options.forEach(option => { const previousId = option.id; option.id = freshId(); if (updated.correctOptionId === previousId) updated.correctOptionId = option.id; });
  } else if ('left' in updated) {
   updated.left.id = freshId(); updated.right.id = freshId();
  } else {
   const ids = new Map(updated.elements.map(element => [element.id, freshId()]));
   updated.elements.forEach(element => { element.id = ids.get(element.id)!; });
   updated.correctOrder = updated.correctOrder.map(id => ids.get(id)!);
  }
 }
 return GameSchema.parse({ ...existing, items: existing.items.map(item => item.id === itemId ? { ...updated, id: item.id } : item) });
}
