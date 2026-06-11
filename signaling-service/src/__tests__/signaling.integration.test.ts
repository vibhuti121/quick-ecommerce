/**
 * Integration tests for the vendored signaling service.
 * Spins up a real Socket.io server (port 0 = OS assigns) and connects real Socket.io clients.
 * No mocking. Exercises OUR contract: admission is by *call grant* (room-bound, aud-checked,
 * separate secret), MAX 3 participants, and a kill-timer at the grant's exp (the 10-min cap).
 */

import { createServer as createHttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server as IoServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { roomManager, MAX_PARTICIPANTS } from '../roomManager';
import { registerSignalingHandlers } from '../handlers/signaling';
import { verifyToken, GRANT_AUDIENCE } from '../auth';

// ── grant minting ─────────────────────────────────────────────────────────────
// auth.ts reads the secret lazily, so setting it before the first verifyToken call suffices.
const GRANT_SECRET = 'integration-grant-secret-at-least-32b!!';
process.env.VIDEOCALL_GRANT_SECRET = GRANT_SECRET;

function makeGrant(
  userId: string,
  email: string,
  displayName: string,
  roomId: string,
  expiresInSec = 600
): string {
  return jwt.sign(
    { sub: userId, email, displayName, roomId, maxParticipants: MAX_PARTICIPANTS, aud: GRANT_AUDIENCE },
    GRANT_SECRET,
    { expiresIn: expiresInSec }
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function waitFor(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timeout (${timeoutMs}ms) waiting for "${event}"`)),
      timeoutMs
    );
    socket.once(event, (data: any) => { clearTimeout(t); resolve(data); });
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── server lifecycle ─────────────────────────────────────────────────────────

let httpServer: ReturnType<typeof createHttpServer>;
let io: IoServer;
let port: number;

beforeAll((done) => {
  httpServer = createHttpServer();
  io = new IoServer(httpServer, { cors: { origin: '*' } });

  // Mirror the exact middleware + kill-timer from index.ts.
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string;
    const payload = verifyToken(token);
    if (!payload) return next(new Error('Unauthorized'));
    socket.data.userId = payload.sub;
    socket.data.email = payload.email;
    socket.data.displayName = payload.displayName || payload.email;
    socket.data.grantRoomId = payload.roomId;
    socket.data.maxParticipants = payload.maxParticipants;
    socket.data.exp = payload.exp;
    next();
  });

  io.on('connection', (socket) => {
    registerSignalingHandlers(io, socket);
    const msUntilExp = (socket.data.exp as number) * 1000 - Date.now();
    const killTimer = setTimeout(() => socket.disconnect(true), Math.max(0, msUntilExp));
    socket.on('disconnect', () => clearTimeout(killTimer));
  });

  httpServer.listen(0, () => {
    port = (httpServer.address() as AddressInfo).port;
    done();
  });
});

afterAll((done) => {
  io.close(done);
});

beforeEach(() => roomManager.clear());

// ── client factory ───────────────────────────────────────────────────────────

function connect(
  userId: string,
  email: string,
  displayName: string,
  roomId: string,
  expiresInSec = 600
): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      auth: { token: makeGrant(userId, email, displayName, roomId, expiresInSec) },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => { socket.disconnect(); reject(err); });
  });
}

function disconnectAll(...sockets: ClientSocket[]) {
  sockets.forEach(s => { try { s.disconnect(); } catch {} });
}

// ── suite: connection & grant auth ───────────────────────────────────────────

describe('connection & grant auth', () => {
  it('rejects a socket with no token', (done) => {
    const bad = ioc(`http://localhost:${port}`, {
      auth: { token: '' }, transports: ['websocket'], reconnection: false,
    });
    bad.once('connect_error', (err) => {
      expect(err.message).toBe('Unauthorized');
      bad.disconnect();
      done();
    });
  });

  it('rejects a token signed with the wrong secret (replayed login JWT is useless here)', (done) => {
    const forged = jwt.sign(
      { sub: 'u1', email: 'a@a.com', roomId: 'r1', maxParticipants: 3, aud: GRANT_AUDIENCE },
      'not-the-grant-secret',
      { expiresIn: '10m' }
    );
    const bad = ioc(`http://localhost:${port}`, {
      auth: { token: forged }, transports: ['websocket'], reconnection: false,
    });
    bad.once('connect_error', (err) => {
      expect(err.message).toBe('Unauthorized');
      bad.disconnect();
      done();
    });
  });

  it('accepts a socket with a valid grant', async () => {
    const alice = await connect('u1', 'alice@test.com', 'Alice', 'room-ok');
    expect(alice.connected).toBe(true);
    alice.disconnect();
  });
});

// ── suite: room binding ──────────────────────────────────────────────────────

describe('room binding — a grant admits exactly its own room', () => {
  it('joining the granted room succeeds', async () => {
    const alice = await connect('u1', 'alice@t.com', 'Alice', 'room-A');
    alice.emit('join-room', 'room-A');
    const joined = await waitFor(alice, 'room-joined');
    expect(joined.roomId).toBe('room-A');
    disconnectAll(alice);
  });

  it('joining a DIFFERENT room than the grant is denied (no admission)', async () => {
    const mallory = await connect('u1', 'm@t.com', 'Mallory', 'room-A');
    mallory.emit('join-room', 'room-B'); // grant was for room-A
    const denied = await waitFor(mallory, 'room-denied');
    expect(denied.roomId).toBe('room-B');
    // and she is NOT seated anywhere
    expect(roomManager.findRoomBySocket(mallory.id!)).toBeNull();
    disconnectAll(mallory);
  });
});

// ── suite: room join + the 3-person cap ──────────────────────────────────────

describe('room join + MAX 3 cap', () => {
  it('first person gets room-joined with empty peer list', async () => {
    const alice = await connect('u1', 'alice@t.com', 'Alice', 'room1');
    alice.emit('join-room', 'room1');
    const joined = await waitFor(alice, 'room-joined');
    expect(joined.roomId).toBe('room1');
    expect(joined.peers).toHaveLength(0);
    disconnectAll(alice);
  });

  it('second person sees the first; first gets peer-joined', async () => {
    const alice = await connect('u1', 'a@t.com', 'Alice', 'room2');
    const bob   = await connect('u2', 'b@t.com', 'Bob',   'room2');

    alice.emit('join-room', 'room2');
    await waitFor(alice, 'room-joined');
    bob.emit('join-room', 'room2');
    const [bobJoined, alicePeerJoined] = await Promise.all([
      waitFor(bob, 'room-joined'),
      waitFor(alice, 'peer-joined'),
    ]);
    expect(bobJoined.peers).toHaveLength(1);
    expect(bobJoined.peers[0].displayName).toBe('Alice');
    expect(alicePeerJoined.socketId).toBe(bob.id);
    disconnectAll(alice, bob);
  });

  it('exactly 3 people can join; each sees the correct existing peers', async () => {
    const clients = await Promise.all([
      connect('u1', 'a@t.com', 'Alice', 'room3'),
      connect('u2', 'b@t.com', 'Bob',   'room3'),
      connect('u3', 'c@t.com', 'Carol', 'room3'),
    ]);
    for (let i = 0; i < clients.length; i++) {
      clients[i].emit('join-room', 'room3');
      const joined = await waitFor(clients[i], 'room-joined');
      expect(joined.peers).toHaveLength(i);
    }
    disconnectAll(...clients);
  });

  it('the 4th person gets room-full (max=3) and is not admitted', async () => {
    const seated = await Promise.all([
      connect('u1', 'a@t.com', 'Alice', 'room-full'),
      connect('u2', 'b@t.com', 'Bob',   'room-full'),
      connect('u3', 'c@t.com', 'Carol', 'room-full'),
    ]);
    for (const c of seated) {
      c.emit('join-room', 'room-full');
      await waitFor(c, 'room-joined');
    }
    const fourth = await connect('u4', 'd@t.com', 'Dave', 'room-full');
    fourth.emit('join-room', 'room-full');
    const fullMsg = await waitFor(fourth, 'room-full');
    expect(fullMsg.max).toBe(3);
    expect(roomManager.findRoomBySocket(fourth.id!)).toBeNull();
    disconnectAll(...seated, fourth);
  });

  it('a slot reopens after someone leaves a full room', async () => {
    const seated = await Promise.all([
      connect('u1', 'a@t.com', 'Alice', 'room-reopen'),
      connect('u2', 'b@t.com', 'Bob',   'room-reopen'),
      connect('u3', 'c@t.com', 'Carol', 'room-reopen'),
    ]);
    for (const c of seated) {
      c.emit('join-room', 'room-reopen');
      await waitFor(c, 'room-joined');
    }
    seated[0].emit('leave-room', 'room-reopen');
    await sleep(60);

    const dave = await connect('u4', 'd@t.com', 'Dave', 'room-reopen');
    dave.emit('join-room', 'room-reopen');
    const joined = await waitFor(dave, 'room-joined');
    expect(joined.peers).toHaveLength(2);
    disconnectAll(seated[1], seated[2], dave);
  });
});

// ── suite: drop & rejoin ─────────────────────────────────────────────────────

describe('drop & rejoin', () => {
  it('abrupt disconnect — remaining peers receive peer-left with the correct socketId', async () => {
    const alice = await connect('u1', 'a@t.com', 'Alice', 'room-drop');
    const bob   = await connect('u2', 'b@t.com', 'Bob',   'room-drop');
    const carol = await connect('u3', 'c@t.com', 'Carol', 'room-drop');
    for (const c of [alice, bob, carol]) {
      c.emit('join-room', 'room-drop');
      await waitFor(c, 'room-joined');
    }
    await sleep(80);

    const carolId = carol.id;
    const aliceLeftP = waitFor(alice, 'peer-left');
    const bobLeftP   = waitFor(bob,   'peer-left');
    carol.disconnect();
    const [aliceLeft, bobLeft] = await Promise.all([aliceLeftP, bobLeftP]);
    expect(aliceLeft.socketId).toBe(carolId);
    expect(bobLeft.socketId).toBe(carolId);
    disconnectAll(alice, bob);
  });

  it('explicit leave-room — remaining peer receives peer-left', async () => {
    const alice = await connect('u1', 'a@t.com', 'Alice', 'room-leave');
    const bob   = await connect('u2', 'b@t.com', 'Bob',   'room-leave');
    alice.emit('join-room', 'room-leave');
    await waitFor(alice, 'room-joined');
    bob.emit('join-room', 'room-leave');
    await Promise.all([waitFor(bob, 'room-joined'), waitFor(alice, 'peer-joined')]);

    const aliceLeftP = waitFor(alice, 'peer-left');
    bob.emit('leave-room', 'room-leave');
    const leftMsg = await aliceLeftP;
    expect(leftMsg.socketId).toBe(bob.id);
    disconnectAll(alice, bob);
  });

  it('last person leaves — room is cleaned up and reopens fresh', async () => {
    const alice = await connect('u1', 'a@t.com', 'Alice', 'room-cleanup');
    alice.emit('join-room', 'room-cleanup');
    await waitFor(alice, 'room-joined');
    const aliceId = alice.id!;
    alice.disconnect();
    await sleep(60);
    expect(roomManager.findRoomBySocket(aliceId)).toBeNull();

    const bob = await connect('u2', 'b@t.com', 'Bob', 'room-cleanup');
    bob.emit('join-room', 'room-cleanup');
    const joined = await waitFor(bob, 'room-joined');
    expect(joined.peers).toHaveLength(0);
    disconnectAll(bob);
  });
});

// ── suite: signal relay ──────────────────────────────────────────────────────

describe('signal relay — offer / answer / ICE / chat', () => {
  async function pair(roomId: string) {
    const alice = await connect('u1', 'a@t.com', 'Alice', roomId);
    const bob   = await connect('u2', 'b@t.com', 'Bob',   roomId);
    alice.emit('join-room', roomId);
    await waitFor(alice, 'room-joined');
    bob.emit('join-room', roomId);
    await Promise.all([waitFor(bob, 'room-joined'), waitFor(alice, 'peer-joined')]);
    return { alice, bob };
  }

  it('offer is routed to the target with the correct fromSocketId', async () => {
    const { alice, bob } = await pair('room-offer');
    const offerPayload = { type: 'offer', sdp: 'v=0...' };
    alice.emit('offer', { targetSocketId: bob.id, sdp: offerPayload });
    const received = await waitFor(bob, 'offer');
    expect(received.sdp).toEqual(offerPayload);
    expect(received.fromSocketId).toBe(alice.id);
    disconnectAll(alice, bob);
  });

  it('answer is routed back to the caller', async () => {
    const { alice, bob } = await pair('room-answer');
    const answerPayload = { type: 'answer', sdp: 'v=0...' };
    bob.emit('answer', { targetSocketId: alice.id, sdp: answerPayload });
    const received = await waitFor(alice, 'answer');
    expect(received.sdp).toEqual(answerPayload);
    expect(received.fromSocketId).toBe(bob.id);
    disconnectAll(alice, bob);
  });

  it('ICE candidates are routed to the correct target', async () => {
    const { alice, bob } = await pair('room-ice');
    const candidate = { candidate: 'candidate:1 1 UDP host', sdpMid: '0' };
    alice.emit('ice-candidate', { targetSocketId: bob.id, candidate });
    const received = await waitFor(bob, 'ice-candidate');
    expect(received.candidate).toEqual(candidate);
    expect(received.fromSocketId).toBe(alice.id);
    disconnectAll(alice, bob);
  });

  it('chat is broadcast to all room members and trimmed to 1000 chars', async () => {
    const { alice, bob } = await pair('room-chat');
    const aliceChatP = waitFor(alice, 'chat-message');
    const bobChatP   = waitFor(bob,   'chat-message');
    alice.emit('chat-message', { text: 'x'.repeat(2000) });
    const [aliceMsg, bobMsg] = await Promise.all([aliceChatP, bobChatP]);
    expect(aliceMsg.from).toBe('Alice');
    expect(aliceMsg.text.length).toBeLessThanOrEqual(1000);
    expect(bobMsg.text.length).toBeLessThanOrEqual(1000);
    disconnectAll(alice, bob);
  });

  it('chat from a socket not in a room is silently ignored', async () => {
    const alice = await connect('u1', 'a@t.com', 'Alice', 'room-ghost');
    alice.emit('chat-message', { text: 'ghost' }); // never joined
    await sleep(100);
    expect(roomManager.findRoomBySocket(alice.id!)).toBeNull();
    disconnectAll(alice);
  });
});

// ── suite: kill-timer (the 10-minute hard cap) ───────────────────────────────

describe('kill-timer enforces the grant exp', () => {
  it('a socket whose grant expires shortly is force-disconnected by the server', async () => {
    // Grant valid for ~2s: passes verify at connect, then the kill-timer drops it.
    const alice = await connect('u1', 'a@t.com', 'Alice', 'room-kill', 2);
    alice.emit('join-room', 'room-kill');
    await waitFor(alice, 'room-joined');
    expect(alice.connected).toBe(true);

    const disconnectReason = await waitFor(alice, 'disconnect', 5000);
    expect(disconnectReason).toBeDefined();
    expect(alice.connected).toBe(false);
    disconnectAll(alice);
  });
});
