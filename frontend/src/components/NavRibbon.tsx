import type { ProductType } from '../types';

// 'ALL' is the default landing tab (shows every product); the rest filter to one product type.
export type TabKey = 'ALL' | ProductType;

export interface Tab {
  key: TabKey;
  label: string;
  count: number;
}

// Friendly label + icon for each product type, plus the canonical order the pills appear in.
// 'ALL' is always rendered first by App, so it isn't part of this per-type map.
export const TYPE_META: Record<ProductType, { label: string; icon: string }> = {
  PHYSICAL: { label: 'Physical', icon: '📦' },
  DIGITAL: { label: 'Digital', icon: '⬇' },
  SERVICE: { label: 'Service', icon: '🛠' },
  SUBSCRIPTION: { label: 'Subscription', icon: '🔁' },
  RENTAL: { label: 'Rental', icon: '⏳' },
};

export const TYPE_ORDER: ProductType[] = [
  'PHYSICAL',
  'DIGITAL',
  'SERVICE',
  'SUBSCRIPTION',
  'RENTAL',
];

interface NavRibbonProps {
  tabs: Tab[];
  active: TabKey;
  onSelect: (key: TabKey) => void;
}

export default function NavRibbon({ tabs, active, onSelect }: NavRibbonProps) {
  return (
    <nav className="nav-ribbon" aria-label="Filter products by type">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`ribbon-pill ${tab.key === active ? 'active' : ''}`}
          onClick={() => onSelect(tab.key)}
          aria-pressed={tab.key === active}
        >
          <span className="ribbon-label">{tab.label}</span>
          <span className="ribbon-count">{tab.count}</span>
        </button>
      ))}
    </nav>
  );
}
