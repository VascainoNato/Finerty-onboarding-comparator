import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { moderateContent } from './_lib/openai.js'
import { suportePrompt } from './_lib/prompts/suporte.js'
import { SUPPORT_MENU, type MenuSuggestion } from './_lib/supportMenu.js'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

interface HistoryItem {
  role: 'user' | 'assistant'
  content: string
}

interface SupportResponse {
  reply: string
  suggestions: MenuSuggestion[]
  nodeKey?: string
}

const FALLBACK_SUGGESTIONS: MenuSuggestion[] = [
  { label: 'Traditional Onboarding', nodeKey: 'traditional' },
  { label: 'Onboarding with IA - Messages', nodeKey: 'messages' },
  { label: 'Onboarding with IA - Voice', nodeKey: 'voice' },
  { label: 'IA Cost', nodeKey: 'cost' },
]

function sanitizeHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (m): m is HistoryItem =>
        !!m &&
        typeof m === 'object' &&
        (('role' in m && (m.role === 'user' || m.role === 'assistant')) as boolean) &&
        typeof (m as HistoryItem).content === 'string'
    )
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
}

async function generateDynamicReply(
  message: string,
  history: HistoryItem[]
): Promise<{ text: string; suggestions: MenuSuggestion[] }> {
  const systemPrompt = `${suportePrompt}

=== OUTPUT FORMAT ===
Reply ONLY in valid JSON (no markdown, no prose outside the object):
{
  "reply": "your short answer here (2-5 sentences, plain text)",
  "suggestions": ["short follow-up question 1", "short follow-up question 2", "short follow-up question 3"]
}
Suggestions must be NATURAL next questions the user could click — they must be
strictly about covered features. Max 4 suggestions, each under 50 characters.
If you refuse (off-topic), the suggestions should be topic names like
"Traditional Onboarding", "AI Messages", etc.`

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 400,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content } as const)),
      { role: 'user', content: message },
    ],
  })

  const raw = completion.choices[0]?.message?.content?.trim() || '{}'
  let parsed: { reply?: unknown; suggestions?: unknown } = {}
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = {}
  }

  const reply =
    typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
      ? parsed.reply.trim()
      : "I can only help with the Finerty platform itself. Pick a topic and I'll walk you through it."

  const suggestionsRaw = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  const suggestions: MenuSuggestion[] = suggestionsRaw
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .slice(0, 4)
    .map((s) => ({ label: s.trim(), prompt: s.trim() }))

  return {
    text: reply,
    suggestions: suggestions.length > 0 ? suggestions : FALLBACK_SUGGESTIONS,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = (req.body ?? {}) as {
      message?: unknown
      nodeKey?: unknown
      history?: unknown
    }

    const nodeKey = typeof body.nodeKey === 'string' ? body.nodeKey : ''
    const message = typeof body.message === 'string' ? body.message.trim() : ''

    // Navigation mode: user clicked a suggestion tied to a static node.
    if (nodeKey && !message) {
      const node = SUPPORT_MENU[nodeKey]
      if (!node) {
        return res.status(404).json({ error: 'Unknown node' })
      }
      const payload: SupportResponse = {
        reply: node.message,
        suggestions: node.suggestions,
        nodeKey,
      }
      return res.status(200).json(payload)
    }

    if (!message) {
      return res.status(400).json({ error: 'message or nodeKey required' })
    }
    if (message.length > 1000) {
      return res.status(400).json({ error: 'message too long (max 1000 chars)' })
    }

    // Moderation gate — same one used by the onboarding chat.
    const moderation = await moderateContent(message)
    if (moderation.flagged) {
      const payload: SupportResponse = {
        reply:
          "I can't respond to that — this chat is limited to explaining Finerty's features. Would you like a tour of one of them?",
        suggestions: FALLBACK_SUGGESTIONS,
      }
      return res.status(200).json(payload)
    }

    const history = sanitizeHistory(body.history)
    const { text, suggestions } = await generateDynamicReply(message, history)

    const payload: SupportResponse = { reply: text, suggestions }
    return res.status(200).json(payload)
  } catch (err) {
    console.error('support handler error', err)
    return res.status(500).json({ error: 'Error processing support message' })
  }
}
