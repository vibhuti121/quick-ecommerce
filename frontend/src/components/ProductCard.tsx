import type { Product } from '../types';
import { formatPrice } from '../api';

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
  adding: boolean;
  // Open the product detail modal. The Add-to-cart button stops propagation so it never also opens it.
  onSelect: (product: Product) => void;
}

export default function ProductCard({ product, onAdd, adding, onSelect }: ProductCardProps) {
  return (
    <article
      className="product-card product-card-clickable"
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(product);
        }
      }}
    >
      <div className="product-image">
        <img src={product.imageUrl} alt={product.name} loading="lazy" />
        <span className="category-badge">{product.category}</span>
      </div>
      <div className="product-body">
        <h3 className="product-name">{product.name}</h3>
        <p className="product-description">{product.description}</p>
        <div className="product-footer">
          <span className="product-price">{formatPrice(product.price)}</span>
          <button
            className="btn btn-primary"
            onClick={(e) => {
              e.stopPropagation(); // add to cart without opening the detail modal
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
