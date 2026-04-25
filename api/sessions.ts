import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  listSessions,
  getSession,
  abandonSession,
  deleteSession,
  type SessionSnapshot,
} from './_lib/sessionStore.js'
import { getConversationIfExists, getMessages } from './_lib/storage.js'

async function buildSnapshot(id: string): Promise<SessionSnapshot | undefined> {
  const conv = await getConversationIfExists(id)
  const messages = await getMessages(id)
  if (!conv && messages.length === 0) return undefined
  return {
    collectedData: (conv?.collectedData ?? {}) as Record<string, unknown>,
    messages: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        ...(m.file ? { file: m.file } : {}),
      })),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const rawId = req.query?.id
    const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined

    if (req.method === 'GET') {
      if (id) {
        const session = await getSession(id)
        if (!session) return res.status(404).json({ error: 'Session not found' })
        return res.status(200).json({ session })
      }
      const sessions = await listSessions()
      return res.status(200).json({ sessions })
    }

    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id query param required' })
      const body = (req.body ?? {}) as { action?: string }
      if (body.action === 'abandon') {
        const snapshot = await buildSnapshot(id)
        await abandonSession(id, snapshot)
        const session = await getSession(id)
        return res.status(200).json({ session })
      }
      return res.status(400).json({ error: 'Unsupported action' })
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id query param required' })
      await deleteSession(id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('sessions handler error', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}
