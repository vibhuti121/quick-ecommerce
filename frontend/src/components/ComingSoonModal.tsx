import type { Product } from '../types';
import NotifyForm from './NotifyForm';
import { isComingSoon, HONEY_IMAGE } from '../lib/comingSoon';

interface ComingSoonModalProps {
  open: boolean;
  product: Product | null;
  // Persist interest (browser-local). Phone is required & validated; email is optional (passed only
  // when the user filled a valid one).
  onNotify: (phone: string, email?: string) => void;
  onClose: () => void;
}

// Teaser popup for a not-yet-launched product (honey). Reuses the shared .overlay + .product-modal
// styling and shows the product's per-SKU image/name/description, then the shared <NotifyForm/>
// capture. The form remounts (keyed on product id) so it resets to a fresh state each reopen.
export default function ComingSoonModal({ open, product, onNotify, onClose }: ComingSoonModalProps) {
  if (!open || !product) return null;

  return (
    <>
      <div className="overlay overlay-open" onClick={onClose} />
      <div className="product-modal coming-soon-modal" role="dialog" aria-modal="true" aria-label={`${product.name} — coming soon`}>
        <button className="icon-button product-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="product-modal-main coming-soon-main">
          <div className="product-modal-image">
            {/* Honey's catalog imageUrl is a placeholder until launch — show the real MaLLADE jar
                shot (matches the grid card + carousel) so the teaser always carries the real image. */}
            <img src={isComingSoon(product) ? HONEY_IMAGE : product.imageUrl} alt={product.name} />
            <span className="coming-soon-badge">Coming Soon</span>
          </div>
          <div className="product-modal-info">
            <h3 className="product-modal-name">{product.name}</h3>
            <p className="coming-soon-headline">Launching soon 🍯</p>
            <p className="product-modal-description">{product.description}</p>
            <NotifyForm key={product.id} onNotify={onNotify} />
          </div>
        </div>
      </div>
    </>
  );
}
