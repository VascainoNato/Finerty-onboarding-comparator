import { useEffect, useMemo } from 'react'
import type { SessionType } from '../services/sessionsService'
import { useOnboardingStore } from '../stores/onboardingStore'

const TYPE_LABEL: Record<SessionType, string> = {
  chat: 'Messages',
  voice: 'Voice',
  traditional: 'Traditional',
}

function formatCost(usd: number): string {
  if (usd < 0.0001) return `$${usd.toFixed(6)}`
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function IACost() {
  const sessionsMap = useOnboardingStore((s) => s.sessions)
  const lastSyncedAt = useOnboardingStore((s) => s.lastSyncedAt)
  const refresh = useOnboardingStore((s) => s.refresh)

  useEffect(() => {
    refresh()
  }, [refresh])

  const sessions = useMemo(
    () =>
      Object.values(sessionsMap).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
    [sessionsMap]
  )

  const loading = lastSyncedAt === null && sessions.length === 0

  const totals = useMemo(() => {
    let tokens = 0
    let cost = 0
    const byType: Record<SessionType, { tokens: number; cost: number; count: number }> = {
      chat: { tokens: 0, cost: 0, count: 0 },
      voice: { tokens: 0, cost: 0, count: 0 },
      traditional: { tokens: 0, cost: 0, count: 0 },
    }
    for (const s of sessions) {
      tokens += s.cost.tokensUsed
      cost += s.cost.costUsd
      byType[s.type].tokens += s.cost.tokensUsed
      byType[s.type].cost += s.cost.costUsd
      byType[s.type].count += 1
    }
    return { tokens, cost, byType, count: sessions.length }
  }, [sessions])

  return (
    <div className='flex-1 w-full overflow-y-auto p-6 md:p-10'>
      <div className='max-w-5xl mx-auto'>
        <header className='mb-6'>
          <h1 className='text-2xl font-bold text-gray-900'>IA Cost</h1>
          <p className='text-sm text-gray-600 mt-1'>
            Token usage and approximate cost across every session.
          </p>
        </header>

        {loading && <p className='text-sm text-gray-500'>Loading usage...</p>}

        {!loading && (
          <>
            {/* Totals */}
            <div className='grid grid-cols-2 md:grid-cols-4 gap-3 mb-8'>
              <StatCard label='Sessions' value={totals.count.toString()} />
              <StatCard label='Total tokens' value={totals.tokens.toLocaleString()} />
              <StatCard label='Total cost' value={formatCost(totals.cost)} accent />
              <StatCard
                label='Avg / session'
                value={totals.count ? formatCost(totals.cost / totals.count) : '—'}
              />
            </div>

            {/* Breakdown by type */}
            <section className='mb-8'>
              <h2 className='text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3'>
                By onboarding type
              </h2>
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                {(Object.keys(totals.byType) as SessionType[]).map((t) => (
                  <div
                    key={t}
                    className='p-4 rounded-xl border border-gray-200 bg-white'
                  >
                    <p className='text-sm font-semibold text-gray-900'>{TYPE_LABEL[t]}</p>
                    <div className='mt-2 text-xs text-gray-600 flex flex-col gap-0.5'>
                      <span>
                        <span className='text-gray-400'>Sessions:</span>{' '}
                        {totals.byType[t].count}
                      </span>
                      <span>
                        <span className='text-gray-400'>Tokens:</span>{' '}
                        {totals.byType[t].tokens.toLocaleString()}
                      </span>
                      <span>
                        <span className='text-gray-400'>Cost:</span>{' '}
                        {formatCost(totals.byType[t].cost)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Per-session table */}
            <section>
              <h2 className='text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3'>
                Per session
              </h2>
              {sessions.length === 0 ? (
                <p className='text-sm text-gray-500 py-8 text-center'>
                  No sessions yet.
                </p>
              ) : (
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm border-collapse'>
                    <thead>
                      <tr className='text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200'>
                        <th className='py-2 px-3 font-semibold'>Session</th>
                        <th className='py-2 px-3 font-semibold'>Type</th>
                        <th className='py-2 px-3 font-semibold'>Status</th>
                        <th className='py-2 px-3 font-semibold'>Model</th>
                        <th className='py-2 px-3 font-semibold text-right'>Tokens</th>
                        <th className='py-2 px-3 font-semibold text-right'>Cost</th>
                        <th className='py-2 px-3 font-semibold'>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr
                          key={s.id}
                          className='border-b border-gray-100 hover:bg-gray-50'
                        >
                          <td className='py-2 px-3 font-medium text-gray-900'>{s.label}</td>
                          <td className='py-2 px-3 text-gray-700'>{TYPE_LABEL[s.type]}</td>
                          <td className='py-2 px-3 capitalize text-gray-700'>{s.status}</td>
                          <td className='py-2 px-3 font-mono text-xs text-gray-700'>
                            {s.cost.model}
                          </td>
                          <td className='py-2 px-3 text-right tabular-nums text-gray-900'>
                            {s.cost.tokensUsed.toLocaleString()}
                          </td>
                          <td className='py-2 px-3 text-right tabular-nums text-gray-900'>
                            {formatCost(s.cost.costUsd)}
                          </td>
                          <td className='py-2 px-3 text-xs text-gray-600'>
                            {formatDate(s.updatedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className='text-xs text-gray-500 mt-6 leading-relaxed'>
              Costs are an approximation using the blended average of GPT-4o-mini input/output rates
              (input $0.15, output $0.60 per 1M tokens) applied to total tokens — the exact split isn't
              tracked per call. Voice transcription via Azure Speech (F0 free tier) isn't included.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      className={`p-4 rounded-xl border ${
        accent
          ? 'bg-[#2D0A6C] border-[#2D0A6C] text-white'
          : 'bg-white border-gray-200'
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          accent ? 'text-white/70' : 'text-gray-500'
        }`}
      >
        {label}
      </p>
      <p className='text-xl font-bold mt-1'>{value}</p>
    </div>
  )
}

export default IACost
