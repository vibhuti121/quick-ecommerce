import type { CSSProperties } from 'react';
import type { Product, WorldCupTeam } from '../../types';

// A single pitch slot: either a placed fruit (a Product) or empty (null). The page owns the 11-length
// array; index 0 = keeper, then the 4-3-3 rows. Pure UI state — no rules, no formation logic encoded
// beyond the fixed 4-3-3 row layout below (presentation, CLAUDE.md §9).
export type Slot = Product | null;

interface PitchBuilderProps {
  team: WorldCupTeam | null;     // the picked team; null until one is chosen
  slots: Slot[];                 // length 11 (1 GK + 4 + 3 + 3)
  activeSlot: number;            // the slot the next tray pick lands in (highlighted)
  onSelectSlot: (index: number) => void;  // tap a slot to target it / clear it
}

// The fixed 4-3-3 layout, top (attack) → bottom (keeper) for a fan looking AT the goal. Each entry is a
// list of slot indices in that row. This is the only "formation" the page offers — a literal layout
// constant, not computed logic. 1 keeper + 4 defenders + 3 midfielders + 3 forwards = 11.
const ROWS: number[][] = [
  [8, 9, 10],   // forwards (3)
  [5, 6, 7],    // midfield (3)
  [1, 2, 3, 4], // defence (4)
  [0],          // goalkeeper (1)
];

// Fall-back pitch colours (warm forest pitch) used before a team is picked. Once a team is chosen we
// theme the jerseys/pitch tint from the team's API-provided kit hexes — applied as INLINE STYLE only;
// we never compute or map a colour client-side (the hex IS the data).
export default function PitchBuilder({ team, slots, activeSlot, onSelectSlot }: PitchBuilderProps) {
  // Team kit colours come straight off the API record (hex strings). CSS custom properties carry them
  // into the scoped stylesheet so jerseys/accents pick them up — inline style, API value, no mapping.
  const themeStyle = team
    ? ({
        '--kit-primary': team.colorPrimary,
        '--kit-secondary': team.colorSecondary,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={`fruit-xi-pitch${team ? ' is-themed' : ''}`}
      style={themeStyle}
      aria-label={team ? `${team.name} 4-3-3 pitch` : '4-3-3 pitch'}
    >
      {/* Pitch markings — decorative only. */}
      <div className="pitch-markings" aria-hidden="true">
        <span className="pitch-circle" />
        <span className="pitch-halfway" />
        <span className="pitch-box pitch-box-top" />
        <span className="pitch-box pitch-box-bottom" />
      </div>

      {ROWS.map((row, rowIdx) => (
        <div className="pitch-row" key={rowIdx}>
          {row.map((slotIndex) => {
            const fruit = slots[slotIndex];
            const isGk = slotIndex === 0;
            const isActive = slotIndex === activeSlot;
            return (
              <button
                key={slotIndex}
                type="button"
                className={`pitch-slot${fruit ? ' is-filled' : ''}${isActive ? ' is-active' : ''}${
                  isGk ? ' is-gk' : ''
                }`}
                onClick={() => onSelectSlot(slotIndex)}
                aria-label={
                  fruit
                    ? `${isGk ? 'Goalkeeper' : 'Slot'} ${slotIndex + 1}: ${fruit.name} — tap to remove`
                    : `Empty ${isGk ? 'goalkeeper' : ''} slot ${slotIndex + 1}${
                        isActive ? ', selected — pick a fruit from the tray' : ', tap to select'
                      }`
                }
                aria-pressed={isActive}
              >
                {/* The jersey — themed to the team kit. Holds the fruit photo when filled. */}
                <span className="pitch-jersey" aria-hidden="true">
                  {fruit ? (
                    <img src={fruit.imageUrl} alt="" className="pitch-jersey-fruit" />
                  ) : (
                    <span className="pitch-jersey-num">{isGk ? 'GK' : slotIndex}</span>
                  )}
                </span>
                <span className="pitch-slot-name">
                  {fruit ? fruit.name : isGk ? 'Keeper' : 'Add'}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
