import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Self-hosted brand fonts (Iteration 0): Inter for body/UI, Fraunces for display headings.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
