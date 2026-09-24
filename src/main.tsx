import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import App from './App.tsx';
import { UIProvider } from './lib/ui.tsx';
import './index.css';

// Microsoft Clarity (solo se carga si la variable de entorno está definida)
if (import.meta.env.VITE_CLARITY_ID) {
  const script = document.createElement('script');
  script.innerHTML = `
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${import.meta.env.VITE_CLARITY_ID}");
  `;
  document.head.appendChild(script);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Default every Phosphor icon to the duotone weight app-wide. Individual
        icons still control their size via Tailwind width/height classes. */}
    <IconContext.Provider value={{ weight: 'duotone' }}>
      <UIProvider>
        <App />
      </UIProvider>
    </IconContext.Provider>
  </StrictMode>,
);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' }).then((reg) => {
      console.log('Service worker registered.', reg);
    }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
