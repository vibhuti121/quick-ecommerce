import { useEffect, useRef, useState } from 'react';
import { UPDATES } from '../lib/updates';
import type { NotifyTopic } from '../lib/updates';

// Top-of-page "latest updates" strip. Shows one announcement at a time and advances ONLY while the
// cursor is over it (hover-to-play) — it sits still otherwise. Clickable dots still jump manually, and
// each slide carries a "🔔 Notify me" button that signs the visitor up for that banner's own subject.
// Clears its timer on unmount / mouse-leave — same setInterval discipline as App's order poll.
const ADVANCE_MS = 4000;

interface UpdatesCarouselProps {
  // Open the notify popup for a banner's subject (honey launch, litchi season, …).
  onNotify: (topic: NotifyTopic) => void;
  // Open the "Taste Arcade" Games Hub overlay — fired by the dedicated Taste Match slide's "Play now".
  onPlayGames: () => void;
}

// A "Taste Arcade" slide is woven in as the FIRST item. It is NOT a notify subject — its CTA routes to
// the Games Hub overlay (onPlayGames) instead of opening the notify popup. Marked with `game: true` so
// the render branch knows to swap the "🔔 Notify me" button for a "Play now" button.
interface GameSlide {
  game: true;
  icon: string;
  text: string;
  sub: string;
  image: string;
}
const GAME_SLIDE: GameSlide = {
  game: true,
  icon: '🎮',
  text: 'Play Taste Match — find your fruit twin',
  sub: 'Swipe to your taste persona & earn a Taste Rank. Free, 30 seconds.',
  image: '/taste-match-proto/litchi.jpg',
};

export default function UpdatesCarousel({ onNotify, onPlayGames }: UpdatesCarouselProps) {
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);

  // Keep the latest index in a ref so the interval callback advances from the current slide without
  // re-subscribing the timer on every tick (the effect re-runs only when hover starts/stops).
  const indexRef = useRef(index);
  indexRef.current = index;

  // The Taste Arcade slide leads, then the curated UPDATES banners.
  const slides: (GameSlide | (typeof UPDATES)[number])[] = [GAME_SLIDE, ...UPDATES];

  useEffect(() => {
    // Advance ONLY while hovered — the timer doesn't even exist when the cursor is away.
    if (!hovering || slides.length <= 1) return;
    const id = setInterval(() => {
      setIndex((indexRef.current + 1) % slides.length);
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, [hovering, slides.length]);

  if (slides.length === 0) return null;
  const current = slides[index];
  const isGame = 'game' in current;

  return (
    <section
      className="updates-carousel"
      aria-label="Latest updates"
      aria-live="polite"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* key forces a remount per slide so the fade/slide transition re-runs on each advance */}
      <div className="updates-slide" key={index}>
        <img className="updates-slide-img" src={current.image} alt={current.text} />
        <div className="updates-overlay" />
        <div className="updates-caption">
          {isGame && <span className="updates-eyebrow">New · Taste Arcade</span>}
          <div className="updates-caption-row">
            <span className="updates-icon" aria-hidden="true">
              {current.icon}
            </span>
            <span className="updates-text">{current.text}</span>
          </div>
          {isGame ? (
            <>
              <span className="updates-sub">{(current as GameSlide).sub}</span>
              <button type="button" className="updates-notify" onClick={onPlayGames}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
                Play now
              </button>
            </>
          ) : (
            <button
              type="button"
              className="updates-notify"
              onClick={() => onNotify((current as (typeof UPDATES)[number]).notify)}
            >
              🔔 Notify me
            </button>
          )}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="updates-dots" role="tablist" aria-label="Choose an update">
          {slides.map((u, i) => (
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
