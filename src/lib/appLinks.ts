// Links into Well Good Mail from other apps (the hub's "Open in Well Good Mail"), registered with Windows:
//   wellgoodmail://thread/<account email>/<Gmail thread id>   one conversation
//   wellgoodmail://calendar/<YYYY-MM-DD>                       the calendar on that day
//   wellgoodmail://calendar/event/<event id>                   one event (the Google event id is enough)
import { messagesInThread, openScreen, selectThread, toast, useMail } from './mail';
import { openExternal } from './platform';

export type AppLink =
  | { kind: 'thread'; account: string; threadId: string }
  | { kind: 'day'; day: number }
  | { kind: 'event'; eventId: string };

export const SCHEME = 'wellgoodmail';

export function parseAppLink(link: string): AppLink | undefined {
  const m = /^wellgoodmail:\/*(.*)$/i.exec(link.trim());
  if (!m) return undefined;
  const parts = m[1].split(/[?#]/)[0].split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const [what, a, b] = parts;
  switch ((what || '').toLowerCase()) {
    case 'thread':
    case 'email':
      return a && b ? { kind: 'thread', account: a, threadId: b } : undefined;
    case 'event':
      return a ? { kind: 'event', eventId: a } : undefined;
    case 'calendar': {
      if (a?.toLowerCase() === 'event') return b ? { kind: 'event', eventId: b } : undefined;
      if (!a) return { kind: 'day', day: new Date().setHours(0, 0, 0, 0) };
      const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a);
      return d ? { kind: 'day', day: new Date(+d[1], +d[2] - 1, +d[3]).getTime() } : undefined;
    }
  }
  return undefined;
}

export const threadLink = (accountEmail: string, threadId: string) => `${SCHEME}://thread/${encodeURIComponent(accountEmail)}/${encodeURIComponent(threadId)}`;

/** Opens a conversation from a link: in the main window when it's on this computer, otherwise offers Gmail on the web. */
export function openThreadLink(account: string, threadId: string) {
  const acc = useMail.getState().accounts.find((a) => a.email.toLowerCase() === account.toLowerCase() || a.id === account);
  if (!acc) return toast({ text: `${account} isn't one of the accounts in Well Good Mail` });
  const key = `${acc.id}|${threadId}`;
  if (messagesInThread(key).length) {
    openScreen('mail');
    selectThread(key);
    return;
  }
  toast({
    text: "That email isn't on this computer (it may be older than the mail kept here)",
    ttl: 10000,
    ...(acc.kind === 'gmail' ? { action: { label: 'Open in Gmail', run: () => void openExternal(`https://mail.google.com/mail/u/${encodeURIComponent(acc.email)}/#all/${threadId}`) } } : {}),
  });
}

/** Opens whatever a wellgoodmail: link points at. */
export async function openAppLink(link: string) {
  const l = parseAppLink(link);
  if (!l) return toast({ text: "Well Good Mail can't open that link" });
  if (l.kind === 'thread') return openThreadLink(l.account, l.threadId);
  const { goToDay } = await import('../components/CalendarViews');
  const { useSettings } = await import('./settings');
  const showCalendar = () => { openScreen('reminders'); useSettings.getState().set({ remindersView: 'calendar' }); };
  if (l.kind === 'day') { showCalendar(); goToDay(l.day); return; }
  // The hub knows the Google event id; here an event's id also has its account and calendar in front.
  const ev = useMail.getState().events.find((e) => e.id === l.eventId || e.id.split('|').pop() === l.eventId);
  if (!ev) return toast({ text: "That event isn't in your calendars here (it may be too far ahead or behind, or deleted)" });
  showCalendar();
  goToDay(ev.start, ev.id);
}
