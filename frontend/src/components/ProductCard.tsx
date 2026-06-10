import type { Product } from '../types';
import { formatPrice } from '../api';

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
  // Open the product detail drawer. The Add-to-cart button stops propagation so it never also opens it.
  onView: (product: Product) => void;
  adding: boolean;
}

export default function ProductCard({ product, onAdd, onView, adding }: ProductCardProps) {
  const gi = product.provenance?.gi;
  const origin = product.provenance?.origin;
  return (
    <article className="product-card">
      <button
        type="button"
        className="product-image product-view"
        onClick={() => onView(product)}
        aria-label={`View details for ${product.name}`}
      >
        <img src={product.imageUrl} alt={product.name} loading="lazy" />
        <span className="category-badge">{product.category}</span>
        {gi?.status === 'authorized' && <span className="gi-badge gi-badge-card">GI ✓</span>}
      </button>
      <div className="product-body">
        <h3 className="product-name product-view-text" onClick={() => onView(product)}>
          {product.name}
        </h3>
        {origin && <span className="product-origin">📍 {origin}</span>}
        <p className="product-description">{product.description}</p>
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
      </div>
    </article>
  );
}
