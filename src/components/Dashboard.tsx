import { useState } from 'react'
import SideMenu, { type MenuOptionId } from './SideMenu'
import AboutProject from './AboutProject'
import Chat from './Chat'
import TraditionalOnboarding from './TraditionalOnboarding'
import IACost from './IACost'
import SavedInformation from './SavedInformation'
import VoiceOnboarding from './VoiceOnboarding'
import SessionPills from './SessionPills'
import FinertyLogo from '../assets/finerty.jpeg'
import {
  setActiveSessionId,
  type SessionRecord,
} from '../services/sessionsService'

interface DashboardProps {
  active: MenuOptionId
  setActive: (id: MenuOptionId) => void
  voiceOpen: boolean
  setVoiceOpen: (open: boolean) => void
}

function Dashboard({ active, setActive, voiceOpen, setVoiceOpen }: DashboardProps) {
  const [chatRemount, setChatRemount] = useState(0)
  const [tradRemount, setTradRemount] = useState(0)
  const [pillsRefresh, setPillsRefresh] = useState(0)

  function handleSelect(id: MenuOptionId) {
    if (id === 'onboarding-ia-voice') {
      setVoiceOpen(true)
      return
    }
    setVoiceOpen(false)
    setActive(id)
  }

  function handleResume(session: SessionRecord) {
    setActiveSessionId(session.type, session.id)
    if (session.type === 'chat') {
      setVoiceOpen(false)
      setActive('onboarding-ia-journey')
      setChatRemount((n) => n + 1)
    } else if (session.type === 'traditional') {
      setVoiceOpen(false)
      setActive('onboarding-tradicional')
      setTradRemount((n) => n + 1)
    } else if (session.type === 'voice') {
      setVoiceOpen(true)
    }
    setPillsRefresh((n) => n + 1)
  }

  function handleVoiceClose() {
    setVoiceOpen(false)
    setPillsRefresh((n) => n + 1)
  }

  return (
    <div className='flex w-full h-full'>
      <SessionPills onResume={handleResume} refreshTrigger={pillsRefresh} />

      <div className='flex w-[20%]'>
        <SideMenu
          active={voiceOpen ? 'onboarding-ia-voice' : active}
          onSelect={handleSelect}
        />
      </div>
      <div className='relative flex w-full bg-[#FAFAFA] overflow-hidden'>
        {active !== 'inicio' && (
          <img
            src={FinertyLogo}
            alt=''
            aria-hidden='true'
            className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 max-w-[60%] opacity-10 mix-blend-multiply pointer-events-none select-none'
          />
        )}
        {active === 'inicio' && <AboutProject />}
        {active === 'onboarding-ia-journey' && (
          <Chat key={`chat-${chatRemount}`} onGoHome={() => setActive('inicio')} />
        )}
        {active === 'onboarding-tradicional' && (
          <TraditionalOnboarding
            key={`trad-${tradRemount}`}
            onGoHome={() => setActive('inicio')}
          />
        )}
        {active === 'custos-ia' && <IACost />}
        {active === 'informacoes-salvas' && <SavedInformation />}
      </div>
      {voiceOpen && <VoiceOnboarding onClose={handleVoiceClose} />}
    </div>
  )
}

export default Dashboard
