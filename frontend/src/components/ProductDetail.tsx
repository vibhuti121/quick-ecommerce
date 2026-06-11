import { useEffect, useState } from 'react';
import type { Product, Provenance } from '../types';
import { formatPrice, getRecommendations } from '../api';

// Static, range-true brand copy (Iteration 7). There is no per-product benefits/ingredients
// data in the catalog, so these are honest editorial lines for the MaLLADE range — worded
// generically so they never over-claim for a specific SKU. Easy to refine.
const BENEFITS = [
  'Raw & unprocessed — never overheated',
  'No added sugar or syrups',
  'Lab-tested for adulteration',
  'Single-origin & fully traceable',
];
const INGREDIENTS = '100% pure, single-origin — nothing added. No preservatives, no additives.';

interface ProductDetailProps {
  open: boolean;
  product: Product | null;
  loading: boolean;
  adding: boolean;
  onClose: () => void;
  onAdd: (product: Product) => void;
  // Re-anchor the drawer to a clicked recommendation (refetches the authoritative record + its recs).
  onViewProduct?: (product: Product) => void;
  // Wishlist heart — consistent with the card. `wished` reflects the anchored product's membership.
  wished: boolean;
  onToggleWishlist: (product: Product) => void;
}

// A provenance field row — rendered only when the value is present, so a sparse
// provenance object (or a legacy product with none) collapses cleanly.
function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="prov-row">
      <span className="prov-label">{label}</span>
      <span className="prov-value">{value}</span>
    </div>
  );
}

// Compliance rule (see [[mallade-golive-plan]]): the "GI-tagged ✓" badge appears ONLY when
// gi.status === "authorized". "pending"/"none" render as plain text — never an unearned claim.
function GiLine({ gi }: { gi: NonNullable<Provenance['gi']> }) {
  if (gi.status === 'authorized') {
    return (
      <div className="prov-row">
        <span className="prov-label">GI status</span>
        <span className="prov-value">
          <span className="gi-badge">GI-tagged ✓</span>
          {gi.name ? ` ${gi.name}` : ''}
          {gi.authNo ? ` · ${gi.authNo}` : ''}
        </span>
      </div>
    );
  }
  if (gi.status === 'pending') {
    return <Field label="GI status" value={`Authorization pending${gi.name ? ` — ${gi.name}` : ''}`} />;
  }
  return null; // "none": no GI claim shown at all
}

export default function ProductDetail({
  open,
  product,
  loading,
  adding,
  onClose,
  onAdd,
  onViewProduct,
  wished,
  onToggleWishlist,
}: ProductDetailProps) {
  const provenance = product?.provenance;
  const labCert = provenance?.labCert;
  const variants = product?.variants ?? [];

  // Real trust signals (same honesty rules as the card): each shows only when backed by data.
  const gi = provenance?.gi;
  const giAuthorized = gi?.status === 'authorized';
  const labTested = labCert?.status?.toLowerCase() === 'passed';
  const traceable = Boolean(provenance?.farm || provenance?.origin);
  const hasTrust = giAuthorized || labTested || traceable;

  // Premium single-image viewer: click the image to open a full-screen lightbox (internal
  // state only — no prop-contract change). Only one product image exists in the catalog.
  const [zoomOpen, setZoomOpen] = useState(false);
  useEffect(() => {
    if (!open) setZoomOpen(false);
  }, [open]);
  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomOpen]);

  // Hybrid "you may also like" recs for the anchored product. Best-effort & non-blocking: the
  // endpoint never 503s, so any failure (or none related) simply leaves an empty row. `active`
  // guards against a stale response from a previous anchor overwriting the current one.
  const [recs, setRecs] = useState<Product[]>([]);
  const productId = product?.id;
  useEffect(() => {
    if (!open || productId == null) {
      setRecs([]);
      return;
    }
    let active = true;
    getRecommendations(productId)
      .then((list) => {
        if (active) setRecs(list);
      })
      .catch(() => {
        if (active) setRecs([]); // recs are decorative — never surface an error for them
      });
    return () => {
      active = false;
    };
  }, [open, productId]);

  return (
    <>
      <div
        className={`overlay ${open ? 'overlay-open' : ''}`}
        onClick={onClose}
      />
      <aside className={`detail-drawer ${open ? 'detail-drawer-open' : ''}`}>
        <div className="cart-header">
          <h2>Product details</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close details">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="state-message">
            <div className="spinner" />
            <p>Loading details…</p>
          </div>
        ) : !product ? (
          <div className="state-message">
            <p>Product not found.</p>
          </div>
        ) : (
          <>
            <div className="detail-body">
              <div className="detail-gallery">
                <button
                  type="button"
                  className="detail-image"
                  onClick={() => setZoomOpen(true)}
                  aria-label={`Zoom image of ${product.name}`}
                >
                  <img src={product.imageUrl} alt={product.name} />
                  <span className="detail-zoom-cue" aria-hidden="true">⤢</span>
                </button>
                <span className="category-badge">{product.category}</span>
                <button
                  type="button"
                  className={`wishlist-heart ${wished ? 'wishlist-heart--active' : ''}`}
                  onClick={() => onToggleWishlist(product)}
                  aria-label={
                    wished
                      ? `Remove ${product.name} from wishlist`
                      : `Save ${product.name} to wishlist`
                  }
                  aria-pressed={wished}
                >
                  {wished ? '♥' : '♡'}
                </button>
              </div>

              <h3 className="detail-name">{product.name}</h3>
              <div className="detail-price">{formatPrice(product.price)}</div>

              {hasTrust && (
                <div className="detail-trust">
                  {giAuthorized && <span className="trust-chip trust-chip--gi">🌿 GI-certified</span>}
                  {labTested && <span className="trust-chip trust-chip--lab">🔬 Lab-tested</span>}
                  {traceable && (
                    <span className="trust-chip trust-chip--origin">📍 Traceable to farm</span>
                  )}
                </div>
              )}

              {product.sku && <div className="detail-sku">SKU: {product.sku}</div>}
              {product.description && <p className="detail-description">{product.description}</p>}

              <section className="pdp-block">
                <h4 className="pdp-block-title">Why you'll love it</h4>
                <ul className="pdp-benefits">
                  {BENEFITS.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>

              <section className="pdp-block">
                <h4 className="pdp-block-title">Ingredients</h4>
                <p className="pdp-ingredients">{INGREDIENTS}</p>
              </section>

              {provenance && (
                <section className="pdp-verified">
                  <h4 className="pdp-block-title">Verified, not reviewed</h4>
                  <p className="pdp-verified-tag">
                    We earn trust with lab proof &amp; full traceability — not stranger ratings.
                  </p>
                  {labCert && (
                    <div className="pdp-proof">
                      <span className="pdp-proof-icon" aria-hidden="true">🔬</span>
                      <div className="pdp-proof-text">
                        <span className="pdp-proof-label">Lab tested · {labCert.status}</span>
                        <span className="pdp-proof-value">{labCert.test}</span>
                        <span className="pdp-proof-ref">Ref: {labCert.ref}</span>
                      </div>
                    </div>
                  )}
                  <div className="prov-panel prov-panel--bare">
                    <Field label="Farm" value={provenance.farm} />
                    <Field label="Origin" value={provenance.origin} />
                    <Field label="Harvest" value={provenance.harvest} />
                    <Field label="Batch" value={provenance.batch} />
                    {provenance.gi && <GiLine gi={provenance.gi} />}
                  </div>
                </section>
              )}

              {variants.length > 0 && (
                <section className="variant-panel">
                  <h4 className="prov-title">Available grades / sizes</h4>
                  <ul className="variant-list">
                    {variants.map((v) => (
                      <li key={v.sku} className="variant-item">
                        {v.name}
                        {v.priceDelta > 0 && (
                          <span className="variant-delta">+{formatPrice(v.priceDelta)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="variant-note">
                    Grades shown for information. This listing ships as the standard pack.
                  </p>
                </section>
              )}

              {recs.length > 0 && (
                <section className="recs-section">
                  <h4 className="recs-title">You may also like</h4>
                  <div className="recs-row">
                    {recs.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="rec-card"
                        onClick={() => onViewProduct?.(r)}
                        aria-label={`View details for ${r.name}`}
                      >
                        <img src={r.imageUrl} alt={r.name} loading="lazy" />
                        <span className="rec-name">{r.name}</span>
                        <span className="rec-price">{formatPrice(r.price)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="detail-footer">
              <div className="detail-footer-info">
                <span className="detail-footer-name">{product.name}</span>
                <span className="detail-footer-price">{formatPrice(product.price)}</span>
              </div>
              <button
                className="btn btn-primary detail-add"
                onClick={() => onAdd(product)}
                disabled={adding}
                aria-busy={adding}
              >
                {adding && <span className="btn-spinner" aria-hidden="true" />}
                {adding ? 'Adding…' : 'Add to cart'}
              </button>
            </div>
          </>
        )}
      </aside>

      {zoomOpen && product && (
        <div
          className="lightbox"
          onClick={() => setZoomOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${product.name} image`}
        >
          <button className="lightbox-close" onClick={() => setZoomOpen(false)} aria-label="Close zoom">
            ✕
          </button>
          <img
            className="lightbox-img"
            src={product.imageUrl}
            alt={product.name}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
