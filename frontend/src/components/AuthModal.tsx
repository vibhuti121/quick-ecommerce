import { useEffect, useState } from 'react';
import { login, register, requestOtp, verifyOtp } from '../api';
import { isValidIndianMobile, normalizeMobile } from '../lib/comingSoon';

// Same light email check NotifyForm uses — we're not the source of truth, just catching typos before
// the round-trip. The backend re-validates the identifier shape too (anti-garbage).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'login' | 'register' | 'otp';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  // Called after a successful sign-in/registration (a real, non-guest JWT is now in localStorage).
  // The parent refreshes getProfile() and closes the modal.
  onAuthed: () => void;
}

// Normalize + validate an email-or-phone identifier the way the backend expects. Phones are reduced to
// the bare 10-digit form (the backend accepts ^\+?[0-9]{8,15}$, so 10 digits passes) and — critically —
// the SAME normalization is used everywhere a phone is sent (register, login, otp request+verify) so a
// number typed as "98765 43210" and "9876543210" resolve to one account.
function normalizeIdentifier(raw: string): { value: string; error: string } {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) {
    if (!EMAIL_RE.test(trimmed)) return { value: '', error: 'Enter a valid email address.' };
    return { value: trimmed.toLowerCase(), error: '' };
  }
  if (!isValidIndianMobile(trimmed)) {
    return { value: '', error: 'Enter a valid email or 10-digit mobile number.' };
  }
  return { value: normalizeMobile(trimmed), error: '' };
}

// Our own sign-in (email/phone + password, or phone-OTP), alongside "Continue with Google". Built on the
// shared .overlay + .product-modal shell and the .coming-soon-* form classes so it matches ComingSoonModal
// / NotifyForm without new styling. Every successful path stores a real JWT and calls onAuthed().
export default function AuthModal({ open, onClose, onAuthed }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('login');

  // Shared password-mode fields.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // OTP-mode fields. otpPhone is the normalized number locked in once "Send code" succeeds, so verify
  // uses exactly what request used. resendIn counts down the 30s throttle (mirrors the backend window).
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset everything whenever the modal closes so reopening is a clean slate (no stale code/error).
  useEffect(() => {
    if (!open) {
      setMode('login');
      setIdentifier('');
      setPassword('');
      setDisplayName('');
      setOtpStep('phone');
      setOtpPhone('');
      setOtpCode('');
      setResendIn(0);
      setError('');
      setBusy(false);
    }
  }, [open]);

  // Resend cooldown ticker — only runs while there's time left.
  useEffect(() => {
    if (resendIn <= 0) return;
    const handle = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(handle);
  }, [resendIn]);

  if (!open) return null;

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setPassword('');
    setOtpStep('phone');
    setOtpCode('');
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { value, error: idError } = normalizeIdentifier(identifier);
    if (idError) {
      setError(idError);
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(value, password, displayName.trim() || undefined);
      } else {
        await login(value, password);
      }
      onAuthed();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!isValidIndianMobile(identifier)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    const phone = normalizeMobile(identifier);
    setBusy(true);
    try {
      const res = await requestOtp(phone);
      setOtpPhone(phone);
      setOtpStep('code');
      setResendIn(30);
      // Dev/CI convenience only: when the backend runs with OTP_DEV_ECHO=true it returns the code so we
      // can prefill it. In production devCode is absent and the user reads it from their SMS.
      setOtpCode(res.devCode ?? '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^[0-9]{4,8}$/.test(otpCode.trim())) {
      setError('Enter the code we sent you.');
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(otpPhone, otpCode.trim());
      onAuthed();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not verify the code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0 || busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await requestOtp(otpPhone);
      setResendIn(30);
      if (res.devCode) setOtpCode(res.devCode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overlay overlay-open" onClick={onClose} />
      <div className="product-modal coming-soon-modal auth-modal" role="dialog" aria-modal="true" aria-label="Sign in">
        <button className="icon-button product-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="auth-modal-body">
          <h3 className="product-modal-name">Welcome to MaLLADE</h3>
          <p className="coming-soon-headline">Sign in to track orders across devices</p>

          <div className="auth-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Log in
            </button>
            <button
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Register
            </button>
            <button
              role="tab"
              aria-selected={mode === 'otp'}
              className={`auth-tab ${mode === 'otp' ? 'auth-tab--active' : ''}`}
              onClick={() => switchMode('otp')}
            >
              Phone OTP
            </button>
          </div>

          {/* ---- password modes (login / register) ---- */}
          {mode !== 'otp' && (
            <form className="coming-soon-form" onSubmit={handlePasswordSubmit} noValidate>
              <label className="coming-soon-label" htmlFor="auth-identifier">
                Email or mobile <span className="coming-soon-req">*</span>
              </label>
              <input
                id="auth-identifier"
                type="text"
                autoComplete="username"
                className="coming-soon-input"
                placeholder="you@example.com or 98765 43210"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (error) setError('');
                }}
                autoFocus
              />

              {mode === 'register' && (
                <>
                  <label className="coming-soon-label" htmlFor="auth-name">
                    Name <span className="coming-soon-optional">(optional)</span>
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    className="coming-soon-input"
                    placeholder="What should we call you?"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </>
              )}

              <label className="coming-soon-label" htmlFor="auth-password">
                Password <span className="coming-soon-req">*</span>
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="coming-soon-input"
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
              />

              {error && <span className="coming-soon-error" role="alert">{error}</span>}

              <button type="submit" className="btn btn-primary coming-soon-submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}
              </button>
            </form>
          )}

          {/* ---- phone-OTP mode (2 steps) ---- */}
          {mode === 'otp' && otpStep === 'phone' && (
            <form className="coming-soon-form" onSubmit={handleSendCode} noValidate>
              <label className="coming-soon-label" htmlFor="auth-otp-phone">
                Mobile number <span className="coming-soon-req">*</span>
              </label>
              <input
                id="auth-otp-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                className="coming-soon-input"
                placeholder="e.g. 98765 43210"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (error) setError('');
                }}
                autoFocus
              />
              {error && <span className="coming-soon-error" role="alert">{error}</span>}
              <button type="submit" className="btn btn-primary coming-soon-submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          )}

          {mode === 'otp' && otpStep === 'code' && (
            <form className="coming-soon-form" onSubmit={handleVerifyCode} noValidate>
              <p className="auth-otp-sent">
                We sent a code to <strong>{otpPhone}</strong>.{' '}
                <button type="button" className="auth-link" onClick={() => { setOtpStep('phone'); setError(''); }}>
                  Change
                </button>
              </p>
              <label className="coming-soon-label" htmlFor="auth-otp-code">
                Verification code <span className="coming-soon-req">*</span>
              </label>
              <input
                id="auth-otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="coming-soon-input"
                placeholder="6-digit code"
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value);
                  if (error) setError('');
                }}
                autoFocus
              />
              {error && <span className="coming-soon-error" role="alert">{error}</span>}
              <button type="submit" className="btn btn-primary coming-soon-submit" disabled={busy}>
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>
              <button
                type="button"
                className="auth-link auth-resend"
                onClick={handleResend}
                disabled={resendIn > 0 || busy}
              >
                {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              </button>
            </form>
          )}

          <div className="auth-divider"><span>or</span></div>
          <a className="btn btn-ghost auth-google" href="/oauth2/authorization/google">
            Continue with Google
          </a>
        </div>
      </div>
    </>
  );
}
