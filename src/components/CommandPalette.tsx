// Ctrl+K: type a few letters to jump to an account, folder, setting or action.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useMail, setView, openScreen, refreshAll, runSearch } from '../lib/mail';
import { startCompose } from '../lib/composeActions';
import { checkForUpdates } from '../lib/updater';
import type { SystemFolder } from '../lib/types';

interface Command { id: string; label: string; hint?: string; icon: string; run: () => void }

const FOLDER_NAMES: [SystemFolder, string][] = [
  ['inbox', 'Inbox'], ['drafts', 'Drafts'], ['sent', 'Sent'], ['junk', 'Junk'], ['bin', 'Bin'], ['archive', 'Archive'], ['flagged', 'Flagged'],
];

const SETTINGS_TABS: [string, string][] = [
  ['accounts', 'Accounts'], ['signatures', 'Signatures & addresses'], ['groups', 'Inbox groups'], ['appearance', 'Appearance'], ['writing', 'Composing'],
  ['notifications', 'Notifications & reminders'], ['privacy', 'Privacy'], ['offline', 'Search & storage'], ['shortcuts', 'Keyboard shortcuts'], ['updates', 'Updates'], ['diagnostics', 'Diagnostics'],
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const accounts = useMail((s) => s.accounts);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'k') return;
      // Ctrl+K already means "add a link" inside the email editor.
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.closest?.('[contenteditable="true"]'))) return;
      e.preventDefault();
      setQ(''); setAt(0); setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: 'new', label: 'New email', icon: 'compose', run: () => startCompose('new') },
      { id: 'refresh', label: 'Check for new mail', icon: 'refresh', run: () => refreshAll() },
      { id: 'reminders', label: 'Open Reminders', icon: 'bell', run: () => openScreen('reminders') },
      { id: 'update', label: 'Check for updates', icon: 'download', run: () => { openScreen('settings', 'updates'); checkForUpdates({ userInitiated: true }); } },
    ];
    for (const [folder, name] of FOLDER_NAMES) {
      list.push({ id: `all|${folder}`, label: folder === 'flagged' ? 'Flagged' : `All ${name}`, hint: 'All accounts', icon: 'inbox', run: () => setView({ scope: { type: 'all' }, mailbox: { kind: 'system', folder } }) });
    }
    for (const a of accounts) {
      for (const [folder, name] of FOLDER_NAMES) {
        if (folder === 'flagged') continue;
        list.push({ id: `${a.id}|${folder}`, label: `${a.label}: ${name}`, hint: a.email, icon: 'folder', run: () => setView({ scope: { type: 'account', accountId: a.id }, mailbox: { kind: 'system', folder } }) });
      }
    }
    for (const [tab, name] of SETTINGS_TABS) list.push({ id: `set|${tab}`, label: `Settings: ${name}`, icon: 'settings', run: () => openScreen('settings', tab) });
    return list;
  }, [accounts]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = commands.filter((c) => words.every((w) => `${c.label} ${c.hint || ''}`.toLowerCase().includes(w)));
    // Anything else you type can be sent straight to search.
    return q.trim() ? [...hits.slice(0, 12), { id: 'search', label: `Search all mail for "${q.trim()}"`, icon: 'search', run: () => runSearch(q.trim(), { everywhere: true }) } as Command] : hits.slice(0, 12);
  }, [commands, q]);

  if (!open) return null;
  const go = (c?: Command) => { if (!c) return; setOpen(false); c.run(); };

  return (
    <div className="palette-back" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          placeholder="Go to a mailbox, setting or action..."
          aria-label="Type to find something"
          onChange={(e) => { setQ(e.target.value); setAt(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(shown.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
            else if (e.key === 'Enter') go(shown[at]);
          }}
        />
        <div className="palette-list" role="listbox">
          {shown.map((c, i) => (
            <button key={c.id} className={`palette-item ${i === at ? 'on' : ''}`} role="option" aria-selected={i === at} onMouseEnter={() => setAt(i)} onClick={() => go(c)}>
              <Icon name={c.icon as never} size={15} />
              <span className="grow">{c.label}</span>
              {c.hint && <span className="hint">{c.hint}</span>}
            </button>
          ))}
          {!shown.length && <div className="empty">Nothing matches</div>}
        </div>
      </div>
    </div>
  );
}
