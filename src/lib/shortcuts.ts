// Keyboard shortcuts: Apple Mail style defaults (Cmd becomes Ctrl on Windows),
// and every one can be changed in Settings.

export type ShortcutAction =
  | 'newEmail' | 'reply' | 'replyAll' | 'forward' | 'send' | 'refresh' | 'search'
  | 'markUnread' | 'markRead' | 'flag' | 'archive' | 'delete' | 'junk' | 'snooze'
  | 'next' | 'previous' | 'openWindow' | 'toggleSidebar' | 'undo' | 'markAllRead' | 'reminders';

export interface ShortcutDef {
  id: ShortcutAction;
  label: string;
  /** Default key combos. Single letters only apply when single key shortcuts are on. */
  keys: string[];
  /** Also works while writing an email. */
  inComposer?: boolean;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'newEmail', label: 'New email', keys: ['Ctrl+N', 'C'] },
  { id: 'reply', label: 'Reply (switches an open draft too)', keys: ['Ctrl+R', 'R'], inComposer: true },
  { id: 'replyAll', label: 'Reply All (switches an open draft too)', keys: ['Ctrl+Shift+R', 'A'], inComposer: true },
  { id: 'forward', label: 'Forward (switches an open draft too)', keys: ['Ctrl+Shift+F', 'F'], inComposer: true },
  { id: 'send', label: 'Send', keys: ['Ctrl+Enter', 'Ctrl+Shift+D'], inComposer: true },
  { id: 'refresh', label: 'Check for new mail', keys: ['F5', 'Ctrl+Shift+N'] },
  { id: 'search', label: 'Search', keys: ['Ctrl+F', 'Ctrl+E', '/'] },
  { id: 'markUnread', label: 'Mark as unread', keys: ['Ctrl+Shift+U', 'U'] },
  { id: 'markRead', label: 'Mark as read', keys: ['Ctrl+Shift+I'] },
  { id: 'flag', label: 'Flag or unflag', keys: ['Ctrl+Shift+L', 'S'] },
  { id: 'archive', label: 'Archive', keys: ['Ctrl+Shift+A', 'E'] },
  { id: 'delete', label: 'Move to Bin', keys: ['Delete', 'Backspace', '#'] },
  { id: 'junk', label: 'Mark as junk', keys: ['Ctrl+Shift+J'] },
  { id: 'snooze', label: 'Snooze until tomorrow morning', keys: ['B'] },
  { id: 'next', label: 'Next email', keys: ['ArrowDown', 'J'] },
  { id: 'previous', label: 'Previous email', keys: ['ArrowUp', 'K'] },
  { id: 'openWindow', label: 'Open in its own window', keys: ['Enter', 'O'] },
  { id: 'toggleSidebar', label: 'Show or hide the sidebar', keys: ['Ctrl+Shift+S'] },
  { id: 'markAllRead', label: 'Mark everything in this mailbox as read', keys: ['Ctrl+Alt+R'] },
  { id: 'reminders', label: 'Open Reminders', keys: ['Ctrl+Shift+M'] },
  { id: 'undo', label: 'Undo last archive, delete or move', keys: ['Ctrl+Z'] },
];

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift'];

/** Turns a key press into "Ctrl+Shift+U" style text. Returns '' for a lone modifier. */
export function comboFromEvent(e: KeyboardEvent): string {
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return '';
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  // Shift is part of symbols like "#" and "/" already.
  if (e.shiftKey && (k.length > 1 || /[a-z]/i.test(k))) mods.push('Shift');
  let key = k.length === 1 ? k.toUpperCase() : k;
  if (key === ' ') key = 'Space';
  if (key === 'Del') key = 'Delete';
  return [...mods, key].join('+');
}

export function normaliseCombo(c: string): string {
  const parts = c.split('+').map((p) => p.trim()).filter(Boolean);
  const key = parts.pop() || '';
  const mods = MOD_ORDER.filter((m) => parts.some((p) => p.toLowerCase() === m.toLowerCase() || (m === 'Ctrl' && /^(cmd|control)$/i.test(p))));
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
}

export const isSingleKey = (c: string) => !c.includes('+') && c.length === 1;

export function bindingsFor(overrides: Record<string, string[]>): Record<ShortcutAction, string[]> {
  const out = {} as Record<ShortcutAction, string[]>;
  for (const s of SHORTCUTS) out[s.id] = (overrides[s.id] ?? s.keys).map(normaliseCombo);
  return out;
}

/** Which action (if any) a key press triggers. */
export function matchAction(e: KeyboardEvent, overrides: Record<string, string[]>, singleKeys: boolean, opts: { inComposer?: boolean } = {}): ShortcutAction | null {
  const combo = comboFromEvent(e);
  if (!combo) return null;
  const b = bindingsFor(overrides);
  for (const s of SHORTCUTS) {
    if (opts.inComposer && !s.inComposer) continue;
    for (const k of b[s.id]) {
      if (k !== combo) continue;
      if (isSingleKey(k) && (!singleKeys || opts.inComposer)) continue;
      return s.id;
    }
  }
  return null;
}
