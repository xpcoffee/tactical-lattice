// Mech sprite overlay — positioned by its feet at the player anchor in the battlefield.
// This component will eventually render the isometric mech sprite + animated parts.
// The parent (.panel-mech-status) uses transform: translate(-50%, -100%) so the
// bottom-centre of this component sits exactly on the player hex anchor point.

export default function Mech() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
    }}>
      {/* Placeholder silhouette — replace with actual isometric sprite */}
      <svg width="60" height="90" viewBox="0 0 60 90" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Head */}
        <rect x="22" y="4" width="16" height="14" rx="2" stroke="#e6c200" strokeWidth="1.5"/>
        {/* Torso */}
        <rect x="16" y="20" width="28" height="24" rx="2" stroke="#e6c200" strokeWidth="1.5"/>
        {/* Left arm */}
        <rect x="6" y="22" width="8" height="20" rx="2" stroke="#e6c200" strokeWidth="1.5"/>
        {/* Right arm */}
        <rect x="46" y="22" width="8" height="20" rx="2" stroke="#e6c200" strokeWidth="1.5"/>
        {/* Left leg */}
        <rect x="18" y="46" width="10" height="28" rx="2" stroke="#e6c200" strokeWidth="1.5"/>
        {/* Right leg */}
        <rect x="32" y="46" width="10" height="28" rx="2" stroke="#e6c200" strokeWidth="1.5"/>
        {/* Cockpit window */}
        <rect x="26" y="8" width="8" height="6" rx="1" fill="#e6c200" fillOpacity="0.3" stroke="#e6c200" strokeWidth="1"/>
      </svg>
      <div style={{ fontSize: '8px', color: '#e6c200', letterSpacing: '0.12em', opacity: 0.6 }}>
        UNIT-01
      </div>
    </div>
  )
}
