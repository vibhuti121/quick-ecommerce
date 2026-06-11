import { useEffect, useRef, useState } from 'react';
import { UPDATES } from '../lib/updates';
import type { NotifyTopic } from '../lib/updates';

// Top-of-page "latest updates" strip. Shows one announcement at a time and advances ONLY while the
// cursor is over it (hover-to-play) — it sits still otherwise. Clickable dots jump manually, and each
// slide carries a "🔔 Notify me" button that signs the visitor up for that banner's own subject.
//
// Transition: the outgoing slide stays mounted (as `prev`) and swipes out to the left while the new
// one swipes in from the right — both are on-screen together, so there's no transparent gap (no blink).
// Clears its timer on unmount / mouse-leave — same setInterval discipline as App's order poll.
const ADVANCE_MS = 4000;

interface UpdatesCarouselProps {
  // Open the notify popup for a banner's subject (honey launch, litchi season, …).
  onNotify: (topic: NotifyTopic) => void;
}

export default function UpdatesCarousel({ onNotify }: UpdatesCarouselProps) {
  const [index, setIndex] = useState(0);
  // The slide we're leaving — kept mounted so it can swipe out beneath the incoming one. Cleared
  // when its exit animation ends (see onAnimationEnd below).
  const [prev, setPrev] = useState<number | null>(null);
  const [hovering, setHovering] = useState(false);

  // Keep the latest index in a ref so the interval callback advances from the current slide without
  // re-subscribing the timer on every tick (the effect re-runs only when hover starts/stops).
  const indexRef = useRef(index);
  indexRef.current = index;

  // Advance to `next`, recording the current slide as the outgoing layer (no-op if it's the same one).
  const goTo = (next: number) => {
    if (next === indexRef.current) return;
    setPrev(indexRef.current);
    setIndex(next);
  };

  useEffect(() => {
    // Advance ONLY while hovered — the timer doesn't even exist when the cursor is away.
    if (!hovering || UPDATES.length <= 1) return;
    const id = setInterval(() => {
      goTo((indexRef.current + 1) % UPDATES.length);
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, [hovering]);

  if (UPDATES.length === 0) return null;
  const current = UPDATES[index];

  return (
    <section
      className="updates-carousel"
      aria-label="Latest updates"
      aria-live="polite"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Outgoing slide (visual only) swipes out to the left, then unmounts when its animation ends. */}
      {prev !== null && (
        <div
          className="updates-slide updates-slide--out"
          key={`out-${prev}`}
          aria-hidden="true"
          onAnimationEnd={(e) => {
            if (e.animationName === 'updates-swipe-out') setPrev(null);
          }}
        >
          <img className="updates-slide-img" src={UPDATES[prev].image} alt="" />
          <div className="updates-overlay" />
          <div className="updates-caption">
            <div className="updates-caption-row">
              <span className="updates-icon" aria-hidden="true">
                {UPDATES[prev].icon}
              </span>
              <span className="updates-text">{UPDATES[prev].text}</span>
            </div>
          </div>
        </div>
      )}

      {/* key forces a remount per slide so the swipe-in animation re-runs on each advance */}
      <div className="updates-slide updates-slide--in" key={`in-${index}`}>
        <img className="updates-slide-img" src={current.image} alt={current.text} />
        <div className="updates-overlay" />
        <div className="updates-caption">
          <div className="updates-caption-row">
            <span className="updates-icon" aria-hidden="true">
              {current.icon}
            </span>
            <span className="updates-text">{current.text}</span>
          </div>
          <button
            type="button"
            className="updates-notify"
            onClick={() => onNotify(current.notify)}
          >
            🔔 Notify me
          </button>
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
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
