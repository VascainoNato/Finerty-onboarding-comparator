function AboutProject() {
  return (
    <div className='flex flex-1 items-center justify-center p-8 w-full'>
      <div className='max-w-xl w-full text-gray-700 border border-gray-600 rounded-xl p-6 bg-[#F2F1FF]'>
        <h1 className='text-2xl font-semibold text-gray-900 mb-2'>
          Welcome!
        </h1>
        <p className='text-base mb-6'>
          This project compares different onboarding approaches side by side,
          so you can experience and evaluate each one.
        </p>

        <h2 className='text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3'>
          What you'll find here
        </h2>
        <ul className='flex flex-col gap-3 text-base'>
          <li>
            <span className='font-medium text-gray-900'>Traditional Onboarding</span>
            {' — '}
            the classic two-phase form, no AI required.
          </li>
          <li>
            <span className='font-medium text-gray-900'>Onboarding with IA - Messages</span>
            {' — '}
            a conversational, AI-guided chat flow driven by Fin.
          </li>
          <li>
            <span className='font-medium text-gray-900'>Onboarding with IA - Voice</span>
            {' — '}
            the same flow, hands-free — speak to Fin and listen back.
          </li>
          <li>
            <span className='font-medium text-gray-900'>IA Cost</span>
            {' — '}
            token usage and cost breakdown per session.
          </li>
          <li>
            <span className='font-medium text-gray-900'>Saved Informations</span>
            {' — '}
            every completed session with its answers, transcript, and cost.
          </li>
        </ul>

        <p className='text-sm text-gray-500 mt-6'>
          Pick an option on the side menu to get started.
        </p>
      </div>
    </div>
  )
}

export default AboutProject
