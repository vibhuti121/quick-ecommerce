import { useState } from 'react';
import type { Filters } from '../lib/filters';
import { DEFAULT_FILTERS, countActiveFilters } from '../lib/filters';
import FilterPanel from './FilterPanel';

// Responsive shop controls (Iteration 9): a luxury left sidebar on desktop; on mobile the
// sidebar is hidden and [Filters] [Sort] open a bottom sheet holding the same FilterPanel.
// Owns only the sheet open-state. No sidebar on mobile.
interface FilterSidebarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  counts: Record<string, number>;
}

export default function FilterSidebar({ filters, onChange, counts }: FilterSidebarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = countActiveFilters(filters);

  return (
    <>
      <aside className="shop-sidebar">
        <FilterPanel filters={filters} onChange={onChange} counts={counts} />
      </aside>

      <div className="shop-mobile-bar">
        <button type="button" className="filter-mobile-btn" onClick={() => setSheetOpen(true)}>
          <span aria-hidden="true">⚙</span> Filters
          {activeCount > 0 && <span className="filter-badge">{activeCount}</span>}
        </button>
        <button type="button" className="filter-mobile-btn" onClick={() => setSheetOpen(true)}>
          <span aria-hidden="true">↕</span> Sort
        </button>
      </div>

      <div
        className={`overlay ${sheetOpen ? 'overlay-open' : ''}`}
        onClick={() => setSheetOpen(false)}
      />
      <div
        className={`filter-sheet ${sheetOpen ? 'filter-sheet-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Filters and sort"
      >
        <div className="filter-sheet-head">
          <h3>Filters &amp; sort</h3>
          <button className="icon-button" onClick={() => setSheetOpen(false)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="filter-sheet-body">
          <FilterPanel filters={filters} onChange={onChange} counts={counts} />
        </div>
        <div className="filter-sheet-foot">
          <button className="btn btn-secondary" onClick={() => onChange(DEFAULT_FILTERS)}>
            Clear all
          </button>
          <button className="btn btn-primary" onClick={() => setSheetOpen(false)}>
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
