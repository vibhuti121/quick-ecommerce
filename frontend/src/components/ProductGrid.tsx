import type { Product } from '../types';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: Product[];
  onAdd: (product: Product) => void;
  addingId: number | null;
}

export default function ProductGrid({ products, onAdd, addingId }: ProductGridProps) {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAdd={onAdd}
          adding={addingId === product.id}
        />
      ))}
    </div>
  );
}
