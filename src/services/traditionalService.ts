export interface TraditionalFileMeta {
  name: string
  size: number
  type: string
}

export interface TraditionalPayload {
  // Phase 1
  relax: string
  hobbies: string
  dream: string
  dreamPlan: string
  morning: string
  change: string
  consequences: string
  // Phase 2
  name: string
  address: string
  eircode: string
  mobile: string
  dob: string
  email: string
  civilStatus: string
  document?: TraditionalFileMeta
}

export interface TraditionalStored extends TraditionalPayload {
  startedAt: string
  completedAt?: string
}

interface SaveSuccess {
  ok: true
  data: TraditionalStored
}

interface ValidationError {
  error: string
  fieldErrors?: Record<string, string>
}

export type SaveResult = SaveSuccess | ValidationError

function headers(sessionId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-session-id': sessionId,
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('API unavailable — run `npm run dev` to start the local backend.')
  }
  return (await res.json()) as T
}

export async function getTraditional(sessionId: string): Promise<TraditionalStored | null> {
  const res = await fetch('/api/traditional', { method: 'GET', headers: headers(sessionId) })
  const body = await parseJson<{ data: TraditionalStored | null }>(res)
  if (!res.ok) throw new Error('Failed to fetch onboarding state')
  return body.data
}

export async function saveTraditional(
  sessionId: string,
  payload: TraditionalPayload
): Promise<SaveResult> {
  const res = await fetch('/api/traditional', {
    method: 'POST',
    headers: headers(sessionId),
    body: JSON.stringify(payload),
  })
  const body = await parseJson<SaveResult>(res)
  if (res.status === 400) {
    return body as ValidationError
  }
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
  }
  return body
}

export async function resetTraditional(sessionId: string): Promise<void> {
  await fetch('/api/traditional', { method: 'DELETE', headers: headers(sessionId) })
}
