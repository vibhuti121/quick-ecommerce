import { useEffect, useRef, useState } from 'react';
import { UPDATES } from '../lib/updates';

// Top-of-page "latest updates" strip. Shows one announcement at a time and auto-advances every
// ADVANCE_MS on its own (no hover-pause — it keeps moving by itself), with clickable dot indicators
// to jump. Clears its timer on unmount — same setInterval discipline as App's order poll.
const ADVANCE_MS = 4000;

export default function UpdatesCarousel() {
  const [index, setIndex] = useState(0);

  // Keep the latest index in a ref so the interval callback advances from the current slide without
  // re-subscribing the timer on every tick (the effect mounts the timer once).
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    if (UPDATES.length <= 1) return;
    const id = setInterval(() => {
      setIndex((indexRef.current + 1) % UPDATES.length);
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, []);

  if (UPDATES.length === 0) return null;
  const current = UPDATES[index];

  return (
    <section className="updates-carousel" aria-label="Latest updates" aria-live="polite">
      {/* key forces a remount per slide so the fade/slide transition re-runs on each advance */}
      <div className="updates-slide" key={index}>
        <img className="updates-slide-img" src={current.image} alt={current.text} />
        <div className="updates-overlay" />
        <div className="updates-caption">
          <span className="updates-icon" aria-hidden="true">
            {current.icon}
          </span>
          <span className="updates-text">{current.text}</span>
        </div>
      </div>
      {UPDATES.length > 1 && (
        <div className="updates-dots" role="tablist" aria-label="Choose an update">
          {UPDATES.map((u, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Update ${i + 1}: ${u.text}`}
              className={`carousel-dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
