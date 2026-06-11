import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { verifyToken } from "./auth";
import { registerSignalingHandlers } from "./handlers/signaling";
import { logger } from "./logger";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

// Grant validation on every socket connection. The grant — NOT the login JWT — is the only thing
// that admits a socket (see auth.ts). Its claims are pinned onto socket.data so the room-binding
// check and the kill-timer below can enforce the call's room and 10-minute lifetime.
io.use((socket, next) => {
  const token =
    (socket.handshake.auth.token as string) ||
    (socket.handshake.query.token as string);

  const payload = verifyToken(token);
  if (!payload) {
    logger.warn({ event: 'grant-error', socketId: socket.id });
    return next(new Error("Unauthorized"));
  }

  socket.data.userId = payload.sub;
  socket.data.email = payload.email;
  socket.data.displayName = payload.displayName || payload.email;
  socket.data.grantRoomId = payload.roomId;
  socket.data.maxParticipants = payload.maxParticipants;
  socket.data.exp = payload.exp; // seconds since epoch — the hard session cap
  next();
});

io.on("connection", (socket) => {
  logger.info({ event: 'connect', email: socket.data.email, socketId: socket.id });
  registerSignalingHandlers(io, socket);

  // Kill-timer: force-drop the socket at the grant's exp (the 10-minute hard cap), even if the
  // client never re-emits. jsonwebtoken already rejects an expired grant at *connect* time; this
  // closes the gap for a socket that connected just before exp and would otherwise linger.
  const msUntilExp = (socket.data.exp as number) * 1000 - Date.now();
  const killTimer = setTimeout(() => {
    logger.info({ event: 'grant-expired-kill', email: socket.data.email, socketId: socket.id });
    socket.disconnect(true);
  }, Math.max(0, msUntilExp));

  socket.on("disconnect", () => {
    clearTimeout(killTimer);
    logger.info({ event: 'disconnect', email: socket.data.email, socketId: socket.id });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  logger.info({ event: 'startup', port: PORT });
});
