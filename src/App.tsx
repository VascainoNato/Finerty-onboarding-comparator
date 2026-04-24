import { useEffect, useState } from 'react'
import './App.css'
import Body from './components/Body'
import Dashboard from './components/Dashboard'
import Header from './components/Header'
import SupportChat from './components/SupportChat'
import { useOnboardingStore } from './stores/onboardingStore'

function App() {
  const [supportOpen, setSupportOpen] = useState(false)
  const navigate = useOnboardingStore((s) => s.navigate)
  const refresh = useOnboardingStore((s) => s.refresh)

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <>
      <section id="App" className='h-screen overflow-hidden'>
        <div className='flex flex-col h-full'>
          <Header
            onToggleSupport={() => setSupportOpen((prev) => !prev)}
            onLogoClick={() => navigate('inicio')}
          />
          <Body>
            <Dashboard />
          </Body>
        </div>
      </section>
      <SupportChat open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  )
}

export default App
