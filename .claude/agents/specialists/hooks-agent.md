---
name: hooks-agent
description: "Write the frontend's custom hooks — API/data hooks for every project, plus realtime hooks (useWebRTC etc.) when the PROFILE has realtime: yes. Trigger: New hook or WebRTC/media logic change needed."
model: sonnet
tools: Read, Grep
---

# Hooks Agent — Layer 2 Specialist

> **Step 0 (read profile):** Read the `PROJECT PROFILE` block from the run ledger (see
> `~/varsha-kit/PROJECT-PROFILE.md`). Take the realtime hook/file names, ICE/TURN identity, gateway
> URL, and session entity **from there or from live detection** — never assume FamilyCall's.
> Missing field → detect it, don't guess.
>
> **Activation gate:** Activate only when PROFILE `realtime: yes` (evidence: `coturn/` dir,
> `socket.io` dep, `RTCPeerConnection` in src, a `*videocall*`/`*signaling*` service). **Dormant
> otherwise** — a project without a realtime surface has no WebRTC/blur hooks to write.

**Parent:** Frontend Orchestrator
**Single responsibility:** Write the project's realtime media hooks — a WebRTC connection hook and
(optionally) a background-blur hook — over the project's actual realtime files and session entity.

## useWebRTC (the connection hook)
The session id parameter is the project's actual realtime session key (FamilyCall: `roomId`).
Signaling event names map to the project's signaling contract.

```typescript
// Signature
function useWebRTC(sessionId: string, token: string, gatewayUrl: string): {
  localStream: MediaStream | null;
  peers: Map<string, MediaStream>;
  joined: boolean;
  error: string | null;
  toggleMute: () => void;
  toggleCamera: () => void;
  leave: () => void;
}
```

### ICE / SDP Flow (the HOW — keep regardless of project)
Event names below use generic `join-session`/`session-joined`/… — map them to the project's
signaling contract. The negotiation/buffering logic itself never changes.
```
1. Get local media (getUserMedia video+audio)
2. Connect socket: io(gatewayUrl, { path: '/socket.io', auth: { token } })
3. On connect: emit('join-session', sessionId)
4. On 'session-joined' ({ peers }):
     for each existing peer socketId: create RTCPeerConnection, send offer
5. On 'peer-joined' ({ socketId }):
     create RTCPeerConnection for new peer, send offer
6. On 'offer' ({ fromSocketId, sdp }):
     set remote description, create answer, send back
7. On 'answer' ({ fromSocketId, sdp }):
     set remote description on existing peer connection
8. On 'ice-candidate' ({ fromSocketId, candidate }):
     if peerConnection.remoteDescription is set: addIceCandidate immediately
     else: buffer in candidateQueue[fromSocketId], flush after setRemoteDescription
9. On 'peer-left' ({ socketId }):
     close peer connection, remove from peers Map
10. Cleanup on unmount:
     emit('leave-session'), close all peer connections, stop local tracks, disconnect socket
```

> **Example — FamilyCall (illustrative, not prescriptive):**
> Signature param is `roomId`; events are `join-room` / `room-joined` / `peer-joined` / `offer` /
> `answer` / `ice-candidate` / `peer-left` / `leave-room`. quick-ecommerce maps the same flow onto
> its own `videocall-service` + `signaling` event names.

### RTCPeerConnection Config
Public STUN is fine to keep literal. Any TURN server entry must be read from the project's `.env`
(URL/username/credential), with realm `${TURN_REALM}` (default = project name) — never a baked IP,
realm, or secret.
```typescript
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // + TURN entry from env when present, e.g.:
    //   { urls: import.meta.env.VITE_TURN_URL,
    //     username: import.meta.env.VITE_TURN_USERNAME,
    //     credential: import.meta.env.VITE_TURN_CREDENTIAL }
  ]
};
```

### Key Implementation Rules
- `useRef` for socket and peerConnections Map (not useState — mutations shouldn't trigger re-renders)
- `useState` only for: localStream, peers (Map copy on each update), joined, error
- ICE candidate buffering is MANDATORY — candidates arrive before remote description is set
- Add `ontrack` handler before sending offer/answer (tracks must be ready to receive)
- `peers` Map update: always spread into a new Map to trigger React re-render

## useBackgroundBlur

```typescript
// Signature
function useBackgroundBlur(inputStream: MediaStream | null): {
  outputStream: MediaStream | null;
  isBlurActive: boolean;
  toggleBlur: () => void;
}
```

### MediaPipe Integration
```typescript
// Uses @mediapipe/tasks-vision ImageSegmenter
// Model: selfie_segmentation
// On each video frame: segment → mask → canvas composite (blur background, keep person)
// Output: captureStream() from canvas element

// Fallback: if MediaPipe fails to load → return { outputStream: inputStream, isBlurActive: false }
```

## Output
The project's realtime media hook files, in its own layout.

> **Example — FamilyCall (illustrative, not prescriptive):**
> ```
> Files written:
>   src/hooks/useWebRTC.ts
>   src/hooks/useBackgroundBlur.ts
> ```

## Rules
- No `any` types — all Socket.io event payloads must be typed
- No console.log in production code — use winston (signaling) or silent (frontend)
- Cleanup in useEffect return function — no memory leaks from unclosed peer connections
