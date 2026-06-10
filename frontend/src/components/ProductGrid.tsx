import type { Product } from '../types';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: Product[];
  onAdd: (product: Product) => void;
  onView: (product: Product) => void;
  addingId: number | null;
  wishedIds: Set<number>;
  onToggleWishlist: (product: Product) => void;
}

export default function ProductGrid({
  products,
  onAdd,
  onView,
  addingId,
  wishedIds,
  onToggleWishlist,
}: ProductGridProps) {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAdd={onAdd}
          onView={onView}
          adding={addingId === product.id}
          wished={wishedIds.has(product.id)}
          onToggleWishlist={onToggleWishlist}
        />
      ))}
    </div>
  );
}
