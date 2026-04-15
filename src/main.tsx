import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Register the service worker. We do this regardless of standalone mode so
// the app shell is cached for offline use after the first visit.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
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
