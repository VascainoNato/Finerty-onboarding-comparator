import type { VercelRequest } from '@vercel/node';

export function getSessionId(req: VercelRequest): string | null {
  const raw = req.headers['x-session-id'];
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  return trimmed;
}
