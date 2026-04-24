import logo from '../assets/finerty.jpeg'
import sparkle from '../assets/sparkle.svg'

interface HeaderProps {
  onToggleSupport?: () => void
}

function Header({ onToggleSupport }: HeaderProps) {

  return (
    <>
      <section id="header">
        <div className="flex h-[80px] bg-white/95 backdrop-blur-sm items-center  text-white border-b border-gray-200">
           <div className='px-[6rem] items-center flex justify-between w-full '>
              <img src={logo} alt="Finerty Logo" className='w-[80px]'/>
              <button
                type='button'
                aria-label='Open support chat'
                onClick={onToggleSupport}
                className='w-[50px] rounded-full flex items-center justify-center hover:bg-[#F2F1FF] transition-colors cursor-pointer'
              >
                <img src={sparkle} alt='' className='w-[80px]' />
              </button>
           </div>
        </div>
      </section>
    </>
  )
}

export default Header
