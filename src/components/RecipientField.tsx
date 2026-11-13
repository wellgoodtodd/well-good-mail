// To / Cc / Bcc box with contact suggestions.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { parseAddressList } from '../lib/mime';
import { isMachineAddress } from '../lib/machineAddress';
import type { Address } from '../lib/types';
import { useMenu } from './ui';
import { PersonCard, personItems } from './Person';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RecipientField({ label, value, contacts, onAdd, onRemove, autoFocus, placeholder, anyAddress }: {
  label: string;
  value: Address[];
  contacts: Address[];
  onAdd: (a: Address[]) => void;
  onRemove: (email: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  /** Offer service addresses too (receipts@..., Hubdoc), not only people. */
  anyAddress?: boolean;
}) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const menu = useMenu();
  const [card, setCard] = useState<{ a: Address; at: DOMRect } | null>(null);
  const id = `rcpt-${label.toLowerCase()}`;

  // The contacts worth offering, worked out once (not on every key press): lower-case names and no machine addresses.
  const people = useMemo(() => contacts.filter((c) => anyAddress || !isMachineAddress(c.email)).map((c) => ({ c, name: (c.name || '').toLowerCase() })), [contacts, anyAddress]);
  const suggestFor = (typed: string) => {
    const q = typed.trim().toLowerCase();
    if (q.length < 1) return [];
    const taken = new Set(value.map((v) => v.email.toLowerCase()));
    return people
      .filter((p) => !taken.has(p.c.email) && (p.c.email.includes(q) || p.name.includes(q)))
      .sort((a, b) => Number(b.c.email.startsWith(q) || b.name.startsWith(q)) - Number(a.c.email.startsWith(q) || a.name.startsWith(q)))
      .slice(0, 8)
      .map((p) => p.c);
  };
  // The lookup waits for a short pause in typing, so each letter shows at once even with a long contact list.
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!text.trim()) { setQuery(text); return; }
    const t = window.setTimeout(() => setQuery(text), 120);
    return () => window.clearTimeout(t);
  }, [text]);
  const shown = useMemo(() => suggestFor(query), [query, people, value]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keys act on what's typed now, even if the list hasn't caught up yet.
  const current = () => (query === text ? shown : suggestFor(text));

  const commit = (raw = text) => {
    const list = parseAddressList(raw.replace(/;/g, ','));
    if (list.length) onAdd(list);
    setText('');
    setActive(0);
  };

  return (
    <div className="comp-field" data-field={label.toLowerCase()}>
      <label htmlFor={id}>{label}</label>
      <div className="chips" onClick={() => inputRef.current?.focus()}>
        {value.map((a) => (
          <span key={a.email} className={`chip ${EMAIL_RE.test(a.email) ? '' : 'invalid'}`} title={EMAIL_RE.test(a.email) ? a.email : `${a.email} doesn't look like an email address`}
            onClick={(e) => { e.stopPropagation(); setCard({ a, at: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); menu.open({ x: e.clientX, y: e.clientY }, personItems(a, [{ label: 'Remove', icon: 'close', onClick: () => onRemove(a.email) }])); }}>
            {a.name || a.email}
            <button aria-label={`Remove ${a.email}`} onClick={(e) => { e.stopPropagation(); onRemove(a.email); }}><Icon name="close" size={12} /></button>
          </span>
        ))}
        {card && <PersonCard a={card.a} anchor={card.at} onClose={() => setCard(null)} />}
        {menu.node}
        <input
          id={id}
          ref={inputRef}
          value={text}
          autoFocus={autoFocus}
          placeholder={value.length ? undefined : placeholder}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]\s*$/.test(v)) commit(v.replace(/[,;]\s*$/, ''));
            else { setText(v); setActive(0); }
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (/[,;\n]/.test(t)) { e.preventDefault(); commit(t.replace(/\n/g, ',')); }
          }}
          onKeyDown={(e) => {
            const suggestions = e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab' ? current() : [];
            if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
            } else if ((e.key === 'Enter' || e.key === 'Tab') && suggestions.length && text) {
              e.preventDefault();
              onAdd([suggestions[active]]);
              setText('');
            } else if ((e.key === 'Enter' || e.key === 'Tab') && text.trim()) {
              if (e.key === 'Enter') e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !text && value.length) {
              onRemove(value[value.length - 1].email);
            }
          }}
          onBlur={() => text.trim() && commit()}
        />
        {shown.length > 0 && text && (
          <div className="suggest" role="listbox">
            {shown.map((s, i) => (
              <button key={s.email} className={i === active ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); onAdd([s]); setText(''); }}>
                <div>{s.name || s.email}</div>
                {s.name && <div className="sub">{s.email}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
