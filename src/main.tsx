import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Only proxy /api/* on static hosting if an explicit external Node backend URL is configured via VITE_API_BASE_URL
const externalBackend = ((import.meta as any).env?.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
if (
  typeof window !== 'undefined' &&
  externalBackend &&
  (window.location.hostname.includes('zadtoo.com') ||
    window.location.hostname.endsWith('.web.app') ||
    window.location.hostname.endsWith('.firebaseapp.com'))
) {
  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = `${externalBackend}${input}`;
    }
    return originalFetch.call(this, input, init);
  };
}

createRoot(document.getElementById('root')!).render(<App />);
