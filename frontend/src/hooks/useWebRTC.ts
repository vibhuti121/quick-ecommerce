import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { DEFAULT_ICE_SERVERS } from '../config';

// ─── Ported from the FamilyCall WebRTC stack (mesh signaling over Socket.IO) ──────────────────
// Two deliberate adaptations from the original FamilyCall hook:
//   1. SAME-ORIGIN socket — io() with no URL, so the connection rides the gateway that serves the
//      SPA (gateway proxies /socket.io/** → signaling-service). No GATEWAY_URL / cross-origin.
//   2. The socket carries the short-lived CALL GRANT (passed in), NOT the login token. The grant is
//      the only credential that admits a socket; signaling-service verifies it with a SEPARATE
//      secret. ICE servers are also passed in (the grant response carries them), falling back to
//      DEFAULT_ICE_SERVERS only when empty.
// Everything else (mesh offer/answer/ICE buffering, chat, screen-share, quality polling) is the
// original logic unchanged.

export interface Peer {
  socketId: string;
  userId: string;
  email: string;
  displayName: string;
  stream: MediaStream | null;
}

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
  isOwn: boolean;
}

export type QualityLevel = 'good' | 'poor' | 'buffering';

export interface PeerQuality {
  level: QualityLevel;
  fps: number;
  packetLoss: number;
}

type StatsSnapshot = {
  framesDecoded: number;
  packetsLost: number;
  packetsReceived: number;
  ts: number;
};

export function useWebRTC(roomId: string, grant: string, iceServers: RTCIceServer[]) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [connected, setConnected] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [peerQualities, setPeerQualities] = useState<Map<string, PeerQuality>>(new Map());

  const [screenSharing, setScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // ICE servers are stable for a call's lifetime; hold them in a ref so createPC never goes stale
  // and the connect effect doesn't re-run when the caller passes a fresh array literal each render.
  const iceServersRef = useRef<RTCIceServer[]>(
    iceServers && iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS,
  );

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceBufRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const facingModeRef = useRef<'user' | 'environment'>('user');
  const statsSnapshotsRef = useRef<Map<string, StatsSnapshot>>(new Map());
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  // Upsert: if peer not in map yet (ontrack fired before peer-joined), create placeholder
  const updatePeer = useCallback((socketId: string, update: Partial<Peer>) => {
    setPeers(prev => {
      const next = new Map(prev);
      const existing = next.get(socketId);
      if (existing) {
        next.set(socketId, { ...existing, ...update });
      } else {
        next.set(socketId, { socketId, userId: '', email: '', displayName: '', stream: null, ...update });
      }
      return next;
    });
  }, []);

  const removePeer = useCallback((socketId: string) => {
    pcsRef.current.get(socketId)?.close();
    pcsRef.current.delete(socketId);
    iceBufRef.current.delete(socketId);
    statsSnapshotsRef.current.delete(socketId);
    setPeers(prev => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
    setPeerQualities(prev => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
  }, []);

  const createPC = useCallback((socketId: string): RTCPeerConnection => {
    const stale = pcsRef.current.get(socketId);
    if (stale) { stale.close(); pcsRef.current.delete(socketId); }
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pcsRef.current.set(socketId, pc);

    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    // If screen sharing is already active when a new peer joins, send them the screen
    if (screenTrackRef.current) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(screenTrackRef.current);
    }

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      updatePeer(socketId, { stream });
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          targetSocketId: socketId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    return pc;
  }, [updatePeer]);

  const flushIceBuf = async (socketId: string, pc: RTCPeerConnection) => {
    const buf = iceBufRef.current.get(socketId) ?? [];
    for (const candidate of buf) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    iceBufRef.current.delete(socketId);
  };

  // Poll WebRTC stats every 2s to detect buffering / poor quality
  useEffect(() => {
    const timer = setInterval(async () => {
      const updates = new Map<string, PeerQuality>();

      for (const [socketId, pc] of pcsRef.current) {
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') continue;
        try {
          const stats = await pc.getStats();
          for (const report of stats.values()) {
            if (report.type !== 'inbound-rtp' || report.kind !== 'video') continue;

            const now = Date.now();
            const prev = statsSnapshotsRef.current.get(socketId);

            if (prev) {
              const dt = (now - prev.ts) / 1000;
              const fps = Math.max(0, Math.round(((report.framesDecoded ?? 0) - prev.framesDecoded) / dt));
              const lostDelta = (report.packetsLost ?? 0) - prev.packetsLost;
              const totalDelta = ((report.packetsReceived ?? 0) - prev.packetsReceived) + lostDelta;
              const packetLoss = totalDelta > 0 ? Math.max(0, Math.round((lostDelta / totalDelta) * 100)) : 0;

              let level: QualityLevel = 'good';
              if (fps < 5 || packetLoss > 20) level = 'buffering';
              else if (fps < 15 || packetLoss > 8) level = 'poor';

              updates.set(socketId, { level, fps, packetLoss });
            }

            statsSnapshotsRef.current.set(socketId, {
              framesDecoded: report.framesDecoded ?? 0,
              packetsLost: report.packetsLost ?? 0,
              packetsReceived: report.packetsReceived ?? 0,
              ts: now,
            });
          }
        } catch {}
      }

      if (updates.size > 0) {
        setPeerQualities(prev => {
          const next = new Map(prev);
          updates.forEach((q, id) => next.set(id, q));
          return next;
        });
      }
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // Higher quality constraints — browser degrades gracefully if unsupported
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Same-origin socket; the GRANT (not the login token) is the credential the signaling-service
      // verifies. path is the gateway-proxied /socket.io.
      const socket = io({
        auth: { token: grant },
        path: '/socket.io',
        transports: ['websocket'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        // On reconnect the old PCs are dead — close and clear everything before rejoining
        pcsRef.current.forEach(pc => pc.close());
        pcsRef.current.clear();
        iceBufRef.current.clear();
        statsSnapshotsRef.current.clear();
        setPeers(new Map());
        setPeerQualities(new Map());
        socket.emit('join-room', roomId);
      });

      socket.on('disconnect', () => setConnected(false));

      socket.on('room-joined', async ({ peers: existingPeers }: { roomId: string; peers: Array<{ socketId: string; userId: string; email: string; displayName: string }> }) => {
        for (const peer of existingPeers) {
          setPeers(prev => {
            const next = new Map(prev);
            if (!next.has(peer.socketId)) {
              next.set(peer.socketId, { ...peer, stream: null });
            }
            return next;
          });
          const pc = createPC(peer.socketId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', { targetSocketId: peer.socketId, sdp: pc.localDescription });
        }
      });

      socket.on('peer-joined', (peer: { socketId: string; userId: string; email: string; displayName: string }) => {
        setPeers(prev => {
          const next = new Map(prev);
          const existing = next.get(peer.socketId);
          // Preserve stream if ontrack already fired before peer-joined arrived
          next.set(peer.socketId, { ...peer, stream: existing?.stream ?? null });
          return next;
        });
      });

      socket.on('offer', async ({ sdp, fromSocketId }: { sdp: RTCSessionDescriptionInit; fromSocketId: string }) => {
        let pc = pcsRef.current.get(fromSocketId);
        if (!pc) pc = createPC(fromSocketId);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushIceBuf(fromSocketId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { targetSocketId: fromSocketId, sdp: pc.localDescription });
      });

      socket.on('answer', async ({ sdp, fromSocketId }: { sdp: RTCSessionDescriptionInit; fromSocketId: string }) => {
        const pc = pcsRef.current.get(fromSocketId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushIceBuf(fromSocketId, pc);
      });

      socket.on('ice-candidate', async ({ candidate, fromSocketId }: { candidate: RTCIceCandidateInit; fromSocketId: string }) => {
        const pc = pcsRef.current.get(fromSocketId);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          const buf = iceBufRef.current.get(fromSocketId) ?? [];
          buf.push(candidate);
          iceBufRef.current.set(fromSocketId, buf);
        }
      });

      socket.on('peer-left', ({ socketId }: { socketId: string }) => {
        removePeer(socketId);
      });

      socket.on('room-full', () => {
        setRoomFull(true);
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        socket.disconnect();
      });

      socket.on('chat-message', ({ from, text, timestamp }: { from: string; text: string; timestamp: number }) => {
        setChatMessages(prev => [...prev, {
          id: `${timestamp}-${Math.random().toString(36).slice(2)}`,
          from,
          text,
          timestamp,
          isOwn: false,
        }]);
      });
    }

    start().catch(console.error);

    return () => {
      cancelled = true;
      socketRef.current?.emit('leave-room', roomId);
      socketRef.current?.disconnect();
      socketRef.current = null;
      pcsRef.current.forEach(pc => pc.close());
      pcsRef.current.clear();
      iceBufRef.current.clear();
      statsSnapshotsRef.current.clear();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      screenTrackRef.current = null;
    };
  }, [roomId, grant, createPC, removePeer]);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMuted(m => !m);
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCameraOff(c => !c);
  }, []);

  const flipCamera = useCallback(async () => {
    const nextFacing = facingModeRef.current === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) { newStream.getTracks().forEach(t => t.stop()); return; }
      facingModeRef.current = nextFacing;
      const oldTrack = localStreamRef.current?.getVideoTracks()[0];
      if (oldTrack) { localStreamRef.current?.removeTrack(oldTrack); oldTrack.stop(); }
      localStreamRef.current?.addTrack(newTrack);
      pcsRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        sender?.replaceTrack(newTrack);
      });
    } catch {}
  }, []);

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    screenTrackRef.current = null;
    setScreenStream(null);
    setScreenSharing(false);
    // Restore camera video track in all peer connections
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) {
      pcsRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        sender?.replaceTrack(cameraTrack);
      });
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const ss = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = ss.getVideoTracks()[0];
      if (!screenTrack) { ss.getTracks().forEach(t => t.stop()); return; }
      screenStreamRef.current = ss;
      screenTrackRef.current = screenTrack;
      setScreenStream(ss);
      setScreenSharing(true);
      pcsRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        sender?.replaceTrack(screenTrack);
      });
      // Auto-stop when user clicks browser's native "Stop sharing" button
      screenTrack.onended = stopScreenShare;
    } catch {
      // User cancelled or permission denied — silent
    }
  }, [stopScreenShare]);

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !socketRef.current) return;
    socketRef.current.emit('chat-message', { text: trimmed });
    setChatMessages(prev => [...prev, {
      id: `own-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from: 'You',
      text: trimmed,
      timestamp: Date.now(),
      isOwn: true,
    }]);
  }, []);

  return {
    localStream, peers, muted, cameraOff, connected, roomFull,
    toggleMute, toggleCamera, flipCamera,
    chatMessages, sendChat,
    peerQualities,
    screenSharing, screenStream, startScreenShare, stopScreenShare,
  };
}
