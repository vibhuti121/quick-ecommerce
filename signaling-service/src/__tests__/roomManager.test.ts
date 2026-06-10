import { roomManager, MAX_PARTICIPANTS } from '../roomManager';

const p1 = { socketId: 's1', userId: 'u1', email: 'a@a.com', displayName: 'Alice' };
const p2 = { socketId: 's2', userId: 'u2', email: 'b@b.com', displayName: 'Bob' };
const p3 = { socketId: 's3', userId: 'u3', email: 'c@c.com', displayName: 'Carol' };

beforeEach(() => roomManager.clear());

describe('join', () => {
  it('adds first participant and returns success', () => {
    const result = roomManager.join('room1', p1);
    expect(result.success).toBe(true);
    expect(result.full).toBe(false);
    expect(result.all).toHaveLength(1);
    expect(result.all[0]).toMatchObject(p1);
  });

  it('second join returns both participants', () => {
    roomManager.join('room1', p1);
    const result = roomManager.join('room1', p2);
    expect(result.success).toBe(true);
    expect(result.all).toHaveLength(2);
  });

  it('same userId on a different socket is a separate participant (multi-device)', () => {
    roomManager.join('room1', p1);
    const p1device2 = { socketId: 'new-s1', userId: 'u1', email: 'a@a.com', displayName: 'Alice' };
    const result = roomManager.join('room1', p1device2);
    expect(result.success).toBe(true);
    expect(result.all).toHaveLength(2);
  });

  it('same socketId joining again is idempotent (duplicate event)', () => {
    roomManager.join('room1', p1);
    const result = roomManager.join('room1', p1);
    expect(result.success).toBe(true);
    expect(result.all).toHaveLength(1);
  });

  it('different rooms are independent', () => {
    roomManager.join('room1', p1);
    const result = roomManager.join('room2', p2);
    expect(result.success).toBe(true);
    expect(result.all).toHaveLength(1);
    expect(result.all[0]).toMatchObject(p2);
  });
});

describe(`max ${MAX_PARTICIPANTS} participants per room`, () => {
  const makeParticipant = (n: number) => ({
    socketId: `s${n}`,
    userId: `u${n}`,
    email: `user${n}@test.com`,
    displayName: `User${n}`,
  });

  it(`allows exactly ${MAX_PARTICIPANTS} participants to join`, () => {
    for (let i = 1; i <= MAX_PARTICIPANTS; i++) {
      const result = roomManager.join('room1', makeParticipant(i));
      expect(result.success).toBe(true);
      expect(result.full).toBe(false);
    }
    expect(roomManager.getOthers('room1', 'nobody')).toHaveLength(MAX_PARTICIPANTS);
  });

  it(`blocks the ${MAX_PARTICIPANTS + 1}th unique participant`, () => {
    for (let i = 1; i <= MAX_PARTICIPANTS; i++) {
      roomManager.join('room1', makeParticipant(i));
    }
    const result = roomManager.join('room1', makeParticipant(MAX_PARTICIPANTS + 1));
    expect(result.success).toBe(false);
    expect(result.full).toBe(true);
    expect(result.all).toHaveLength(MAX_PARTICIPANTS);
  });

  it('blocks same userId on a new socket when room is at capacity', () => {
    for (let i = 1; i <= MAX_PARTICIPANTS; i++) {
      roomManager.join('room1', makeParticipant(i));
    }
    // same userId, new socket — treated as a new connection, blocked at capacity
    const reconnect = { socketId: 'new-s1', userId: 'u1', email: 'user1@test.com', displayName: 'User1' };
    const result = roomManager.join('room1', reconnect);
    expect(result.success).toBe(false);
    expect(result.full).toBe(true);
    expect(result.all).toHaveLength(MAX_PARTICIPANTS);
  });

  it('allows a new participant after someone leaves a full room', () => {
    for (let i = 1; i <= MAX_PARTICIPANTS; i++) {
      roomManager.join('room1', makeParticipant(i));
    }
    roomManager.leave('room1', 's1');
    const result = roomManager.join('room1', makeParticipant(MAX_PARTICIPANTS + 1));
    expect(result.success).toBe(true);
    expect(result.all).toHaveLength(MAX_PARTICIPANTS);
  });

  it('rooms with different IDs each enforce their own limit independently', () => {
    for (let i = 1; i <= MAX_PARTICIPANTS; i++) {
      roomManager.join('roomA', makeParticipant(i));
    }
    // roomB is a fresh room — should still allow joins
    const result = roomManager.join('roomB', makeParticipant(1));
    expect(result.success).toBe(true);
  });
});

describe('leave', () => {
  it('removes participant from room', () => {
    roomManager.join('room1', p1);
    roomManager.join('room1', p2);
    roomManager.leave('room1', 's1');
    expect(roomManager.getOthers('room1', 's2')).toHaveLength(0);
  });

  it('deletes room when last participant leaves', () => {
    roomManager.join('room1', p1);
    roomManager.leave('room1', 's1');
    expect(roomManager.findRoomBySocket('s1')).toBeNull();
  });

  it('leave from non-existent room does not throw', () => {
    expect(() => roomManager.leave('no-room', 's1')).not.toThrow();
  });
});

describe('getOthers', () => {
  it('returns all participants except the caller', () => {
    roomManager.join('room1', p1);
    roomManager.join('room1', p2);
    roomManager.join('room1', p3);
    const others = roomManager.getOthers('room1', 's1');
    expect(others).toHaveLength(2);
    expect(others.map(p => p.socketId)).not.toContain('s1');
  });

  it('returns empty array for non-existent room', () => {
    expect(roomManager.getOthers('no-room', 's1')).toEqual([]);
  });
});

describe('findRoomBySocket', () => {
  it('finds the room a socket is in', () => {
    roomManager.join('room1', p1);
    expect(roomManager.findRoomBySocket('s1')).toBe('room1');
  });

  it('returns null if socket not in any room', () => {
    expect(roomManager.findRoomBySocket('ghost')).toBeNull();
  });

  it('finds correct room among multiple rooms', () => {
    roomManager.join('room1', p1);
    roomManager.join('room2', p2);
    expect(roomManager.findRoomBySocket('s2')).toBe('room2');
  });
});
