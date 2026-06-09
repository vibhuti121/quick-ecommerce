interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

// Controlled search input. The debounce + fetch live in App; this stays a dumb, accessible control
// so it can be reused. The clear (✕) button shows only when there is text to clear.
export default function SearchBar({ value, onChange, onClear }: SearchBarProps) {
  return (
    <div className="search-bar" role="search">
      <span className="search-icon" aria-hidden="true">🔍</span>
      <input
        type="search"
        className="search-input"
        placeholder="Search products…"
        aria-label="Search products"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear search"
          onClick={onClear}
        >
          ✕
        </button>
      )}
    </div>
  );
}
