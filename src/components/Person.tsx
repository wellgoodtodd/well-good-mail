// A person's name or address, wherever it shows (an email's From, To and Cc, and the chips in a draft).
// Click: a small card with Copy, Email and Search emails. Right-click: the full menu.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useMenu, avatarColour, initials, type MenuItem } from './ui';
import { runSearch, toast } from '../lib/mail';
import { startCompose } from '../lib/composeActions';
import type { Address } from '../lib/types';

const copy = (text: string, what: string) => {
  navigator.clipboard?.writeText(text).then(() => toast({ text: `${what} copied`, ttl: 2000 })).catch(() => toast({ text: 'Couldn\'t copy' }));
};
/** A name can wrap onto two lines; the card lines up with the first. */
const firstLine = (el: HTMLElement) => el.getClientRects()[0] || el.getBoundingClientRect();
const full = (a: Address) => (a.name ? `${a.name} <${a.email}>` : a.email);

/** The right-click choices for one address. `extra` adds things like Remove in a draft. */
export function personItems(a: Address, extra: MenuItem[] = []): MenuItem[] {
  const who = a.name || a.email;
  return [
    { heading: who },
    { label: 'Copy address', icon: 'file', onClick: () => copy(a.email, 'Address') },
    ...(a.name ? [{ label: 'Copy name and address', icon: 'file' as const, onClick: () => copy(full(a), 'Name and address') }] : []),
    { divider: true },
    { label: `New email to ${a.name?.split(' ')[0] || a.email}`, icon: 'compose', onClick: () => void startCompose('new', undefined, { extra: { to: [a] } }) },
    { label: 'Show emails with them', icon: 'search', onClick: () => void runSearch(a.email, { everywhere: true }) },
    ...(extra.length ? [{ divider: true as const }, ...extra] : []),
  ];
}

/** A name you can click for a card, or right-click for the menu. */
export function Person({ a, children, className }: { a: Address; children?: ReactNode; className?: string }) {
  const menu = useMenu();
  const [card, setCard] = useState<DOMRect | null>(null);
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        className={`person ${className || ''}`}
        title={full(a)}
        onClick={(e) => { e.stopPropagation(); setCard(firstLine(e.currentTarget as HTMLElement)); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setCard(firstLine(e.currentTarget as HTMLElement)); } }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); menu.open({ x: e.clientX, y: e.clientY }, personItems(a)); }}
      >
        {children ?? (a.name || a.email)}
      </span>
      {card && <PersonCard a={a} anchor={card} onClose={() => setCard(null)} />}
      {menu.node}
    </>
  );
}

export function PersonCard({ a, anchor, onClose }: { a: Address; anchor: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { clearTimeout(t); document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  // Below the name, kept inside the window.
  const width = 280;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const below = anchor.bottom + 6;
  const top = below + 150 > window.innerHeight ? Math.max(8, anchor.top - 156) : below;
  const name = a.name || a.email;
  const act = (fn: () => void) => () => { fn(); onClose(); };
  return (
    <div ref={ref} className="person-card" role="dialog" aria-label={name} style={{ left, top, width }}>
      <div className="person-card-head">
        <span className="avatar" style={{ background: avatarColour(a.email) }}>{initials(name)}</span>
        <div className="person-card-who">
          <strong>{name}</strong>
          {a.name && <span>{a.email}</span>}
        </div>
      </div>
      <div className="person-card-actions">
        <button className="btn small" onClick={act(() => copy(a.email, 'Address'))}><Icon name="file" size={14} /> Copy</button>
        <button className="btn small" onClick={act(() => void startCompose('new', undefined, { extra: { to: [a] } }))}><Icon name="compose" size={14} /> Email</button>
        <button className="btn small" onClick={act(() => void runSearch(a.email, { everywhere: true }))}><Icon name="search" size={14} /> Emails</button>
      </div>
    </div>
  );
}
