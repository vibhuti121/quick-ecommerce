import { useState } from 'react';
import type { WorldCupTeam } from '../../types';

interface XiShareCardProps {
  team: WorldCupTeam;
  // The fruit names actually in the composed box (server-returned items) — what we name in the share.
  fruitNames: string[];
  // Fired AFTER a successful share/copy so the page can record the demand signal once (notify path).
  onShared: () => void;
}

// Lineup share card for a composed Fruit XI. Reuses the FruitQuiz ShareRow idiom exactly: native
// navigator.share on supporting browsers, clipboard copy as the universal fallback. The share text names
// the team + the fruits; the link is the current /fruit-xi URL (a real route now). Pure presentation —
// the fruit list comes from the server-composed box; we don't derive it here.
export default function XiShareCard({ team, fruitNames, onShared }: XiShareCardProps) {
  const [copied, setCopied] = useState(false);

  const headline = `My MaLLADE Fruit XI for ${team.name} ${team.flag}`;
  const lineup = fruitNames.length
    ? `Starting XI: ${fruitNames.slice(0, 11).join(', ')}.`
    : '';
  const shareText = `${headline} — ${lineup} Build yours →`.replace('—  ', '— ');
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  async function handleShare() {
    // Native share sheet first (mostly mobile), clipboard everywhere else — the action always does
    // SOMETHING. Mirror FruitQuiz: a dismissed sheet falls through to copy.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Build your Fruit XI', text: shareText, url: shareUrl });
        onShared();
        return;
      } catch {
        /* user dismissed the sheet, or share failed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShared();
    } catch {
      /* clipboard blocked (insecure context / permissions) — nothing more we can safely do */
    }
  }

  return (
    <div
      className="fruit-xi-share-card"
      style={
        {
          '--kit-primary': team.colorPrimary,
          '--kit-secondary': team.colorSecondary,
        } as React.CSSProperties
      }
    >
      <div className="xi-share-head">
        <span className="xi-share-flag" aria-hidden="true">
          {team.flag}
        </span>
        <div>
          <p className="xi-share-eyebrow">My Fruit XI</p>
          <p className="xi-share-team">{team.name}</p>
        </div>
      </div>
      {fruitNames.length > 0 && (
        <ul className="xi-share-lineup">
          {fruitNames.slice(0, 11).map((n, i) => (
            <li key={`${n}-${i}`}>{n}</li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-secondary fruit-xi-share-btn" onClick={handleShare}>
        {copied ? '✓ Link copied' : '↗ Share my XI'}
      </button>
    </div>
  );
}
