import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  fetchSupportNode,
  askSupport,
  type SupportSuggestion,
} from '../services/supportService'
import FinStatic from '../assets/fin-static.svg'
import UserAvatar from '../assets/user-default.svg'

interface SupportChatProps {
  open: boolean
  onClose: () => void
}

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface SupportSession {
  id: string
  label: string
  messages: DisplayMessage[]
  suggestions: SupportSuggestion[]
  createdAt: string
  updatedAt: string
}

type ViewMode = 'list' | 'chat'

const STORAGE_KEY = 'fin.supportState'

interface StoredState {
  sessions: SupportSession[]
  activeId: string | null
  view: ViewMode
  nextNumber: number
}

function loadStored(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredState>
    if (!Array.isArray(parsed.sessions)) return null
    return {
      sessions: parsed.sessions as SupportSession[],
      activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
      view: parsed.view === 'chat' ? 'chat' : 'list',
      nextNumber: typeof parsed.nextNumber === 'number' ? parsed.nextNumber : 1,
    }
  } catch {
    return null
  }
}

function saveStored(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function lastMessagePreview(s: SupportSession): string {
  const last = s.messages[s.messages.length - 1]
  if (!last) return 'No messages yet'
  const text = last.content.replace(/\s+/g, ' ').trim()
  return text.length > 60 ? text.slice(0, 57) + '…' : text
}

function SupportChat({ open, onClose }: SupportChatProps) {
  const [sessions, setSessions] = useState<SupportSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('list')
  const [nextNumber, setNextNumber] = useState(1)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Load from localStorage once
  useEffect(() => {
    const stored = loadStored()
    if (stored) {
      setSessions(stored.sessions)
      setActiveId(stored.activeId)
      setView(stored.view)
      setNextNumber(stored.nextNumber)
    }
    setHydrated(true)
  }, [])

  // Persist on changes
  useEffect(() => {
    if (!hydrated) return
    saveStored({ sessions, activeId, view, nextNumber })
  }, [sessions, activeId, view, nextNumber, hydrated])

  // Auto-scroll when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeId, sessions, loading])

  const activeSession = sessions.find((s) => s.id === activeId) ?? null

  // When a session becomes active and is empty, fetch the root welcome once.
  // Deps intentionally omit `sessions` and `loading` to avoid re-running on
  // every state tick (which would cancel the in-flight fetch and retry forever).
  useEffect(() => {
    if (!open || !hydrated) return
    if (view !== 'chat') return
    if (!activeId) return
    const session = sessions.find((s) => s.id === activeId)
    if (!session || session.messages.length > 0) return

    let cancelled = false
    setLoading(true)
    fetchSupportNode('root')
      .then((r) => {
        if (cancelled) return
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeId
              ? {
                  ...s,
                  messages: [
                    {
                      id: `a-${Date.now()}`,
                      role: 'assistant',
                      content: r.reply,
                    },
                  ],
                  suggestions: r.suggestions,
                  updatedAt: new Date().toISOString(),
                }
              : s
          )
        )
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load support.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hydrated, view, activeId])

  function patchSession(id: string, patch: (s: SupportSession) => SupportSession) {
    setSessions((prev) => prev.map((s) => (s.id === id ? patch(s) : s)))
  }

  function createNewSession(): SupportSession {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const session: SupportSession = {
      id,
      label: `Chat ${nextNumber}`,
      messages: [],
      suggestions: [],
      createdAt: now,
      updatedAt: now,
    }
    setSessions((prev) => [session, ...prev])
    setNextNumber((n) => n + 1)
    setActiveId(id)
    setView('chat')
    setError(null)
    return session
  }

  function openSession(id: string) {
    setActiveId(id)
    setView('chat')
    setError(null)
  }

  function deleteSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeId === id) {
      setActiveId(null)
      setView('list')
    }
  }

  function goToList() {
    setView('list')
    setError(null)
  }

  async function handleNodeClick(nodeKey: string) {
    if (loading || !activeSession) return
    const targetId = activeSession.id
    setError(null)
    patchSession(targetId, (s) => ({ ...s, suggestions: [] }))
    setLoading(true)
    try {
      const r = await fetchSupportNode(nodeKey)
      patchSession(targetId, (s) => ({
        ...s,
        messages: [
          ...s.messages,
          { id: `a-${Date.now()}`, role: 'assistant', content: r.reply },
        ],
        suggestions: r.suggestions,
        updatedAt: new Date().toISOString(),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch topic.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAsk(message: string) {
    if (loading || !activeSession || !message.trim()) return
    const targetId = activeSession.id
    const text = message.trim()
    setError(null)
    patchSession(targetId, (s) => ({
      ...s,
      messages: [
        ...s.messages,
        { id: `u-${Date.now()}`, role: 'user', content: text },
      ],
      suggestions: [],
      updatedAt: new Date().toISOString(),
    }))
    setLoading(true)
    try {
      const historySource = activeSession.messages.slice(-8)
      const history = [
        ...historySource.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ].slice(-10)
      const r = await askSupport(text, history)
      patchSession(targetId, (s) => ({
        ...s,
        messages: [
          ...s.messages,
          { id: `a-${Date.now()}`, role: 'assistant', content: r.reply },
        ],
        suggestions: r.suggestions,
        updatedAt: new Date().toISOString(),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.')
    } finally {
      setLoading(false)
    }
  }

  function handleSuggestionClick(s: SupportSuggestion) {
    if (!activeSession) return
    if (s.nodeKey) {
      patchSession(activeSession.id, (sess) => ({
        ...sess,
        messages: [
          ...sess.messages,
          { id: `u-${Date.now()}`, role: 'user', content: s.label },
        ],
        updatedAt: new Date().toISOString(),
      }))
      handleNodeClick(s.nodeKey)
    } else if (s.prompt) {
      handleAsk(s.prompt)
    }
  }

  function handleSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    handleAsk(text)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isListView = view === 'list' || !activeSession

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-[1200ms] ease-out ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden='true'
      />

      {/* Sliding panel */}
      <aside
        className={`fixed top-0 right-0 h-full z-50 bg-white shadow-2xl flex flex-col transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] w-full md:w-[30%] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className='flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 bg-white shrink-0'>
          <div className='flex items-center gap-2 min-w-0'>
            {!isListView && (
              <button
                type='button'
                onClick={goToList}
                aria-label='Back to chats'
                className='w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-600 shrink-0 cursor-pointer'
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
                  <path d='m15 18-6-6 6-6' />
                </svg>
              </button>
            )}
            <img
              src={FinStatic}
              alt='Fin'
              className='w-8 h-8 rounded-full bg-gray-100 shrink-0'
            />
            <div className='min-w-0'>
              <p className='text-sm font-semibold text-gray-900 truncate'>
                {isListView ? 'Fin — Support' : activeSession!.label}
              </p>
              <p className='text-xs text-gray-500 truncate'>
                {isListView
                  ? 'Your chats with Fin'
                  : 'Ask anything about Finerty features.'}
              </p>
            </div>
          </div>
          <button
            type='button'
            onClick={onClose}
            aria-label='Close support chat'
            className='w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-600 cursor-pointer shrink-0'
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

        {/* Body */}
        {isListView ? (
          <div className='flex-1 min-h-0 overflow-y-auto bg-[#FAFAFA]'>
            {/* New chat button */}
            <div className='p-3 border-b border-gray-100 bg-white'>
              <button
                type='button'
                onClick={createNewSession}
                className='w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#2D0A6C] text-white text-sm font-medium hover:bg-[#1f0750] transition-colors cursor-pointer'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth={2}
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='w-4 h-4'
                >
                  <path d='M12 5v14' />
                  <path d='M5 12h14' />
                </svg>
                Start a new chat
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className='text-center py-12 px-6 text-gray-500'>
                <p className='text-sm'>No chats yet.</p>
                <p className='text-xs mt-1'>
                  Tap the button above to start a conversation with Fin.
                </p>
              </div>
            ) : (
              <ul className='divide-y divide-gray-100'>
                {[...sessions]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .map((s) => (
                    <li
                      key={s.id}
                      className='group flex items-center gap-3 px-4 py-3 bg-white hover:bg-[#F2F1FF]/50 transition-colors cursor-pointer'
                      onClick={() => openSession(s.id)}
                    >
                      <img
                        src={FinStatic}
                        alt=''
                        aria-hidden='true'
                        className='w-10 h-10 rounded-full bg-gray-100 shrink-0'
                      />
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center justify-between gap-2'>
                          <p className='text-sm font-semibold text-gray-900 truncate'>
                            {s.label}
                          </p>
                          <span className='text-[10px] text-gray-400 shrink-0'>
                            {formatRelative(s.updatedAt)}
                          </span>
                        </div>
                        <p className='text-xs text-gray-500 truncate'>
                          {lastMessagePreview(s)}
                        </p>
                      </div>
                      <button
                        type='button'
                        aria-label={`Delete ${s.label}`}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          deleteSession(s.id)
                        }}
                        className='w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0 cursor-pointer'
                      >
                        <svg
                          xmlns='http://www.w3.org/2000/svg'
                          viewBox='0 0 24 24'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth={2}
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          className='w-4 h-4'
                        >
                          <path d='M3 6h18' />
                          <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' />
                          <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
                        </svg>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className='flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-[#FAFAFA]'>
              {activeSession!.messages.map((m) => {
                const isUser = m.role === 'user'
                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <img
                        src={FinStatic}
                        alt='Fin'
                        className='w-7 h-7 rounded-full shrink-0 bg-white'
                      />
                    )}
                    <span
                      className={`inline-block px-3 py-2 rounded-2xl max-w-[80%] whitespace-pre-wrap break-words text-sm ${
                        isUser
                          ? 'bg-[#F2F1FF] text-gray-900'
                          : 'bg-white border border-gray-200 text-gray-800'
                      }`}
                    >
                      {m.content}
                    </span>
                    {isUser && (
                      <img
                        src={UserAvatar}
                        alt='You'
                        className='w-7 h-7 rounded-full shrink-0 bg-gray-100'
                      />
                    )}
                  </div>
                )
              })}

              {loading && (
                <div className='flex items-end gap-2 justify-start'>
                  <img
                    src={FinStatic}
                    alt='Fin'
                    className='w-7 h-7 rounded-full shrink-0 bg-white'
                  />
                  <span className='inline-flex items-center gap-1 px-3 py-2.5 rounded-2xl bg-white border border-gray-200'>
                    <span
                      className='w-2 h-2 bg-gray-400 rounded-full animate-bounce'
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className='w-2 h-2 bg-gray-400 rounded-full animate-bounce'
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className='w-2 h-2 bg-gray-400 rounded-full animate-bounce'
                      style={{ animationDelay: '300ms' }}
                    />
                  </span>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Suggestions */}
            {!loading && activeSession!.suggestions.length > 0 && (
              <div className='px-3 pt-2 pb-2 flex flex-wrap gap-1.5 border-t border-gray-100 bg-white max-h-[30%] overflow-y-auto shrink-0'>
                {activeSession!.suggestions.map((s, i) => (
                  <button
                    key={`${s.label}-${i}`}
                    type='button'
                    onClick={() => handleSuggestionClick(s)}
                    className='px-2.5 py-1 text-xs rounded-full border border-gray-300 bg-white hover:bg-[#F2F1FF] hover:border-gray-400 transition-colors text-gray-800 cursor-pointer'
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div className='px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-200 shrink-0'>
                {error}
              </div>
            )}

            {/* Input */}
            <div className='border-t border-gray-200 p-3 flex gap-2 bg-white items-center shrink-0'>
              <input
                type='text'
                className='flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2F1FF] focus:border-gray-400'
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={loading ? 'Waiting for Fin...' : 'Ask Fin about any feature...'}
                disabled={loading}
              />
              <button
                type='button'
                onClick={handleSend}
                disabled={loading || input.trim().length === 0}
                className='px-3 py-2 bg-[#2D0A6C] text-white rounded-lg text-sm font-medium hover:bg-[#1f0750] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer'
              >
                Send
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

export default SupportChat
