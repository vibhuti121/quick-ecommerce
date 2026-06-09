import SearchBar from './SearchBar';

interface HeaderProps {
  itemCount: number;
  onOpenCart: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
}

export default function Header({
  itemCount,
  onOpenCart,
  query,
  onQueryChange,
  onClearQuery,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-mark">⚡</span>
          <span className="brand-name">QuickCart</span>
        </div>
        <SearchBar value={query} onChange={onQueryChange} onClear={onClearQuery} />
        <button className="cart-button" onClick={onOpenCart} aria-label="Open cart">
          <span className="cart-icon">🛒</span>
          <span>Cart</span>
          {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
        </button>
      </div>
    </header>
  );
}
