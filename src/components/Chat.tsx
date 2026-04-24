import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react'
import {
  sendMessage,
  getHistory,
  START_SENTINEL,
  type ChatMessage,
  type FileMeta,
} from '../services/chatService'
import { convertWebMToWav, transcribeAudio } from '../services/audioService'
import Fin from '../assets/fin.svg'
import UserAvatar from '../assets/user-default.svg'
import { ReactConfetti } from './ReactConfetti'
import StartButton from './StartButton'
import { useOnboardingStore } from '../stores/onboardingStore'

type DisplayMessage = Pick<ChatMessage, 'role' | 'content'> & {
  id: string
  file?: FileMeta
  audioUrl?: string
}

type RecordingStatus = 'idle' | 'recording' | 'processing'

const BUBBLE_DELAY_MS = 1500
const DOCUMENT_STATE = 'pd_document'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Chat() {
  const focusedSession = useOnboardingStore((s) => s.focusedSession)
  const startOnboarding = useOnboardingStore((s) => s.startOnboarding)
  const navigate = useOnboardingStore((s) => s.navigate)
  const completeOnboardingLocal = useOnboardingStore(
    (s) => s.completeOnboardingLocal
  )

  const sessionId =
    focusedSession && focusedSession.type === 'chat' ? focusedSession.id : null

  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [started, setStarted] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [currentState, setCurrentState] = useState<string | null>(null)
  const [recStatus, setRecStatus] = useState<RecordingStatus>('idle')
  const [hydrating, setHydrating] = useState(!!sessionId)
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const mediaStreamRef = useRef<MediaStream | null>(null)
  // Marca quando o próprio Start botou a sessão: não queremos rehidratar
  // por cima das mensagens que vão chegar em performTurn.
  const justStartedRef = useRef(false)
  // Último sessionId que já passou por rehidratação (ou Start); evita refazer
  // o get quando a referência do store muda mas o id continua igual.
  const hydratedForIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (justStartedRef.current) {
      justStartedRef.current = false
      hydratedForIdRef.current = sessionId
      return
    }

    if (!sessionId) {
      if (hydratedForIdRef.current !== null) {
        setMessages([])
        setInput('')
        setSending(false)
        setCompleted(false)
        setStarted(false)
        setSuggestions([])
        setError(null)
        setCurrentState(null)
        hydratedForIdRef.current = null
      }
      setHydrating(false)
      return
    }

    if (hydratedForIdRef.current === sessionId) return

    setMessages([])
    setInput('')
    setSending(false)
    setCompleted(false)
    setStarted(false)
    setSuggestions([])
    setError(null)
    setCurrentState(null)
    setHydrating(true)
    getHistory(sessionId)
      .then((data) => {
        const displayed = data.messages
          .filter((m) => m.role !== 'system' && m.content !== START_SENTINEL)
          .map((m, i) => ({
            id: `h-${i}`,
            role: m.role,
            content: m.content,
            ...(m.file ? { file: m.file } : {}),
          }))
        if (displayed.length > 0) {
          setMessages(displayed)
          setStarted(true)
        }
        setCompleted(!!data.conversation?.isCompleted)
        if (data.conversation?.state) setCurrentState(data.conversation.state)
        hydratedForIdRef.current = sessionId
      })
      .catch(() => {
        hydratedForIdRef.current = sessionId
      })
      .finally(() => setHydrating(false))
  }, [sessionId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (completed) {
      setShowConfetti(true)
      const t = setTimeout(() => setShowConfetti(false), 12000)
      return () => clearTimeout(t)
    }
  }, [completed])

  async function performTurn(
    activeSessionId: string,
    text: string,
    showUserBubble: boolean,
    file?: FileMeta
  ) {
    if (sending || completed) return
    setError(null)
    setSuggestions([])
    setStarted(true)

    if (showUserBubble) {
      setMessages((p) => [
        ...p,
        {
          id: `u-${Date.now()}`,
          role: 'user',
          content: file ? '' : text,
          ...(file ? { file } : {}),
        },
      ])
    }

    setSending(true)
    try {
      const [r] = await Promise.all([
        sendMessage(activeSessionId, text, file),
        sleep(BUBBLE_DELAY_MS),
      ])
      if (r.reset) {
        setMessages([])
      }
      if (r.replies.length > 0) {
        setMessages((p) => [
          ...p,
          { id: `a-${Date.now()}-0`, role: 'assistant', content: r.replies[0] },
        ])
      }
      for (let i = 1; i < r.replies.length; i++) {
        await sleep(BUBBLE_DELAY_MS)
        setMessages((p) => [
          ...p,
          { id: `a-${Date.now()}-${i}`, role: 'assistant', content: r.replies[i] },
        ])
      }
      setSuggestions(r.suggestions || [])
      setCurrentState(r.state || null)
      if (r.isCompleted) {
        setCompleted(true)
        completeOnboardingLocal()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  function handlePaperclipClick() {
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !sessionId) return
    const meta: FileMeta = { name: file.name, size: file.size, type: file.type || 'application/octet-stream' }
    await performTurn(sessionId, file.name, true, meta)
  }

  function stopMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
  }

  async function startRecording() {
    if (recStatus !== 'idle' || sending || completed) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      recordedChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = rec
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data)
      }
      rec.onstop = handleRecordingStopped
      rec.start()
      setRecStatus('recording')
    } catch (err) {
      stopMediaStream()
      const msg = err instanceof Error ? err.message : 'Microphone access denied.'
      setError(msg)
      setRecStatus('idle')
    }
  }

  function stopRecording() {
    const rec = mediaRecorderRef.current
    if (!rec || rec.state === 'inactive') return
    setRecStatus('processing')
    rec.stop()
  }

  async function handleRecordingStopped() {
    try {
      stopMediaStream()
      const chunks = recordedChunksRef.current
      recordedChunksRef.current = []
      if (chunks.length === 0 || !sessionId) {
        setRecStatus('idle')
        return
      }
      const webmBlob = new Blob(chunks, { type: 'audio/webm' })
      const wavBlob = await convertWebMToWav(webmBlob)
      const audioUrl = URL.createObjectURL(webmBlob)

      const result = await transcribeAudio(wavBlob)
      if (!result.text) {
        URL.revokeObjectURL(audioUrl)
        setError("I couldn't hear anything — please try again.")
        setRecStatus('idle')
        return
      }

      setRecStatus('idle')
      await performAudioTurn(sessionId, result.text, audioUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not transcribe the recording.'
      setError(msg)
      setRecStatus('idle')
    }
  }

  async function performAudioTurn(
    activeSessionId: string,
    transcript: string,
    audioUrl: string
  ) {
    if (sending || completed) return
    setError(null)
    setSuggestions([])
    setStarted(true)

    setMessages((p) => [
      ...p,
      { id: `u-${Date.now()}`, role: 'user', content: transcript, audioUrl },
    ])

    setSending(true)
    try {
      const [r] = await Promise.all([
        sendMessage(activeSessionId, transcript),
        sleep(BUBBLE_DELAY_MS),
      ])
      if (r.reset) setMessages([])
      if (r.replies.length > 0) {
        setMessages((p) => [
          ...p,
          { id: `a-${Date.now()}-0`, role: 'assistant', content: r.replies[0] },
        ])
      }
      for (let i = 1; i < r.replies.length; i++) {
        await sleep(BUBBLE_DELAY_MS)
        setMessages((p) => [
          ...p,
          { id: `a-${Date.now()}-${i}`, role: 'assistant', content: r.replies[i] },
        ])
      }
      setSuggestions(r.suggestions || [])
      setCurrentState(r.state || null)
      if (r.isCompleted) {
        setCompleted(true)
        completeOnboardingLocal()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  function handleMicClick() {
    if (recStatus === 'recording') {
      stopRecording()
    } else if (recStatus === 'idle') {
      startRecording()
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || !sessionId) return
    setInput('')
    await performTurn(sessionId, text, true)
  }

  async function handleStart() {
    setStarted(true)
    let id = sessionId
    if (!id) {
      justStartedRef.current = true
      id = startOnboarding('chat')
    }
    await performTurn(id, START_SENTINEL, false)
  }

  async function handleSuggestion(suggestion: string) {
    if (!sessionId) return
    await performTurn(sessionId, suggestion, true)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleGoHome() {
    navigate('inicio')
  }

  const showWelcome = !hydrating && !started && messages.length === 0

  return (
    <div className='relative flex flex-1 flex-col w-full h-full'>
      <ReactConfetti active={showConfetti} />

      <div
        className={`flex flex-1 flex-col min-h-0 transition-all duration-300 ${
          completed ? 'blur-sm pointer-events-none select-none' : ''
        }`}
      >
        <div className='flex-1 min-h-0 overflow-y-auto p-4 space-y-3'>
          {showWelcome && (
            <div className='flex flex-col items-center justify-center h-full text-center px-4'>
              <img src={Fin} alt='Fin' className='mb-6 w-[250px]' />
              <h2 className='text-xl font-semibold text-gray-900 mb-2'>
                Hi! I'm Fin.
              </h2>
              <p className='text-gray-600 max-w-sm mb-12'>
                I'm the AI assistant at Finerty. Send a message or click below to begin your message onboarding.
              </p>
              <StartButton onClick={handleStart} disabled={sending} />
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.role === 'user'
            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <img
                    src={Fin}
                    alt='Fin'
                    className='w-8 h-8 rounded-full shrink-0 object-cover bg-gray-100'
                  />
                )}
                {m.audioUrl ? (
                  <div className='inline-flex items-center gap-2 px-2 py-2 rounded-2xl max-w-[75%] bg-[#F2F1FF] text-gray-900'>
                    <audio
                      controls
                      src={m.audioUrl}
                      className='h-10 max-w-[220px] sm:max-w-[260px]'
                    />
                  </div>
                ) : m.file ? (
                  <div className='inline-flex items-center gap-3 px-3 py-2 rounded-2xl max-w-[75%] bg-[#F2F1FF] text-gray-900'>
                    <svg
                      xmlns='http://www.w3.org/2000/svg'
                      viewBox='0 0 24 24'
                      fill='currentColor'
                      className='w-8 h-8 text-[#2D0A6C] shrink-0'
                    >
                      <path
                        fillRule='evenodd'
                        d='M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5H5.625Z'
                        clipRule='evenodd'
                      />
                      <path d='M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z' />
                    </svg>
                    <div className='flex flex-col min-w-0'>
                      <span className='font-medium truncate text-sm'>
                        {m.file.name}
                      </span>
                      <span className='text-xs text-gray-500'>
                        {formatFileSize(m.file.size)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span
                    className={`inline-block px-4 py-2 rounded-2xl max-w-[75%] whitespace-pre-wrap break-words ${
                      isUser
                        ? 'bg-[#F2F1FF] text-gray-900'
                        : 'bg-white border border-gray-200 text-gray-800'
                    }`}
                  >
                    {m.content}
                  </span>
                )}
                {isUser && (
                  <img
                    src={UserAvatar}
                    alt='You'
                    className='w-8 h-8 rounded-full shrink-0 object-cover bg-gray-100'
                  />
                )}
              </div>
            )
          })}

          {sending && (
            <div className='flex items-end gap-2 justify-start'>
              <img
                src={Fin}
                alt='Fin'
                className='w-8 h-8 rounded-full shrink-0 object-cover bg-gray-100'
              />
              <span className='inline-flex items-center gap-1 px-4 py-3 rounded-2xl bg-white border border-gray-200'>
                <span className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '0ms' }}></span>
                <span className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '150ms' }}></span>
                <span className='w-2 h-2 bg-gray-400 rounded-full animate-bounce' style={{ animationDelay: '300ms' }}></span>
              </span>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {!sending && suggestions.length > 0 && !completed && (
          <div className='px-4 pt-2 pb-3 flex flex-wrap gap-2 border-t border-gray-100 bg-white'>
            {suggestions.map((s) => (
              <button
                key={s}
                type='button'
                onClick={() => handleSuggestion(s)}
                className='px-3 py-1.5 text-sm rounded-full border border-gray-300 bg-white hover:bg-[#F2F1FF] hover:border-gray-400 transition-colors text-gray-800'
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className='px-4 py-2 text-sm text-red-600 bg-red-50 border-t border-red-200'>
            {error}
          </div>
        )}

        <div className='border-t border-gray-200 p-3 flex gap-2 bg-white items-center'>
          <input
            ref={fileInputRef}
            type='file'
            accept='application/pdf,image/*'
            className='hidden'
            onChange={handleFileSelected}
          />
          <input
            type='text'
            className='flex-1 border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#F2F1FF] focus:border-gray-400'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              completed
                ? 'Onboarding Finished'
                : sending
                  ? 'Awaiting Fin...'
                  : 'Type your message...'
            }
            disabled={sending || completed || !sessionId}
            autoFocus
          />
          <button
            type='button'
            onClick={handlePaperclipClick}
            disabled={sending || completed || currentState !== DOCUMENT_STATE || recStatus !== 'idle'}
            title={
              currentState === DOCUMENT_STATE
                ? 'Attach a document'
                : 'Available when Fin asks for a document'
            }
            className='p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
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
              <path d='m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' />
            </svg>
          </button>
          <button
            type='button'
            onClick={handleMicClick}
            disabled={
              !started ||
              completed ||
              sending ||
              recStatus === 'processing' ||
              (recStatus === 'idle' && currentState === 'greeting')
            }
            title={
              recStatus === 'recording'
                ? 'Stop recording'
                : recStatus === 'processing'
                  ? 'Transcribing...'
                  : 'Record a voice answer'
            }
            className={`p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              recStatus === 'recording'
                ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {recStatus === 'recording' ? (
              <svg
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 24 24'
                fill='currentColor'
                className='w-5 h-5'
              >
                <rect x='6' y='6' width='12' height='12' rx='1.5' />
              </svg>
            ) : recStatus === 'processing' ? (
              <svg
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth={2}
                className='w-5 h-5 animate-spin'
              >
                <path strokeLinecap='round' d='M12 3a9 9 0 1 0 9 9' />
              </svg>
            ) : (
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
                <path d='M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' />
                <path d='M19 10v2a7 7 0 0 1-14 0v-2' />
                <path d='M12 19v4' />
                <path d='M8 23h8' />
              </svg>
            )}
          </button>
          <button
            type='button'
            onClick={handleSend}
            disabled={sending || completed || input.trim().length === 0 || !sessionId}
            className='px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
          >
            Send
          </button>
        </div>
      </div>

      {completed && (
        <div className='absolute inset-0 z-10 flex items-center justify-center px-4'>
          <div className='bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center border border-gray-200'>
            <img
              src={Fin}
              alt='Fin'
              className='w-20 h-20 rounded-full mx-auto mb-4 object-cover bg-gray-100'
            />
            <h2 className='text-2xl font-bold text-gray-900 mb-2'>
              Onboarding complete!
            </h2>
            <p className='text-gray-600 mb-6'>
              Thanks for sharing. You're all set with Finerty.
            </p>
            <div className='flex gap-3'>
              <button
                type='button'
                onClick={handleGoHome}
                className='flex-1 px-4 py-3 bg-[#2D0A6C] text-white rounded-lg font-medium hover:bg-[#1f0750] transition-colors cursor-pointer'
              >
                Go to home page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Chat
