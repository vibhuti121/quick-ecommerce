import { useState } from 'react';
import { isValidIndianMobile } from '../lib/comingSoon';

// Very light email sanity check — we're not the source of truth, just avoiding obvious typos before
// we store the address. A real launch list would validate server-side.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NotifyFormProps {
  // Persist interest (browser-local). Phone is required & validated; email is optional (passed only
  // when the user filled a valid one). The parent owns WHAT subject this is for.
  onNotify: (phone: string, email?: string) => void;
}

// The shared notify-me capture: a required Indian mobile + an optional email, with per-field
// validation, swapping to a confirmation on submit. Used by both the honey product popup
// (ComingSoonModal) and the per-banner carousel popup (NotifyModal) so the validation/normalization
// lives in exactly one place. The parent remounts this (via a `key`) to reset it on reopen.
export default function NotifyForm({ onNotify }: NotifyFormProps) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitted, setSubmitted] = useState(false);

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

  if (submitted) {
    return (
      <p className="coming-soon-confirm" role="status">
        ✓ Thanks! We&apos;ll text you the moment there&apos;s news.
      </p>
    );
  }

  return (
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
  );
}
