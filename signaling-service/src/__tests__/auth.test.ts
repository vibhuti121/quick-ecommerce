import jwt from 'jsonwebtoken';
import { verifyToken, GRANT_AUDIENCE } from '../auth';

// auth.ts reads VIDEOCALL_GRANT_SECRET lazily (at call time), so setting it here — before any
// verifyToken call — is enough. A separate secret from the login JWT is the whole point.
const GRANT_SECRET = 'test-grant-secret-at-least-32-bytes-long!!';

beforeAll(() => {
  process.env.VIDEOCALL_GRANT_SECRET = GRANT_SECRET;
});

function signGrant(overrides: Record<string, unknown> = {}, opts: jwt.SignOptions = {}): string {
  const claims = {
    sub: 'user123',
    email: 'test@test.com',
    displayName: 'Tester',
    roomId: 'room-abc',
    maxParticipants: 3,
    aud: GRANT_AUDIENCE,
    ...overrides,
  };
  return jwt.sign(claims, GRANT_SECRET, { expiresIn: '10m', ...opts });
}

describe('verifyToken (call grant)', () => {
  it('returns the payload for a valid, room-bound grant', () => {
    const payload = verifyToken(signGrant());
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user123');
    expect(payload?.roomId).toBe('room-abc');
    expect(payload?.maxParticipants).toBe(3);
    expect(payload?.aud).toBe(GRANT_AUDIENCE);
  });

  it('returns null for a grant signed with the wrong secret (e.g. a replayed login JWT)', () => {
    const token = jwt.sign(
      { sub: 'u1', email: 'a@a.com', roomId: 'room-abc', maxParticipants: 3, aud: GRANT_AUDIENCE },
      'some-other-secret',
      { expiresIn: '10m' }
    );
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null when the audience is wrong (single-purpose enforcement)', () => {
    const token = signGrant({ aud: 'some-other-audience' });
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null for an expired grant (the 10-minute cap)', () => {
    const token = signGrant({}, { expiresIn: '-1s' });
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null for a grant with no roomId (cannot admit any room)', () => {
    const token = jwt.sign(
      { sub: 'u1', email: 'a@a.com', maxParticipants: 3, aud: GRANT_AUDIENCE },
      GRANT_SECRET,
      { expiresIn: '10m' }
    );
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null for an alg:none token (algorithm-confusion attempt)', () => {
    const token = jwt.sign(
      { sub: 'u1', email: 'a@a.com', roomId: 'room-abc', aud: GRANT_AUDIENCE },
      '',
      { algorithm: 'none' as jwt.Algorithm }
    );
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null for empty string and malformed tokens', () => {
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('not.a.token')).toBeNull();
  });

  it('fails closed when VIDEOCALL_GRANT_SECRET is unset', () => {
    const saved = process.env.VIDEOCALL_GRANT_SECRET;
    delete process.env.VIDEOCALL_GRANT_SECRET;
    try {
      expect(verifyToken(signGrant())).toBeNull();
    } finally {
      process.env.VIDEOCALL_GRANT_SECRET = saved;
    }
  });
});
