// Hard cap of 3 per call (founder requirement). Enforced here server-side AND independently
// asserted via the grant's maxParticipants claim — neither a forged client nor a tampered grant
// can seat a 4th peer.
export const MAX_PARTICIPANTS = 3;

export interface Participant {
  socketId: string;
  userId: string;
  email: string;
  displayName: string;
}

export interface JoinResult {
  success: boolean;
  full: boolean;
  all: Participant[];
}

const rooms = new Map<string, Participant[]>();

export const roomManager = {
  join(roomId: string, participant: Participant): JoinResult {
    const current = rooms.get(roomId) ?? [];
    if (!rooms.has(roomId)) rooms.set(roomId, current);

    // Idempotent: same socket already in room (e.g. duplicate event)
    if (current.some(p => p.socketId === participant.socketId)) {
      return { success: true, full: false, all: current };
    }

    if (current.length >= MAX_PARTICIPANTS) {
      return { success: false, full: true, all: current };
    }

    const next = [...current, participant];
    rooms.set(roomId, next);
    return { success: true, full: false, all: next };
  },

  leave(roomId: string, socketId: string): void {
    const updated = (rooms.get(roomId) || []).filter(p => p.socketId !== socketId);
    if (updated.length === 0) rooms.delete(roomId);
    else rooms.set(roomId, updated);
  },

  getOthers(roomId: string, socketId: string): Participant[] {
    return (rooms.get(roomId) || []).filter(p => p.socketId !== socketId);
  },

  findRoomBySocket(socketId: string): string | null {
    for (const [roomId, participants] of rooms) {
      if (participants.some(p => p.socketId === socketId)) return roomId;
    }
    return null;
  },

  clear(): void {
    rooms.clear();
  },
};
