import { promises as fs } from 'node:fs'
import path from 'node:path'

export type SessionType = 'chat' | 'voice' | 'traditional'
export type SessionStatus = 'active' | 'completed' | 'abandoned'

export interface SessionCostBreakdown {
  tokensUsed: number
  model: string
  inputRatePerMillion: number
  outputRatePerMillion: number
  costUsd: number // blended approx
}

export interface SessionSnapshot {
  collectedData: Record<string, unknown>
  messages?: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: string
    file?: { name: string; size: number; type: string }
  }>
}

export interface SessionRecord {
  id: string
  label: string
  type: SessionType
  status: SessionStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  cost: SessionCostBreakdown
  snapshot?: SessionSnapshot
}

const STORAGE_PATH = path.resolve(process.cwd(), 'server/data/sessions.json')

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
// GPT-4o-mini indicative prices (USD per 1M tokens)
const INPUT_RATE = 0.15
const OUTPUT_RATE = 0.6
// Blended rate used when we don't split input/output.
const BLENDED_RATE = (INPUT_RATE + OUTPUT_RATE) / 2

interface Store {
  nextNumber: number
  sessions: SessionRecord[]
}

let cache: Store | null = null
let writeQueue: Promise<void> = Promise.resolve()

async function ensureLoaded(): Promise<Store> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(STORAGE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<Store>
    cache = {
      nextNumber: parsed.nextNumber ?? 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    }
  } catch {
    cache = { nextNumber: 1, sessions: [] }
  }
  return cache
}

async function persist(): Promise<void> {
  if (!cache) return
  const snapshot = JSON.stringify(cache, null, 2)
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      try {
        await fs.mkdir(path.dirname(STORAGE_PATH), { recursive: true })
        await fs.writeFile(STORAGE_PATH, snapshot, 'utf8')
      } catch (err) {
        console.warn('sessionStore persist failed', err)
      }
    })
  return writeQueue
}

export function calcCostFromTokens(tokens: number): number {
  return (tokens / 1_000_000) * BLENDED_RATE
}

export async function listSessions(): Promise<SessionRecord[]> {
  const store = await ensureLoaded()
  return [...store.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  const store = await ensureLoaded()
  return store.sessions.find((s) => s.id === id) ?? null
}

export async function ensureSession(id: string, type: SessionType): Promise<SessionRecord> {
  const store = await ensureLoaded()
  let session = store.sessions.find((s) => s.id === id)
  if (!session) {
    const label = `Session ${store.nextNumber}`
    store.nextNumber += 1
    session = {
      id,
      label,
      type,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cost: {
        tokensUsed: 0,
        model: DEFAULT_MODEL,
        inputRatePerMillion: INPUT_RATE,
        outputRatePerMillion: OUTPUT_RATE,
        costUsd: 0,
      },
    }
    store.sessions.push(session)
    await persist()
  }
  return session
}

export async function addTokens(id: string, tokensDelta: number): Promise<void> {
  if (!tokensDelta || tokensDelta <= 0) return
  const store = await ensureLoaded()
  const session = store.sessions.find((s) => s.id === id)
  if (!session) return
  session.cost.tokensUsed += tokensDelta
  session.cost.costUsd = calcCostFromTokens(session.cost.tokensUsed)
  session.updatedAt = new Date().toISOString()
  await persist()
}

export async function completeSession(
  id: string,
  snapshot: SessionSnapshot,
  finalTokens?: number
): Promise<void> {
  const store = await ensureLoaded()
  const session = store.sessions.find((s) => s.id === id)
  if (!session) return
  session.status = 'completed'
  session.completedAt = new Date().toISOString()
  session.updatedAt = session.completedAt
  session.snapshot = snapshot
  if (typeof finalTokens === 'number' && finalTokens > session.cost.tokensUsed) {
    session.cost.tokensUsed = finalTokens
    session.cost.costUsd = calcCostFromTokens(finalTokens)
  }
  await persist()
}

export async function abandonSession(id: string): Promise<void> {
  const store = await ensureLoaded()
  const session = store.sessions.find((s) => s.id === id)
  if (!session) return
  if (session.status === 'active') {
    session.status = 'abandoned'
    session.updatedAt = new Date().toISOString()
    await persist()
  }
}

export async function deleteSession(id: string): Promise<void> {
  const store = await ensureLoaded()
  const before = store.sessions.length
  store.sessions = store.sessions.filter((s) => s.id !== id)
  if (store.sessions.length !== before) await persist()
}

export async function updateType(id: string, type: SessionType): Promise<void> {
  const store = await ensureLoaded()
  const session = store.sessions.find((s) => s.id === id)
  if (!session) return
  if (session.type !== type) {
    session.type = type
    session.updatedAt = new Date().toISOString()
    await persist()
  }
}
