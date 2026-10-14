import { demoGame, type GameContent, type GenerationInput } from '@oquplay/shared';

export function canRegenerateItem(content: GameContent, itemId: string, mode: 'demo' | 'live'): boolean {
 return mode === 'live' || demoGame(content.gameType, content.language).items.some(item => item.id === itemId);
}

export function generationSettings(form: GenerationInput, content: GameContent | null, mode: 'demo' | 'live', replaceItemId?: string): GenerationInput {
 if (!replaceItemId || !content) return form;
 return {
  ...form,
  subject: content.subject,
  topic: mode === 'demo' ? demoGame(content.gameType, content.language).title : content.title,
  grade: content.grade,
  language: content.language,
  difficulty: content.difficulty,
  gameType: content.gameType,
 };
}
