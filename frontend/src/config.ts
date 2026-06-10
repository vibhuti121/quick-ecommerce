// WebRTC client config for the gated video-call feature (Phase 3).
//
// The socket connects SAME-ORIGIN: the storefront is served by the gateway, which proxies
// /socket.io/** to the signaling-service, so the hook calls io() with no URL. There is no
// GATEWAY_URL here on purpose — a cross-origin socket would defeat the same-origin TLS edge.
//
// ICE servers normally arrive WITH the grant (the videocall-service returns them so STUN/TURN
// config is owned server-side). DEFAULT_ICE_SERVERS is only a fallback for when that list is
// empty — public Google STUN is enough to connect two browsers on one LAN; real NAT traversal
// needs the coturn TURN relay, which the backend injects into the grant response in prod.
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];
