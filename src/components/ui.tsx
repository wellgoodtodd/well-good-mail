// Small shared pieces: menus, splitters, formatting helpers.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

export type Brand = 'google' | 'microsoft' | 'icloud' | 'mail';

/** Small marks for the services in the Add account menu. Google and Microsoft draw their own colours; the others follow the text. */
export function BrandMark({ brand }: { brand: Brand }) {
  if (brand === 'google') {
    return (
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" style={{ flex: 'none' }}>
        <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z" />
      </svg>
    );
  }
  if (brand === 'microsoft') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
        <rect x="1" y="1" width="6.5" height="6.5" fill="#F25022" />
        <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7FBA00" />
        <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00A4EF" />
        <rect x="8.5" y="8.5" width="6.5" height="6.5" fill="#FFB900" />
      </svg>
    );
  }
  if (brand === 'icloud') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
        <path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z" />
      </svg>
    );
  }
  return <Icon name="mail" />;
}

export interface MenuItem {
  label?: string;
  icon?: IconName;
  /** A service's mark (Google, Microsoft, iCloud) shown instead of an icon. */
  brand?: Brand;
  kbd?: string;
  onClick?: () => void;
  heading?: string;
  divider?: boolean;
  active?: boolean;
  disabled?: boolean;
  /** Items shown in a flyout beside this one, so long lists stay out of the way. */
  submenu?: MenuItem[];
  /** A colour dot (an account's colour) in place of an icon. */
  dot?: string;
}

export function Menu({ anchor, items, onClose, align = 'left' }: { anchor: DOMRect | { x: number; y: number }; items: MenuItem[]; onClose: () => void; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  const [sub, setSub] = useState<{ at: number; left: number; top: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = 'x' in anchor && !('width' in anchor) ? anchor.x : align === 'right' ? (anchor as DOMRect).right - w : (anchor as DOMRect).left;
    let top = 'x' in anchor && !('width' in anchor) ? anchor.y : (anchor as DOMRect).bottom + 4;
    left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
    if (top + h > window.innerHeight - 6) top = Math.max(6, ('top' in anchor ? (anchor as DOMRect).top : top) - h - 4);
    setPos({ left, top });
  }, [anchor, align]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <>
      <div className="overlay" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="menu" ref={ref} style={pos} role="menu">
        {items.map((it, i) =>
          it.divider ? <hr key={i} /> : it.heading ? (
            <div key={i} className="menu-label">{it.heading}</div>
          ) : it.submenu ? (
            <div
              key={i}
              className="menu-sub"
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const left = r.right + 230 > window.innerWidth ? Math.max(6, r.left - 232) : r.right - 2;
                setSub({ at: i, left, top: Math.max(6, Math.min(r.top - 4, window.innerHeight - 300)) });
              }}
              onMouseLeave={() => setSub((v) => (v && v.at === i ? null : v))}
            >
              <button
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={sub?.at === i}
                onClick={(e) => {
                  const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                  setSub(sub?.at === i ? null : { at: i, left: r.right + 230 > window.innerWidth ? Math.max(6, r.left - 232) : r.right - 2, top: Math.max(6, Math.min(r.top - 4, window.innerHeight - 300)) });
                }}
              >
                {it.brand ? <BrandMark brand={it.brand} /> : it.icon ? <Icon name={it.icon} /> : <span style={{ width: 16, flex: 'none' }} />}
                <span>{it.label}</span>
                <span className="kbd" style={{ display: 'flex' }}><Icon name="chevronRight" size={14} /></span>
              </button>
              {sub?.at === i && (
                <div className="menu submenu" role="menu" style={{ left: sub.left, top: sub.top }}>
                  {it.submenu.map((c, j) => (
                    <button key={j} role="menuitem" className={c.active ? 'active' : ''} disabled={c.disabled} onClick={() => { onClose(); c.onClick?.(); }}>
                      {c.brand ? <BrandMark brand={c.brand} /> : c.icon ? <Icon name={c.icon} /> : <span style={{ width: 16, flex: 'none' }} />}
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button key={i} role="menuitem" className={it.active ? 'active' : ''} disabled={it.disabled} onClick={() => { onClose(); it.onClick?.(); }}>
              {it.dot ? <span className="menu-dot" style={{ background: it.dot }} /> : it.brand ? <BrandMark brand={it.brand} /> : it.icon ? <Icon name={it.icon} /> : <span style={{ width: 16, flex: 'none' }} />}
              <span>{it.label}</span>
              {it.kbd && <span className="kbd">{it.kbd}</span>}
            </button>
          ),
        )}
      </div>
    </>,
    document.body,
  );
}

export function useMenu() {
  const [state, setState] = useState<{ anchor: DOMRect | { x: number; y: number }; items: MenuItem[]; align?: 'left' | 'right' } | null>(null);
  const open = (anchor: DOMRect | { x: number; y: number }, items: MenuItem[], align?: 'left' | 'right') => setState({ anchor, items, align });
  const node = state ? <Menu anchor={state.anchor} items={state.items} align={state.align} onClose={() => setState(null)} /> : null;
  return { open, node };
}

export function Splitter({ onDrag, horizontal = false, onEnd }: { onDrag: (delta: number) => void; horizontal?: boolean; onEnd?: () => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`splitter ${horizontal ? 'horizontal' : ''} ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        let last = horizontal ? e.clientY : e.clientX;
        const move = (ev: PointerEvent) => {
          const now = horizontal ? ev.clientY : ev.clientX;
          onDrag(now - last);
          last = now;
        };
        const up = () => {
          setDragging(false);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          onEnd?.();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- formatting ----------

export function listTime(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (ms >= today.getTime()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (ms >= today.getTime() - 86400000) return 'Yesterday';
  if (ms >= today.getTime() - 6 * 86400000) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fullDate(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const AVATAR_COLOURS = ['#2f6fde', '#c2410c', '#15803d', '#7e22ce', '#be123c', '#0e7490', '#a16207', '#4338ca'];
export function avatarColour(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** The quick Send later choices (the editor's Send arrow, and AI Drafts). */
export function sendLaterOptions(): { label: string; at: number }[] {
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(8, 0, 0, 0);
  const mon = new Date(); mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7)); mon.setHours(8, 0, 0, 0);
  const later = new Date(Date.now() + 3 * 3600000); later.setMinutes(0, 0, 0);
  const opts = [{ label: `Later today (${later.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`, at: later.getTime() }];
  if (later.getDate() !== new Date().getDate()) opts.length = 0;
  const evening = new Date(); evening.setHours(18, 0, 0, 0);
  if (Date.now() < evening.getTime() - 3600000) opts.push({ label: 'This evening (18:00)', at: evening.getTime() });
  opts.push(
    { label: `Tomorrow morning (${t.toLocaleDateString('en-GB', { weekday: 'short' })} 08:00)`, at: t.getTime() },
    { label: 'Monday morning (08:00)', at: mon.getTime() },
  );
  return opts;
}

export function snoozeOptions(): { label: string; at: number }[] {
  const now = new Date();
  const at = (d: Date, h: number, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.getTime(); };
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const nextMon = new Date(now); nextMon.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  const sat = new Date(now); sat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
  const opts = [
    { label: 'In 1 hour', at: Date.now() + 3600000 },
    { label: 'In 3 hours', at: Date.now() + 3 * 3600000 },
  ];
  if (now.getHours() < 17) opts.push({ label: 'This evening (18:00)', at: at(now, 18) });
  opts.push(
    { label: `Tomorrow morning (${tomorrow.toLocaleDateString('en-GB', { weekday: 'short' })} 08:00)`, at: at(tomorrow, 8) },
    { label: `This weekend (Sat 09:00)`, at: at(sat, 9) },
    { label: `Next week (Mon 08:00)`, at: at(nextMon, 8) },
  );
  return opts;
}
