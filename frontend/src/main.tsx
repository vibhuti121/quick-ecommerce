import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
// Self-hosted brand fonts (no runtime CDN): Inter for body, Poppins for display.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './index.css';

// BrowserRouter = the repo's first router (CLAUDE.md §10). Full-screen PAGES get real paths here;
// drawers/modals/overlays (cart, profile, product detail, the ?call= invite, the ?games hub) stay
// state-driven inside App — that's still modern-correct. The nginx SPA fallback (try_files … /index.html)
// makes a hard refresh on a deep path serve index.html instead of 404'ing.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
