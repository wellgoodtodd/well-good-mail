import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app.css';
import { useSettings } from './lib/settings';
import { setDownloadFolder, clearPreviews, isPopout } from './lib/platform';

// Save uses the downloads folder chosen in Settings (in every window), and old previews are tidied once at start.
setDownloadFolder(useSettings.getState().downloadFolder);
useSettings.subscribe((s) => setDownloadFolder(s.downloadFolder));
if (!isPopout()) setTimeout(() => { void clearPreviews(30).catch(() => { /* nothing to clear */ }); }, 20000);

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
