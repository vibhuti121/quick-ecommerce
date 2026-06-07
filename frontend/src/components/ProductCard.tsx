import type { Product } from '../types';
import { formatPrice } from '../api';

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
  adding: boolean;
}

export default function ProductCard({ product, onAdd, adding }: ProductCardProps) {
  return (
    <article className="product-card">
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
            onClick={() => onAdd(product)}
            disabled={adding}
          >
            {adding ? 'Adding…' : 'Add to cart'}
          </button>
        </div>
      </div>
    </article>
  );
}
