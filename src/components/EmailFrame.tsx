// Shows an email's HTML in a locked down frame (no scripts) that grows to
// fit its content. Links open in your normal browser.
import { useEffect, useRef, useState } from 'react';
import { openExternal } from '../lib/platform';
import { askConfirm } from '../lib/dialogs';

// The last height each email drew at, so opening it again starts at the right size and nothing jumps.
const heights = new Map<string, number>();
const keyOf = (html: string) => `${html.length}:${html.slice(0, 64)}:${html.slice(-64)}`;

export function EmailFrame({ html, onLinkHover, onContext }: { html: string; onLinkHover: (info: { href: string; mismatch?: string } | null) => void; onContext?: (at: { x: number; y: number; selection: string; link?: { href: string; mismatch: boolean } }) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(() => heights.get(keyOf(html)) || 80);
  // Hidden until the email has drawn, so there's never a flash of an empty white box.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    setHeight(heights.get(keyOf(html)) || 80);
    // Never left invisible: shown after a moment even if the frame doesn't say it has loaded.
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, [html]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const measure = () => { const h = Math.max(60, Math.ceil(doc.documentElement.scrollHeight)); heights.set(keyOf(html), h); setHeight(h); };
      measure();
      requestAnimationFrame(() => setReady(true));
      observer = new ResizeObserver(measure);
      observer.observe(doc.documentElement);
      doc.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
      // Keys pressed with focus inside the email go to the app's shortcuts, so Ctrl+R replies instead of reloading the page.
      doc.addEventListener('keydown', (e) => {
        const copy = new KeyboardEvent('keydown', { key: e.key, code: e.code, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, bubbles: true, cancelable: true });
        window.dispatchEvent(copy);
        if (copy.defaultPrevented) e.preventDefault();
      });
      doc.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const box = frame.getBoundingClientRect();
        const a = (e.target as HTMLElement).closest('a');
        const href = a?.getAttribute('href') || '';
        const link = a && href && !href.startsWith('#') ? { href, mismatch: a.hasAttribute('data-wgm-mismatch') } : undefined;
        onContext?.({ x: box.left + e.clientX, y: box.top + e.clientY, selection: doc.getSelection()?.toString() || '', link });
      });
      doc.addEventListener('click', (e) => {
        const a = (e.target as HTMLElement).closest('a');
        if (!a) return;
        e.preventDefault();
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) return;
        const go = () => { if (/^(https?:|mailto:|tel:)/i.test(href)) openExternal(href); };
        if (a.hasAttribute('data-wgm-mismatch')) {
          askConfirm('This link looks misleading', `It says one thing but really goes to:\n${href}`, 'Open anyway').then((ok) => ok && go());
          return;
        }
        go();
      });
      doc.addEventListener('mouseover', (e) => {
        const a = (e.target as HTMLElement).closest('a');
        if (a) onLinkHover({ href: a.getAttribute('href') || '', mismatch: a.getAttribute('data-wgm-mismatch') || undefined });
      });
      doc.addEventListener('mouseout', (e) => {
        if ((e.target as HTMLElement).closest('a')) onLinkHover(null);
      });
    };
    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      observer?.disconnect();
    };
  }, [html, onLinkHover, onContext]);

  return (
    <iframe
      ref={ref}
      className="email-frame"
      title="Email content"
      // No scripts can run. Same origin only so we can measure height and catch link clicks.
      sandbox="allow-same-origin allow-popups"
      srcDoc={html}
      style={{ height, colorScheme: 'light', opacity: ready ? 1 : 0 }}
    />
  );
}
