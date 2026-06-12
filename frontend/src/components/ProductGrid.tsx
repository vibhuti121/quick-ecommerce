import { AnimatePresence, LayoutGroup } from 'motion/react';
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
  // LayoutGroup + AnimatePresence give the grid a smooth, layout-animated reflow when the set
  // changes (search / filter): cards fade+slide in, removed cards fade out, survivors glide to
  // their new slots instead of snapping. Each card's own `layout` prop (see ProductCard) does the
  // gliding; here we just scope the shared layout context and animate enter/exit.
  return (
    <LayoutGroup>
      <div className="product-grid">
        <AnimatePresence mode="popLayout">
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
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
