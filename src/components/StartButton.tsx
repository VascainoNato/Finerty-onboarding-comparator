interface StartButtonProps {
  onClick: () => void
  disabled?: boolean
  label?: string
}

function StartButton({ onClick, disabled = false, label = 'Start' }: StartButtonProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className='py-4 px-10 bg-green-500 rounded-xl text-white cursor-pointer hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
    >
      {label}
    </button>
  )
}

export default StartButton
