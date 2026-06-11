import jwt from "jsonwebtoken";

// The signaling service admits a socket ONLY on a valid *call grant* — a short-lived,
// room-bound, single-purpose token minted by videocall-service and signed with a SEPARATE
// secret (VIDEOCALL_GRANT_SECRET). The login JWT (signed with JWT_SECRET) is deliberately
// NOT accepted here: proving "logged in" must not, by itself, admit media. That separation is
// what makes a replayed login token useless against the socket.
//
// Fail-closed by design: no default secret. If VIDEOCALL_GRANT_SECRET is unset, every token is
// rejected (a signing key in source = anyone can forge a grant). The secret is read at call time
// so tests can inject it and a misconfigured deploy can never silently fall back to a weak key.

export const GRANT_AUDIENCE = "videocall-grant";

export interface GrantPayload {
  sub: string;             // userId (gateway-validated upstream; guests rejected at the grant endpoint)
  email: string;
  displayName?: string;
  roomId: string;          // the grant admits exactly ONE room — enforced on join-room
  maxParticipants: number; // 3 — defence-in-depth alongside roomManager's own cap
  aud: string;             // must equal GRANT_AUDIENCE
  iat: number;
  exp: number;             // 10-minute hard cap baked in; the socket cannot outlive it (kill-timer)
}

export function verifyToken(token: string): GrantPayload | null {
  const secret = process.env.VIDEOCALL_GRANT_SECRET;
  if (!secret) {
    // Fail closed — without the grant secret the service can verify nothing.
    return null;
  }
  if (!token) return null;
  try {
    // audience + algorithms are validated by jsonwebtoken itself: a wrong `aud`, a token signed
    // with another secret, an expired `exp`, or an `alg:none` / algorithm-confusion attempt all
    // throw → null. Pinning HS256 forbids attacker-chosen algorithms.
    const payload = jwt.verify(token, secret, {
      audience: GRANT_AUDIENCE,
      algorithms: ["HS256"],
    }) as GrantPayload;
    if (!payload.roomId) return null; // a grant with no room can admit nothing
    return payload;
  } catch {
    return null;
  }
}
