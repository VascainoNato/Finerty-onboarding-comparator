import { useEffect, useState } from 'react'
import {
  listSessions,
  type SessionRecord,
  type SessionType,
} from '../services/sessionsService'

const TYPE_LABEL: Record<SessionType, string> = {
  chat: 'Onboarding with IA - Messages',
  voice: 'Onboarding with IA - Voice',
  traditional: 'Traditional Onboarding',
}

const TYPE_PILL: Record<SessionType, string> = {
  chat: 'bg-blue-50 text-blue-700 border-blue-200',
  voice: 'bg-purple-50 text-purple-700 border-purple-200',
  traditional: 'bg-green-50 text-green-700 border-green-200',
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

function SavedInformation() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SessionRecord | null>(null)

  useEffect(() => {
    listSessions()
      .then((all) => setSessions(all.filter((s) => s.status === 'completed')))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className='flex-1 w-full overflow-y-auto p-6 md:p-10'>
      <div className='max-w-4xl mx-auto'>
        <header className='mb-6'>
          <h1 className='text-2xl font-bold text-gray-900'>Saved Informations</h1>
          <p className='text-sm text-gray-600 mt-1'>
            Every completed onboarding session is kept here with its full details.
          </p>
        </header>

        {loading && <p className='text-sm text-gray-500'>Loading sessions...</p>}

        {!loading && sessions.length === 0 && (
          <div className='text-center py-16 text-gray-500'>
            <p className='text-sm'>No completed sessions yet.</p>
            <p className='text-xs mt-1'>Finish an onboarding to see it here.</p>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {sessions.map((s) => (
              <button
                key={s.id}
                type='button'
                onClick={() => setSelected(s)}
                className='text-left p-5 rounded-xl border border-gray-200 bg-white hover:border-[#2D0A6C]/40 hover:shadow-md transition-all cursor-pointer'
              >
                <div className='flex items-center justify-between mb-3'>
                  <span className='text-sm font-semibold text-gray-900'>{s.label}</span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${TYPE_PILL[s.type]}`}
                  >
                    {s.type}
                  </span>
                </div>
                <p className='text-xs text-gray-500 mb-3'>{TYPE_LABEL[s.type]}</p>
                <div className='flex flex-col gap-1 text-xs text-gray-600'>
                  <span>
                    <span className='text-gray-400'>Completed:</span> {formatDate(s.completedAt)}
                  </span>
                  <span>
                    <span className='text-gray-400'>Tokens:</span> {s.cost.tokensUsed.toLocaleString()}
                  </span>
                  <span>
                    <span className='text-gray-400'>Cost:</span> {formatCost(s.cost.costUsd)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && <SessionDetailsModal session={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function SessionDetailsModal({
  session,
  onClose,
}: {
  session: SessionRecord
  onClose: () => void
}) {
  return (
    <div
      className='fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4'
      onClick={onClose}
    >
      <div
        className='bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col'
        onClick={(e) => e.stopPropagation()}
      >
        <header className='flex items-start justify-between p-6 border-b border-gray-200'>
          <div>
            <h2 className='text-lg font-semibold text-gray-900'>{session.label}</h2>
            <p className='text-xs text-gray-500 mt-1'>{TYPE_LABEL[session.type]}</p>
          </div>
          <button
            type='button'
            onClick={onClose}
            aria-label='Close'
            className='w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600 cursor-pointer'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth={2}
              strokeLinecap='round'
              strokeLinejoin='round'
              className='w-5 h-5'
            >
              <path d='M18 6 6 18' />
              <path d='m6 6 12 12' />
            </svg>
          </button>
        </header>

        <div className='overflow-y-auto p-6 space-y-5'>
          <section>
            <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2'>
              Overview
            </h3>
            <dl className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
              <dt className='text-gray-500'>Created</dt>
              <dd className='text-gray-900'>{formatDate(session.createdAt)}</dd>
              <dt className='text-gray-500'>Completed</dt>
              <dd className='text-gray-900'>{formatDate(session.completedAt)}</dd>
              <dt className='text-gray-500'>Type</dt>
              <dd className='text-gray-900 capitalize'>{session.type}</dd>
              <dt className='text-gray-500'>Status</dt>
              <dd className='text-gray-900 capitalize'>{session.status}</dd>
            </dl>
          </section>

          <section>
            <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2'>
              AI cost
            </h3>
            <dl className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm'>
              <dt className='text-gray-500'>Model</dt>
              <dd className='text-gray-900 font-mono'>{session.cost.model}</dd>
              <dt className='text-gray-500'>Tokens</dt>
              <dd className='text-gray-900'>{session.cost.tokensUsed.toLocaleString()}</dd>
              <dt className='text-gray-500'>Input rate</dt>
              <dd className='text-gray-900'>${session.cost.inputRatePerMillion}/1M</dd>
              <dt className='text-gray-500'>Output rate</dt>
              <dd className='text-gray-900'>${session.cost.outputRatePerMillion}/1M</dd>
              <dt className='text-gray-500 font-medium'>Total</dt>
              <dd className='text-gray-900 font-medium'>{formatCost(session.cost.costUsd)}</dd>
            </dl>
          </section>

          <section>
            <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2'>
              Collected answers
            </h3>
            {session.snapshot?.collectedData ? (
              <dl className='flex flex-col gap-2 text-sm'>
                {Object.entries(session.snapshot.collectedData).map(([key, value]) => (
                  <div key={key} className='flex flex-col gap-0.5'>
                    <dt className='text-xs text-gray-500 capitalize'>{formatKey(key)}</dt>
                    <dd className='text-gray-900 whitespace-pre-wrap break-words'>
                      {formatValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className='text-sm text-gray-500'>No answers captured.</p>
            )}
          </section>

          {session.snapshot?.messages && session.snapshot.messages.length > 0 && (
            <section>
              <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2'>
                Conversation transcript ({session.snapshot.messages.length})
              </h3>
              <div className='flex flex-col gap-2 text-sm max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50'>
                {session.snapshot.messages.map((m, i) => (
                  <div
                    key={i}
                    className={`px-3 py-2 rounded-lg ${
                      m.role === 'user'
                        ? 'bg-[#F2F1FF] self-end max-w-[85%]'
                        : 'bg-white border border-gray-200 self-start max-w-[85%]'
                    }`}
                  >
                    <p className='text-[10px] uppercase tracking-wide text-gray-500 mb-0.5'>
                      {m.role}
                    </p>
                    {m.file ? (
                      <p className='text-xs italic text-gray-600'>
                        📎 {m.file.name} ({Math.round(m.file.size / 1024)} KB)
                      </p>
                    ) : (
                      <p className='whitespace-pre-wrap break-words'>{m.content}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function formatKey(k: string): string {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    if ('name' in obj && 'size' in obj) {
      return `📎 ${obj.name} (${Math.round(Number(obj.size) / 1024)} KB)`
    }
    return JSON.stringify(v)
  }
  return String(v)
}

export default SavedInformation
