import { useState } from 'react';
import { isValidIndianMobile } from '../lib/comingSoon';
import { resolvePincode, INDIAN_STATES, STATE_TO_CAPITAL } from '../lib/pincode';

// Very light email sanity check — we're not the source of truth, just avoiding obvious typos before
// we store the address. A real launch list would validate server-side.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NotifyFormProps {
  // Persist interest (browser-local + backend). Phone is required & validated; email is optional
  // (passed only when valid). pincode (6-digit, required) + city/state (auto-filled, editable, both
  // required) feed the serviceability pilot. The parent owns WHAT subject this is for.
  //
  // HONEY CALLERS (HoneyTeaser / ComingSoonModal / NotifyModal) use ONLY `onNotify` — its signature
  // and the JSON it ultimately POSTs are unchanged. The quiz path opts into a required Name field via
  // `collectName` and receives it through the SEPARATE `onNotifyWithName` callback, so the 6-arg honey
  // contract stays byte-identical. (When collectName is true, onNotifyWithName fires INSTEAD of onNotify.)
  onNotify: (
    phone: string,
    email: string | undefined,
    pincode: string,
    city: string,
    state: string,
  ) => void;
  // Quiz opt-in: render a required Name input above phone. Defaults to false (honey behaviour).
  collectName?: boolean;
  // Address-footprint opt-in (Taste Match V7): when true, the location fields render in the
  // demand-signal order STATE (dropdown of Indian states) → PINCODE → CITY, instead of the legacy
  // PINCODE → CITY → STATE order. Defaults to false so every honey caller is byte-identical.
  // Picking a state first auto-fills its capital as city; a later 6-digit PIN still refines both.
  stateFirst?: boolean;
  // Fired (instead of onNotify) when collectName is true — carries the collected name as the 1st arg.
  onNotifyWithName?: (
    name: string,
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
export default function NotifyForm({
  onNotify,
  collectName = false,
  onNotifyWithName,
  stateFirst = false,
}: NotifyFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pincode, setPincode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [resolving, setResolving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [pincodeError, setPincodeError] = useState('');
  const [stateError, setStateError] = useState('');
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

  // stateFirst path: picking a state up-front auto-fills its capital as city (the founder "state →
  // capital" rule, reused) — but ONLY when city is still empty, so a PIN-derived or hand-typed city is
  // never clobbered. A later 6-digit PIN refines both via handlePincodeChange. Clears the state error.
  function handleStateChange(value: string) {
    setState(value);
    if (stateError) setStateError('');
    if (value && !city.trim()) {
      const capital = STATE_TO_CAPITAL[value];
      if (capital) setCity(capital);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let ok = true;

    // Name is required ONLY on the quiz path (collectName). Honey callers never render it.
    const nameValue = name.trim();
    if (collectName && !nameValue) {
      setNameError('Please tell us your name.');
      ok = false;
    }

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

    // State is compulsory. On the stateFirst path it's a dropdown, so surface the error on the field
    // itself; the legacy path keeps the combined "fill city and state" message under pincode.
    if (stateFirst && !state.trim()) {
      setStateError('Please choose your state.');
      ok = false;
    }

    // Pincode is compulsory (6 digits). City/state must end up filled (auto or typed).
    if (!/^\d{6}$/.test(pincode)) {
      setPincodeError('Enter a valid 6-digit pincode.');
      ok = false;
    } else if (!city.trim() || !state.trim()) {
      setPincodeError(
        stateFirst ? 'Please fill in your city.' : 'Please fill in your city and state.',
      );
      ok = false;
    }

    if (!ok) return;
    // Quiz path fires onNotifyWithName (name first); honey path fires the unchanged 6-arg onNotify.
    if (collectName && onNotifyWithName) {
      onNotifyWithName(nameValue, phone, emailValue || undefined, pincode, city.trim(), state.trim());
    } else {
      onNotify(phone, emailValue || undefined, pincode, city.trim(), state.trim());
    }
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
      {/* Name — quiz-only (collectName). Required there; never rendered for honey callers. */}
      {collectName && (
        <>
          <label className="coming-soon-label" htmlFor="notify-name">
            Name <span className="coming-soon-req">*</span>
          </label>
          <input
            id="notify-name"
            type="text"
            autoComplete="name"
            className="coming-soon-input"
            placeholder="Your name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'notify-name-error' : undefined}
            autoFocus
          />
          {nameError && (
            <span className="coming-soon-error" id="notify-name-error">
              {nameError}
            </span>
          )}
        </>
      )}

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
        autoFocus={!collectName}
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

      {/* ── Location fields. Order depends on `stateFirst`: V7 Taste Match wants STATE → PIN → CITY
          (state + pincode are the per-pincode demand-footprint signal); honey callers keep the legacy
          PIN → CITY → STATE order byte-for-byte. The three blocks below are defined once and emitted
          in the chosen order so neither path duplicates markup or validation. ── */}
      {(() => {
        const stateBlock = (
          <div key="state" className="coming-soon-field">
            <label className="coming-soon-label" htmlFor="notify-state">
              State <span className="coming-soon-req">*</span>
            </label>
            {stateFirst ? (
              <select
                id="notify-state"
                autoComplete="address-level1"
                className="coming-soon-input coming-soon-select"
                value={state}
                onChange={(e) => handleStateChange(e.target.value)}
                aria-invalid={!!stateError}
                aria-describedby={stateError ? 'notify-state-error' : undefined}
              >
                <option value="">Select your state…</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="notify-state"
                type="text"
                autoComplete="address-level1"
                className="coming-soon-input"
                placeholder="State"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            )}
            {stateError && (
              <span className="coming-soon-error" id="notify-state-error">
                {stateError}
              </span>
            )}
          </div>
        );

        const pincodeBlock = (
          <div key="pincode" className="coming-soon-field">
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
          </div>
        );

        const cityBlock = (
          <div key="city" className="coming-soon-field">
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
          </div>
        );

        // STATE → PIN → CITY for the footprint path; PIN → CITY → STATE legacy otherwise.
        return stateFirst
          ? [stateBlock, pincodeBlock, cityBlock]
          : [pincodeBlock, cityBlock, stateBlock];
      })()}

      {/* Consent line — we collect a phone (and optional email) before they hit submit, so the
          privacy promise must be visible BEFORE submission, not just on the confirmation. */}
      <p className="coming-soon-privacy">
        We&apos;ll only use your number to text you when your picks drop — no spam, no sharing.
      </p>

      <button type="submit" className="btn btn-primary coming-soon-submit">
        🔔 Notify me
      </button>
    </form>
  );
}
