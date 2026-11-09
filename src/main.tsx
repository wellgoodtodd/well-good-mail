import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// wgm-link-guard: a link clicked anywhere in the app window itself (a reply's quoted text, a signature preview) opens in
// your normal browser. It never loads inside Well Good Mail, where a fake "sign in again" page could pass for the app.
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (href.startsWith('#')) return;
  e.preventDefault();
  // Inside the text you're writing, a click just places the cursor.
  if (a.closest('[contenteditable="true"]')) return;
  if (/^(https?:|mailto:)/i.test(href.trim())) void import('./lib/platform').then((m) => m.openExternal(href.trim()));
}, true);
