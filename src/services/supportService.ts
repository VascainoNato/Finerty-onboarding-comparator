export interface SupportSuggestion {
  label: string
  nodeKey?: string
  prompt?: string
}

export interface SupportResponse {
  reply: string
  suggestions: SupportSuggestion[]
  nodeKey?: string
}

export interface SupportHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

interface FetchInput {
  message?: string
  nodeKey?: string
  history?: SupportHistoryItem[]
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Support API unavailable.')
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  }
  return data
}

export async function fetchSupportNode(nodeKey: string): Promise<SupportResponse> {
  const res = await fetch('/api/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeKey } satisfies FetchInput),
  })
  return parseJson<SupportResponse>(res)
}

export async function askSupport(
  message: string,
  history: SupportHistoryItem[] = []
): Promise<SupportResponse> {
  const res = await fetch('/api/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history } satisfies FetchInput),
  })
  return parseJson<SupportResponse>(res)
}
