import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Automatic Cloud Backend router for static domain (fx.zadtoo.com on GitHub Pages)
if (typeof window !== 'undefined' && window.location.hostname.includes('zadtoo.com')) {
  const originalFetch = window.fetch;
  const CLOUD_BACKEND = 'https://ais-pre-vplsbzvt35dzg6l6qdryd4-317188159968.europe-west2.run.app';
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = `${CLOUD_BACKEND}${input}`;
    }
    return originalFetch.call(this, input, init);
  };
}

createRoot(document.getElementById('root')!).render(<App />);
