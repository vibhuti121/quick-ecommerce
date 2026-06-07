interface HeaderProps {
  itemCount: number;
  onOpenCart: () => void;
}

export default function Header({ itemCount, onOpenCart }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-mark">⚡</span>
          <span className="brand-name">QuickCart</span>
        </div>
        <button className="cart-button" onClick={onOpenCart} aria-label="Open cart">
          <span className="cart-icon">🛒</span>
          <span>Cart</span>
          {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
        </button>
      </div>
    </header>
  );
}
