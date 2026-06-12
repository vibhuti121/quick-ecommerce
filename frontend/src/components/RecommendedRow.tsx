import { useEffect, useState } from 'react';
import type { Product } from '../types';
import { formatPrice, getRecommendations } from '../api';

interface RecommendedRowProps {
  // The last product the shopper opened (localStorage-backed). null on a first visit → row hides.
  seedId: number | null;
  onView: (product: Product) => void;
}

// Home "Recommended for you" strip (Catalogue v2 — part of the "Zoom + quick-add" detail direction).
// Seeded by the last-viewed SKU and served by the PUBLIC hybrid recommendations endpoint (never 503s,
// no backend change). Renders nothing for a first-time visitor or when nothing relates — so it's a
// pure progressive enhancement that never leaves an empty band.
export default function RecommendedRow({ seedId, onView }: RecommendedRowProps) {
  const [recs, setRecs] = useState<Product[]>([]);

  useEffect(() => {
    if (seedId == null) {
      setRecs([]);
      return;
    }
    let active = true;
    getRecommendations(seedId)
      .then((list) => {
        if (active) setRecs(list);
      })
      .catch(() => {
        if (active) setRecs([]); // decorative — never surface an error
      });
    return () => {
      active = false;
    };
  }, [seedId]);

  if (recs.length === 0) return null;

  return (
    <section className="home-recs" aria-label="Recommended for you">
      <div className="home-recs-inner">
        <h2 className="home-recs-title">Recommended for you</h2>
        <p className="home-recs-sub">Picks related to what you last viewed</p>
        <div className="recs-row">
          {recs.map((r) => (
            <button
              key={r.id}
              type="button"
              className="rec-card"
              onClick={() => onView(r)}
              aria-label={`View details for ${r.name}`}
            >
              <img src={r.imageUrl} alt={r.name} loading="lazy" />
              <span className="rec-name">{r.name}</span>
              <span className="rec-price">{formatPrice(r.price)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
