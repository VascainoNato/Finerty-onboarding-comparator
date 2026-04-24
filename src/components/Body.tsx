import type { ReactNode } from 'react'

interface BodyProps {
  children: ReactNode
}

function Body({ children }: BodyProps) {

  return (
    <>
      <section id="body" className='flex-1 min-h-0 overflow-y-auto bg-white'>
        {children}
      </section>
    </>
  )
}

export default Body
