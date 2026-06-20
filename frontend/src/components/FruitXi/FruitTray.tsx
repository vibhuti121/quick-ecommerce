import { useEffect, useState } from 'react';
import { formatPrice, getProducts } from '../../api';
import { isComingSoon } from '../../lib/comingSoon';
import type { Product } from '../../types';

interface FruitTrayProps {
  // The product ids already placed on the pitch — shown as "on the pitch" so the fan sees what's used.
  // (We do NOT block re-tapping here; the BACKEND dedupes on /box — presentation only, CLAUDE.md §9.)
  placedIds: Set<number>;
  // Tap a fruit to drop it onto the next open pitch slot. The page owns the placement state.
  onPick: (product: Product) => void;
}

// The catalogue tray for the Fruit XI builder. Self-fetches the normal browse catalogue (the same
// RecommendedRow self-fetch idiom) and renders each fruit as a tap-to-place button. This is just the
// regular storefront catalogue surfaced as a picker — no Fruit-XI logic lives here.
//
// Honey: the tray shows the live catalogue. Honey carries a non-buyable "Coming soon" tag here (the
// normal isComingSoon gate) and tapping it is a no-op for the box — and even if it WERE placed, the
// backend /box excludes it (HONEY_NOT_BUYABLE). So honey-not-buyable holds from both sides.
export default function FruitTray({ placedIds, onPick }: FruitTrayProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    getProducts()
      .then((list) => {
        if (active) setProducts(list);
      })
      .catch(() => {
        if (active) setProducts([]); // tray is a picker — never surface a fatal error
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="fruit-xi-tray-state">
        <div className="spinner" />
        <p>Loading fruits…</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="fruit-xi-tray-state">
        <p>No fruits to pick right now.</p>
      </div>
    );
  }

  return (
    <div className="fruit-xi-tray" role="list" aria-label="Fruit tray — tap to add to your XI">
      {products.map((p) => {
        const comingSoon = isComingSoon(p);
        const placed = placedIds.has(p.id);
        return (
          <button
            key={p.id}
            type="button"
            role="listitem"
            className={`tray-fruit${placed ? ' is-placed' : ''}${comingSoon ? ' is-coming-soon' : ''}`}
            // Honey (coming soon) is never placeable on the pitch — it's not buyable. The backend would
            // exclude it anyway; we just don't add it client-side, keeping the placed lineup clean.
            disabled={comingSoon}
            onClick={() => onPick(p)}
            aria-label={
              comingSoon
                ? `${p.name} — coming soon, not available for the box`
                : `Add ${p.name} to your XI`
            }
          >
            <span className="tray-fruit-img">
              <img src={p.imageUrl} alt="" loading="lazy" />
              {placed && (
                <span className="tray-fruit-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </span>
            <span className="tray-fruit-name">{p.name}</span>
            <span className="tray-fruit-price">
              {comingSoon ? 'Coming soon' : formatPrice(p.price)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
