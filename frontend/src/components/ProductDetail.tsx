import type { Product, Provenance } from '../types';
import { formatPrice } from '../api';

interface ProductDetailProps {
  open: boolean;
  product: Product | null;
  loading: boolean;
  adding: boolean;
  onClose: () => void;
  onAdd: (product: Product) => void;
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
}: ProductDetailProps) {
  const provenance = product?.provenance;
  const labCert = provenance?.labCert;
  const variants = product?.variants ?? [];

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
                <img src={product.imageUrl} alt={product.name} />
                <span className="category-badge">{product.category}</span>
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
            </div>

            <div className="cart-footer">
              <button
                className="btn btn-primary btn-block"
                onClick={() => onAdd(product)}
                disabled={adding}
              >
                {adding ? 'Adding…' : 'Add to cart'}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
