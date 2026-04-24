import './App.css'
import Body from './components/Body'
import Header from './components/Header'

function App() {

  return (
    <>
      <section id="App" className='h-screen overflow-hidden'>
        <div className='flex flex-col h-full'>
          <Header/>
          <Body/>
        </div>
      </section>
    </>
  )
}

export default App
