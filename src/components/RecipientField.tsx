// To / Cc / Bcc box with contact suggestions.
import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { parseAddressList } from '../lib/mime';
import type { Address } from '../lib/types';
import { useMenu } from './ui';
import { PersonCard, personItems } from './Person';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RecipientField({ label, value, contacts, onAdd, onRemove, autoFocus }: {
  label: string;
  value: Address[];
  contacts: Address[];
  onAdd: (a: Address[]) => void;
  onRemove: (email: string) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const menu = useMenu();
  const [card, setCard] = useState<{ a: Address; at: DOMRect } | null>(null);
  const id = `rcpt-${label.toLowerCase()}`;

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 1) return [];
    const taken = new Set(value.map((v) => v.email.toLowerCase()));
    return contacts
      .filter((c) => !taken.has(c.email) && (c.email.includes(q) || (c.name || '').toLowerCase().includes(q)))
      .sort((a, b) => Number(b.email.startsWith(q) || (b.name || '').toLowerCase().startsWith(q)) - Number(a.email.startsWith(q) || (a.name || '').toLowerCase().startsWith(q)))
      .slice(0, 8);
  }, [text, contacts, value]);

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
        {suggestions.length > 0 && text && (
          <div className="suggest" role="listbox">
            {suggestions.map((s, i) => (
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
