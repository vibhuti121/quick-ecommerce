import { useState } from 'react';

// Manual rain on/off toggle (interim — Iteration 11 refined). Self-contained, no props, drops
// into the Header like ThemeToggle. Persists to localStorage and broadcasts a window event so
// the root-level RainOverlay reacts without prop plumbing.
//
// HAND-OFF (when geolocation is ready): remove <RainToggle/> from Header, set AUTO_WEATHER=true
// in RainOverlay.tsx, and clear localStorage['mallade-rain'] → rain goes auto-by-location.
const STORAGE_KEY = 'mallade-rain';
export const RAIN_EVENT = 'mallade-rain-change';

export default function RainToggle() {
  const [on, setOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* storage disabled — applies for this session */
    }
    window.dispatchEvent(new CustomEvent(RAIN_EVENT, { detail: { on: next } }));
  };

  return (
    <button
      type="button"
      className={`rain-toggle ${on ? 'rain-toggle--on' : ''}`}
      onClick={toggle}
      aria-label={on ? 'Turn off rain effect' : 'Turn on rain effect'}
      aria-pressed={on}
      title={on ? 'Turn off rain' : 'Turn on rain'}
    >
      <span aria-hidden="true">🌧️</span>
    </button>
  );
}
