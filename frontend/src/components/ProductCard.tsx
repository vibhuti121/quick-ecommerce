import type { Product } from '../types';
import { formatPrice } from '../api';
import { isComingSoon } from '../lib/comingSoon';

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
  const gi = product.provenance?.gi;
  const origin = product.provenance?.origin;
  const comingSoon = isComingSoon(product);
  return (
    <article className="product-card">
      <button
        type="button"
        className="product-image product-view"
        onClick={() => onView(product)}
        aria-label={comingSoon ? `Coming soon: ${product.name}` : `View details for ${product.name}`}
      >
        <img src={product.imageUrl} alt={product.name} loading="lazy" />
        {comingSoon ? (
          <span className="coming-soon-badge">Coming Soon</span>
        ) : (
          <span className="category-badge">{product.category}</span>
        )}
        {gi?.status === 'authorized' && <span className="gi-badge gi-badge-card">GI ✓</span>}
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
        <h3 className="product-name product-view-text" onClick={() => onView(product)}>
          {product.name}
        </h3>
        {origin && <span className="product-origin">📍 {origin}</span>}
        <p className="product-description">{product.description}</p>
        {comingSoon ? (
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
        ) : (
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
        )}
      </div>
    </article>
  );
}
