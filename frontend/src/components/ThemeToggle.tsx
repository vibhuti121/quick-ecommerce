import { useEffect, useState } from 'react';

// Self-contained dark/light toggle (Iteration 10). The theme lives on <html data-theme>; the
// pre-paint script in index.html sets the initial value (saved choice → OS preference). No
// props, so this drops into the Header without touching any prop contract.
type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  // Sync from the DOM on mount (the init script already applied it before React rendered).
  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const toggle = () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('mallade-theme', next);
    } catch {
      /* storage disabled — still applies for this session */
    }
    setTheme(next);
  };

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span aria-hidden="true">{isDark ? '☀️' : '🌙'}</span>
    </button>
  );
}
