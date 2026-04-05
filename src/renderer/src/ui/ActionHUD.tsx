interface ActionHUDProps {
  mode: 'idle' | 'map'
  onMapToggle: () => void
}

export default function ActionHUD({ mode, onMapToggle }: ActionHUDProps) {
  const active = mode === 'map'
  return (
    <div className="panel-action-hud">
      <button
        className={`action-btn${active ? ' action-btn--selected' : ' action-btn--active'}`}
        onClick={onMapToggle}
      >
        MAP<span className="action-keybind">[M]</span>
      </button>
    </div>
  )
}
