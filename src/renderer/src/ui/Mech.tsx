// Mech sprite overlay — positioned by its feet at the player anchor in the battlefield.
// The parent (.panel-mech-status) uses transform: translate(-50%, -100%) so the
// bottom-centre of this component sits exactly on the player hex anchor point.

import mechSprite from '../assets/mech-placeholder.png'

export default function Mech() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
    }}>
      <img
        src={mechSprite}
        alt="mech"
        style={{ imageRendering: 'pixelated', width: '320px' }}
      />
      <div style={{ fontSize: '8px', color: '#e6c200', letterSpacing: '0.12em', opacity: 0.6 }}>
        UNIT-01
      </div>
    </div>
  )
}
