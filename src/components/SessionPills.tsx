import { useMemo, useState } from 'react'
import type { SessionRecord, SessionType } from '../services/sessionsService'
import { useOnboardingStore } from '../stores/onboardingStore'

const TYPE_LABELS: Record<SessionType, string> = {
  chat: 'Chat',
  voice: 'Voice',
  traditional: 'Form',
}

function SessionPills() {
  const sessions = useOnboardingStore((s) => s.sessions)
  const focusedId = useOnboardingStore((s) => s.focusedSession?.id ?? null)
  const resumeOnboarding = useOnboardingStore((s) => s.resumeOnboarding)
  const cancelOnboarding = useOnboardingStore((s) => s.cancelOnboarding)
  const [busyId, setBusyId] = useState<string | null>(null)

  const pills = useMemo(
    () =>
      Object.values(sessions).filter(
        (s) => s.status === 'active' && s.id !== focusedId
      ),
    [sessions, focusedId]
  )

  async function handleClose(session: SessionRecord, ev: React.MouseEvent) {
    ev.stopPropagation()
    setBusyId(session.id)
    try {
      await cancelOnboarding(session.id)
    } finally {
      setBusyId(null)
    }
  }

  if (pills.length === 0) return null

  return (
    <div className='fixed top-3 left-3 z-40 flex flex-wrap gap-2 max-w-[min(90vw,640px)]'>
      {pills.map((s) => (
        <button
          key={s.id}
          type='button'
          onClick={() => resumeOnboarding(s)}
          disabled={busyId === s.id}
          title={`Resume ${s.label} (${TYPE_LABELS[s.type]})`}
          className='group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#2D0A6C]/30 shadow-sm hover:border-[#2D0A6C] hover:shadow-md transition-all text-xs font-medium text-gray-800 disabled:opacity-50 cursor-pointer'
        >
          <span className='w-1.5 h-1.5 rounded-full bg-[#2D0A6C] animate-pulse' />
          <span>{s.label}</span>
          <span className='text-[10px] uppercase tracking-wide text-gray-500'>
            {TYPE_LABELS[s.type]}
          </span>
          <span
            role='button'
            tabIndex={-1}
            aria-label='Close session'
            onClick={(ev) => handleClose(s, ev)}
            className='ml-1 w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth={2.5}
              strokeLinecap='round'
              strokeLinejoin='round'
              className='w-3 h-3'
            >
              <path d='M18 6 6 18' />
              <path d='m6 6 12 12' />
            </svg>
          </span>
        </button>
      ))}
    </div>
  )
}

export default SessionPills
