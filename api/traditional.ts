import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionId } from './_lib/session'
import { ensureSession, completeSession, abandonSession } from './_lib/sessionStore'

interface FileMetaInput {
  name: string
  size: number
  type: string
}

export interface TraditionalData {
  // Phase 1 — About yourself
  relax: string
  hobbies: string
  dream: string
  dreamPlan: string
  morning: string
  change: string
  consequences: string
  // Phase 2 — Personal details
  name: string
  address: string
  eircode: string
  mobile: string
  dob: string
  email: string
  civilStatus: string
  document?: FileMetaInput
  // Metadata
  startedAt: string
  completedAt?: string
}

const traditionalStore = new Map<string, TraditionalData>()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EIRCODE_RE = /^[A-Za-z]\d{2}\s?[A-Za-z0-9]{4}$/
const MOBILE_RE = /^\+?[\d][\d\s\-()]{6,17}$/
const DOB_RE = /^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/

const CIVIL_STATUS_OPTIONS = [
  'Single',
  'Married',
  'Civil partnership',
  'Divorced',
  'Widowed',
]

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

function parseFile(raw: unknown): FileMetaInput | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const f = raw as { name?: unknown; size?: unknown; type?: unknown }
  if (typeof f.name !== 'string' || f.name.length === 0) return undefined
  if (typeof f.size !== 'number' || !Number.isFinite(f.size) || f.size < 0) return undefined
  if (typeof f.type !== 'string') return undefined
  return {
    name: f.name.slice(0, 200),
    size: f.size,
    type: f.type.slice(0, 100),
  }
}

function validate(data: TraditionalData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (data.relax.length < 2) errors.relax = 'Please give us a bit more.'
  if (data.hobbies.length < 2) errors.hobbies = 'Please give us a bit more.'
  if (data.dream.length < 2) errors.dream = 'Please give us a bit more.'
  if (data.dreamPlan.length < 2) errors.dreamPlan = 'Please give us a bit more.'
  if (data.morning.length < 2) errors.morning = 'Please give us a bit more.'
  if (data.change.length < 2) errors.change = 'Please give us a bit more.'
  if (data.consequences.length < 2) errors.consequences = 'Please give us a bit more.'

  if (data.name.length < 2) errors.name = 'Full name is required.'
  if (data.address.length < 5) errors.address = 'A full address is required.'
  if (!EIRCODE_RE.test(data.eircode)) errors.eircode = 'Use the format A65 F4E2.'
  if (!MOBILE_RE.test(data.mobile)) errors.mobile = 'Use a valid phone number.'
  if (!DOB_RE.test(data.dob)) errors.dob = 'Use DD/MM/YYYY.'
  if (!EMAIL_RE.test(data.email)) errors.email = 'Use a valid email address.'
  if (!CIVIL_STATUS_OPTIONS.includes(data.civilStatus))
    errors.civilStatus = 'Please choose a civil status.'

  return errors
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sessionId = getSessionId(req)
  if (!sessionId) {
    return res.status(400).json({ error: 'x-session-id header missing or invalid' })
  }

  if (req.method === 'GET') {
    const data = traditionalStore.get(sessionId) ?? null
    return res.status(200).json({ data })
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>

    const data: TraditionalData = {
      relax: str(body.relax),
      hobbies: str(body.hobbies),
      dream: str(body.dream),
      dreamPlan: str(body.dreamPlan),
      morning: str(body.morning),
      change: str(body.change),
      consequences: str(body.consequences),
      name: str(body.name),
      address: str(body.address),
      eircode: str(body.eircode),
      mobile: str(body.mobile),
      dob: str(body.dob),
      email: str(body.email),
      civilStatus: str(body.civilStatus),
      document: parseFile(body.document),
      startedAt:
        traditionalStore.get(sessionId)?.startedAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
    }

    const errors = validate(data)
    if (Object.keys(errors).length > 0) {
      await ensureSession(sessionId, 'traditional')
      return res.status(400).json({ error: 'Validation failed', fieldErrors: errors })
    }

    traditionalStore.set(sessionId, data)
    await ensureSession(sessionId, 'traditional')
    await completeSession(sessionId, {
      collectedData: data as unknown as Record<string, unknown>,
    })
    return res.status(200).json({ ok: true, data })
  }

  if (req.method === 'DELETE') {
    traditionalStore.delete(sessionId)
    await abandonSession(sessionId)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
