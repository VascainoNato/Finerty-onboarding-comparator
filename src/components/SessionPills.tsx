import { useEffect, useState, useCallback } from 'react'
import {
  listSessions,
  abandonSession,
  activeSessionIdFor,
  type SessionRecord,
  type SessionType,
} from '../services/sessionsService'

interface SessionPillsProps {
  onResume: (session: SessionRecord) => void
  refreshTrigger?: number
}

const TYPE_LABELS: Record<SessionType, string> = {
  chat: 'Chat',
  voice: 'Voice',
  traditional: 'Form',
}

function SessionPills({ onResume, refreshTrigger = 0 }: SessionPillsProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    listSessions()
      .then((all) => {
        const open = all.filter((s) => s.status === 'active')
        setSessions(open)
      })
      .catch(() => setSessions([]))
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshTrigger])

  useEffect(() => {
    const id = window.setInterval(load, 5000)
    return () => window.clearInterval(id)
  }, [load])

  async function handleClose(session: SessionRecord, ev: React.MouseEvent) {
    ev.stopPropagation()
    setBusyId(session.id)
    try {
      await abandonSession(session.id)
      const activeId = activeSessionIdFor(session.type)
      if (activeId === session.id) {
        localStorage.removeItem(
          session.type === 'chat'
            ? 'fin.sessionId'
            : session.type === 'voice'
              ? 'fin.voiceSessionId'
              : 'fin.traditionalSessionId'
        )
      }
      setSessions((prev) => prev.filter((s) => s.id !== session.id))
    } catch {
      // ignore
    } finally {
      setBusyId(null)
    }
  }

  if (sessions.length === 0) return null

  return (
    <div className='fixed top-3 left-3 z-40 flex flex-wrap gap-2 max-w-[min(90vw,640px)]'>
      {sessions.map((s) => (
        <button
          key={s.id}
          type='button'
          onClick={() => onResume(s)}
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
