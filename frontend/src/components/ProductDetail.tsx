import { useEffect, useState } from 'react';
import type { Product, Provenance } from '../types';
import { formatPrice, getRecommendations } from '../api';

interface ProductDetailProps {
  open: boolean;
  product: Product | null;
  loading: boolean;
  adding: boolean;
  onClose: () => void;
  onAdd: (product: Product, quantity?: number) => void;
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

  // Quick-add controls (Catalogue v2). Quantity is real (multiplies the add). The grade picker is
  // INDICATIVE ONLY — a variant is never a cart-line key (see types.ts), so add-to-cart always ships
  // the standard pack at the base price; selecting a grade just previews its indicative price.
  const [qty, setQty] = useState(1);
  const [gradeSku, setGradeSku] = useState<string>('standard');
  // Single-image zoom lightbox (the data carries one imageUrl — no fake multi-image gallery).
  const [zoomed, setZoomed] = useState(false);

  // Reset the quick-add controls whenever the anchored product changes.
  const anchorId = product?.id;
  useEffect(() => {
    setQty(1);
    setGradeSku('standard');
    setZoomed(false);
  }, [anchorId]);

  // Esc closes the zoom lightbox; keep it scoped to when it's open.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  const selectedGrade = variants.find((v) => v.sku === gradeSku);
  const indicativePrice = (product?.price ?? 0) + (selectedGrade?.priceDelta ?? 0);

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
              <div className="detail-image">
                <button
                  type="button"
                  className="detail-image-zoom"
                  onClick={() => setZoomed(true)}
                  aria-label={`Zoom image of ${product.name}`}
                >
                  <img src={product.imageUrl} alt={product.name} />
                  <span className="zoom-hint" aria-hidden="true">🔍</span>
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
              {product.sku && <div className="detail-sku">SKU: {product.sku}</div>}
              <p className="detail-description">{product.description}</p>

              {provenance && (
                <section className="prov-panel">
                  <h4 className="prov-title">Provenance &amp; traceability</h4>
                  <Field label="Farm" value={provenance.farm} />
                  <Field label="Origin" value={provenance.origin} />
                  <Field label="Harvest" value={provenance.harvest} />
                  <Field label="Batch" value={provenance.batch} />
                  {labCert && (
                    <Field
                      label="Lab test"
                      value={`${labCert.test} — ${labCert.status} (${labCert.ref})`}
                    />
                  )}
                  {provenance.gi && <GiLine gi={provenance.gi} />}
                </section>
              )}

              {variants.length > 0 && (
                <section className="variant-panel">
                  <h4 className="prov-title">Grade / size</h4>
                  <label className="grade-picker">
                    <span className="grade-picker-label">Choose a grade</span>
                    <select
                      className="cc-select grade-select"
                      value={gradeSku}
                      onChange={(e) => setGradeSku(e.target.value)}
                      aria-label="Select grade"
                    >
                      <option value="standard">Standard pack — {formatPrice(product.price)}</option>
                      {variants.map((v) => (
                        <option key={v.sku} value={v.sku}>
                          {v.name}
                          {v.priceDelta > 0 ? ` — ${formatPrice(product.price + v.priceDelta)} (indicative)` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedGrade && selectedGrade.priceDelta > 0 && (
                    <p className="grade-indicative">
                      {selectedGrade.name}: ~{formatPrice(indicativePrice)} — indicative.
                    </p>
                  )}
                  <p className="variant-note">
                    Grades shown for information. This listing ships as the standard pack at{' '}
                    {formatPrice(product.price)}.
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

            <div className="cart-footer detail-footer">
              <div className="qty-stepper" role="group" aria-label="Quantity">
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="qty-value" aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  className="qty-btn"
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  disabled={qty >= 99}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button
                className="btn btn-primary detail-add"
                onClick={() => onAdd(product, qty)}
                disabled={adding}
              >
                {adding ? 'Adding…' : `Add ${qty} to cart`}
              </button>
            </div>
          </>
        )}
      </aside>

      {zoomed && product && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${product.name} — zoomed image`}
          onClick={() => setZoomed(false)}
        >
          <button type="button" className="image-lightbox-close" aria-label="Close zoom">
            ✕
          </button>
          <img src={product.imageUrl} alt={product.name} />
        </div>
      )}
    </>
  );
}
