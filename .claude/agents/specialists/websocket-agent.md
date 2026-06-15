---
name: websocket-agent
description: "Socket.io signaling handlers — join-room, peer-joined, offer, answer, ice-candidate, leave. Trigger: Signaling events broken, room join/leave logic change, new real-time event needed."
model: sonnet
tools: Read, Grep, Write, Edit
---

# WebSocket Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` block from the run ledger (see
> `~/varsha-kit/PROJECT-PROFILE.md`). Take the signaling-service path, WebRTC-hook path, and
> session entity **from there or from live detection** — never assume FamilyCall's. Missing field →
> detect it, don't guess.
>
> **Activation gate:** Activate only when PROFILE `realtime: yes` (evidence: `coturn/` dir,
> `socket.io` dep, `RTCPeerConnection` in src, a `*videocall*`/`*signaling*` service). **Dormant
> otherwise.**

**Parent:** Realtime Orchestrator
**Model:** sonnet
**Single responsibility:** Add or modify Socket.io events in the project's signaling service and keep them in sync with the project's frontend WebRTC hook.

## Input
```
event_name: string           // e.g. "screen-share-started"
direction: client→server | server→client | bidirectional
payload: { field: type }[]   // exact payload shape
trigger: string              // when this event fires
```

## Files I Own
The project's signaling handler (server side) — named in the contract / PROFILE. The project's
WebRTC hook is client-side and read-only here (flag changes to the WebRTC Agent). Operate on the
project's actual realtime files.

> **Example — FamilyCall (illustrative, not prescriptive):**
> ```
> signaling-service/src/handlers/signaling.ts   ← server side
> frontend/src/hooks/useWebRTC.ts               ← client side (read-only — flag to WebRTC Agent)
> ```

## Event Contract Template
```typescript
// SERVER (signaling.ts)
socket.on('event-name', (payload: PayloadType) => {
  // 1. validate payload
  // 2. update roomManager state if needed
  // 3. broadcast to target sockets
  targetSocket.emit('event-name', { ...payload, fromSocketId: socket.id });
});

// CLIENT (useWebRTC.ts — flagged to WebRTC Agent to add)
socket.on('event-name', (payload: PayloadType) => {
  // update React state
});
```

## Rules
1. Every server event MUST have a matching client listener — flag to WebRTC Agent if not writing frontend
2. Always type payloads — no `any`
3. Broadcasts: use `io.to(<session-id>).emit()` for session-wide, `io.to(socketId).emit()` for point-to-point (FamilyCall's session id is `roomId`)
4. Never mutate the session-state module directly — call its methods (FamilyCall: `roomManager`)

## Output
```
status: done | blocked | failed
files_changed: [<the project's signaling handler>]   // e.g. (FamilyCall) signaling-service/src/handlers/signaling.ts
data: { events_added: string[], frontend_events_needed: string[] }
blocked_on: "WebRTC Agent must add client listeners for: [events]"
```
