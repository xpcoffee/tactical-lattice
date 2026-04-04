interface ActionHUDProps {
  mode: 'idle' | 'move-select'
  onMovePress: () => void
}

export default function ActionHUD({ mode, onMovePress }: ActionHUDProps) {
  return (
    <div className="panel-action-hud">
      <button
        className={`action-btn${mode === 'move-select' ? ' action-btn--selected' : ' action-btn--active'}`}
        onClick={mode === 'idle' ? onMovePress : undefined}
        style={{ pointerEvents: mode === 'move-select' ? 'none' : 'auto' }}
      >
        MOVE<span className="action-keybind">[M]</span>
      </button>
      {mode === 'move-select' && (
        <span className="action-cancel">ESC to cancel</span>
      )}
    </div>
  )
}
