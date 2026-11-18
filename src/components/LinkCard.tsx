// Links while writing: click one for a small card under it with where it goes, Open, Edit, Copy and Remove, so you
// can check a link before sending. Ctrl+click opens it straight away, as in Word and Outlook.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { Icon } from './Icon';
import { promptLink } from './FormatBar';
import { openExternal } from '../lib/platform';
import { toast } from '../lib/mail';

/** Only web, email and phone links open; anything else stays put. */
export function openLink(href: string) {
  if (/^(https?:|mailto:|tel:)/i.test(href)) void openExternal(href);
  else toast({ text: "That link can't be opened from here." });
}

export function copyLink(href: string) {
  navigator.clipboard?.writeText(href.replace(/^mailto:/i, '')).then(() => toast({ text: 'Copied', ttl: 1500 })).catch(() => {});
}

export function removeLink(editor: Editor) {
  editor.chain().focus().extendMarkRange('link').unsetLink().run();
}

/** The link under a point in the editor, if any. */
export function linkAt(editor: Editor, x: number, y: number): HTMLAnchorElement | undefined {
  const el = document.elementFromPoint(x, y)?.closest('a[href]') as HTMLAnchorElement | null;
  return el && editor.view.dom.contains(el) ? el : undefined;
}

export function LinkCard({ editor }: { editor: Editor | null }) {
  const [card, setCard] = useState<{ href: string; left: number; top: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!a || !dom.contains(a)) { setCard(null); return; }
      const href = a.getAttribute('href') || '';
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); setCard(null); openLink(href); return; }
      const r = a.getBoundingClientRect();
      setCard({ href, left: Math.max(8, Math.min(r.left, window.innerWidth - 468)), top: r.bottom + 6 });
    };
    // Typing, or the cursor leaving the link, puts it away.
    const onSelection = () => { if (!editor.isActive('link')) setCard(null); };
    const onUpdate = () => setCard(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCard(null); };
    const onBlur = () => setCard(null);
    dom.addEventListener('click', onClick);
    dom.addEventListener('keydown', onKey);
    dom.addEventListener('contextmenu', onBlur);
    editor.on('selectionUpdate', onSelection);
    editor.on('update', onUpdate);
    editor.on('blur', onBlur);
    // Scrolling would leave the card behind, so it goes.
    const onScroll = () => setCard(null);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      dom.removeEventListener('click', onClick);
      dom.removeEventListener('keydown', onKey);
      dom.removeEventListener('contextmenu', onBlur);
      editor.off('selectionUpdate', onSelection);
      editor.off('update', onUpdate);
      editor.off('blur', onBlur);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [editor]);

  if (!editor || !card) return null;
  const shown = card.href.replace(/^mailto:/i, '');
  // Pressing a button mustn't take the cursor out of the email (that would close the card first).
  const keep = (e: React.MouseEvent) => e.preventDefault();
  // On the page itself, so a moving or scrolling panel around the editor can't misplace it.
  return createPortal(
    <div className="link-card" style={{ left: card.left, top: card.top }} onMouseDown={keep} role="dialog" aria-label="Link">
      <Icon name="link" size={13} />
      <span className="link-card-url" title={card.href}>{shown}</span>
      <button className="btn small" onClick={() => { setCard(null); openLink(card.href); }} title="Open in your browser (or Ctrl+click the link)">Open</button>
      <button className="icon-btn" title="Edit link" aria-label="Edit link" onClick={() => { setCard(null); void promptLink(editor); }}><Icon name="pen" size={14} /></button>
      <button className="icon-btn" title="Copy link address" aria-label="Copy link address" onClick={() => { copyLink(card.href); setCard(null); }}><Icon name="file" size={14} /></button>
      <button className="icon-btn" title="Remove link" aria-label="Remove link" onClick={() => { setCard(null); removeLink(editor); }}><Icon name="eraser" size={14} /></button>
    </div>,
    document.body,
  );
}
