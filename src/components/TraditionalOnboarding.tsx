import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  getTraditional,
  saveTraditional,
  resetTraditional,
  type TraditionalPayload,
} from '../services/traditionalService'
import StartButton from './StartButton'
import { ReactConfetti } from './ReactConfetti'

type StepKey = 'welcome' | 'about' | 'details' | 'done'

const STEPS: { key: StepKey; title: string; desc: string }[] = [
  { key: 'welcome', title: 'Welcome', desc: 'A quick tour of what we will ask.' },
  { key: 'about', title: 'About Yourself', desc: '7 open questions, no rush.' },
  { key: 'details', title: 'Personal Details', desc: 'Your contact information.' },
  { key: 'done', title: 'All set', desc: 'Finish and review.' },
]

const EMPTY_PAYLOAD: TraditionalPayload = {
  relax: '',
  hobbies: '',
  dream: '',
  dreamPlan: '',
  morning: '',
  change: '',
  consequences: '',
  name: '',
  address: '',
  eircode: '',
  mobile: '',
  dob: '',
  email: '',
  civilStatus: '',
}

const CIVIL_STATUS_OPTIONS = [
  'Single',
  'Married',
  'Civil partnership',
  'Divorced',
  'Widowed',
]

const ABOUT_QUESTIONS: { key: keyof TraditionalPayload; label: string }[] = [
  { key: 'relax', label: 'What do you like to do to relax and enjoy yourself?' },
  { key: 'hobbies', label: 'What are your favourite hobbies or pastimes?' },
  {
    key: 'dream',
    label: 'What is your one big dream or goal, and do you realistically want to achieve it?',
  },
  { key: 'dreamPlan', label: 'What do you think you need to do to make it a reality?' },
  { key: 'morning', label: 'What makes you get up in the morning and keep doing what you do?' },
  { key: 'change', label: 'If you could change one thing in your life, what would that be?' },
  {
    key: 'consequences',
    label: 'What do you need to do to change this one thing, and what consequences might come with it?',
  },
]

interface TraditionalOnboardingProps {
  onGoHome?: () => void
}

function TraditionalOnboarding({ onGoHome }: TraditionalOnboardingProps) {
  const [step, setStep] = useState<StepKey>('welcome')
  const [completed, setCompleted] = useState<StepKey[]>([])
  const [data, setData] = useState<TraditionalPayload>(EMPTY_PAYLOAD)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getTraditional()
      .then((stored) => {
        if (!stored) return
        setData({
          relax: stored.relax,
          hobbies: stored.hobbies,
          dream: stored.dream,
          dreamPlan: stored.dreamPlan,
          morning: stored.morning,
          change: stored.change,
          consequences: stored.consequences,
          name: stored.name,
          address: stored.address,
          eircode: stored.eircode,
          mobile: stored.mobile,
          dob: stored.dob,
          email: stored.email,
          civilStatus: stored.civilStatus,
          document: stored.document,
        })
        if (stored.completedAt) {
          setFinished(true)
          setCompleted(['welcome', 'about', 'details', 'done'])
          setStep('done')
        }
      })
      .catch(() => {
        // API not up yet — start fresh, no UI noise
      })
  }, [])

  useEffect(() => {
    if (finished) {
      setShowConfetti(true)
      const t = setTimeout(() => setShowConfetti(false), 10000)
      return () => clearTimeout(t)
    }
  }, [finished])

  function markStepDone(k: StepKey) {
    setCompleted((prev) => (prev.includes(k) ? prev : [...prev, k]))
  }

  function goTo(k: StepKey) {
    setErrors({})
    setStep(k)
  }

  function validateAbout(): Record<string, string> {
    const e: Record<string, string> = {}
    for (const q of ABOUT_QUESTIONS) {
      const v = (data[q.key] as string)?.trim() || ''
      if (v.length < 2) e[q.key] = 'Please give us a bit more.'
    }
    return e
  }

  function validateDetails(): Record<string, string> {
    const e: Record<string, string> = {}
    if (data.name.trim().length < 2) e.name = 'Full name is required.'
    if (data.address.trim().length < 5) e.address = 'A full address is required.'
    if (!/^[A-Za-z]\d{2}\s?[A-Za-z0-9]{4}$/.test(data.eircode.trim()))
      e.eircode = 'Use a format like A65 F4E2.'
    if (!/^\+?[\d][\d\s\-()]{6,17}$/.test(data.mobile.trim()))
      e.mobile = 'Use a valid phone number.'
    if (!/^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/.test(data.dob.trim()))
      e.dob = 'Use DD/MM/YYYY.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
      e.email = 'Use a valid email address.'
    if (!CIVIL_STATUS_OPTIONS.includes(data.civilStatus))
      e.civilStatus = 'Please choose a civil status.'
    return e
  }

  function handleAboutSubmit() {
    const e = validateAbout()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    markStepDone('about')
    goTo('details')
  }

  async function handleDetailsSubmit() {
    const e = validateDetails()
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSaving(true)
    try {
      const payload: TraditionalPayload = {
        ...data,
        ...(selectedFile
          ? {
              document: {
                name: selectedFile.name,
                size: selectedFile.size,
                type: selectedFile.type || 'application/octet-stream',
              },
            }
          : {}),
      }
      const result = await saveTraditional(payload)
      if ('fieldErrors' in result && result.fieldErrors) {
        setErrors(result.fieldErrors)
        return
      }
      markStepDone('details')
      markStepDone('done')
      setFinished(true)
      goTo('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save — please try again.'
      setErrors({ _submit: msg })
    } finally {
      setSaving(false)
    }
  }

  function handleFileChange(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    if (!f) return
    setSelectedFile(f)
    setData((prev) => ({
      ...prev,
      document: { name: f.name, size: f.size, type: f.type || 'application/octet-stream' },
    }))
  }

  function handleClearFile() {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setData((prev) => {
      const { document: _doc, ...rest } = prev
      void _doc
      return rest
    })
  }

  async function handleStartOver() {
    await resetTraditional().catch(() => {})
    setData(EMPTY_PAYLOAD)
    setSelectedFile(null)
    setErrors({})
    setFinished(false)
    setShowConfetti(false)
    setCompleted([])
    goTo('welcome')
  }

  const isActive = (k: StepKey) => step === k
  const isDone = (k: StepKey) => completed.includes(k)

  return (
    <div className='flex flex-1 flex-col w-full h-full overflow-hidden'>
      <ReactConfetti active={showConfetti} />

      {/* Main content with stepper on top */}
      <section className='flex-1 overflow-y-auto p-6 md:p-10'>
        <div className='max-w-3xl mx-auto'>
          {/* Horizontal stepper */}
          <div className='flex items-start w-full mb-10'>
            {STEPS.map((s, idx) => {
              const active = isActive(s.key)
              const done = isDone(s.key)
              const isLast = idx === STEPS.length - 1
              const connectorFilled = done
              return (
                <div
                  key={s.key}
                  className={`flex items-start ${isLast ? '' : 'flex-1'}`}
                >
                  <div className='flex flex-col items-center w-28 shrink-0'>
                    <div
                      className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition-colors ${
                        done
                          ? 'bg-[#2D0A6C] border-[#2D0A6C] text-white'
                          : active
                            ? 'bg-[#F2F1FF] border-[#2D0A6C] text-[#2D0A6C]'
                            : 'bg-gray-100 border-gray-300 text-gray-400'
                      }`}
                    >
                      {done ? '✓' : idx + 1}
                    </div>
                    <p
                      className={`mt-2 text-xs text-center font-medium leading-tight ${
                        active
                          ? 'text-gray-900'
                          : done
                            ? 'text-gray-700'
                            : 'text-gray-400'
                      }`}
                    >
                      {s.title}
                    </p>
                  </div>
                  {!isLast && (
                    <div
                      className={`flex-1 h-0.5 mt-[18px] transition-colors ${
                        connectorFilled ? 'bg-[#2D0A6C]' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {step === 'welcome' && (
            <div className='text-center py-12'>
              <h1 className='text-3xl font-bold text-gray-900 mb-3'>Traditional Onboarding</h1>
              <p className='text-gray-600 mb-2'>
                Two short phases. No AI, no chat — just a form you can fill at your own pace.
              </p>
              <p className='text-gray-600 mb-10'>
                We will ask about you first, then your contact details.
              </p>
              <StartButton onClick={() => { markStepDone('welcome'); goTo('about') }} />
            </div>
          )}

          {step === 'about' && (
            <div>
              <header className='mb-6'>
                <p className='text-xs font-semibold uppercase tracking-wide text-[#2D0A6C] mb-1'>
                  Phase 1 of 2
                </p>
                <h1 className='text-2xl font-bold text-gray-900 mb-2'>Tell us about yourself</h1>
                <p className='text-gray-600 text-sm'>
                  Answer at your own pace. Short replies are fine.
                </p>
              </header>

              <div className='flex flex-col gap-5'>
                {ABOUT_QUESTIONS.map((q) => (
                  <div key={q.key}>
                    <label className='block text-sm font-medium text-gray-800 mb-2'>
                      {q.label}
                    </label>
                    <textarea
                      value={(data[q.key] as string) || ''}
                      onChange={(ev) =>
                        setData((prev) => ({ ...prev, [q.key]: ev.target.value }))
                      }
                      rows={3}
                      className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2F1FF] focus:border-gray-400 resize-y'
                      placeholder='Your answer...'
                    />
                    {errors[q.key] && (
                      <p className='text-xs text-red-600 mt-1'>{errors[q.key]}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className='flex gap-3 justify-end mt-8'>
                <button
                  type='button'
                  onClick={() => goTo('welcome')}
                  className='px-6 py-3 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-medium transition-colors cursor-pointer'
                >
                  Back
                </button>
                <button
                  type='button'
                  onClick={handleAboutSubmit}
                  className='px-6 py-3 rounded-lg bg-[#2D0A6C] text-white hover:bg-[#1f0750] text-sm font-medium transition-colors cursor-pointer'
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div>
              <header className='mb-6'>
                <p className='text-xs font-semibold uppercase tracking-wide text-[#2D0A6C] mb-1'>
                  Phase 2 of 2
                </p>
                <h1 className='text-2xl font-bold text-gray-900 mb-2'>Your personal details</h1>
                <p className='text-gray-600 text-sm'>
                  The document upload at the end is optional.
                </p>
              </header>

              <div className='flex flex-col gap-5'>
                <Field
                  label='Full name'
                  error={errors.name}
                  input={
                    <input
                      type='text'
                      value={data.name}
                      onChange={(e) => setData((p) => ({ ...p, name: e.target.value }))}
                      className={inputCls}
                      placeholder='e.g. Rafael Satyro'
                    />
                  }
                />
                <Field
                  label='Home address'
                  error={errors.address}
                  input={
                    <input
                      type='text'
                      value={data.address}
                      onChange={(e) => setData((p) => ({ ...p, address: e.target.value }))}
                      className={inputCls}
                      placeholder='Street, number, city'
                    />
                  }
                />
                <Field
                  label='Eircode'
                  hint='Format: A65 F4E2'
                  error={errors.eircode}
                  input={
                    <input
                      type='text'
                      value={data.eircode}
                      onChange={(e) => setData((p) => ({ ...p, eircode: e.target.value }))}
                      className={inputCls}
                      placeholder='A65 F4E2'
                    />
                  }
                />
                <Field
                  label='Mobile number'
                  hint='e.g. +353 87 123 4567'
                  error={errors.mobile}
                  input={
                    <input
                      type='tel'
                      value={data.mobile}
                      onChange={(e) => setData((p) => ({ ...p, mobile: e.target.value }))}
                      className={inputCls}
                      placeholder='+353 87 123 4567'
                    />
                  }
                />
                <Field
                  label='Date of birth'
                  hint='DD/MM/YYYY'
                  error={errors.dob}
                  input={
                    <input
                      type='text'
                      value={data.dob}
                      onChange={(e) => setData((p) => ({ ...p, dob: e.target.value }))}
                      className={inputCls}
                      placeholder='14/03/1990'
                    />
                  }
                />
                <Field
                  label='Email'
                  error={errors.email}
                  input={
                    <input
                      type='email'
                      value={data.email}
                      onChange={(e) => setData((p) => ({ ...p, email: e.target.value }))}
                      className={inputCls}
                      placeholder='you@example.com'
                    />
                  }
                />
                <Field
                  label='Civil status'
                  error={errors.civilStatus}
                  input={
                    <select
                      value={data.civilStatus}
                      onChange={(e) =>
                        setData((p) => ({ ...p, civilStatus: e.target.value }))
                      }
                      className={inputCls}
                    >
                      <option value=''>Select...</option>
                      {CIVIL_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  }
                />

                <div>
                  <label className='block text-sm font-medium text-gray-800 mb-2'>
                    Proof of address <span className='text-gray-400 font-normal'>(optional)</span>
                  </label>
                  <div className='flex items-center gap-3'>
                    <input
                      ref={fileInputRef}
                      type='file'
                      accept='application/pdf,image/*'
                      onChange={handleFileChange}
                      className='hidden'
                    />
                    <button
                      type='button'
                      onClick={() => fileInputRef.current?.click()}
                      className='px-4 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-medium transition-colors cursor-pointer'
                    >
                      {selectedFile || data.document ? 'Replace file' : 'Choose file'}
                    </button>
                    {(selectedFile || data.document) && (
                      <>
                        <span className='text-sm text-gray-700 truncate max-w-[18rem]'>
                          {selectedFile?.name || data.document?.name}
                        </span>
                        <button
                          type='button'
                          onClick={handleClearFile}
                          className='text-xs text-red-600 hover:underline cursor-pointer'
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                  <p className='text-xs text-gray-500 mt-1'>
                    Utility bill, bank statement, or lease.
                  </p>
                </div>
              </div>

              {errors._submit && (
                <p className='text-sm text-red-600 mt-4'>{errors._submit}</p>
              )}

              <div className='flex gap-3 justify-end mt-8'>
                <button
                  type='button'
                  onClick={() => goTo('about')}
                  className='px-6 py-3 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-medium transition-colors cursor-pointer'
                  disabled={saving}
                >
                  Back
                </button>
                <button
                  type='button'
                  onClick={handleDetailsSubmit}
                  disabled={saving}
                  className='px-6 py-3 rounded-lg bg-[#2D0A6C] text-white hover:bg-[#1f0750] text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {saving ? 'Saving...' : 'Finish'}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className='text-center py-12'>
              <div className='w-16 h-16 rounded-full bg-[#2D0A6C] text-white flex items-center justify-center mx-auto mb-4 text-2xl'>
                ✓
              </div>
              <h1 className='text-2xl font-bold text-gray-900 mb-2'>All set!</h1>
              <p className='text-gray-600 mb-8 max-w-md mx-auto'>
                Thanks, {data.name.split(/\s+/)[0] || 'friend'} — your onboarding is complete.
                {data.email ? ` We'll reach out at ${data.email}.` : ''}
              </p>
              <div className='flex gap-3 justify-center flex-wrap'>
                <button
                  type='button'
                  onClick={handleStartOver}
                  className='px-6 py-3 rounded-lg bg-[#2D0A6C] text-white hover:bg-[#1f0750] text-sm font-medium transition-colors cursor-pointer'
                >
                  Start over
                </button>
                <button
                  type='button'
                  onClick={() => (onGoHome ? onGoHome() : undefined)}
                  disabled={!onGoHome}
                  className='px-6 py-3 rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-200 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50'
                >
                  Go to home page
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2F1FF] focus:border-gray-400'

function Field({
  label,
  hint,
  error,
  input,
}: {
  label: string
  hint?: string
  error?: string
  input: React.ReactNode
}) {
  return (
    <div>
      <label className='block text-sm font-medium text-gray-800 mb-2'>
        {label}
        {hint && <span className='text-gray-400 font-normal ml-2'>{hint}</span>}
      </label>
      {input}
      {error && <p className='text-xs text-red-600 mt-1'>{error}</p>}
    </div>
  )
}

export default TraditionalOnboarding
