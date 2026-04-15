import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Register the service worker. We do this regardless of standalone mode so
// the app shell is cached for offline use after the first visit.
// BASE_URL ensures correct paths under a sub-path deployment (GitHub Pages).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL; // e.g. "/audio-sampling-machine/"
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // Silent: SW failures shouldn't break the app on dev/preview.
    });
  });
}

// iOS Safari double-tap zoom prevention on UI buttons. We let touchstart
// bubble normally so React handlers still fire; we only block synthetic
// double-tap zoom on .pad / .key elements via CSS touch-action.
document.documentElement.addEventListener(
  'gesturestart',
  (e) => e.preventDefault(),
  { passive: false },
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
