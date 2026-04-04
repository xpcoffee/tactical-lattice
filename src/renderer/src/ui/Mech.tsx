// Mech panel (bottom-left).
// Over-the-shoulder view of the player mech via trailing drone camera.
// Shows component HP, overheated weapons, destroyed limbs, and action animations.

export default function Mech() {
  return (
    <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '10px', color: '#e6c200', letterSpacing: '0.12em' }}>MECH</div>
      {/* Placeholder — will render mech sprite + per-component HP bars */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a2a3a', fontSize: '11px' }}>
        no mech deployed
      </div>
    </div>
  )
}
