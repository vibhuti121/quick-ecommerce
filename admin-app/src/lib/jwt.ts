import type { Role } from '@/auth/permissions';

interface JwtClaims {
  sub?: string;
  email?: string;
  displayName?: string;
  role?: Role;
  exp?: number;
}

/**
 * Decode (NOT verify) a JWT's payload to read its claims client-side. Verification is the gateway's
 * job — it re-validates the signature on every /api/** call and is the real access-control boundary.
 * Here we only need the role/displayName to drive UI, so an unverified decode is sufficient and safe.
 */
export function decodeJwt(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(payload)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}
