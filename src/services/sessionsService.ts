export type SessionType = 'chat' | 'voice' | 'traditional'
export type SessionStatus = 'active' | 'completed' | 'abandoned'

export interface SessionCost {
  tokensUsed: number
  model: string
  inputRatePerMillion: number
  outputRatePerMillion: number
  costUsd: number
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  file?: { name: string; size: number; type: string }
}

export interface SessionSnapshot {
  collectedData: Record<string, unknown>
  messages?: SessionMessage[]
}

export interface SessionRecord {
  id: string
  label: string
  type: SessionType
  status: SessionStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  cost: SessionCost
  snapshot?: SessionSnapshot
}

const DEFAULT_SESSION_KEY: Record<SessionType, string> = {
  chat: 'fin.sessionId',
  voice: 'fin.voiceSessionId',
  traditional: 'fin.traditionalSessionId',
}

export function activeSessionIdFor(type: SessionType): string | null {
  return localStorage.getItem(DEFAULT_SESSION_KEY[type])
}

export function setActiveSessionId(type: SessionType, id: string): void {
  localStorage.setItem(DEFAULT_SESSION_KEY[type], id)
}

export function clearActiveSessionId(type: SessionType): void {
  localStorage.removeItem(DEFAULT_SESSION_KEY[type])
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Sessions API unavailable.')
  }
  return (await res.json()) as T
}

export async function listSessions(): Promise<SessionRecord[]> {
  const res = await fetch('/api/sessions', { method: 'GET' })
  const body = await parseJson<{ sessions: SessionRecord[] }>(res)
  if (!res.ok) throw new Error('Failed to list sessions')
  return body.sessions
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  const res = await fetch(`/api/sessions?id=${encodeURIComponent(id)}`, {
    method: 'GET',
  })
  if (res.status === 404) return null
  const body = await parseJson<{ session: SessionRecord }>(res)
  if (!res.ok) throw new Error('Failed to fetch session')
  return body.session
}

export async function abandonSession(id: string): Promise<SessionRecord | null> {
  const res = await fetch(`/api/sessions?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'abandon' }),
  })
  const body = await parseJson<{ session: SessionRecord | null }>(res)
  if (!res.ok) throw new Error('Failed to abandon session')
  return body.session
}

export async function deleteSession(id: string): Promise<void> {
  await fetch(`/api/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}
