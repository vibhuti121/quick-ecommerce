import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import SearchBar from './SearchBar';
import { formatPrice } from '../api';

export type SortKey = 'newest' | 'price-asc' | 'price-desc';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
};

interface CatalogControlsProps {
  categories: string[]; // distinct category keys (lowercase), NOT including 'all'
  category: string; // active category key, or 'all'
  onCategory: (c: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  query: string;
  onQuery: (q: string) => void;
  onClearQuery: () => void;
  giOnly: boolean;
  onGiOnly: (v: boolean) => void;
  labOnly: boolean;
  onLabOnly: (v: boolean) => void;
  priceCeiling: number; // max price across the catalogue (slider bound)
  maxPrice: number; // current price cap
  onMaxPrice: (v: number) => void;
  onResetFilters: () => void;
  resultCount: number;
  total: number;
}

function label(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Discovery toolbar (Catalogue v2 — "Sticky toolbar" direction). One compact sticky bar above the grid:
// category pills + inline live-filter search + sort, with a collapsible facet row (GI ✓, Lab-tested,
// price ceiling). Pure presentation over client-side state owned by App — no backend call. Filtering
// itself happens in App; this only emits intent.
export default function CatalogControls({
  categories,
  category,
  onCategory,
  sort,
  onSort,
  query,
  onQuery,
  onClearQuery,
  giOnly,
  onGiOnly,
  labOnly,
  onLabOnly,
  priceCeiling,
  maxPrice,
  onMaxPrice,
  onResetFilters,
  resultCount,
  total,
}: CatalogControlsProps) {
  const reduce = useReducedMotion();
  const priceCapped = maxPrice > 0 && maxPrice < priceCeiling;
  const activeFacets = (giOnly ? 1 : 0) + (labOnly ? 1 : 0) + (priceCapped ? 1 : 0);
  const [open, setOpen] = useState(false);

  const pills = ['all', ...categories];

  return (
    <section className="catalog-controls" aria-label="Catalogue filters and sorting">
      <div className="cc-row cc-row-main">
        <div className="cc-pills" role="tablist" aria-label="Product categories">
          {pills.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={category === key}
              className={`cc-pill${category === key ? ' cc-pill-active' : ''}`}
              onClick={() => onCategory(key)}
            >
              {key === 'all' ? 'All' : label(key)}
            </button>
          ))}
        </div>

        <div className="cc-tools">
          <SearchBar value={query} onChange={onQuery} onClear={onClearQuery} />
          <label className="cc-sort">
            <span className="cc-sort-label">Sort</span>
            <select
              className="cc-select"
              value={sort}
              onChange={(e) => onSort(e.target.value as SortKey)}
              aria-label="Sort products"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`cc-filter-toggle${activeFacets ? ' cc-filter-toggle-active' : ''}`}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            Filters{activeFacets ? ` · ${activeFacets}` : ''}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="cc-facets"
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <label className="cc-check">
              <input type="checkbox" checked={giOnly} onChange={(e) => onGiOnly(e.target.checked)} />
              <span>GI-tagged only</span>
            </label>
            <label className="cc-check">
              <input type="checkbox" checked={labOnly} onChange={(e) => onLabOnly(e.target.checked)} />
              <span>Lab-tested only</span>
            </label>
            <label className="cc-price">
              <span className="cc-price-label">
                Up to <strong>{formatPrice(priceCapped ? maxPrice : priceCeiling)}</strong>
              </span>
              <input
                type="range"
                min={0}
                max={priceCeiling}
                step={Math.max(1, Math.round(priceCeiling / 100))}
                value={priceCapped ? maxPrice : priceCeiling}
                onChange={(e) => onMaxPrice(Number(e.target.value))}
                aria-label="Maximum price"
              />
            </label>
            {activeFacets > 0 && (
              <button type="button" className="cc-reset" onClick={onResetFilters}>
                Clear filters
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="cc-count" aria-live="polite">
        Showing <strong>{resultCount}</strong> of {total}
      </p>
    </section>
  );
}
