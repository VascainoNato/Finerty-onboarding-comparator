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

export function speak(text: string, lang = 'en-US', rate = 0.9): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ttsSupported()) {
      reject(new Error('Speech synthesis is not supported in this browser.'))
      return
    }
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = rate
    utter.pitch = 1.0
    utter.volume = 1.0

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
