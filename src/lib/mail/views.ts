// Where you are: the mailbox, the selected conversation, Back and Forward, and searching.
import { searchMessages, toGmailQuery } from '../search';
import type { MailboxRef, Message, SystemFolder, View } from '../types';
import { putMessages } from './messages';
import { type MailState, indexNow, providers, useMail } from './store';

const get = useMail.getState;
const set = useMail.setState;

/** A place you can go back to: the screen, the mailbox and the email that was open. */
export interface Place { screen: MailState['screen']; view: View; settingsTab: string; selectedKey?: string }
const samePlace = (a: Place, b: Place) => a.screen === b.screen && (a.screen === 'settings' ? a.settingsTab === b.settingsTab : a.screen !== 'mail' || JSON.stringify(a.view) === JSON.stringify(b.view));

/** Notes where you are now, before going somewhere else. */
function remember(next: Partial<Place>) {
  const s = get();
  const here: Place = { screen: s.screen, view: s.view, settingsTab: s.settingsTab, selectedKey: s.selectedKey };
  const there: Place = { ...here, ...next };
  if (samePlace(here, there)) return;
  set({ backStack: [...s.backStack, here].slice(-30), forwardStack: [] });
}

const placeNow = (): Place => { const s = get(); return { screen: s.screen, view: s.view, settingsTab: s.settingsTab, selectedKey: s.selectedKey }; };
const goTo = (place: Place) => ({ screen: place.screen, view: place.view, settingsTab: place.settingsTab, selectedKey: place.selectedKey, selectedKeys: place.selectedKey ? [place.selectedKey] : [], inlineDraftId: undefined });

/** Back to where you were: the screen, the mailbox and the email that was open. */
export function goBack() {
  const stack = get().backStack;
  const place = stack[stack.length - 1];
  if (!place) return;
  set({ backStack: stack.slice(0, -1), forwardStack: [...get().forwardStack, placeNow()].slice(-30), ...goTo(place) });
}

/** Forward again, after going back. */
export function goForward() {
  const stack = get().forwardStack;
  const place = stack[stack.length - 1];
  if (!place) return;
  set({ forwardStack: stack.slice(0, -1), backStack: [...get().backStack, placeNow()].slice(-30), ...goTo(place) });
}

export function setView(view: View) {
  remember({ screen: 'mail', view });
  set({ view, selectedKey: undefined, selectedKeys: [], screen: 'mail', inlineDraftId: undefined });
}

export function selectThread(key: string | undefined, opts: { additive?: boolean; range?: string[] } = {}) {
  if (!key) return set({ selectedKey: undefined, selectedKeys: [] });
  if (opts.range) return set({ selectedKeys: opts.range, selectedKey: key });
  if (opts.additive) {
    const cur = get().selectedKeys;
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    return set({ selectedKeys: next, selectedKey: key });
  }
  set({ selectedKey: key, selectedKeys: [key], inlineDraftId: undefined });
}

export function messagesInThread(key: string): Message[] {
  const all = get().messages;
  return indexNow().idsIn(key).map((id) => all[id]).filter(Boolean).sort((a, b) => a.date - b.date);
}

export function openScreen(screen: MailState['screen'], settingsTab?: string) {
  remember({ screen, ...(settingsTab ? { settingsTab } : {}) });
  set({ screen, ...(settingsTab ? { settingsTab } : {}) });
}

let searchSeq = 0;
/** Searches the mailbox you are looking at, unless `everywhere` says to search all mail. */
export async function runSearch(query: string, opts: { everywhere?: boolean } = {}) {
  const q = query.trim();
  const cur = get().view.mailbox;
  if (!q) {
    searchSeq++;
    set({ searchQuery: '', remoteResults: [], searching: false });
    // Clearing goes back to where the search started.
    if (cur.kind === 'search') setView({ scope: get().view.scope, mailbox: cur.within || { kind: 'system', folder: 'inbox' } });
    return;
  }
  const within = opts.everywhere ? undefined : cur.kind === 'search' ? cur.within : cur;
  if (cur.kind !== 'search') remember({ screen: 'mail', view: { scope: get().view.scope, mailbox: { kind: 'search', query: q, within } } });
  set({ searchQuery: q, view: { scope: get().view.scope, mailbox: { kind: 'search', query: q, within } }, selectedKey: undefined, selectedKeys: [], screen: 'mail', remoteResults: [] });
  const seq = ++searchSeq;
  if (!get().online) return;
  set({ searching: true });
  try {
    // Also ask the servers so older mail (beyond what's kept offline) is found.
    const results = await Promise.all(
      get().accounts.map((a) => providers.get(a.id)?.searchRemote(toGmailQuery(q) + remoteScope(within)).catch(() => [] as Message[]) ?? Promise.resolve([] as Message[])),
    );
    if (seq !== searchSeq) return;
    const known = get().messages;
    set({ remoteResults: results.flat().filter((m) => !known[m.id]) });
  } finally {
    if (seq === searchSeq) set({ searching: false });
  }
}

/** Gmail words that keep a server search inside the folder it started in. */
function remoteScope(within?: Exclude<MailboxRef, { kind: 'search' }>): string {
  if (within?.kind !== 'system') return '';
  const ops: Partial<Record<SystemFolder, string>> = { inbox: ' in:inbox', sent: ' in:sent', drafts: ' in:drafts', junk: ' in:spam', bin: ' in:trash', flagged: ' is:starred' };
  return ops[within.folder] || '';
}

export function localSearch(q: string): Message[] {
  return searchMessages(q, get().messages);
}

/** Bring a server search result into the local cache when opened. */
export function adoptRemote(m: Message) {
  putMessages([m]);
  set({ remoteResults: get().remoteResults.filter((r) => r.id !== m.id) });
}
