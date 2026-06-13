import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { UIProvider } from './lib/ui.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UIProvider>
      <App />
    </UIProvider>
  </StrictMode>,
);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then((reg) => {
      console.log('Service worker registered.', reg);
    }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
