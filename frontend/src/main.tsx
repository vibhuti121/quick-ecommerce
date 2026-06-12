import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Self-hosted brand fonts (no runtime CDN): Inter for body, Poppins for display.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
