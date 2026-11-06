// Remembers which emails you had open to write, so a restart (or an update) puts them back.
// The text itself is already saved as you type; this only remembers which ones were on screen.
import { store } from './db';
import { openPopout } from './platform';
import { draftIsEmpty } from './compose';
import { useMail, messagesInThread } from './mail';

const KEY = 'wgm.openDrafts';

interface Open { id: string; popout: boolean }

function read(): Open[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((o) => o && typeof o.id === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: Open[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

export function trackOpen(id: string, popout: boolean) {
  write([...read().filter((o) => o.id !== id), { id, popout }]);
}

export function trackClosed(id: string) {
  write(read().filter((o) => o.id !== id));
}

/** Called once when the main window starts: reopen whatever was open when the app last stopped. */
export async function restoreOpenDrafts(): Promise<void> {
  const open = read();
  let inlineUsed = false;
  for (const o of open) {
    const draft = await store.getDraft(o.id);
    if (!draft || draftIsEmpty(draft)) { trackClosed(o.id); continue; }
    if (o.popout && (await openPopout(`compose/${o.id}`, draft.subject || 'Email'))) continue;
    if (inlineUsed) { await openPopout(`compose/${o.id}`, draft.subject || 'Email'); continue; }
    inlineUsed = true;
    const source = draft.sourceMessageId ? useMail.getState().messages[draft.sourceMessageId] : undefined;
    const key = source ? `${source.accountId}|${source.threadId}` : undefined;
    useMail.setState({ screen: 'mail', inlineDraftId: o.id, ...(key && messagesInThread(key).length ? { selectedKey: key, selectedKeys: [key] } : { selectedKey: undefined, selectedKeys: [] }) });
  }
}
