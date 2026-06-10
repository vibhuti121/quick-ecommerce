import { Server, Socket } from "socket.io";
import { roomManager, MAX_PARTICIPANTS } from "../roomManager";

export function registerSignalingHandlers(io: Server, socket: Socket) {
  const { userId, email, displayName, grantRoomId } = socket.data;

  socket.on("join-room", (roomId: string) => {
    // Room binding: the grant admits exactly ONE room. A grant minted for room A cannot be
    // replayed to join room B — the only room this socket may enter is the one in its grant.
    if (roomId !== grantRoomId) {
      socket.emit("room-denied", { roomId });
      return;
    }

    const result = roomManager.join(roomId, { socketId: socket.id, userId, email, displayName });

    if (!result.success) {
      socket.emit("room-full", { roomId, max: MAX_PARTICIPANTS });
      return;
    }

    socket.join(roomId);
    const others = result.all.filter(p => p.socketId !== socket.id);

    // Tell this socket who's already in the room (so it knows to initiate offer)
    socket.emit("room-joined", { roomId, peers: others });

    // Tell existing peers someone new arrived
    others.forEach(p => {
      io.to(p.socketId).emit("peer-joined", {
        socketId: socket.id,
        userId,
        email,
        displayName,
      });
    });
  });

  // SDP Offer: caller → signaling → callee
  socket.on("offer", (payload: { targetSocketId: string; sdp: object }) => {
    io.to(payload.targetSocketId).emit("offer", {
      sdp: payload.sdp,
      fromSocketId: socket.id,
    });
  });

  // SDP Answer: callee → signaling → caller
  socket.on("answer", (payload: { targetSocketId: string; sdp: object }) => {
    io.to(payload.targetSocketId).emit("answer", {
      sdp: payload.sdp,
      fromSocketId: socket.id,
    });
  });

  // ICE candidates flow both directions
  socket.on("ice-candidate", (payload: { targetSocketId: string; candidate: object }) => {
    io.to(payload.targetSocketId).emit("ice-candidate", {
      candidate: payload.candidate,
      fromSocketId: socket.id,
    });
  });

  socket.on("chat-message", ({ text }: { text: string }) => {
    if (typeof text !== 'string' || !text.trim()) return;
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (!roomId) return;
    io.to(roomId).emit("chat-message", {
      from: displayName,
      text: text.trim().slice(0, 1000),
      timestamp: Date.now(),
    });
  });

  socket.on("leave-room", (roomId: string) => {
    handleLeave(roomId);
  });

  socket.on("disconnect", () => {
    const roomId = roomManager.findRoomBySocket(socket.id);
    if (roomId) handleLeave(roomId);
  });

  function handleLeave(roomId: string) {
    const others = roomManager.getOthers(roomId, socket.id);
    roomManager.leave(roomId, socket.id);
    socket.leave(roomId);
    others.forEach(p => {
      io.to(p.socketId).emit("peer-left", { socketId: socket.id, userId });
    });
  }
}
