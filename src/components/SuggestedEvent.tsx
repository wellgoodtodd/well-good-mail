// A quiet card at the top of an email that mentions a future date and time: Add to calendar, Not now, or change
// the details first. Nothing is added unless you click.
import { useMemo, useRef, useState } from 'react';
import { plainError } from '../lib/plainErrors';
import { Icon } from './Icon';
import { Dialog, useMenu } from './ui';
import { create } from 'zustand';
import { addInviteToCalendar, updateAddedEvent, canAddToCalendar, canMoveAcross, editEvent, moveEventAcross, writableCalendars, toast, useMail } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { visibleText } from '../lib/cleanText';
import { eventDifferences, suggestEvent, whenWords, type Suggestion } from '../lib/suggestEvents';
import type { Invite } from '../lib/invites';
import { placeFromTitle } from '../lib/places';
import type { CalendarEvent, Message } from '../lib/types';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const at = (day: string, time: string) => { const [y, m, d] = day.split('-').map(Number); const [h, mi] = time.split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0).getTime(); };

export function SuggestedEvent({ message }: { message: Message }) {
  const on = useSettings((s) => s.suggestEvents);
  const hidden = useSettings((s) => s.suggestHidden);
  const muted = useSettings((s) => s.suggestMuted);
  const events = useMail((s) => s.events);
  const [added, setAdded] = useState(false);
  const lastAdded = useRef<AddedEvent | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Suggestion | null>(null);
  const menu = useMenu();
  const sender = message.from.email.toLowerCase();
  const found = useMemo(() => {
    if (!on || !message.bodyLoaded || message.isDraft) return undefined;
    return suggestEvent(message, visibleText(message.bodyHtml, message.bodyText, 8000), Date.now(), events);
  }, [on, message.id, message.bodyLoaded, events]); // eslint-disable-line react-hooks/exhaustive-deps
  if (added) {
    return <section className="invite-card suggest-card" aria-label="Suggested event"><span className="inv-ok"><Icon name="check" size={14} /> Added to your calendar</span>{lastAdded.current && <button className="btn small" onClick={() => useEventEdit.setState({ editing: lastAdded.current })}>Edit</button>}</section>;
  }
  if (!found || hidden.includes(message.id) || muted.includes(sender)) return null;
  if (found.existing) return <AlreadyInCalendar event={found.existing} found={found} emailAccountId={message.accountId} onHide={() => useSettings.getState().set({ suggestHidden: [...hidden, message.id].slice(-300) }, { quiet: true })} />;
  if (!canAddToCalendar(message.id)) return null;

  const hide = () => useSettings.getState().set({ suggestHidden: [...hidden, message.id].slice(-300) }, { quiet: true });
  const add = async (s: Suggestion) => {
    let added: AddedEvent | undefined;
    setBusy(true);
    const invite: Invite = {
      method: 'PUBLISH', uid: `wgm-${message.id.replace(/[^A-Za-z0-9]/g, '')}-${s.start}@wellgood.mail`, sequence: 0,
      title: s.title, start: s.start, end: s.end, allDay: false,
      // No meeting link: "Lunch at Five Guys" in the title gives the place.
      location: s.meetingUrl || placeFromTitle(s.title), description: s.meetingUrl ? `Join: ${s.meetingUrl}` : undefined, meetingUrl: s.meetingUrl,
      attendees: [], startLine: '',
    };
    try {
      const ref = await addInviteToCalendar(message.id, invite);
      added = { messageId: message.id, ref, invite };
      lastAdded.current = added;
      setAdded(true);
      // Once added it isn't offered again, even for dates beyond what the app keeps of the calendar.
      useSettings.getState().set({ suggestHidden: [...useSettings.getState().suggestHidden, message.id].slice(-300) }, { quiet: true });
      const acc = useMail.getState().accounts.find((a) => a.id === message.accountId);
      const info = added;
      // It goes into this account's main calendar. If that calendar is hidden here, say so, or it seems to vanish.
      const hiddenKeys = useSettings.getState().hiddenCalendars;
      const mainKey = acc ? `${acc.id}|${acc.email}` : '';
      const isHidden = Boolean(acc && (hiddenKeys.includes(mainKey) || hiddenKeys.includes(`${acc.id}|${acc.email.toLowerCase()}`)));
      toast({
        text: `"${s.title}" added to ${acc ? `${acc.label || acc.email}'s` : 'your'} calendar, ${whenWords(s)}.${isHidden ? ' That calendar is hidden here.' : ''}`,
        actions: [
          { label: 'Edit', run: () => useEventEdit.setState({ editing: info }) },
          ...(isHidden ? [{ label: 'Show it', run: () => useSettings.getState().set({ hiddenCalendars: useSettings.getState().hiddenCalendars.filter((k) => k !== mainKey && k !== `${acc!.id}|${acc!.email.toLowerCase()}`) }) }] : []),
        ],
        ttl: 12000,
      });
    } catch (e) {
      toast({ text: `Couldn't add it. ${plainError(e).text}`, ttl: 9000 });
    }
    setBusy(false);
  };

  return (
    <section className="invite-card suggest-card" aria-label="Suggested event">
      <div className="inv-top">
        <div className="inv-main">
          <div className="inv-small suggest-kicker"><Icon name="calendar" size={13} /> Add to calendar?</div>
          <div className="inv-title">{found.title}</div>
          <div className="inv-line"><Icon name="clock" size={14} /> {whenWords(found)}</div>
          {found.meetingUrl && <div className="inv-line"><Icon name="link" size={14} /> Online</div>}
          <div className="inv-line suggest-found">Found in the email: <mark>{found.phrase}</mark></div>
        </div>
      </div>
      <div className="inv-actions">
        <button className="btn primary" disabled={busy} onClick={() => add(found)}>Add to calendar</button>
        <button className="btn" onClick={hide}>Not now</button>
        <button className="btn ghost icon-only" aria-label="More choices" title="More choices" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), [
          { label: 'Change details...', icon: 'compose', onClick: () => setEdit({ ...found }) },
          { label: `Don't suggest from ${message.from.name || sender}`, icon: 'mute', onClick: () => useSettings.getState().set({ suggestMuted: [...muted, sender] }) },
          { label: 'Turn off suggested events', icon: 'settings', onClick: () => useSettings.getState().set({ suggestEvents: false }) },
        ])}><Icon name="more" /></button>
      </div>
      {menu.node}
      {edit && (
        <Dialog title="Add to calendar" onClose={() => setEdit(null)} actions={<>
          <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn primary" disabled={!edit.title.trim() || edit.end <= edit.start} onClick={() => { const s = edit; setEdit(null); void add(s); }}>Add to calendar</button>
        </>}>
          <div className="suggest-form">
            <label><span>Title</span><input type="text" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
            <label><span>Day</span><input type="date" value={ymd(edit.start)} onChange={(e) => { const len = edit.end - edit.start; const start = at(e.target.value, hm(edit.start)); setEdit({ ...edit, start, end: start + len }); }} /></label>
            <label><span>From</span><input type="time" value={hm(edit.start)} onChange={(e) => { const len = edit.end - edit.start; const start = at(ymd(edit.start), e.target.value); setEdit({ ...edit, start, end: start + len }); }} /></label>
            <label><span>To</span><input type="time" value={hm(edit.end)} onChange={(e) => setEdit({ ...edit, end: at(ymd(edit.start), e.target.value) })} /></label>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/**
 * The email's event is already in your calendar. The card says which calendar, and what the email has that the event
 * doesn't (its meeting link, a different time). Nothing changes until you pick: update it, move it to this email's
 * account (with the changes), or add a separate copy there.
 */
function AlreadyInCalendar({ event, found, emailAccountId, onHide }: { event: CalendarEvent; found: Suggestion; emailAccountId: string; onHide: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | undefined>(undefined);
  const menu = useMenu();
  const accounts = useMail((s) => s.accounts);
  const acc = accounts.find((a) => a.id === event.accountId);
  const here = accounts.find((a) => a.id === emailAccountId);
  const { patch, lines } = eventDifferences(found, event);
  const changes = lines.length > 0 && Boolean(event.canEdit);
  // This email's account, when the event is in another one: it can go there (moved, or copied).
  const hereCals = here && here.id !== event.accountId ? writableCalendars(here.id) : [];
  const hereCal = here && (hereCals.includes(here.email) ? here.email : hereCals[0]);
  const canMove = Boolean(hereCal && canMoveAcross(event));
  const accName = (a?: { label?: string; email: string }) => (a ? a.label || a.email : '');
  const calShown = acc && event.calendarName && ![acc.email, acc.label || ''].some((x) => x.toLowerCase() === event.calendarName.toLowerCase());
  const where = `${accName(acc)}${calShown ? `, ${event.calendarName}` : ''}`;
  const title = event.title.trim() || 'Event';
  const run = async (what: () => Promise<unknown>, note: string) => {
    setBusy(true);
    try { await what(); setDone(note); toast({ text: note }); } catch (e) { toast({ text: `Couldn't do that. ${plainError(e).text}`, ttl: 9000 }); }
    setBusy(false);
  };
  const update = () => run(() => editEvent(event, patch), `"${title}" updated`);
  const move = () => run(() => moveEventAcross(event, { accountId: here!.id, calendarName: hereCal! }, { patch, removeOriginal: true }), `"${title}" moved to ${accName(here)}${lines.length ? ', with the changes' : ''}`);
  const copy = () => run(() => moveEventAcross(event, { accountId: here!.id, calendarName: hereCal! }, { patch, removeOriginal: false }), `"${title}" added to ${accName(here)} too`);
  if (done) return <section className="invite-card suggest-card" aria-label="Already in your calendar"><span className="inv-ok"><Icon name="check" size={14} /> {done}</span></section>;
  return (
    <section className="invite-card suggest-card" aria-label="Already in your calendar">
      <div className="inv-top">
        <div className="inv-main">
          <div className="inv-small suggest-kicker"><Icon name="check" size={13} /> Already in your calendar{where ? ` (${where})` : ''}</div>
          <div className="inv-title">{title}</div>
          <div className="inv-line"><Icon name="clock" size={14} /> {whenWords(event)}</div>
          {lines.map((l) => <div key={l} className="inv-line suggest-found"><Icon name="info" size={14} /> {l}</div>)}
        </div>
      </div>
      {(changes || canMove) && (
        <div className="inv-actions">
          {changes && <button className="btn primary" disabled={busy} onClick={() => void update()}>Update event</button>}
          {canMove && <button className={`btn ${changes ? '' : 'primary'}`} disabled={busy} onClick={() => void move()}>{changes ? `Update and move to ${accName(here)}` : `Move to ${accName(here)}`}</button>}
          <button className="btn" onClick={onHide}>Not now</button>
          {canMove && <button className="btn ghost icon-only" aria-label="More choices" title="More choices" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), [
            { label: `Add a copy to ${accName(here)}`, icon: 'calendar', onClick: () => void copy() },
          ])}><Icon name="more" /></button>}
        </div>
      )}
      {menu.node}
    </section>
  );
}

/** An event added from an email, kept so it can be edited afterwards (from the note, Recent, or the card). */
export interface AddedEvent { messageId: string; ref: string | void; invite: Invite }
export const useEventEdit = create<{ editing?: AddedEvent }>(() => ({}));

/** Change the title or time of an event already added. Mounted once, at the top of the app. */
export function EventEditDialog() {
  const editing = useEventEdit((s) => s.editing);
  const [form, setForm] = useState<{ title: string; start: number; end: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = editing && (form || { title: editing.invite.title, start: editing.invite.start, end: editing.invite.end });
  if (!editing || !current) return null;
  const close = () => { useEventEdit.setState({ editing: undefined }); setForm(null); setBusy(false); };
  const save = async () => {
    setBusy(true);
    const invite: Invite = { ...editing.invite, title: current.title.trim() || editing.invite.title, start: current.start, end: current.end, sequence: (editing.invite.sequence || 0) + 1 };
    try {
      await updateAddedEvent(editing.messageId, editing.ref, invite);
      toast({ text: `"${invite.title}" changed to ${whenWords({ ...invite, title: invite.title, phrase: '', meetingUrl: undefined } as unknown as Suggestion)}.`, action: { label: 'Edit', run: () => useEventEdit.setState({ editing: { ...editing, invite } }) }, ttl: 10000 });
      close();
    } catch (e) {
      toast({ text: `Couldn't change it: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
      setBusy(false);
    }
  };
  const set = (patch: Partial<typeof current>) => setForm({ ...current, ...patch });
  return (
    <Dialog title="Change the event" onClose={close} actions={<>
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" disabled={busy || !current.title.trim() || current.end <= current.start} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="suggest-form">
        <label><span>Title</span><input type="text" value={current.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label><span>Day</span><input type="date" value={ymd(current.start)} onChange={(e) => { const len = current.end - current.start; const start = at(e.target.value, hm(current.start)); set({ start, end: start + len }); }} /></label>
        <label><span>From</span><input type="time" value={hm(current.start)} onChange={(e) => { const len = current.end - current.start; const start = at(ymd(current.start), e.target.value); set({ start, end: start + len }); }} /></label>
        <label><span>To</span><input type="time" value={hm(current.end)} onChange={(e) => set({ end: at(ymd(current.start), e.target.value) })} /></label>
      </div>
    </Dialog>
  );
}
