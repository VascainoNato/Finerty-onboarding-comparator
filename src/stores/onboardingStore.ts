import { create } from 'zustand'
import type { MenuOptionId } from '../components/SideMenu'
import {
  listSessions,
  abandonSession as apiAbandonSession,
  type SessionRecord,
  type SessionType,
} from '../services/sessionsService'

const VIEW_BY_TYPE: Record<SessionType, MenuOptionId> = {
  chat: 'onboarding-ia-journey',
  voice: 'onboarding-ia-voice',
  traditional: 'onboarding-tradicional',
}

const TYPE_BY_VIEW: Partial<Record<MenuOptionId, SessionType>> = {
  'onboarding-ia-journey': 'chat',
  'onboarding-ia-voice': 'voice',
  'onboarding-tradicional': 'traditional',
}

interface FocusedSession {
  type: SessionType
  id: string
}

interface OnboardingStore {
  view: MenuOptionId
  focusedSession: FocusedSession | null
  sessions: Record<string, SessionRecord>
  lastSyncedAt: number | null

  navigate: (view: MenuOptionId) => void
  startOnboarding: (type: SessionType) => string
  resumeOnboarding: (session: SessionRecord) => void
  cancelOnboarding: (id: string) => Promise<void>
  completeOnboardingLocal: () => Promise<void>
  refresh: () => Promise<void>
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  view: 'inicio',
  focusedSession: null,
  sessions: {},
  lastSyncedAt: null,

  navigate: (view) => {
    const sessionType = TYPE_BY_VIEW[view]
    const currentFocus = get().focusedSession
    if (!sessionType) {
      set({ view, focusedSession: null })
      return
    }
    if (currentFocus && currentFocus.type === sessionType) {
      set({ view })
      return
    }
    set({ view, focusedSession: null })
  },

  startOnboarding: (type) => {
    const id = crypto.randomUUID()
    set({
      view: VIEW_BY_TYPE[type],
      focusedSession: { type, id },
    })
    return id
  },

  resumeOnboarding: (session) => {
    set({
      view: VIEW_BY_TYPE[session.type],
      focusedSession: { type: session.type, id: session.id },
      sessions: { ...get().sessions, [session.id]: session },
    })
  },

  cancelOnboarding: async (id) => {
    try {
      await apiAbandonSession(id)
    } catch {
      // swallow — refresh below will reconcile
    }
    const focus = get().focusedSession
    set({
      focusedSession: focus?.id === id ? null : focus,
      view: focus?.id === id ? 'inicio' : get().view,
    })
    await get().refresh()
  },

  completeOnboardingLocal: async () => {
    await get().refresh()
  },

  refresh: async () => {
    try {
      const list = await listSessions()
      const map: Record<string, SessionRecord> = {}
      for (const s of list) map[s.id] = s
      set({ sessions: map, lastSyncedAt: Date.now() })
    } catch {
      // offline / API down — keep whatever we have
    }
  },
}))
