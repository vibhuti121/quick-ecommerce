import { useState } from 'react';
import { isValidIndianMobile } from '../lib/comingSoon';
import { resolvePincode } from '../lib/pincode';

// Very light email sanity check — we're not the source of truth, just avoiding obvious typos before
// we store the address. A real launch list would validate server-side.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NotifyFormProps {
  // Persist interest (browser-local + backend). Phone is required & validated; email is optional
  // (passed only when valid). pincode (6-digit, required) + city/state (auto-filled, editable, both
  // required) feed the serviceability pilot. The parent owns WHAT subject this is for.
  onNotify: (
    phone: string,
    email: string | undefined,
    pincode: string,
    city: string,
    state: string,
  ) => void;
}

// The shared notify-me capture: a required Indian mobile + an optional email + a required pincode that
// auto-fills an editable city/state, swapping to a confirmation on submit. Used by the honey product
// popup (ComingSoonModal), the honey teaser (HoneyTeaser), and the per-banner carousel popup
// (NotifyModal) so the validation/normalization lives in exactly one place. The parent remounts this
// (via a `key`) to reset it on reopen.
export default function NotifyForm({ onNotify }: NotifyFormProps) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pincode, setPincode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [resolving, setResolving] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [pincodeError, setPincodeError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // On reaching 6 digits, resolve city/state (API → offline fallback, never throws). Keep the digits
  // only and cap at 6 so the field is strictly numeric. City/state stay editable for correction.
  function handlePincodeChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setPincode(digits);
    if (pincodeError) setPincodeError('');
    if (digits.length === 6) {
      setResolving(true);
      void resolvePincode(digits)
        .then((res) => {
          if (res) {
            setCity(res.city);
            setState(res.state);
          }
        })
        .finally(() => setResolving(false));
    }
  }

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

    // Pincode is compulsory (6 digits). City/state must end up filled (auto or typed).
    if (!/^\d{6}$/.test(pincode)) {
      setPincodeError('Enter a valid 6-digit pincode.');
      ok = false;
    } else if (!city.trim() || !state.trim()) {
      setPincodeError('Please fill in your city and state.');
      ok = false;
    }

    if (!ok) return;
    onNotify(phone, emailValue || undefined, pincode, city.trim(), state.trim());
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

      <label className="coming-soon-label" htmlFor="notify-pincode">
        Pincode <span className="coming-soon-req">*</span>
        {resolving && (
          <span className="coming-soon-resolving" aria-live="polite">
            {' '}resolving…
          </span>
        )}
      </label>
      <input
        id="notify-pincode"
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        className="coming-soon-input"
        placeholder="e.g. 560001"
        value={pincode}
        onChange={(e) => handlePincodeChange(e.target.value)}
        aria-invalid={!!pincodeError}
        aria-describedby={pincodeError ? 'notify-pincode-error' : undefined}
      />
      {pincodeError && (
        <span className="coming-soon-error" id="notify-pincode-error">
          {pincodeError}
        </span>
      )}

      <label className="coming-soon-label" htmlFor="notify-city">
        City <span className="coming-soon-req">*</span>
      </label>
      <input
        id="notify-city"
        type="text"
        autoComplete="address-level2"
        className="coming-soon-input"
        placeholder="City"
        value={city}
        onChange={(e) => setCity(e.target.value)}
      />

      <label className="coming-soon-label" htmlFor="notify-state">
        State <span className="coming-soon-req">*</span>
      </label>
      <input
        id="notify-state"
        type="text"
        autoComplete="address-level1"
        className="coming-soon-input"
        placeholder="State"
        value={state}
        onChange={(e) => setState(e.target.value)}
      />

      <button type="submit" className="btn btn-primary coming-soon-submit">
        🔔 Notify me
      </button>
    </form>
  );
}
