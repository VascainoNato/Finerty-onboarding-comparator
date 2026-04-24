import { useEffect, useRef, useState } from 'react'
import {
  sendVoiceMessage,
  getVoiceHistory,
  resetVoiceSession,
  START_SENTINEL,
} from '../services/chatService'
import {
  convertWebMToWav,
  transcribeAudio,
  speak,
  cancelSpeaking,
  ttsSupported,
  playBeep,
} from '../services/audioService'
import Fin from '../assets/fin-static.svg'
import StartButton from './StartButton'

type VoiceStatus =
  | 'idle'
  | 'starting'
  | 'fin_speaking'
  | 'listening'
  | 'processing'
  | 'completed'
  | 'error'

interface VoiceOnboardingProps {
  onClose: () => void
}

const VOICE_THRESHOLD = 0.008 // RMS normalizado (0..1) — bem sensível
const SILENCE_MS = 1600 // silêncio mínimo após fala antes de parar
const MAX_NO_SPEECH_MS = 15000 // desistência silenciosa se ninguém falar
const MIN_SPEECH_MS = 300 // descarta rajadas < 300ms de ruído
const PAUSE_BETWEEN_REPLIES_MS = 700 // respiro entre frases do Fin

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function VoiceOnboarding({ onClose }: VoiceOnboardingProps) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [message, setMessage] = useState<string>(
    "Tap Start and I'll introduce myself."
  )
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const sharedAudioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const vadFrameRef = useRef<number | null>(null)

  const speechDetectedRef = useRef(false)
  const firstSpeechAtRef = useRef(0)
  const lastVoiceAtRef = useRef(0)
  const listenStartedAtRef = useRef(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      cancelSpeaking()
      stopAutoListen()
      const shared = sharedAudioContextRef.current
      sharedAudioContextRef.current = null
      if (shared && shared.state !== 'closed') shared.close().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ensureSharedAudioContext(): Promise<AudioContext | null> {
    if (sharedAudioContextRef.current) {
      const ctx = sharedAudioContextRef.current
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
      return ctx
    }
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    const ctx = new Ctx()
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    sharedAudioContextRef.current = ctx
    return ctx
  }

  function stopAutoListen() {
    if (vadFrameRef.current != null) {
      cancelAnimationFrame(vadFrameRef.current)
      vadFrameRef.current = null
    }
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null

    try {
      sourceRef.current?.disconnect()
    } catch {
      // ignore
    }
    sourceRef.current = null
    analyserRef.current = null

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
    // Mantém o sharedAudioContextRef vivo — reutilizado em próximas rodadas.
  }

  async function speakReplies(replies: string[]) {
    setStatus('fin_speaking')
    for (let i = 0; i < replies.length; i++) {
      if (!isMountedRef.current) return
      setMessage(replies[i])
      try {
        await speak(replies[i])
      } catch (err) {
        console.warn('tts error', err)
      }
      // Respiro entre frases pra soar mais humano.
      if (i < replies.length - 1 && isMountedRef.current) {
        await sleep(PAUSE_BETWEEN_REPLIES_MS)
      }
    }
  }

  async function autoListen() {
    if (!isMountedRef.current) return
    const sharedCtx = await ensureSharedAudioContext()
    try {
      await playBeep(sharedCtx ?? undefined)
    } catch {
      // beep falhou; segue em frente
    }
    if (!isMountedRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
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

      const audioCtx = sharedCtx ?? (await ensureSharedAudioContext())
      if (!audioCtx) throw new Error('AudioContext not supported in this browser.')
      if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {})

      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser) // not connected to destination = no echo
      sourceRef.current = source
      analyserRef.current = analyser

      speechDetectedRef.current = false
      firstSpeechAtRef.current = 0
      lastVoiceAtRef.current = 0
      listenStartedAtRef.current = Date.now()

      rec.start()
      setStatus('listening')
      setMessage('Listening...')
      pollVad()
    } catch (err) {
      stopAutoListen()
      const msg = err instanceof Error ? err.message : 'Microphone access denied.'
      setError(msg)
      setStatus('error')
    }
  }

  function pollVad() {
    const analyser = analyserRef.current
    if (!analyser || !isMountedRef.current) return

    const buffer = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(buffer)

    // Compute RMS normalized to [0..1].
    let sum = 0
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / buffer.length)

    const now = Date.now()
    if (rms > VOICE_THRESHOLD) {
      if (!speechDetectedRef.current) {
        speechDetectedRef.current = true
        firstSpeechAtRef.current = now
      }
      lastVoiceAtRef.current = now
    }

    const silentFor = now - lastVoiceAtRef.current
    const spokeFor = speechDetectedRef.current
      ? now - firstSpeechAtRef.current
      : 0
    const noSpeechFor = now - listenStartedAtRef.current

    if (
      speechDetectedRef.current &&
      spokeFor >= MIN_SPEECH_MS &&
      silentFor > SILENCE_MS
    ) {
      // Fim da fala detectado.
      const rec = mediaRecorderRef.current
      if (rec && rec.state !== 'inactive') {
        setStatus('processing')
        setMessage('Got it — thinking...')
        rec.stop() // triggers handleRecordingStopped
      }
      if (vadFrameRef.current != null) {
        cancelAnimationFrame(vadFrameRef.current)
        vadFrameRef.current = null
      }
      return
    }

    if (!speechDetectedRef.current && noSpeechFor > MAX_NO_SPEECH_MS) {
      // Ninguém falou. Aborta, avisa e tenta de novo.
      stopAutoListen()
      handleNoSpeech()
      return
    }

    vadFrameRef.current = requestAnimationFrame(pollVad)
  }

  async function handleNoSpeech() {
    if (!isMountedRef.current) return
    try {
      setStatus('fin_speaking')
      setMessage("Still there? I didn't catch anything.")
      await speak("Still there? I didn't catch anything.")
    } catch {
      // ignore
    }
    if (!isMountedRef.current) return
    autoListen()
  }

  async function handleRecordingStopped() {
    try {
      const chunks = recordedChunksRef.current
      recordedChunksRef.current = []

      // Para o stream/analyser agora — já capturamos o áudio.
      if (vadFrameRef.current != null) {
        cancelAnimationFrame(vadFrameRef.current)
        vadFrameRef.current = null
      }
      try {
        sourceRef.current?.disconnect()
      } catch {
        // ignore
      }
      sourceRef.current = null
      analyserRef.current = null
      // Shared AudioContext stays alive — reused on next round.
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
      mediaRecorderRef.current = null

      if (!isMountedRef.current) return

      if (chunks.length === 0) {
        autoListen()
        return
      }

      const webmBlob = new Blob(chunks, { type: 'audio/webm' })
      const wavBlob = await convertWebMToWav(webmBlob)
      const result = await transcribeAudio(wavBlob)
      if (!isMountedRef.current) return

      if (!result.text) {
        setError("I couldn't hear anything — let's try again.")
        autoListen()
        return
      }
      setError(null)

      const r = await sendVoiceMessage(result.text)
      if (!isMountedRef.current) return

      await speakReplies(r.replies)
      if (!isMountedRef.current) return

      if (r.isCompleted) {
        setStatus('completed')
        setMessage('Onboarding complete. Thanks for chatting!')
      } else {
        autoListen()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setError(msg)
      setStatus('error')
    }
  }

  async function kickoff() {
    if (!ttsSupported()) {
      setError('Your browser does not support speech synthesis.')
      setStatus('error')
      return
    }
    setError(null)
    setStatus('starting')
    setMessage('Connecting with Fin...')
    // Initialise the shared AudioContext NOW while we're still inside the user gesture.
    // Browsers only allow creating/resuming AudioContext inside a gesture handler,
    // so this unlock must happen before any await.
    await ensureSharedAudioContext()
    try {
      const history = await getVoiceHistory().catch(() => null)

      if (history?.conversation?.isCompleted) {
        // Conversa anterior terminou — começa fresh.
        resetVoiceSession()
      } else if (history?.messages && history.messages.length > 0) {
        // Conversa em andamento — retoma falando a última pergunta que Fin fez,
        // sem reenviar o sentinel (que o backend trataria como resposta).
        const msgs = history.messages.filter(
          (m) => m.role === 'assistant' || m.role === 'user'
        )
        let lastUserIdx = -1
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'user') {
            lastUserIdx = i
            break
          }
        }
        const trailing = lastUserIdx === -1 ? msgs : msgs.slice(lastUserIdx + 1)
        const finReplies = trailing
          .filter((m) => m.role === 'assistant')
          .map((m) => m.content)
        if (finReplies.length > 0) {
          await speakReplies(finReplies)
          if (!isMountedRef.current) return
          autoListen()
          return
        }
        // Edge case: sem replies do Fin no final — cai pro fluxo fresh.
      }

      // Fresh start (greeting + Q1).
      const r = await sendVoiceMessage(START_SENTINEL)
      if (!isMountedRef.current) return
      await speakReplies(r.replies)
      if (!isMountedRef.current) return
      if (r.isCompleted) {
        setStatus('completed')
        setMessage('Onboarding complete. Thanks for chatting!')
      } else {
        autoListen()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start the voice chat.'
      setError(msg)
      setStatus('error')
    }
  }

  function handleClose() {
    cancelSpeaking()
    stopAutoListen()
    onClose()
  }

  async function handleRetry() {
    setError(null)
    if (status === 'error') {
      autoListen()
    }
  }

  function forceStopListening() {
    if (status !== 'listening') return
    const rec = mediaRecorderRef.current
    if (!rec || rec.state === 'inactive') return
    // Marcamos speechDetected pra passar pela validação em handleRecordingStopped,
    // mas handleRecordingStopped cuida de descartar se não houver áudio suficiente.
    speechDetectedRef.current = true
    if (vadFrameRef.current != null) {
      cancelAnimationFrame(vadFrameRef.current)
      vadFrameRef.current = null
    }
    setStatus('processing')
    setMessage('Got it — thinking...')
    try {
      rec.stop()
    } catch {
      // ignore
    }
  }

  const isSpeaking = status === 'fin_speaking'
  const isListening = status === 'listening'
  const isProcessing = status === 'processing' || status === 'starting'
  const canStart = status === 'idle'

  return (
    <div className='fixed inset-0 z-50 flex flex-col items-center justify-center bg-white'>
      <button
        type='button'
        onClick={handleClose}
        aria-label='Close voice onboarding'
        className='absolute top-4 left-4 w-10 h-10 rounded-full bg-white shadow-md hover:bg-gray-100 flex items-center justify-center text-gray-700 cursor-pointer transition-colors'
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

      <button
        type='button'
        onClick={isListening ? forceStopListening : undefined}
        disabled={!isListening}
        aria-label={isListening ? 'Tap to finish speaking' : 'Fin'}
        className={`relative flex items-center justify-center mb-8 bg-transparent border-0 p-0 ${
          isListening ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {isSpeaking && (
          <>
            <div className='absolute inset-0 rounded-full bg-[#2D0A6C] animate-fin-speak' />
            <div
              className='absolute inset-0 rounded-full bg-[#2D0A6C] animate-fin-speak'
              style={{ animationDelay: '1.2s' }}
            />
          </>
        )}
        <img
          src={Fin}
          alt='Fin'
          className='relative w-40 h-40 sm:w-48 sm:h-48 rounded-full object-cover bg-white shadow-xl ring-4 ring-white'
        />
      </button>

      <p className='text-lg sm:text-xl font-medium text-gray-900 text-center px-6 max-w-xl min-h-[3.5rem]'>
        {message}
      </p>

      {error && (
        <p className='text-sm text-red-600 mt-3 px-6 text-center max-w-md'>
          {error}
        </p>
      )}

      <div className='mt-10 flex flex-col items-center gap-3 min-h-[5rem]'>
        {canStart && <StartButton onClick={kickoff} />}

        {isListening && (
          <div className='flex flex-col items-center gap-2'>
            <div className='flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200 text-green-700 text-sm font-medium'>
              <span className='relative flex w-2.5 h-2.5'>
                <span className='absolute inset-0 rounded-full bg-green-500 opacity-75 animate-ping' />
                <span className='relative rounded-full w-2.5 h-2.5 bg-green-500' />
              </span>
              Listening...
            </div>
            <span className='text-xs text-gray-500'>
              Tap Fin when you're done speaking
            </span>
          </div>
        )}

        {isProcessing && (
          <div className='w-12 h-12 flex items-center justify-center'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth={2}
              className='w-8 h-8 text-[#2D0A6C] animate-spin'
            >
              <path strokeLinecap='round' d='M12 3a9 9 0 1 0 9 9' />
            </svg>
          </div>
        )}

        {status === 'error' && (
          <button
            type='button'
            onClick={handleRetry}
            className='px-8 py-3 rounded-full bg-[#2D0A6C] text-white font-medium hover:bg-[#1f0750] cursor-pointer transition-colors'
          >
            Try again
          </button>
        )}

        {status === 'completed' && (
          <button
            type='button'
            onClick={handleClose}
            className='px-8 py-3 rounded-full bg-[#2D0A6C] text-white font-medium hover:bg-[#1f0750] cursor-pointer transition-colors'
          >
            Close
          </button>
        )}
      </div>
    </div>
  )
}

export default VoiceOnboarding
