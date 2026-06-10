import { useEffect, useState } from 'react';
import type { Product } from '../types';
import { isValidIndianMobile } from '../lib/comingSoon';

// Very light email sanity check — we're not the source of truth, just avoiding obvious typos before
// we store the address. A real launch list would validate server-side.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ComingSoonModalProps {
  open: boolean;
  product: Product | null;
  // Persist interest (browser-local). Phone is required & validated; email is optional (passed only
  // when the user filled a valid one).
  onNotify: (phone: string, email?: string) => void;
  onClose: () => void;
}

// Teaser popup for a not-yet-launched product (honey). Reuses the shared .overlay + .product-modal
// styling. Shows the product image + a "launching soon" headline and a notify-me capture: a required
// mobile number plus an optional email. After submit it swaps the form for a confirmation. Resets to
// the form each time it reopens.
export default function ComingSoonModal({ open, product, onNotify, onClose }: ComingSoonModalProps) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Fresh form on every open (and clear stale state when product changes).
  useEffect(() => {
    if (open) {
      setPhone('');
      setEmail('');
      setPhoneError('');
      setEmailError('');
      setSubmitted(false);
    }
  }, [open, product?.id]);

  if (!open || !product) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let ok = true;

    // Phone is compulsory.
    if (!isValidIndianMobile(phone)) {
      setPhoneError('Enter a valid 10-digit mobile number.');
      ok = false;
    }

    // Email is optional — only validated if the user typed something.
    const emailValue = email.trim();
    if (emailValue && !EMAIL_RE.test(emailValue)) {
      setEmailError('Please enter a valid email address.');
      ok = false;
    }

    if (!ok) return;
    onNotify(phone, emailValue || undefined);
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
                ✓ Thanks! We&apos;ll text you the moment it launches.
              </p>
            ) : (
              <form className="coming-soon-form" onSubmit={handleSubmit} noValidate>
                <label className="coming-soon-label" htmlFor="notify-phone">
                  Mobile number <span className="coming-soon-req">*</span>
                </label>
                <input
                  id="notify-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  className="coming-soon-input"
                  placeholder="e.g. 98765 43210"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (phoneError) setPhoneError('');
                  }}
                  aria-invalid={!!phoneError}
                  aria-describedby={phoneError ? 'notify-phone-error' : undefined}
                  autoFocus
                />
                {phoneError && (
                  <span className="coming-soon-error" id="notify-phone-error">
                    {phoneError}
                  </span>
                )}

                <label className="coming-soon-label" htmlFor="notify-email">
                  Email <span className="coming-soon-optional">(optional)</span>
                </label>
                <input
                  id="notify-email"
                  type="email"
                  autoComplete="email"
                  className="coming-soon-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'notify-email-error' : undefined}
                />
                {emailError && (
                  <span className="coming-soon-error" id="notify-email-error">
                    {emailError}
                  </span>
                )}

                <button type="submit" className="btn btn-primary coming-soon-submit">
                  🔔 Notify me
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
