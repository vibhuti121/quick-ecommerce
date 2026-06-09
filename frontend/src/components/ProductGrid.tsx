import type { Product } from '../types';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: Product[];
  onAdd: (product: Product) => void;
  addingId: number | null;
  onSelect: (product: Product) => void;
}

export default function ProductGrid({ products, onAdd, addingId, onSelect }: ProductGridProps) {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAdd={onAdd}
          adding={addingId === product.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
