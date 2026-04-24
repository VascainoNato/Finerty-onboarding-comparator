import SideMenu from './SideMenu'
import AboutProject from './AboutProject'
import Chat from './Chat'
import TraditionalOnboarding from './TraditionalOnboarding'
import IACost from './IACost'
import SavedInformation from './SavedInformation'
import VoiceOnboarding from './VoiceOnboarding'
import SessionPills from './SessionPills'
import FinertyLogo from '../assets/finerty.jpeg'
import { useOnboardingStore } from '../stores/onboardingStore'

function Dashboard() {
  const view = useOnboardingStore((s) => s.view)
  const navigate = useOnboardingStore((s) => s.navigate)

  return (
    <div className='flex w-full h-full'>
      <SessionPills />

      <div className='flex w-[20%]'>
        <SideMenu active={view} onSelect={navigate} />
      </div>
      <div className='relative flex w-full bg-[#FAFAFA] overflow-hidden'>
        {view !== 'inicio' && (
          <img
            src={FinertyLogo}
            alt=''
            aria-hidden='true'
            className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 max-w-[60%] opacity-10 mix-blend-multiply pointer-events-none select-none'
          />
        )}
        {view === 'inicio' && <AboutProject />}
        {view === 'onboarding-ia-journey' && <Chat />}
        {view === 'onboarding-ia-voice' && <VoiceOnboarding />}
        {view === 'onboarding-tradicional' && <TraditionalOnboarding />}
        {view === 'custos-ia' && <IACost />}
        {view === 'informacoes-salvas' && <SavedInformation />}
      </div>
    </div>
  )
}

export default Dashboard
