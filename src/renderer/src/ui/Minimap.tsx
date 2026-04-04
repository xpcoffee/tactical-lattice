// Minimap panel (top-right of right column).
// 10×10 hex grid showing positional awareness — unit locations, fog of war.
// Read-only; actions are taken in the main battlefield view.

export default function Minimap() {
  return (
    <div style={{ padding: '8px 16px', height: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '10px', color: '#444', letterSpacing: '0.12em' }}>TACTICAL MAP</div>
      {/* Placeholder — will render 10×10 hex minimap with unit markers */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a2a3a', fontSize: '11px' }}>
        10×10
      </div>
    </div>
  )
}
