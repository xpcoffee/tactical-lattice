import type { AppScene } from '../app/scenes'

interface MainMenuProps {
  devMode: boolean
  onNavigate: (scene: AppScene) => void
}

export default function MainMenu({ devMode, onNavigate }: MainMenuProps) {
  return (
    <div className="main-menu">
      <h1 className="main-menu__title">TACTICAL LATTICE</h1>
      <div className="main-menu__buttons">
        <button className="menu-btn" onClick={() => onNavigate('hangar')}>
          HANGAR
        </button>
        {devMode && (
          <button className="menu-btn menu-btn--dev" onClick={() => onNavigate('combat')}>
            QUICK COMBAT <span className="menu-btn__hint">(dev)</span>
          </button>
        )}
      </div>
    </div>
  )
}
