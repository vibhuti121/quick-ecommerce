import { useEffect, useState } from 'react';
import type { Product } from '../types';

interface ComingSoonModalProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  // Persist interest (browser-local). Called only after a valid email is entered.
  onNotify: (email: string) => void;
}

// Very light email sanity check — we're not the source of truth, just avoiding obvious typos before
// we store the address. A real launch list would validate server-side.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Teaser popup for a not-yet-launched product (honey). Reuses the shared .overlay + .product-modal
// styling. Shows the product image + a "launching soon" headline and a notify-me email capture;
// after submit it swaps the form for a confirmation. Resets to the form each time it reopens.
export default function ComingSoonModal({ open, product, onClose, onNotify }: ComingSoonModalProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Fresh form on every open (and clear stale state when product changes).
  useEffect(() => {
    if (open) {
      setEmail('');
      setError('');
      setSubmitted(false);
    }
  }, [open, product?.id]);

  if (!open || !product) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError('Please enter a valid email address.');
      return;
    }
    onNotify(value);
    setSubmitted(true);
  }

  return (
    <>
      <div className="overlay overlay-open" onClick={onClose} />
      <div className="product-modal coming-soon-modal" role="dialog" aria-modal="true" aria-label={`${product.name} — coming soon`}>
        <button className="icon-button product-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="product-modal-main coming-soon-main">
          <div className="product-modal-image">
            <img src={product.imageUrl} alt={product.name} />
            <span className="coming-soon-badge">Coming Soon</span>
          </div>
          <div className="product-modal-info">
            <h3 className="product-modal-name">{product.name}</h3>
            <p className="coming-soon-headline">Launching soon 🍯</p>
            <p className="product-modal-description">{product.description}</p>

            {submitted ? (
              <p className="coming-soon-confirm" role="status">
                ✓ Thanks! We&apos;ll email you the moment it launches.
              </p>
            ) : (
              <form className="coming-soon-form" onSubmit={handleSubmit} noValidate>
                <label className="coming-soon-label" htmlFor="notify-email">
                  Get notified at launch
                </label>
                <div className="coming-soon-row">
                  <input
                    id="notify-email"
                    type="email"
                    className="coming-soon-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                    aria-invalid={!!error}
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary">
                    🔔 Notify me
                  </button>
                </div>
                {error && <span className="coming-soon-error">{error}</span>}
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
