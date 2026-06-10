import { useEffect, useRef, useState, useCallback } from 'react';
import { useWebRTC } from '../../hooks/useWebRTC';
import type { Peer, ChatMessage, PeerQuality } from '../../hooks/useWebRTC';

// Full-screen call UI, ported and trimmed from the FamilyCall Room.tsx for the gated storefront call:
//   - no router (a single onLeave prop closes the overlay)
//   - no theme panel / background-blur (FamilyCall-only extras, not vendored)
//   - grid-only layout (≤3 participants, so spotlight/PiP add no value)
//   - de-branded, and the room-full copy reflects the hard max of 3
// Mesh signaling, chat, screen-share and quality dots are the original behaviour, driven by useWebRTC.

interface CallRoomProps {
  roomId: string;
  grant: string;
  iceServers: RTCIceServer[];
  onLeave: () => void;
}

function QualityDot({ quality }: { quality?: PeerQuality }) {
  if (!quality) return null;
  const tip =
    quality.level === 'buffering' ? `Buffering — ${quality.fps} fps, ${quality.packetLoss}% loss` :
    quality.level === 'poor'      ? `Poor — ${quality.fps} fps, ${quality.packetLoss}% loss` :
                                    `Good — ${quality.fps} fps`;
  return <span className={`quality-dot quality-dot--${quality.level}`} title={tip} />;
}

function CameraOffPlaceholder({ label }: { label: string }) {
  const initial = (label || '?').charAt(0).toUpperCase();
  return (
    <div className="camera-off-placeholder">
      <div className="camera-off-avatar">{initial}</div>
      <span className="camera-off-label">{label || 'Guest'}</span>
    </div>
  );
}

function RemoteVideo({ peer, quality }: { peer: Peer; quality?: PeerQuality }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && peer.stream) videoRef.current.srcObject = peer.stream;
  }, [peer.stream]);

  const label = peer.displayName || peer.email || peer.userId || 'Guest';

  return (
    <div className="video-tile">
      {peer.stream ? (
        <video ref={videoRef} autoPlay playsInline className="remote-video" />
      ) : (
        <CameraOffPlaceholder label={label} />
      )}
      {quality?.level === 'buffering' && (
        <div className="buffering-overlay">
          <div className="buffering-ring" />
          <span className="buffering-label">Poor connection</span>
        </div>
      )}
      <QualityDot quality={quality} />
      <span className="tile-label">{label}</span>
    </div>
  );
}

function LocalVideo({
  stream, cameraOff, screenSharing, screenStream,
}: {
  stream: MediaStream | null; cameraOff: boolean; screenSharing: boolean; screenStream: MediaStream | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    if (screenVideoRef.current && screenStream) screenVideoRef.current.srcObject = screenStream;
  }, [screenStream]);

  if (screenSharing && screenStream) {
    return (
      <div className="video-tile local-tile">
        <video ref={screenVideoRef} autoPlay playsInline muted className="screen-preview" />
        <span className="tile-label tile-label--you">You</span>
        <span className="screen-share-badge">🖥️ Sharing screen</span>
      </div>
    );
  }

  return (
    <div className="video-tile local-tile">
      {cameraOff ? (
        <CameraOffPlaceholder label="You" />
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="local-video-base" />
      )}
      <span className="tile-label tile-label--you">You</span>
    </div>
  );
}

function ChatPanel({
  messages, onSend, onClose,
}: {
  messages: ChatMessage[]; onSend: (text: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (text.trim()) { onSend(text); setText(''); }
  }, [text, onSend]);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">Chat</span>
        <button className="chat-close" onClick={onClose} title="Close chat">✕</button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && <p className="chat-empty">No messages yet. Say hi!</p>}
        {messages.map(msg => (
          <div key={msg.id} className={`chat-msg ${msg.isOwn ? 'chat-msg--own' : ''}`}>
            {!msg.isOwn && <span className="chat-sender">{msg.from}</span>}
            <span className="chat-bubble">{msg.text}</span>
            <span className="chat-time">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a message…"
          maxLength={500}
          autoFocus
        />
        <button className="chat-send" onClick={handleSend} disabled={!text.trim()}>Send</button>
      </div>
    </div>
  );
}

export default function CallRoom({ roomId, grant, iceServers, onLeave }: CallRoomProps) {
  const {
    localStream, peers, muted, cameraOff, connected, roomFull,
    toggleMute, toggleCamera, flipCamera,
    chatMessages, sendChat,
    peerQualities,
    screenSharing, screenStream, startScreenShare, stopScreenShare,
  } = useWebRTC(roomId, grant, iceServers);

  const [chatOpen, setChatOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unread, setUnread] = useState(0);
  const prevReceivedRef = useRef(0);

  useEffect(() => {
    const received = chatMessages.filter(m => !m.isOwn).length;
    if (!chatOpen) {
      setUnread(received - prevReceivedRef.current);
    } else {
      setUnread(0);
      prevReceivedRef.current = received;
    }
  }, [chatMessages, chatOpen]);

  const openChat = () => {
    setChatOpen(true);
    prevReceivedRef.current = chatMessages.filter(m => !m.isOwn).length;
    setUnread(0);
  };

  // "Copy invite link" — carries the roomId so an invitee opens the gate and joins THIS room. Every
  // joiner is still independently gated (login + eligible + not-in-cooldown) server-side.
  const copyInvite = useCallback(async () => {
    const link = `${window.location.origin}/?call=${encodeURIComponent(roomId)}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.createElement('input');
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  if (roomFull) {
    return (
      <div className="callroom-overlay">
        <div className="room-full-box">
          <span className="room-full-icon">🚫</span>
          <h2>This room is full</h2>
          <p>A live room can have at most 3 people. Please try again later.</p>
          <button className="btn-primary" onClick={onLeave}>Close</button>
        </div>
      </div>
    );
  }

  const peerList = Array.from(peers.values());

  return (
    <div className="callroom-overlay">
      <header className="callroom-header">
        <span className="callroom-title">Live room</span>
        <div className="callroom-header-right">
          <button className="btn-copy" onClick={copyInvite}>{copied ? 'Copied!' : '+ Invite'}</button>
          <span className={`conn-badge ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'Connected' : 'Connecting…'}
          </span>
        </div>
      </header>

      <div className="callroom-body">
        <div className="video-grid">
          {localStream && (
            <LocalVideo
              stream={localStream}
              cameraOff={cameraOff}
              screenSharing={screenSharing}
              screenStream={screenStream}
            />
          )}
          {peerList.map(peer => (
            <RemoteVideo key={peer.socketId} peer={peer} quality={peerQualities.get(peer.socketId)} />
          ))}
          {peerList.length === 0 && (
            <div className="waiting-msg">
              Waiting for others to join…<br />
              <small>Share the invite link above</small>
            </div>
          )}
        </div>

        {chatOpen && (
          <ChatPanel messages={chatMessages} onSend={sendChat} onClose={() => setChatOpen(false)} />
        )}
      </div>

      <div className="controls-bar">
        <button className={`ctrl-btn${muted ? ' ctrl-btn--off' : ''}`} onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🎤'}
        </button>
        <button className={`ctrl-btn${cameraOff ? ' ctrl-btn--off' : ''}`} onClick={toggleCamera} title={cameraOff ? 'Turn on camera' : 'Turn off camera'}>
          {cameraOff ? '📵' : '📷'}
        </button>
        <button className="ctrl-btn" onClick={flipCamera} title="Flip camera">🔄</button>
        <button
          className={`ctrl-btn${screenSharing ? ' ctrl-btn--active' : ''}`}
          onClick={screenSharing ? stopScreenShare : startScreenShare}
          title={screenSharing ? 'Stop sharing screen' : 'Share screen'}
        >
          🖥️
        </button>
        <button
          className={`ctrl-btn ctrl-btn--chat${chatOpen ? ' ctrl-btn--active' : ''}`}
          onClick={chatOpen ? () => setChatOpen(false) : openChat}
          title="Chat"
        >
          💬
          {unread > 0 && <span className="unread-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button className="ctrl-btn ctrl-btn--leave" onClick={onLeave} title="Leave">Leave</button>
      </div>
    </div>
  );
}
