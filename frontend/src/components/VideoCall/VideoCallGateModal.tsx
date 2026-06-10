import { useCallback, useEffect, useRef, useState } from 'react';
import { getProfile, recordEligibility, requestGrant } from '../../api';
import type { GrantResult } from '../../api';
import { isLocallyEligible, markLocallyEligible, TALLY_EMBED_URL, isTallySubmitMessage } from '../../lib/videoCall';

export interface CallStart {
  grant: string;
  roomId: string;
  iceServers: RTCIceServer[];
}

interface VideoCallGateModalProps {
  open: boolean;
  // Optional: an invitee opening a shared link joins this room instead of starting a new one.
  joinRoomId?: string;
  onClose: () => void;
  onStartCall: (call: CallStart) => void;
}

// The flow, as internal steps:
//   checking    → resolving identity (guest? already eligible?)
//   login       → guest / not-logged-in: can't start a call, prompt to log in
//   form        → not yet eligible: show the Tally embed; on submit → record + try grant
//   connecting  → POSTing the grant
//   unavailable → the SILENT block: neutral "not available right now" (no reason, no countdown)
//   error       → an unexpected failure (network, etc.) — distinct from the deliberate silent block
type Step = 'checking' | 'login' | 'form' | 'connecting' | 'unavailable' | 'error';

// Maps the grant response's iceServers (List<urls[]>) onto the browser's RTCIceServer shape.
function toRtcIce(grant: GrantResult): RTCIceServer[] {
  return (grant.iceServers ?? []).map(s => ({
    urls: s.urls,
    ...(s.username ? { username: s.username } : {}),
    ...(s.credential ? { credential: s.credential } : {}),
  }));
}

export default function VideoCallGateModal({ open, joinRoomId, onClose, onStartCall }: VideoCallGateModalProps) {
  const [step, setStep] = useState<Step>('checking');
  const submittingRef = useRef(false); // guards against double-fire (Tally message + manual click)

  // Ask the server for a grant; route to the call, the silent block, or an error.
  const tryGrant = useCallback(async () => {
    setStep('connecting');
    try {
      const grant = await requestGrant(joinRoomId);
      if (grant.available && grant.grant && grant.roomId) {
        onStartCall({ grant: grant.grant, roomId: grant.roomId, iceServers: toRtcIce(grant) });
      } else {
        setStep('unavailable'); // the deliberate, reason-free block
      }
    } catch {
      // A 401/403 here means guest/not-logged-in slipped through; anything else is a real failure.
      setStep('error');
    }
  }, [joinRoomId, onStartCall]);

  // After a confirmed Tally submit: record eligibility server-side, remember it locally, then grant.
  const handleEligible = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await recordEligibility();
      markLocallyEligible();
    } catch {
      // recordEligibility throwing (e.g. guest) will surface as unavailable on the grant call below;
      // don't block the flow here.
    }
    await tryGrant();
  }, [tryGrant]);

  // On open, resolve where the user enters the flow.
  useEffect(() => {
    if (!open) return;
    let active = true;
    submittingRef.current = false;
    setStep('checking');
    getProfile()
      .then(profile => {
        if (!active) return;
        if (profile.isGuest) {
          setStep('login');
        } else if (isLocallyEligible()) {
          void tryGrant();
        } else {
          setStep('form');
        }
      })
      .catch(() => {
        if (active) setStep('login'); // can't confirm identity → safest is "please log in"
      });
    return () => { active = false; };
  }, [open, tryGrant]);

  // Listen for Tally's submit message only while the form step is showing.
  useEffect(() => {
    if (!open || step !== 'form') return;
    const onMessage = (e: MessageEvent) => {
      if (typeof e.origin === 'string' && !e.origin.includes('tally.so')) return;
      if (isTallySubmitMessage(e.data)) void handleEligible();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, step, handleEligible]);

  if (!open) return null;

  return (
    <>
      <div className="overlay overlay-open" onClick={onClose} />
      <div className="product-modal videocall-gate-modal" role="dialog" aria-modal="true" aria-label="Talk to us live">
        <button className="icon-button product-modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="videocall-gate-body">
          {step === 'checking' && (
            <div className="videocall-gate-state">
              <div className="spinner" />
              <p>Just a moment…</p>
            </div>
          )}

          {step === 'login' && (
            <div className="videocall-gate-state">
              <span className="videocall-gate-emoji">📹</span>
              <h3>Talk to us live</h3>
              <p>Live video rooms are for signed-in customers. Please log in to your account, then try again.</p>
              <button className="btn-primary videocall-gate-btn" onClick={onClose}>Got it</button>
            </div>
          )}

          {step === 'form' && (
            <div className="videocall-gate-form">
              <span className="videocall-gate-emoji">✨</span>
              <h3>Want a live chat with us?</h3>
              <p className="videocall-gate-sub">
                Tell us a little about what you're looking for and we'll open a live video room for you.
              </p>
              <div className="videocall-tally-wrap">
                <iframe
                  title="Interest form"
                  src={TALLY_EMBED_URL}
                  className="videocall-tally-iframe"
                  loading="lazy"
                />
              </div>
              {/* Fallback for embeds where the submit message doesn't propagate — never blocks the user. */}
              <button className="videocall-gate-skip" onClick={() => void handleEligible()}>
                I've filled the form — continue →
              </button>
            </div>
          )}

          {step === 'connecting' && (
            <div className="videocall-gate-state">
              <div className="spinner" />
              <p>Opening your live room…</p>
            </div>
          )}

          {step === 'unavailable' && (
            <div className="videocall-gate-state">
              <span className="videocall-gate-emoji">🌙</span>
              <h3>Live rooms aren't available right now</h3>
              <p>Thanks for your interest — please check back soon.</p>
              <button className="btn-primary videocall-gate-btn" onClick={onClose}>Close</button>
            </div>
          )}

          {step === 'error' && (
            <div className="videocall-gate-state">
              <span className="videocall-gate-emoji">⚠️</span>
              <h3>Something went wrong</h3>
              <p>We couldn't start a live room just now. Please try again in a bit.</p>
              <button className="btn-primary videocall-gate-btn" onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
