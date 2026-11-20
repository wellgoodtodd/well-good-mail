// To / Cc / Bcc box with contact suggestions.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { parseAddressList } from '../lib/mime';
import { isMachineAddress } from '../lib/machineAddress';
import type { Address, ContactGroup } from '../lib/types';
import { useMenu } from './ui';
import { PersonCard, personItems } from './Person';
import { groupLabel, useMail } from '../lib/mail';

/** A suggestion: one person, or a group that adds everyone in it as separate people you can still take out. */
type Suggestion = { person: Address; group?: undefined } | { group: ContactGroup; person?: undefined };
const keyOf = (s: Suggestion) => (s.group ? `g:${s.group.id}` : s.person.email);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = 'to' | 'cc' | 'bcc';
const FIELD_NAMES: Record<Field, string> = { to: 'To', cc: 'Cc', bcc: 'Bcc' };

export function RecipientField({ label, value, contacts, onAdd, onRemove, autoFocus, placeholder, anyAddress, everyone, onMove }: {
  label: string;
  value: Address[];
  contacts: Address[];
  onAdd: (a: Address[]) => void;
  onRemove: (email: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  /** Offer service addresses too (receipts@..., Hubdoc), not only people. */
  anyAddress?: boolean;
  /** Everyone on the draft (To, Cc and Bcc), for "New group from everyone" on a chip. */
  everyone?: Address[];
  /** Moves someone to another of To, Cc and Bcc (offered on a chip's right-click). */
  onMove?: (email: string, to: Field) => void;
}) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const menu = useMenu();
  const [card, setCard] = useState<{ a: Address; at: DOMRect } | null>(null);
  const id = `rcpt-${label.toLowerCase()}`;

  // The contacts worth offering, worked out once (not on every key press): lower-case names and no machine addresses.
  const people = useMemo(() => contacts.filter((c) => anyAddress || !isMachineAddress(c.email)).map((c) => ({ c, name: (c.name || '').toLowerCase() })), [contacts, anyAddress]);
  const groups = useMail((s) => s.contactGroups);
  const suggestFor = (typed: string): Suggestion[] => {
    const q = typed.trim().toLowerCase();
    if (q.length < 1) return [];
    const taken = new Set(value.map((v) => v.email.toLowerCase()));
    // Groups first: a group whose name starts with what's typed, with someone in it not already added.
    const gs = groups
      .filter((g) => g.members.some((m) => !taken.has(m.email.toLowerCase())) && g.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
      .slice(0, 3)
      .map((g): Suggestion => ({ group: g }));
    const ps = people
      .filter((p) => !taken.has(p.c.email) && (p.c.email.includes(q) || p.name.includes(q)))
      .sort((a, b) => Number(b.c.email.startsWith(q) || b.name.startsWith(q)) - Number(a.c.email.startsWith(q) || a.name.startsWith(q)))
      .slice(0, 8 - gs.length)
      .map((p): Suggestion => ({ person: p.c }));
    return [...gs, ...ps];
  };
  /** A group adds each person in it who isn't on the email yet, as their own chip. */
  const pick = (s: Suggestion) => {
    if (s.person) { onAdd([s.person]); return; }
    const taken = new Set(value.map((v) => v.email.toLowerCase()));
    onAdd(s.group.members.filter((m) => !taken.has(m.email.toLowerCase())));
  };
  const all = everyone && everyone.length ? everyone : value;
  const here = label.toLowerCase() as Field;
  const moveItems = (email: string) => (onMove ? (['to', 'cc', 'bcc'] as Field[]).filter((f) => f !== here).map((f) => ({ label: `Move to ${FIELD_NAMES[f]}`, icon: 'forward' as const, onClick: () => onMove(email, f) })) : []);

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
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); menu.open({ x: e.clientX, y: e.clientY }, personItems(a, [...moveItems(a.email), { label: 'Remove', icon: 'close', onClick: () => onRemove(a.email) }], all)); }}>
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
              pick(suggestions[active]);
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
              <button key={keyOf(s)} className={i === active ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); pick(s); setText(''); }}>
                {s.group ? (
                  <>
                    <div><Icon name="user" size={12} /> {groupLabel(s.group, groups)}</div>
                    <div className="sub">Group: {s.group.members.length === 1 ? '1 person' : `${s.group.members.length} people`}, added one by one</div>
                  </>
                ) : (
                  <>
                    <div>{s.person.name || s.person.email}</div>
                    {s.person.name && <div className="sub">{s.person.email}</div>}
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
