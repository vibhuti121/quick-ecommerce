import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react';
import type { Product } from '../types';
import { formatPrice } from '../api';
import { isComingSoon, HONEY_IMAGE } from '../lib/comingSoon';
import { isGiTagged, isLabTested } from '../lib/provenance';

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
  // Open the product detail drawer. The Add-to-cart button stops propagation so it never also opens it.
  onView: (product: Product) => void;
  adding: boolean;
  // Wishlist heart: filled when saved. Toggling is client-side (localStorage) — see lib/wishlist.ts.
  wished: boolean;
  onToggleWishlist: (product: Product) => void;
}

export default function ProductCard({
  product,
  onAdd,
  onView,
  adding,
  wished,
  onToggleWishlist,
}: ProductCardProps) {
  const origin = product.provenance?.origin;
  const farm = product.provenance?.farm;
  const comingSoon = isComingSoon(product);
  // Editorial-provenance trust signals (Catalogue v2). Honey is exempt — its card stays the teaser.
  const giTagged = !comingSoon && isGiTagged(product);
  const labTested = !comingSoon && isLabTested(product);
  const variantCount = product.variants?.length ?? 0;
  // Honey's catalog imageUrl is a placeholder until launch — show the real MaLLADE jar shot instead.
  const imgSrc = comingSoon ? HONEY_IMAGE : product.imageUrl;

  // 3D tilt — the card leans toward the cursor for a tactile, premium feel. Only on fine pointers
  // (desktop mice) and never under prefers-reduced-motion; touch devices get the flat card.
  const reduce = useReducedMotion();
  const tiltEnabled =
    !reduce &&
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: fine)').matches;
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 300, damping: 22 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 300, damping: 22 });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tiltEnabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 8); // lean left/right
    rotateX.set(-py * 8); // lean up/down
  };
  const handlePointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.article
      className="product-card"
      layout
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
    >
      <motion.div
        className="product-card-inner"
        ref={ref}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={tiltEnabled ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
      >
        <button
          type="button"
          className="product-image product-view"
          onClick={() => onView(product)}
          aria-label={comingSoon ? `Coming soon: ${product.name}` : `View details for ${product.name}`}
        >
          <img src={imgSrc} alt={product.name} loading="lazy" />
          {comingSoon ? (
            <span className="coming-soon-badge">Coming Soon</span>
          ) : (
            <span className="category-badge">{product.category}</span>
          )}
        </button>
        <button
          type="button"
          className={`wishlist-heart ${wished ? 'wishlist-heart--active' : ''}`}
          onClick={(e) => {
            e.stopPropagation(); // toggle without opening the detail drawer
            onToggleWishlist(product);
          }}
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={wished}
        >
          {wished ? '♥' : '♡'}
        </button>
        <div className="product-body">
          {comingSoon ? (
            <>
              <h3 className="product-name product-view-text" onClick={() => onView(product)}>
                {product.name}
              </h3>
              {origin && <span className="product-origin">📍 {origin}</span>}
              <p className="product-description">{product.description}</p>
              <div className="product-footer">
                <button
                  className="btn btn-primary coming-soon-cta"
                  onClick={(e) => {
                    e.stopPropagation(); // open the teaser popup, not the cart
                    onView(product);
                  }}
                >
                  🔔 Notify me
                </button>
              </div>
            </>
          ) : (
            <>
              {(giTagged || labTested) && (
                <div className="product-trust">
                  {giTagged && <span className="gi-badge">GI ✓</span>}
                  {labTested && <span className="trust-chip trust-chip--lab">Lab-tested ✓</span>}
                </div>
              )}
              {origin && <span className="product-origin product-origin--strong">📍 {origin}</span>}
              <h3 className="product-name product-view-text" onClick={() => onView(product)}>
                {product.name}
              </h3>
              {farm && <span className="product-farm">Farmed by {farm}</span>}
              <p className="product-description">{product.description}</p>
              {variantCount > 0 && (
                <span className="product-variants">{variantCount} grades available</span>
              )}
              <div className="product-footer">
                <span className="product-price">{formatPrice(product.price)}</span>
                <button
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.stopPropagation(); // add to cart without opening the detail drawer
                    onAdd(product);
                  }}
                  disabled={adding}
                >
                  {adding ? 'Adding…' : 'Add to cart'}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.article>
  );
}
