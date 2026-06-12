interface HeaderProps {
  itemCount: number;
  onOpenCart: () => void;
  onOpenProfile: () => void;
}

// Catalogue v2: search no longer lives in the header — it folds into the sticky discovery toolbar
// (CatalogControls) as an inline live filter, so the header stays brand + profile + cart.
export default function Header({ itemCount, onOpenCart, onOpenProfile }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-mark">⚡</span>
          <span className="brand-name">QuickCart</span>
        </div>
        <button className="profile-button" onClick={onOpenProfile} aria-label="Open profile">
          <span className="profile-icon">👤</span>
          <span>Profile</span>
        </button>
        <button className="cart-button" onClick={onOpenCart} aria-label="Open cart">
          <span className="cart-icon">🛒</span>
          <span>Cart</span>
          {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
        </button>
      </div>
    </header>
  );
}
