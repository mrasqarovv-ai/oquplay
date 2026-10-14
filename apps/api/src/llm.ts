import { z } from 'zod';
import { GameSchema, rawSchemas, evidenceIssues, type GameContent, type GenerationInput } from '@oquplay/shared';
import { config } from './config';
import { AppError } from './errors';
import { GENERATION_SYSTEM_PROMPT } from './prompts';
export interface LLMProvider { generate(input: GenerationInput, count: number, repair?: string): Promise<unknown> }
export class OpenAIResponsesProvider implements LLMProvider {
 async generate(input: GenerationInput, count: number, repair?: string): Promise<unknown> {
  const game = rawSchemas[input.gameType];
  // Matching regeneration is one pair; the full game is revalidated after merging.
  const schema = z.toJSONSchema(z.strictObject({ status: z.enum(['ok', 'insufficient']), message: z.string(), game: game.extend({ items: game.shape.items.min(1) }).nullable() }), { target: 'draft-7' });
  const url = new URL(config.LLM_BASE_URL);
  if (url.protocol !== 'https:') throw new AppError('provider_configuration', 500);
  const response = await fetch(`${config.LLM_BASE_URL.replace(/\/$/, '')}/responses`, {
   method: 'POST', signal: AbortSignal.timeout(config.LLM_TIMEOUT_MS),
   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.LLM_API_KEY}` },
   body: JSON.stringify({ model: config.LLM_MODEL, store: false, max_output_tokens: config.LLM_MAX_OUTPUT_TOKENS,
    input: [{ role: 'system', content: GENERATION_SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify({ parameters: { ...input, source: undefined, count }, untrustedSource: input.source, repairIssues: repair ?? null }) }],
    text: { format: { type: 'json_schema', name: `oquplay_${input.gameType}_v1`, strict: true, schema } },
   }),
  }).catch(() => { throw new AppError('provider_unavailable', 502); });
  if (!response.ok) throw new AppError(response.status === 429 ? 'provider_rate_limit' : 'provider_unavailable', 502);
  const envelope = z.object({ status: z.string(), output: z.array(z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })) }).safeParse(await response.json());
  if (!envelope.success || envelope.data.status !== 'completed') throw new AppError('provider_incomplete', 502);
  const text = envelope.data.output.flatMap(o => o.content ?? []).filter(c => c.type === 'output_text').map(c => c.text ?? '').join('');
  try { return JSON.parse(text) as unknown; } catch { return { invalidJSON: true }; }
 }
}
export async function generateValidated(provider: LLMProvider, input: GenerationInput, count: number = input.count): Promise<GameContent> {
 let repair: string | undefined;
 for (let pass = 0; pass < 2; pass++) {
  const value = await provider.generate(input, count, repair);
  const envelope = z.object({ status: z.enum(['ok', 'insufficient']), message: z.string(), game: z.unknown() }).safeParse(value);
  if (envelope.success && envelope.data.status === 'insufficient') throw new AppError('insufficient_material', 422);
  // A one-pair result uses the raw schema plus full validation after merging at the route.
  const parsed = count === 1 && input.gameType === 'matching'
   ? rawSchemas.matching.extend({ items: z.array(rawSchemas.matching.shape.items.element).length(1) }).safeParse(envelope.success ? envelope.data.game : null)
   : GameSchema.safeParse(envelope.success ? envelope.data.game : null);
  if (!parsed.success) { repair = JSON.stringify(parsed.error.issues.map(i => ({ path: i.path, message: i.message }))).slice(0,3000); continue; }
  const game: GameContent = parsed.data;
  const mismatch = game.items.length !== count || game.subject !== input.subject || game.title !== input.topic || game.grade !== input.grade || game.language !== input.language || game.difficulty !== input.difficulty || game.gameType !== input.gameType;
  const issues = evidenceIssues(game, input.source);
  if (!mismatch && !issues.length) return game;
  repair = JSON.stringify({ mismatch, issues }).slice(0, 3000);
 }
 throw new AppError('invalid_generation', 422);
}
