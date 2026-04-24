import Confetti from 'react-confetti'
import { useWindowSize } from 'react-use'
import { createPortal } from 'react-dom'

export function ReactConfetti({ active }: { active: boolean }) {
  const { width, height } = useWindowSize()

  if (!active) return null

  return createPortal(
    <Confetti
      width={width}
      height={height}
      numberOfPieces={400}
      recycle={false}
      colors={['#2D0A6C', '#5B3F99', '#F2F1FF']}
      style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none' }}
    />,
    document.body
  )
}

export default ReactConfetti
