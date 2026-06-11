import type { ReactNode } from 'react';
import type { Filters } from '../lib/filters';
import { COLLECTIONS, DEFAULT_FILTERS, PRICE_OPTIONS, SORT_OPTIONS } from '../lib/filters';

// Grouped, luxury filter controls (Iteration 9). Presentational — used by both the desktop
// sidebar and the mobile bottom sheet so the control markup lives in one place. Rows are
// accessible buttons (aria-pressed) styled as soft radio (○) / checkbox (▢) lines.
interface FilterPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  counts: Record<string, number>; // collection key ('' = all) → product count
}

function OptionRow({
  label,
  active,
  kind,
  onClick,
  trailing,
}: {
  label: string;
  active: boolean;
  kind: 'radio' | 'check';
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`filter-option ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={kind === 'radio' ? 'filter-radio' : 'filter-check'} aria-hidden="true" />
      <span className="filter-option-label">{label}</span>
      {trailing}
    </button>
  );
}

export default function FilterPanel({ filters, onChange, counts }: FilterPanelProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div className="filter-panel">
      <div className="filter-group">
        <p className="filter-group-title">Shop by collection</p>
        <OptionRow
          label="All collections"
          active={filters.collection === ''}
          kind="radio"
          onClick={() => set({ collection: '' })}
          trailing={<span className="filter-option-count">{counts[''] ?? 0}</span>}
        />
        {COLLECTIONS.map((c) => {
          const n = counts[c.key] ?? 0;
          return (
            <OptionRow
              key={c.key}
              label={c.label}
              active={filters.collection === c.key}
              kind="radio"
              onClick={() => set({ collection: filters.collection === c.key ? '' : c.key })}
              trailing={
                n > 0 ? (
                  <span className="filter-option-count">{n}</span>
                ) : (
                  <span className="filter-option-count filter-option-count--soon">Soon</span>
                )
              }
            />
          );
        })}
      </div>

      <div className="filter-group">
        <p className="filter-group-title">Certifications</p>
        <OptionRow
          label="🌿 GI Certified"
          active={filters.gi}
          kind="check"
          onClick={() => set({ gi: !filters.gi })}
        />
        <OptionRow
          label="🔬 Lab Tested"
          active={filters.lab}
          kind="check"
          onClick={() => set({ lab: !filters.lab })}
        />
      </div>

      <div className="filter-group">
        <p className="filter-group-title">Availability</p>
        <OptionRow
          label="In Stock"
          active={filters.inStock}
          kind="check"
          onClick={() => set({ inStock: !filters.inStock })}
        />
        <OptionRow
          label="Coming Soon"
          active={filters.comingSoon}
          kind="check"
          onClick={() => set({ comingSoon: !filters.comingSoon })}
        />
      </div>

      <div className="filter-group">
        <p className="filter-group-title">Price</p>
        {PRICE_OPTIONS.map((o) => (
          <OptionRow
            key={o.value}
            label={o.label}
            active={filters.price === o.value}
            kind="radio"
            onClick={() => set({ price: o.value })}
          />
        ))}
      </div>

      <div className="filter-group">
        <p className="filter-group-title">Sort by</p>
        {SORT_OPTIONS.map((o) => (
          <OptionRow
            key={o.value}
            label={o.label}
            active={filters.sort === o.value}
            kind="radio"
            onClick={() => set({ sort: o.value })}
          />
        ))}
      </div>

      <button type="button" className="filter-clear" onClick={() => onChange(DEFAULT_FILTERS)}>
        Clear all
      </button>
    </div>
  );
}
