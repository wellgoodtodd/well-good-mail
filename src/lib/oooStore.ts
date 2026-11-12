// Out of Office in the app: reads each account's state, turns it on and off for the ticked accounts, and looks
// after the extras (the Away event, the reminder the day before, "While you were away" and the holiday suggestion).
import { create } from 'zustand';
import { useMail, providerFor, reconnectAccount, toast as showToast } from './mail';
import { askConfirm } from './dialogs';
import { settings, useSettings, isQuietNow } from './settings';
import { notify } from './platform';
import type { Account, Message } from './types';
import { AWAY_WORDS, fillBackDate, htmlToText, isAway, messageFor, oooSupport, stateWords, windowOf, type AutoReply, type OooActive, type OooPlan } from './ooo';

export interface AccountOoo {
  loading?: boolean;
  reply?: AutoReply;
  error?: string;
  /** Signed in before Out of Office was allowed: one more sign in fixes it. */
  needsPermission?: boolean;
}

interface OooState {
  byAccount: Record<string, AccountOoo>;
  busy: boolean;
  /** "While you were away" is open, with the time it covers. */
  summary?: { start: number; end: number; accounts: string[] };
  /** A holiday in the calendar that could have out of office. */
  suggestion?: { key: string; title: string; firstDay: string; backOn: string };
}

export const useOoo = create<OooState>(() => ({ byAccount: {}, busy: false }));

const accounts = () => useMail.getState().accounts;
const setAcc = (id: string, patch: AccountOoo) => useOoo.setState((s) => ({ byAccount: { ...s.byAccount, [id]: { ...s.byAccount[id], ...patch } } }));
const nameOf = (a?: Account) => (a ? a.label || a.email : 'an account');
/** When each account's Out of Office was last changed from here. A check that started before then is out of date, so it is ignored. */
const changedAt: Record<string, number> = {};

/** Accounts Out of Office can be set on from here. */
export const nativeAccounts = () => accounts().filter((a) => oooSupport(a).native && providerFor(a.id)?.getAutoReply);

/** Reads each account's Out of Office from the account itself, so changes made in Gmail or Outlook show here too. */
export async function refreshOoo(ids?: string[]): Promise<void> {
  const list = nativeAccounts().filter((a) => !ids || ids.includes(a.id));
  await Promise.all(list.map(async (a) => {
    setAcc(a.id, { loading: true });
    const asked = Date.now();
    try {
      const reply = await providerFor(a.id)!.getAutoReply!();
      if ((changedAt[a.id] || 0) >= asked) { setAcc(a.id, { loading: false }); return; }
      setAcc(a.id, { loading: false, reply, error: undefined, needsPermission: false });
    } catch (e) {
      const err = e as Error & { needsPermission?: boolean };
      setAcc(a.id, { loading: false, needsPermission: Boolean(err.needsPermission), error: err.needsPermission ? undefined : err.message });
    }
  }));
}

/** The reply as it will go to one account: dates, message (its own or the default), audience fitted to what it supports. */
export function replyFor(plan: OooPlan, a: Account, now = Date.now()): AutoReply {
  const sup = oooSupport(a);
  const { start, end } = windowOf(plan, now);
  const msg = messageFor(plan, a.id);
  const audience = plan.audience === 'org' && !sup.org ? 'all' : plan.audience;
  const outsideHtml = sup.outside && plan.outsideDifferent && msg.outsideHtml ? fillBackDate(msg.outsideHtml, end) : undefined;
  return {
    on: true,
    start,
    end,
    subject: sup.subject ? fillBackDate(msg.subject, end) : undefined,
    html: fillBackDate(msg.html, end),
    audience,
    outsideHtml,
    outsideAudience: sup.outside ? plan.outsideAudience : undefined,
  };
}

/**
 * Turns Out of Office on (or schedules it) in every ticked account, then adds the extras. Each account is set on its
 * own, so one that fails (or needs to sign in once more) doesn't stop the others. Returns the names that failed.
 */
export async function turnOnOoo(plan: OooPlan): Promise<{ done: string[]; failed: string[]; needSignIn: string[] }> {
  useOoo.setState({ busy: true });
  const now = Date.now();
  const done: string[] = [];
  const failed: string[] = [];
  const needSignIn: string[] = [];
  const events: Record<string, string> = { ...(settings().oooActive?.events || {}) };
  const targets = accounts().filter((a) => plan.accounts.includes(a.id) && oooSupport(a).native);
  for (const a of targets) {
    const p = providerFor(a.id);
    if (!p?.setAutoReply) { failed.push(nameOf(a)); continue; }
    const reply = replyFor(plan, a, now);
    try {
      changedAt[a.id] = Date.now();
      await p.setAutoReply(reply);
      changedAt[a.id] = Date.now();
      setAcc(a.id, { reply, error: undefined, needsPermission: false });
      done.push(a.id);
    } catch (e) {
      const err = e as Error & { needsPermission?: boolean };
      setAcc(a.id, { needsPermission: Boolean(err.needsPermission), error: err.needsPermission ? undefined : err.message });
      if (err.needsPermission) needSignIn.push(a.id); else failed.push(nameOf(a));
      continue;
    }
    // The Away event: only for dates, never for "until I turn it off". A calendar that says no doesn't undo the reply.
    if (plan.addEvent && plan.mode === 'dates' && p.addAwayEvent && !events[a.id]) {
      try {
        const { start, end } = windowOf(plan, now);
        events[a.id] = await p.addAwayEvent(start || now, end!, { allDay: !plan.useTimes, decline: plan.decline && oooSupport(a).decline, message: htmlToText(reply.html).slice(0, 500) });
      } catch (e) { console.warn('Away event not added', a.email, e); }
    }
  }
  if (done.length) {
    const { start, end } = windowOf(plan, now);
    const prev = settings().oooActive;
    const active: OooActive = {
      accounts: [...new Set([...(prev?.accounts || []), ...done])],
      start: start || now,
      end,
      events,
      pauseAlerts: plan.pauseAlerts,
      awaySummary: plan.awaySummary,
      reminded: !plan.remindBefore,
    };
    useSettings.getState().set({ oooActive: active }, { quiet: true });
  }
  useOoo.setState({ busy: false });
  return { done, failed, needSignIn };
}

/** The accounts that need one more sign in before Out of Office can be read or set. */
export const oooSignInDue = (ids?: string[]) => nativeAccounts().filter((a) => (!ids || ids.includes(a.id)) && useOoo.getState().byAccount[a.id]?.needsPermission);

const andList = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * Signs in once more to each account that needs it for Out of Office, one after another. With ask, a pop-up explains
 * first (Sign in or Later). Resolves with the accounts that work now.
 */
export async function oooSignIn(ids?: string[], opts: { ask?: boolean } = {}): Promise<string[]> {
  const due = oooSignInDue(ids);
  if (!due.length) return [];
  const names = andList(due.map(nameOf));
  if (opts.ask) {
    const ok = await askConfirm(
      due.length === 1 ? `Sign in to ${names} once more` : `Sign in to ${due.length} accounts once more`,
      `Out of Office needs one more sign in for ${names}, to allow setting auto-replies. When Google or Microsoft asks, tick every box. Your mail stays where it is.`,
      due.length === 1 ? 'Sign in' : 'Sign in to each',
      { cancelLabel: 'Later' },
    );
    if (!ok) return [];
  }
  for (const a of due) {
    try { await reconnectAccount(a.id); } catch { /* the next account still gets its turn */ }
  }
  await refreshOoo(due.map((a) => a.id));
  const still = oooSignInDue(due.map((a) => a.id));
  if (still.length) showToast({ text: `${andList(still.map(nameOf))} still can't use Out of Office. On the sign in page, make sure every box is ticked.`, ttl: 10000 });
  return due.filter((a) => !still.includes(a)).map((a) => a.id);
}

/** A short reason from a provider's error, for "Couldn't check". */
export function shortReason(error?: string): string {
  if (!error) return '';
  const m = /"message"\s*:\s*"([^"]+)"/.exec(error);
  const text = (m ? m[1] : error.replace(/^(Gmail|Microsoft) \d+:\s*/, '')).trim();
  return text.length > 90 ? `${text.slice(0, 88)}...` : text;
}

/** Turns Out of Office off now in these accounts (all of them if none given), and takes the Away event out of the calendar. */
export async function turnOffOoo(ids?: string[]): Promise<{ done: string[]; failed: string[] }> {
  useOoo.setState({ busy: true });
  const state = useOoo.getState().byAccount;
  const list = nativeAccounts().filter((a) => (ids ? ids.includes(a.id) : state[a.id]?.reply?.on || settings().oooActive?.accounts.includes(a.id)));
  const done: string[] = [];
  const failed: string[] = [];
  const active = settings().oooActive;
  const events = { ...(active?.events || {}) };
  for (const a of list) {
    const p = providerFor(a.id)!;
    // Not read from the account yet: read it now, so turning off keeps the message rather than blanking it.
    const known = state[a.id]?.reply || (p.getAutoReply ? await p.getAutoReply().catch(() => undefined) : undefined);
    if (!known) { failed.push(nameOf(a)); continue; }
    const was = known;
    // Shown as off straight away; put back if the account says no.
    changedAt[a.id] = Date.now();
    setAcc(a.id, { reply: { ...was, on: false }, error: undefined });
    try {
      await p.setAutoReply!({ ...was, on: false, start: undefined, end: undefined });
      changedAt[a.id] = Date.now();
      done.push(a.id);
      if (events[a.id] && p.removeAwayEvent) {
        await p.removeAwayEvent(events[a.id]).catch((e) => console.warn('Away event not removed', e));
        delete events[a.id];
      }
    } catch (e) {
      const err = e as Error & { needsPermission?: boolean };
      setAcc(a.id, { reply: was, needsPermission: Boolean(err.needsPermission), error: err.needsPermission ? undefined : err.message });
      failed.push(nameOf(a));
    }
  }
  if (active) {
    const left = active.accounts.filter((id) => !done.includes(id));
    useSettings.getState().set({ oooActive: left.length ? { ...active, accounts: left, events } : undefined }, { quiet: true });
  }
  useOoo.setState({ busy: false });
  return { done, failed };
}

/** Accounts with replies going out right now. */
export function awayAccounts(now = Date.now()): Account[] {
  const by = useOoo.getState().byAccount;
  return accounts().filter((a) => isAway(by[a.id]?.reply, now));
}

/** New-mail alerts are paused while away, when the person asked for that. */
export function oooPausesAlerts(now = Date.now()): boolean {
  const a = settings().oooActive;
  return Boolean(a?.pauseAlerts && a.start <= now && (!a.end || a.end > now));
}

/** Each minute: the reminder the day before, "While you were away" once it ends, and the holiday suggestion. */
export function oooTick(now = Date.now()): void {
  const s = settings();
  const a = s.oooActive;
  if (a?.end) {
    if (!a.reminded && now >= a.end - 86400000 && now < a.end) {
      if (!isQuietNow(s)) notify('Out of Office ends tomorrow', `Replies stop ${new Date(a.end).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}. Change it in Settings › Out of Office.`);
      useSettings.getState().set({ oooActive: { ...a, reminded: true } }, { quiet: true });
    }
    if (now >= a.end) {
      if (a.awaySummary !== false && !a.summarised) useOoo.setState({ summary: { start: a.start, end: a.end, accounts: a.accounts } });
      useSettings.getState().set({ oooActive: undefined }, { quiet: true });
      void refreshOoo(a.accounts);
    }
  }
  suggestFromCalendar(now);
}

/** An all-day "Holiday" or "Annual leave" event in the next fortnight, with no out of office set for it yet. */
function suggestFromCalendar(now: number) {
  const s = settings();
  if (s.oooSuggest === false || s.oooActive) { if (useOoo.getState().suggestion) useOoo.setState({ suggestion: undefined }); return; }
  const by = useOoo.getState().byAccount;
  if (Object.values(by).some((x) => x.reply?.on && (!x.reply.end || x.reply.end > now))) return;
  const ev = useMail.getState().events
    .filter((e) => e.allDay && e.start > now - 86400000 && e.start < now + 14 * 86400000 && e.end - e.start >= 86400000 && AWAY_WORDS.test(e.title))
    .sort((x, y) => x.start - y.start)[0];
  const key = ev ? `${ev.title}|${ev.start}` : undefined;
  if (!ev || !key || s.oooDismissed.includes(key)) { if (useOoo.getState().suggestion) useOoo.setState({ suggestion: undefined }); return; }
  if (useOoo.getState().suggestion?.key === key) return;
  const day = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  useOoo.setState({ suggestion: { key, title: ev.title, firstDay: day(Math.max(ev.start, now)), backOn: day(ev.end) } });
}

export function dismissSuggestion() {
  const sg = useOoo.getState().suggestion;
  if (!sg) return;
  useSettings.getState().set({ oooDismissed: [...settings().oooDismissed, sg.key].slice(-30) }, { quiet: true });
  useOoo.setState({ suggestion: undefined });
}

/** Opens Settings › Out of Office with the holiday's dates filled in. */
export function applySuggestion() {
  const sg = useOoo.getState().suggestion;
  if (!sg) return;
  useSettings.getState().set({ ooo: { ...settings().ooo, mode: 'dates', firstDay: sg.firstDay, backOn: sg.backOn } });
  useMail.setState({ screen: 'settings', settingsTab: 'ooo' });
}

/** Emails from people that arrived while away, sorted into what needs you most. */
export function awayDigest(start: number, end: number, ids: string[]): { questions: Message[]; vips: Message[]; direct: Message[]; cc: Message[] } {
  const s = settings();
  const vipSet = new Set(s.vips);
  const mine = new Set(accounts().flatMap((a) => [a.email, ...(a.aliases || []).map((x) => x.email)]).map((e) => e.toLowerCase()));
  const all = Object.values(useMail.getState().messages).filter((m) =>
    ids.includes(m.accountId) && m.date >= start && m.date < end && !m.isDraft && !mine.has(m.from.email.toLowerCase())
    && m.labels.some((l) => l === 'INBOX' || l.toLowerCase() === 'inbox') && !/no-?reply|newsletter|notifications?@|mailer/i.test(m.from.email));
  const byDate = (x: Message, y: Message) => y.date - x.date;
  const vips = all.filter((m) => vipSet.has(m.from.email.toLowerCase())).sort(byDate);
  const rest = all.filter((m) => !vipSet.has(m.from.email.toLowerCase()));
  const toMe = (m: Message) => m.to.some((t) => mine.has(t.email.toLowerCase()));
  const questions = rest.filter((m) => toMe(m) && /\?/.test(`${m.subject} ${m.snippet}`)).sort(byDate);
  const direct = rest.filter((m) => toMe(m) && !questions.includes(m)).sort(byDate);
  const cc = rest.filter((m) => !toMe(m)).sort(byDate);
  return { questions, vips, direct, cc };
}

export function closeSummary() {
  const a = settings().oooActive;
  if (a) useSettings.getState().set({ oooActive: { ...a, summarised: true } }, { quiet: true });
  useOoo.setState({ summary: undefined });
}

/** A short line about the state of one account, for chips, the sidebar tooltip and the account's details. */
export function oooWords(accountId: string, now = Date.now()): string {
  const x = useOoo.getState().byAccount[accountId];
  if (!x) return '';
  if (x.needsPermission) return 'Needs sign in';
  if (x.error) return 'Couldn\'t check';
  return stateWords(x.reply, now).words;
}

export function oooToastResult(r: { done: string[]; failed: string[] }, verb: string) {
  if (r.failed.length && !r.done.length) showToast({ text: `Out of Office couldn't be ${verb} for ${r.failed.join(', ')}.`, ttl: 9000 });
  else if (r.failed.length) showToast({ text: `Out of Office ${verb}, except for ${r.failed.join(', ')}.`, ttl: 9000 });
}
