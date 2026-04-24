export type MenuOptionId =
  | 'inicio'
  | 'onboarding-ia-journey'
  | 'onboarding-ia-voice'
  | 'onboarding-tradicional'
  | 'custos-ia'
  | 'informacoes-salvas'

const options: { id: MenuOptionId; label: string }[] = [
  { id: 'inicio', label: 'About This Project' },
  { id: 'onboarding-tradicional', label: 'Traditional Onboarding' },
  { id: 'onboarding-ia-journey', label: 'Onboarding with IA - Messages' },
  { id: 'onboarding-ia-voice', label: 'Onboarding with IA - Voice' },
  { id: 'custos-ia', label: 'IA Cost' },
  { id: 'informacoes-salvas', label: 'Saved Informations' },
]

interface SideMenuProps {
  active: MenuOptionId
  onSelect: (id: MenuOptionId) => void
}

function SideMenu({ active, onSelect }: SideMenuProps) {
  return (
    <div className='flex flex-col justify-between h-full w-full'>
      <nav id='side-menu' className='flex flex-col gap-2 p-4 w-full'>
        {options.map((opt) => {
          const isActive = active === opt.id
          return (
            <button
              key={opt.id}
              type='button'
              onClick={() => onSelect(opt.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors text-base font-medium cursor-pointer ${
                isActive
                  ? 'bg-[#F2F1FF]'
                  : 'hover:bg-[#F2F1FF] active:bg-[#F2F1FF]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </nav>
      <p className='text-sm text-gray-500 text-center px-4 pb-10'>
        Developed with <span aria-label='purple heart'>💜</span> by Rafael Satyro
      </p>
    </div>
  )
}

export default SideMenu
