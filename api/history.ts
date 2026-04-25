import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionId } from './_lib/session.js';
import { getOrCreateConversation, getMessages } from './_lib/storage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = getSessionId(req);
  if (!sessionId) {
    return res.status(400).json({ error: 'x-session-id header ausente ou inválido' });
  }

  try {
    const conversation = await getOrCreateConversation(sessionId);
    const messages = await getMessages(sessionId);
    return res.status(200).json({ conversation, messages });
  } catch (err) {
    console.error('history handler error', err);
    return res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
}
