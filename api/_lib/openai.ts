import OpenAI from 'openai';
import { personaPrompt } from './prompts/persona';
import { contextoOnboardingPrompt } from './prompts/contextoOnboarding';
import { formatoRespostaPrompt } from './prompts/formatoResposta';
import type { CollectedData } from './stateMachine';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE || 0.6);
const MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS || 200);

const systemPrompt = [personaPrompt, contextoOnboardingPrompt, formatoRespostaPrompt].join(
  '\n\n---\n\n'
);

export type ModerationCategory =
  | 'violence'
  | 'self-harm'
  | 'sexual'
  | 'hate'
  | 'harassment'
  | 'illicit'
  | 'other';

export interface ModerationResult {
  flagged: boolean;
  category?: ModerationCategory;
}

function mapCategory(flagged: Record<string, boolean>): ModerationCategory {
  if (flagged['violence'] || flagged['violence/graphic']) return 'violence';
  if (flagged['self-harm'] || flagged['self-harm/intent'] || flagged['self-harm/instructions'])
    return 'self-harm';
  if (flagged['sexual'] || flagged['sexual/minors']) return 'sexual';
  if (flagged['hate'] || flagged['hate/threatening']) return 'hate';
  if (flagged['harassment'] || flagged['harassment/threatening']) return 'harassment';
  if (flagged['illicit'] || flagged['illicit/violent']) return 'illicit';
  return 'other';
}

export async function moderateContent(text: string): Promise<ModerationResult> {
  if (!text.trim()) return { flagged: false };
  try {
    const result = await client.moderations.create({
      model: 'omni-moderation-latest',
      input: text,
    });
    const first = result.results[0];
    if (!first || !first.flagged) return { flagged: false };
    const flaggedMap = first.categories as unknown as Record<string, boolean>;
    return { flagged: true, category: mapCategory(flaggedMap) };
  } catch (err) {
    console.error('moderation error', err);
    // On moderation failure, be permissive but log. We still have persona-level guardrails.
    return { flagged: false };
  }
}

export async function generateAcknowledgement(
  question: string,
  userAnswer: string
): Promise<{ text: string; tokensUsed: number }> {
  const userPrompt = `The user was asked: "${question}"
Their answer was: "${userAnswer}"

Write a brief, warm, professional acknowledgement (1-2 sentences) that reflects
what they said — show you understood them. Do not ask anything.`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  return {
    text: completion.choices[0]?.message?.content?.trim() || 'Thanks for sharing.',
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}

export async function generateSummary(
  collected: CollectedData
): Promise<{ text: string; tokensUsed: number }> {
  const summaryPrompt = `Here is everything you've learned about the user:

- What they do to relax: ${collected.relax || 'not provided'}
- Hobbies: ${collected.hobbies || 'not provided'}
- Big dream or goal: ${collected.dream || 'not provided'}
- How they plan to achieve it: ${collected.dreamPlan || 'not provided'}
- What drives them in the morning: ${collected.morning || 'not provided'}
- One thing they would change: ${collected.change || 'not provided'}
- What it takes (and consequences): ${collected.consequences || 'not provided'}

Write a short, warm summary (3-4 sentences) that reflects the main themes you
heard, then ask them to confirm whether it captures them well. End with a
question like "Does this feel like you?". Plain text, no bullet points.`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: TEMPERATURE,
    max_tokens: 300,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: summaryPrompt },
    ],
  });

  return {
    text:
      completion.choices[0]?.message?.content?.trim() ||
      "Here's what I've learned about you. Does this feel right?",
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}
