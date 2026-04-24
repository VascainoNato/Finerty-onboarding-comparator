const TARGET_SAMPLE_RATE = 16000

export interface TranscribeResult {
  text: string
  status: string
}

type AudioContextCtor = typeof AudioContext
type OfflineAudioContextCtor = typeof OfflineAudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext || w.webkitAudioContext || null
}

function getOfflineAudioContextCtor(): OfflineAudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    OfflineAudioContext?: OfflineAudioContextCtor
    webkitOfflineAudioContext?: OfflineAudioContextCtor
  }
  return w.OfflineAudioContext || w.webkitOfflineAudioContext || null
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = 1
  const sampleRate = buffer.sampleRate
  const samples = buffer.getChannelData(0)
  const length = samples.length

  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = length * bytesPerSample
  const bufferSize = 44 + dataSize

  const out = new ArrayBuffer(bufferSize)
  const view = new DataView(out)

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([out], { type: 'audio/wav' })
}

export async function convertWebMToWav(source: Blob): Promise<Blob> {
  const Ctx = getAudioContextCtor()
  const OfflineCtx = getOfflineAudioContextCtor()
  if (!Ctx || !OfflineCtx) {
    throw new Error('Audio conversion is not supported in this browser.')
  }

  const arrayBuffer = await source.arrayBuffer()
  const tmpCtx = new Ctx()
  let decoded: AudioBuffer
  try {
    decoded = await tmpCtx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    tmpCtx.close().catch(() => {})
  }

  const targetLength = Math.ceil((decoded.duration * TARGET_SAMPLE_RATE))
  const offlineCtx = new OfflineCtx(1, targetLength, TARGET_SAMPLE_RATE)
  const src = offlineCtx.createBufferSource()
  src.buffer = decoded
  src.connect(offlineCtx.destination)
  src.start(0)

  const rendered = await offlineCtx.startRendering()
  return audioBufferToWav(rendered)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Expected data URL from FileReader'))
        return
      }
      resolve(result)
    }
    reader.readAsDataURL(blob)
  })
}

export async function transcribeAudio(wavBlob: Blob): Promise<TranscribeResult> {
  const dataUrl = await blobToBase64(wavBlob)
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: dataUrl }),
  })
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Transcription API unavailable (non-JSON response).')
  }
  const body = (await res.json().catch(() => ({}))) as {
    text?: string
    status?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return { text: body.text || '', status: body.status || 'Unknown' }
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function cancelSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel()
}

export function playBeep(sharedCtx?: AudioContext): Promise<void> {
  const Ctx = getAudioContextCtor()
  if (!Ctx) return Promise.resolve()

  return new Promise<void>((resolve) => {
    const ctx = sharedCtx ?? new Ctx()
    const ownContext = !sharedCtx
    const resumePromise =
      ctx.state === 'suspended' ? ctx.resume().catch(() => {}) : Promise.resolve()

    // Safety timeout — guarantees the promise resolves even if onended never fires.
    const safetyTimer = setTimeout(() => settle(), 800)
    let settled = false
    function settle() {
      if (settled) return
      settled = true
      clearTimeout(safetyTimer)
      if (ownContext) ctx.close().catch(() => {})
      resolve()
    }

    Promise.resolve(resumePromise).then(() => {
      try {
        const now = ctx.currentTime
        const duration = 0.18
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, now)
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02)
        gain.gain.linearRampToValueAtTime(0, now + duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.onended = () => {
          try {
            osc.disconnect()
            gain.disconnect()
          } catch {
            // ignore
          }
          settle()
        }
        osc.start(now)
        osc.stop(now + duration)
      } catch {
        settle()
      }
    })
  })
}

// Curated male voices in descending order of quality, across Safari (Apple),
// Chrome (Google) and Edge (Microsoft). First exact or partial match wins.
const MALE_VOICE_PREFERENCES = [
  // Apple — Enhanced/Premium variants render noticeably better than defaults.
  'Alex',
  'Daniel (Enhanced)',
  'Aaron (Enhanced)',
  'Tom (Enhanced)',
  'Daniel',
  'Aaron',
  'Tom',
  'Fred',
  'Rishi',
  'Oliver',
  'Arthur',
  // Google (Chrome desktop + Android).
  'Google UK English Male',
  // Microsoft (Edge) — Natural neural voices first, then classic SAPI voices.
  'Microsoft Guy Online (Natural)',
  'Microsoft Davis Online (Natural)',
  'Microsoft Brian Online (Natural)',
  'Microsoft David',
  'Microsoft Mark',
  'Microsoft George',
]

const FEMALE_NAME_HINTS =
  /female|woman|girl|samantha|victoria|karen|tessa|fiona|moira|susan|allison|ava|kate|zira|hazel|catherine|serena/i

let cachedVoices: SpeechSynthesisVoice[] | null = null
let cachedMaleVoice: SpeechSynthesisVoice | null | undefined = undefined

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([])
  if (cachedVoices && cachedVoices.length > 0) return Promise.resolve(cachedVoices)

  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    const existing = synth.getVoices()
    if (existing.length > 0) {
      cachedVoices = existing
      resolve(existing)
      return
    }
    // Chrome populates voices asynchronously — wait for the event.
    let resolved = false
    const settle = (voices: SpeechSynthesisVoice[]) => {
      if (resolved) return
      resolved = true
      cachedVoices = voices.length > 0 ? voices : null
      synth.removeEventListener('voiceschanged', handler)
      clearTimeout(timer)
      resolve(voices)
    }
    const handler = () => settle(synth.getVoices())
    synth.addEventListener('voiceschanged', handler)
    const timer = setTimeout(() => settle(synth.getVoices()), 2000)
  })
}

async function pickMaleVoice(lang: string): Promise<SpeechSynthesisVoice | null> {
  if (cachedMaleVoice !== undefined) return cachedMaleVoice

  const voices = await loadVoices()
  if (voices.length === 0) {
    cachedMaleVoice = null
    return null
  }

  const langPrefix = lang.split('-')[0].toLowerCase()
  const matchLang = (v: SpeechSynthesisVoice) =>
    v.lang.toLowerCase().startsWith(langPrefix)

  // 1) Exact name match from the curated list.
  for (const preferred of MALE_VOICE_PREFERENCES) {
    const match = voices.find(
      (v) => matchLang(v) && v.name.toLowerCase() === preferred.toLowerCase()
    )
    if (match) return (cachedMaleVoice = match)
  }

  // 2) Partial (includes) match — covers platform suffixes like
  //    "Microsoft David - English (United States)".
  for (const preferred of MALE_VOICE_PREFERENCES) {
    const match = voices.find(
      (v) => matchLang(v) && v.name.toLowerCase().includes(preferred.toLowerCase())
    )
    if (match) return (cachedMaleVoice = match)
  }

  // 3) Any voice explicitly tagged "Male" in the name.
  const explicitMale = voices.find(
    (v) => matchLang(v) && /\bmale\b/i.test(v.name) && !/female/i.test(v.name)
  )
  if (explicitMale) return (cachedMaleVoice = explicitMale)

  // 4) Any language-matching voice that isn't a known female name.
  const fallback = voices.find((v) => matchLang(v) && !FEMALE_NAME_HINTS.test(v.name))
  cachedMaleVoice = fallback || null
  return cachedMaleVoice
}

export async function speak(text: string, lang = 'en-US', rate = 0.9): Promise<void> {
  if (!ttsSupported()) {
    throw new Error('Speech synthesis is not supported in this browser.')
  }

  const voice = await pickMaleVoice(lang)

  return new Promise((resolve, reject) => {
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = rate
    utter.pitch = 1.0
    utter.volume = 1.0
    if (voice) utter.voice = voice

    let done = false
    const finish = (err?: Error) => {
      if (done) return
      done = true
      if (err) reject(err)
      else resolve()
    }

    utter.onend = () => finish()
    utter.onerror = (e) => finish(new Error(e.error || 'Speech synthesis failed'))

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  })
}
