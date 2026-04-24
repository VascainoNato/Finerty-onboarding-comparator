import { useState } from 'react'
import './App.css'
import Body from './components/Body'
import Dashboard from './components/Dashboard'
import Header from './components/Header'
import type { MenuOptionId } from './components/SideMenu'
import SupportChat from './components/SupportChat'

function App() {
  const [supportOpen, setSupportOpen] = useState(false)
  const [active, setActive] = useState<MenuOptionId>('inicio')
  const [voiceOpen, setVoiceOpen] = useState(false)

  function handleGoHome() {
    setActive('inicio')
    setVoiceOpen(false)
  }

  return (
    <>
      <section id="App" className='h-screen overflow-hidden'>
        <div className='flex flex-col h-full'>
          <Header
            onToggleSupport={() => setSupportOpen((prev) => !prev)}
            onLogoClick={handleGoHome}
          />
          <Body>
            <Dashboard
              active={active}
              setActive={setActive}
              voiceOpen={voiceOpen}
              setVoiceOpen={setVoiceOpen}
            />
          </Body>
        </div>
      </section>
      <SupportChat open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  )
}

export default App
