import type { NotifyTopic } from '../lib/updates';
import NotifyForm from './NotifyForm';

interface NotifyModalProps {
  open: boolean;
  topic: NotifyTopic | null;
  // Persist interest for `topic` (browser-local). Phone required & validated; email optional.
  onNotify: (phone: string, email?: string) => void;
  onClose: () => void;
}

// Topic-driven notify popup opened from a carousel banner's "🔔 Notify me" button. Self-contained off
// the NotifyTopic (image/icon/badge/title/blurb) and reuses the same .overlay + .product-modal shell
// and the shared <NotifyForm/> capture as the honey product popup. The form remounts (keyed on topic
// key) so it resets when the visitor switches banners.
export default function NotifyModal({ open, topic, onNotify, onClose }: NotifyModalProps) {
  if (!open || !topic) return null;

  return (
    <>
      <div className="overlay overlay-open" onClick={onClose} />
      <div className="product-modal coming-soon-modal" role="dialog" aria-modal="true" aria-label={`${topic.title} — notify me`}>
        <button className="icon-button product-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="product-modal-main coming-soon-main">
          <div className="product-modal-image">
            <img src={topic.image} alt={topic.title} />
            <span className="coming-soon-badge">{topic.badge}</span>
          </div>
          <div className="product-modal-info">
            <h3 className="product-modal-name">{topic.title}</h3>
            <p className="coming-soon-headline">
              <span aria-hidden="true">{topic.icon}</span> Get alerts
            </p>
            <p className="product-modal-description">{topic.blurb}</p>
            <NotifyForm key={topic.key} onNotify={onNotify} />
          </div>
        </div>
      </div>
    </>
  );
}
