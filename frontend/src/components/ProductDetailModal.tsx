import { useEffect, useState } from 'react';
import type { Product } from '../types';
import { formatPrice, getRecommendations } from '../api';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onAdd: (product: Product) => void;
  addingId: number | null;
  // Re-anchor the modal on a recommended product (clicking a rec swaps the detail view).
  onSelect: (product: Product) => void;
}

export default function ProductDetailModal({
  product,
  onClose,
  onAdd,
  addingId,
  onSelect,
}: ProductDetailModalProps) {
  const [recs, setRecs] = useState<Product[]>([]);
  const [loadingRecs, setLoadingRecs] = useState<boolean>(true);

  // Fetch recommendations whenever the anchor product changes (open or re-anchor). `active` guards
  // against a stale response from a previous anchor overwriting the current one. Recs are best-effort:
  // any failure just shows the empty state — it never blocks viewing the product.
  useEffect(() => {
    let active = true;
    setLoadingRecs(true);
    setRecs([]);
    getRecommendations(product.id)
      .then((list) => {
        if (active) setRecs(list);
      })
      .catch(() => {
        if (active) setRecs([]);
      })
      .finally(() => {
        if (active) setLoadingRecs(false);
      });
    return () => {
      active = false;
    };
  }, [product.id]);

  // Close on Escape, like a native dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="overlay overlay-open" onClick={onClose} />
      <div
        className="product-modal"
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
      >
        <button
          className="icon-button product-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="product-modal-main">
          <div className="product-modal-image">
            <img src={product.imageUrl} alt={product.name} />
            <span className="category-badge">{product.category}</span>
          </div>
          <div className="product-modal-info">
            <h2 className="product-modal-name">{product.name}</h2>
            <p className="product-modal-description">{product.description}</p>
            <div className="product-modal-buy">
              <span className="product-price">{formatPrice(product.price)}</span>
              <button
                className="btn btn-primary"
                onClick={() => onAdd(product)}
                disabled={addingId === product.id}
              >
                {addingId === product.id ? 'Adding…' : 'Add to cart'}
              </button>
            </div>
          </div>
        </div>

        <div className="recs-section">
          <h3 className="recs-title">You may also like</h3>
          {loadingRecs ? (
            <div className="recs-loading">
              <div className="spinner" />
            </div>
          ) : recs.length === 0 ? (
            <p className="recs-empty">No related products yet.</p>
          ) : (
            <div className="recs-row">
              {recs.map((rec) => (
                <article
                  className="rec-card"
                  key={rec.id}
                  onClick={() => onSelect(rec)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelect(rec);
                  }}
                >
                  <div className="rec-image">
                    <img src={rec.imageUrl} alt={rec.name} loading="lazy" />
                  </div>
                  <div className="rec-body">
                    <span className="rec-name">{rec.name}</span>
                    <span className="rec-price">{formatPrice(rec.price)}</span>
                    <button
                      className="btn btn-secondary rec-add"
                      onClick={(e) => {
                        e.stopPropagation(); // don't re-anchor when adding
                        onAdd(rec);
                      }}
                      disabled={addingId === rec.id}
                    >
                      {addingId === rec.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
