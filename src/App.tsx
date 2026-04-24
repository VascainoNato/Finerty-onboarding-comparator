import { useState } from 'react'
import './App.css'
import Body from './components/Body'
import Header from './components/Header'
import SupportChat from './components/SupportChat'

function App() {
  const [supportOpen, setSupportOpen] = useState(false)

  return (
    <>
      <section id="App" className='h-screen overflow-hidden'>
        <div className='flex flex-col h-full'>
          <Header onToggleSupport={() => setSupportOpen((prev) => !prev)} />
          <Body/>
        </div>
      </section>
      <SupportChat open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  )
}

export default App
