// The mail store: accounts, messages, what's selected and on screen, the providers, and toasts. Every other part of
// the mail code reads and changes the app's state through here.
import { logLine } from '../activityLog';
import { create } from 'zustand';
import { store } from '../db';
import type { MailProvider } from '../providers/provider';
import { MessageIndex, type Counts } from '../messageIndex';
import type { Account, Address, CalendarEvent, Folder, FollowUp, Message, OutboxItem, Snooze, View } from '../types';
import type { Place } from './views';

export const providers = new Map<string, MailProvider>();

/** Conversations and unread counts, kept up to date as emails change (see messageIndex.ts). */
const index = new MessageIndex((id) => providers.get(id));
export function indexNow(): MessageIndex {
  const s = get();
  index.update(s.messages, s.accounts, s.snoozes);
  return index;
}
/** The sidebar's counts for a given set of messages (the sidebar passes a slightly delayed copy so lists answer first). */
export function countsFor(messages: Record<string, Message>, accounts: Account[], snoozes: Snooze[]): Counts {
  index.update(messages, accounts, snoozes);
  return index.counts();
}
export const providerFor = (accountId: string) => providers.get(accountId);

export interface Toast {
  id: string;
  text: string;
  undo?: () => void;
  action?: { label: string; run: () => void };
  /** Several buttons, like Open and Show in folder. */
  actions?: { label: string; run: () => void }[];
  ttl?: number;
}

export interface MailState {
  ready: boolean;
  accounts: Account[];
  folders: Record<string, Folder[]>;
  messages: Record<string, Message>;
  view: View;
  /** Selected list row: the thread key of the selected conversation. */
  selectedKey?: string;
  selectedKeys: string[];
  searchQuery: string;
  remoteResults: Message[];
  searching: boolean;
  syncing: boolean;
  lastSyncAt?: number;
  outbox: OutboxItem[];
  snoozes: Snooze[];
  followups: FollowUp[];
  events: CalendarEvent[];
  /** Why an account's calendar did not load, by account id. */
  calendarErrors: Record<string, string>;
  /** The calendars each account has, even ones with nothing coming up. */
  calendarNames: Record<string, string[]>;
  dismissed: Set<string>;
  contacts: Address[];
  toasts: Toast[];
  /** The last 20 notes, for the Recent list in the toolbar (this session only). */
  notes: (Toast & { at: number; used?: boolean })[];
  /** A note arrived since Recent was last opened. */
  notesUnseen: boolean;
  /** Draft open inline in the reading pane. */
  inlineDraftId?: string;
  screen: 'mail' | 'reminders' | 'settings' | 'help' | 'aidrafts' | 'scheduled';
  settingsTab: string;
  /** Where you were before, newest last, for the Back button. */
  backStack: Place[];
  /** Conversations just archived, deleted or moved: hidden from the list at once, before the full update runs. */
  goingKeys: string[];
  /** Conversations just flagged or marked read or unread: shown that way at once, before the full update runs. */
  lookKeys: Record<string, { unread?: boolean; flagged?: boolean }>;
  /** Places you went back from, for Forward. Cleared when you go somewhere new. */
  forwardStack: Place[];
  online: boolean;
  filters: ListFilters;
}

export interface ListFilters {
  unread: boolean;
  flagged: boolean;
  attachments: boolean;
  vip: boolean;
  toMe: boolean;
  period: 'any' | 'today' | 'week' | 'month';
  /** Limit a combined view to some accounts ([] = all). */
  accountIds: string[];
}

export const NO_FILTERS: ListFilters = { unread: false, flagged: false, attachments: false, vip: false, toMe: false, period: 'any', accountIds: [] };

export function setFilters(patch: Partial<ListFilters>) {
  set({ filters: { ...get().filters, ...patch } });
}

export const activeFilterCount = (f: ListFilters) =>
  [f.unread, f.flagged, f.attachments, f.vip, f.toMe, f.period !== 'any', f.accountIds.length > 0].filter(Boolean).length;

export const useMail = create<MailState>(() => ({
  ready: false,
  accounts: [],
  folders: {},
  messages: {},
  view: { scope: { type: 'all' }, mailbox: { kind: 'system', folder: 'inbox' } },
  selectedKeys: [],
  searchQuery: '',
  remoteResults: [],
  searching: false,
  syncing: false,
  outbox: [],
  snoozes: [],
  followups: [],
  events: [],
  calendarErrors: {},
  calendarNames: {},
  dismissed: new Set(),
  contacts: [],
  toasts: [],
  notes: [],
  notesUnseen: false,
  screen: 'mail',
  settingsTab: 'accounts',
  backStack: [],
  goingKeys: [],
  lookKeys: {},
  forwardStack: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  filters: NO_FILTERS,
}));

const get = useMail.getState;
const set = useMail.setState;

export function toast(t: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  logLine('note', t.text);
  set({ toasts: [...get().toasts, { ...t, id }], notes: [{ ...t, id, at: Date.now() }, ...get().notes].slice(0, 20), notesUnseen: true });
  setTimeout(() => dismissToast(id), t.ttl ?? 6000);
  return id;
}
export const dismissToast = (id: string) => set({ toasts: get().toasts.filter((t) => t.id !== id) });

export function errorToast(e: unknown, prefix = '') {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(e);
  toast({ text: prefix ? `${prefix}: ${msg}` : msg, ttl: 9000 });
}

export function saveAccount(a: Account) {
  set({ accounts: get().accounts.map((x) => (x.id === a.id ? a : x)) });
  store.putAccount(a);
}

let channel: BroadcastChannel | null = null;
export function broadcast(msg: unknown) {
  try {
    channel ||= new BroadcastChannel('wgm');
    channel.postMessage(msg);
  } catch { /* ignore */ }
}
