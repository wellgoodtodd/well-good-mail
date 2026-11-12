// The pop-up for one event: its details, and the form for changing or moving it (to any account).
import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useMail, refreshEvents, lastEventsRefresh, toast, editEvent, deleteEvent, writableCalendars, providerFor, calendarChoices, canMoveAcross, eventCopy, moveEventAcross } from '../lib/mail';
import { useDialogFocus, useMenu, type MenuItem } from './ui';
import { describeRepeat } from '../lib/recurrence';
import { askConfirm } from '../lib/dialogs';
import { meetingService, dedupeEvents, inviteText } from '../lib/meetings';
import { startCompose } from '../lib/composeActions';
import { openExternal } from '../lib/platform';
import type { CalendarEvent, EventCopy, EventGuest, EventPatch } from '../lib/types';
import { AccountDots, GuestList, JoinButton, chipBackground, dayText, timeText, useColour } from './calendarBits';

/** A small window with the details of one event. */
export function EventPreview({ event: picked, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const focusRef = useDialogFocus();
  const colour = useColour();
  const accounts = useMail((s) => s.accounts);
  const all = useMail((s) => s.events);
  // The calendar refreshes in the background, so show the newest copy of this event.
  const event = useMemo(() => dedupeEvents(all).find((x) => x.id === picked.id) || picked, [all, picked]);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTo, setEditTo] = useState<CalTarget | undefined>(undefined);
  const calMenu = useMenu();
  const editable = Boolean(event.canEdit && providerFor(event.accountId)?.editEvent);
  // Two clicks to put it somewhere else. Anything with guests, a video link or a repeat opens Edit, so the note shows first.
  const quickMove = async (to: CalTarget) => {
    if (to.accountId === event.accountId && to.calendarName === event.calendarName) return;
    if (to.accountId === event.accountId) {
      try { await editEvent(event, { calendarName: to.calendarName }); toast({ text: `"${event.title}" is now in ${to.calendarName}.` }); } catch (e) { toast({ text: `Couldn't move it: ${e instanceof Error ? e.message : e}`, ttl: 9000 }); }
      return;
    }
    if (event.recurring || event.meetingUrl || (event.guests || []).some((g) => !g.self)) { setEditTo(to); setEditing(true); return; }
    try { const newId = await moveEventAcross(event, to, { removeOriginal: true }); movedToast(event, newId, to); onClose(); } catch (e) { toast({ text: `Couldn't move it: ${e instanceof Error ? e.message : e}`, ttl: 9000 }); }
  };
  const refresh = async () => { setRefreshing(true); try { await refreshEvents(); } finally { setRefreshing(false); } };
  // Opening an event with guests pulls the latest answers, unless they were fetched in the last minute.
  useEffect(() => { if (picked.guests?.length && Date.now() - lastEventsRefresh() > 60000) void refresh(); }, [picked.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = event.accountIds?.length ? event.accountIds : [event.accountId];
  const labels = ids.map((id) => accounts.find((a) => a.id === id)?.label || accounts.find((a) => a.id === id)?.email || '').filter(Boolean);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (editing) setEditing(false); else onClose(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, editing]);
  const sameDay = new Date(event.start).toDateString() === new Date(event.end).toDateString();
  const guestList = (event.guests || []).map((g) => { if (!g.self || g.name) return g; const acc = accounts.find((x) => x.email.toLowerCase() === g.email || x.aliases.some((al) => al.email.toLowerCase() === g.email)); const name = acc?.aliases.find((al) => al.isDefault)?.name || acc?.aliases[0]?.name; return name ? { ...g, name } : g; });
  const others = guestList.filter((g) => !g.self);
  const writeTo = (to: EventGuest[]) => { void startCompose('new', undefined, { extra: { to: to.map((g) => ({ email: g.email, name: g.name })), subject: event.title } }); };
  return (
    <div className="ev-scrim" onClick={() => { if (!editing) onClose(); }}>
      <div className="ev-pop" role="dialog" aria-modal="true" aria-label={event.title} ref={focusRef} onClick={(e) => e.stopPropagation()}>
        {editing ? <EventEditForm event={event} startTo={editTo} onDone={(closeAll) => { setEditing(false); setEditTo(undefined); if (closeAll) onClose(); }} /> : <>
        <div className="ev-head">
          <span className="ev-bar" style={{ background: chipBackground(ids, colour) }} />
          <h2>{event.title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div className="ev-line"><Icon name="clock" size={15} /> {event.allDay ? `${dayText(event.start)}, all day` : `${dayText(event.start)}, ${timeText(event.start)} to ${sameDay ? '' : `${dayText(event.end)}, `}${timeText(event.end)}`}</div>
        {event.recurring && <RepeatLine event={event} />}
        {editable && calendarChoices().length
          ? <button className="ev-line ev-cal-link" title="Put it in another calendar" onClick={(e) => calMenu.open(e.currentTarget.getBoundingClientRect(), calendarItems(event, { accountId: event.accountId, calendarName: event.calendarName }, (to) => void quickMove(to)))}><Icon name="calendar" size={15} /> <span>{event.calendarName}{labels.length ? ` · ${labels.join(', ')}` : ''}</span><Icon name="chevronDown" size={12} /></button>
          : <div className="ev-line"><Icon name="calendar" size={15} /> {event.calendarName}{labels.length ? ` · ${labels.join(', ')}` : ''}</div>}
        {calMenu.node}
        {ids.length > 1 && <div className="ev-line"><AccountDots event={event} /> On {ids.length} of your calendars</div>}
        {event.location && !event.location.startsWith('http') && <div className="ev-line"><Icon name="folder" size={15} /> {event.location}</div>}
        {event.meetingUrl && <div className="ev-line"><Icon name="link" size={15} /> {meetingService(event.meetingUrl)} call</div>}
        {event.description && <p className="ev-notes">{event.description}</p>}
        {event.guests && event.guests.length > 0 && (
          <div className="ev-guests">
            <GuestList guests={guestList} subject={event.title} actions={false} />
          </div>
        )}
        {!event.canEdit && event.guests?.some((g) => g.organiser && !g.self) && <p className="hint ev-note">Only the organiser can change the time or details. You can still answer from the invitation email.</p>}
        <div className="ev-actions">
          {editable && <button className={`btn ${event.meetingUrl ? '' : 'primary'}`} onClick={() => setEditing(true)}>Edit</button>}
          <JoinButton event={event} />
          <button className="btn" onClick={() => { void navigator.clipboard?.writeText(inviteText(event)).then(() => toast({ text: 'Invite copied. Paste it anywhere.', ttl: 2500 }), () => toast({ text: "Couldn't copy the invite", ttl: 4000 })); }}>Copy invite</button>
          <span className="cal-picker">
            <button className="btn" aria-expanded={more} onClick={() => setMore(!more)}>More <Icon name="chevronDown" size={12} /></button>
            {more && (
              <div className="cal-pop inv-change up" role="menu">
                {others.length > 0 && <button role="menuitem" className="btn ghost" onClick={() => { setMore(false); writeTo(others); }}>Email everyone</button>}
                {others.some((g) => g.answer === 'waiting') && <button role="menuitem" className="btn ghost" onClick={() => { setMore(false); writeTo(others.filter((g) => g.answer === 'waiting')); }}>Email those waiting</button>}
                {guestList.length > 0 && <button role="menuitem" className="btn ghost" disabled={refreshing} onClick={() => { setMore(false); void refresh(); }}>{refreshing ? 'Checking...' : 'Refresh answers'}</button>}
                {event.htmlLink && <button role="menuitem" className="btn ghost" onClick={() => { setMore(false); openExternal(event.htmlLink!); }}>Open in calendar</button>}
                {editable && providerFor(event.accountId)?.deleteEvent && <button role="menuitem" className="btn ghost danger" onClick={() => { setMore(false); void removeEvent(event, onClose); }}>Delete event</button>}
              </div>
            )}
          </span>
        </div>
        </>}
      </div>
    </div>
  );
}

async function removeEvent(event: CalendarEvent, onClose: () => void) {
  const guests = (event.guests || []).filter((g) => !g.self).length;
  const ok = await askConfirm(`Delete "${event.title}"?`, `It's deleted from the calendar itself${guests ? `, and the ${guests === 1 ? 'guest is' : `${guests} guests are`} told it's cancelled` : ''}.${event.recurring ? ' Only this one of the series.' : ''}`, 'Delete event');
  if (!ok) return;
  try {
    await deleteEvent(event);
    onClose();
    toast({ text: `"${event.title}" deleted.` });
  } catch (e) { toast({ text: `Couldn't delete it: ${e instanceof Error ? e.message : e}`, ttl: 9000 }); }
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymdOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const hmOf = (ms: number) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const msAt = (day: string, time = '00:00') => { const [y, m, d] = day.split('-').map(Number); const [h, mi] = time.split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0).getTime(); };

type CalTarget = { accountId: string; calendarName: string };

/** How each repeating event repeats, once read, so it's only asked for once. */
const repeatWords = new Map<string, string>();
function useRepeatWords(event: CalendarEvent): string | undefined {
  const [words, setWords] = useState(() => repeatWords.get(event.id));
  useEffect(() => {
    if (!event.recurring || repeatWords.has(event.id) || !providerFor(event.accountId)?.copyOfEvent) return;
    let live = true;
    eventCopy(event, true).then((c) => {
      const w = c.repeat ? describeRepeat(c.repeat) : 'Repeats';
      repeatWords.set(event.id, w);
      if (live) setWords(w);
    }, () => { /* the line just says Repeats */ });
    return () => { live = false; };
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return words;
}

function RepeatLine({ event }: { event: CalendarEvent }) {
  const words = useRepeatWords(event);
  return <div className="ev-line"><Icon name="refresh" size={15} /> {words || 'Repeats'}</div>;
}
const accountLabel = (id: string) => { const a = useMail.getState().accounts.find((x) => x.id === id); return a ? a.label || a.email : ''; };

/** Every calendar you can put the event in: its own account's first, then each other account's, under its name. */
function calendarItems(event: CalendarEvent, current: CalTarget, pick: (to: CalTarget) => void): MenuItem[] {
  const accounts = useMail.getState().accounts;
  const own = accounts.find((a) => a.id === event.accountId);
  const ownCals = writableCalendars(event.accountId);
  const groups = [
    ...(own ? [{ account: own, calendars: ownCals.includes(event.calendarName) ? ownCals : [event.calendarName, ...ownCals] }] : []),
    ...calendarChoices().filter((c) => c.account.id !== event.accountId),
  ];
  const across = canMoveAcross(event);
  const items: MenuItem[] = [];
  for (const { account, calendars } of groups) {
    const mine = account.id === event.accountId;
    items.push({ heading: `${account.label || account.email}${mine && groups.length > 1 ? ' · this account' : ''}` });
    for (const c of calendars) items.push({ label: c, dot: account.colour, active: current.accountId === account.id && current.calendarName === c, disabled: !mine && !across, onClick: () => pick({ accountId: account.id, calendarName: c }) });
  }
  return items;
}

/** "Moved to WGM", with Undo, which moves it back the same way. */
function movedToast(event: CalendarEvent, newId: string, to: CalTarget) {
  const back: CalTarget = { accountId: event.accountId, calendarName: event.calendarName };
  toast({
    text: `"${event.title}" moved to ${accountLabel(to.accountId)}.`,
    ttl: 9000,
    undo: () => {
      const now = useMail.getState().events.find((e) => e.id === newId);
      if (!now) { toast({ text: "Couldn't find it to move back. Refresh the calendar and try again.", ttl: 8000 }); return; }
      void moveEventAcross(now, back, { removeOriginal: true }).then(
        () => toast({ text: `"${event.title}" is back in ${accountLabel(back.accountId)}.` }),
        (e) => toast({ text: `Couldn't move it back: ${e instanceof Error ? e.message : e}`, ttl: 9000 }),
      );
    },
  });
}

/** Editing an event in the same box: title, when, all day, calendar (any account's), where and notes. */
function EventEditForm({ event, startTo, onDone }: { event: CalendarEvent; startTo?: CalTarget; onDone: (closeAll: boolean) => void }) {
  const accounts = useMail((s) => s.accounts);
  const [to, setTo] = useState<CalTarget>(startTo || { accountId: event.accountId, calendarName: event.calendarName });
  const toAcc = accounts.find((a) => a.id === to.accountId);
  const across = to.accountId !== event.accountId;
  const calMenu = useMenu();
  // A series going to another account: read how it repeats first, so the form can say.
  const [series, setSeries] = useState<{ copy?: EventCopy; error?: string } | undefined>(undefined);
  const [stopOld, setStopOld] = useState(true);
  useEffect(() => {
    if (!event.recurring || series) return;
    let live = true;
    eventCopy(event, true).then((copy) => { if (live) setSeries({ copy }); }, (e) => { if (live) setSeries({ error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [across, event, series]);
  // All-day events end at midnight after the last day; the form shows the last day itself.
  const [f, setF] = useState(() => ({
    title: event.title,
    day: ymdOf(event.start),
    endDay: ymdOf(event.allDay ? event.end - 1 : event.end),
    from: event.allDay ? '09:00' : hmOf(event.start),
    to: event.allDay ? '10:00' : hmOf(event.end),
    allDay: event.allDay,
    location: event.location && !event.location.startsWith('http') ? event.location : '',
    notes: event.description || '',
  }));
  const [busy, setBusy] = useState(false);
  const start = f.allDay ? msAt(f.day) : msAt(f.day, f.from);
  const end = f.allDay ? msAt(f.endDay) + 86400000 : msAt(f.endDay === f.day || f.endDay < f.day ? f.day : f.endDay, f.to);
  const bad = !f.title.trim() ? 'Give it a title.' : end <= start ? 'It ends before it starts.' : '';
  const guests = (event.guests || []).filter((g) => !g.self).length;
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const save = async () => {
    const patch: EventPatch = {};
    if (f.title.trim() !== event.title) patch.title = f.title.trim();
    if (start !== event.start || end !== event.end || f.allDay !== event.allDay) { patch.start = start; patch.end = end; patch.allDay = f.allDay; }
    const oldLoc = event.location && !event.location.startsWith('http') ? event.location : '';
    if (f.location.trim() !== oldLoc) patch.location = f.location.trim();
    if (f.notes.trim() !== (event.description || '').trim()) patch.description = f.notes.trim();
    if (across) {
      setBusy(true);
      try {
        const newId = await moveEventAcross(event, to, { patch, copy: series?.copy, removeOriginal: event.recurring ? stopOld : true });
        if (event.recurring) toast({ text: `"${patch.title || event.title}" series copied to ${accountLabel(to.accountId)}${stopOld ? `, and stopped in ${accountLabel(event.accountId)} from this one on` : ''}.`, ttl: 8000 });
        else movedToast({ ...event, title: patch.title || event.title }, newId, to);
        onDone(true);
      } catch (e) {
        setBusy(false);
        toast({ text: `Couldn't move it: ${e instanceof Error ? e.message : e}`, ttl: 10000 });
      }
      return;
    }
    if (to.calendarName !== event.calendarName) patch.calendarName = to.calendarName;
    if (!Object.keys(patch).length) { onDone(false); return; }
    setBusy(true);
    try {
      await editEvent(event, patch);
      toast({ text: `"${patch.title || event.title}" saved${patch.calendarName ? `, now in ${patch.calendarName}` : ''}.${guests && (patch.start !== undefined || patch.location !== undefined) ? ' Guests are told.' : ''}` });
      onDone(true);
    } catch (e) {
      setBusy(false);
      toast({ text: `Couldn't save it: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
    }
  };
  return (
    <form className="ev-edit" onSubmit={(e) => { e.preventDefault(); if (!bad && !busy) void save(); }}>
      <div className="ev-head">
        <span className="ev-bar" style={{ background: toAcc?.colour }} />
        <input className="ev-title-in" aria-label="Title" value={f.title} autoFocus onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="ev-form">
        <label htmlFor="ev-day">When</label>
        <div className="ev-when">
          <input id="ev-day" type="date" value={f.day} onChange={(e) => { const len = msAt(f.endDay) - msAt(f.day); const nd = e.target.value; set({ day: nd, endDay: ymdOf(msAt(nd) + Math.max(0, len)) }); }} />
          {!f.allDay && <input type="time" aria-label="From" value={f.from} onChange={(e) => { const keep = msAt(f.day, f.to) - msAt(f.day, f.from); const nf = e.target.value; const ne = msAt(f.day, nf) + keep; set({ from: nf, to: hmOf(ne), endDay: ymdOf(ne) }); }} />}
          <span className="ev-to">to</span>
          {(f.allDay || f.endDay !== f.day) && <input type="date" aria-label="Last day" value={f.endDay} min={f.day} onChange={(e) => set({ endDay: e.target.value })} />}
          {!f.allDay && <input type="time" aria-label="To" value={f.to} onChange={(e) => set({ to: e.target.value })} />}
        </div>
        <span>All day</span>
        <div><input type="checkbox" role="switch" className="switch" aria-label="All day" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} /></div>
        <label htmlFor="ev-cal">Calendar</label>
        <button type="button" id="ev-cal" className="ev-cal-btn" aria-haspopup="menu" onClick={(e) => calMenu.open(e.currentTarget.getBoundingClientRect(), calendarItems(event, to, setTo))}>
          <span className="menu-dot" style={{ background: toAcc?.colour }} /><span className="grow">{to.calendarName}{toAcc && (across || calendarChoices().length > 1) ? <small> · {toAcc.label || toAcc.email}</small> : null}</span><Icon name="chevronDown" size={12} />
        </button>
        {calMenu.node}
        {event.recurring && <><span>Repeats</span><span className="ev-static">{series?.copy?.repeat ? describeRepeat(series.copy.repeat) : series?.copy?.repeatUnsupported ? "In a way that can't be copied" : series?.error ? "Couldn't read it" : 'Reading…'}</span></>}
        <label htmlFor="ev-where">Where</label>
        <input id="ev-where" placeholder="Add a place" value={f.location} onChange={(e) => set({ location: e.target.value })} />
        <label htmlFor="ev-notes">Notes</label>
        <textarea id="ev-notes" rows={3} placeholder="Add notes" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      {across ? (
        <div className="ev-move-note" role="note">
          <Icon name="info" size={15} />
          <div>
            {event.recurring
              ? <>Copies <b>the whole series</b> to <b>{accountLabel(to.accountId)}</b>, repeating the same way, from this one on.</>
              : <>Moves from <b>{accountLabel(event.accountId)}</b> to <b>{accountLabel(to.accountId)}</b>. It's added to {accountLabel(to.accountId)}'s calendar and taken out of {accountLabel(event.accountId)}'s, with the title, time, place and notes.</>}
            {guests > 0 && <> {guests === 1 ? 'Your guest gets' : <>Your <b>{guests} guests</b> get</>} a new invitation from {toAcc?.email} and a cancellation for the old one, so they'll need to answer again.</>}
            {event.meetingUrl && <> The {meetingService(event.meetingUrl)} link belongs to the old event, so a new one is made.</>}
            {event.recurring && series?.copy?.repeatUnsupported && <> This series repeats in a way that can't be copied, so it stays where it is.</>}
            {event.recurring && <label className="switch-line ev-stop"><input type="checkbox" role="switch" className="switch" checked={stopOld} onChange={(e) => setStopOld(e.target.checked)} /> Then delete it from {accountLabel(event.accountId)} (this one on)</label>}
          </div>
        </div>
      ) : (event.recurring || guests > 0) && <p className="hint ev-note">{event.recurring ? 'This changes only this one, not the whole series. ' : ''}{guests ? `${guests === 1 ? 'The guest is' : `The ${guests} guests are`} told about changes.` : ''}</p>}
      {bad && <p className="hint ev-note bad">{bad}</p>}
      <div className="ev-actions">
        <button type="submit" className="btn primary" disabled={Boolean(bad) || busy || (across && event.recurring && !series?.copy?.repeat)}>{busy ? (across ? 'Moving…' : 'Saving…') : across ? (event.recurring ? `Copy series to ${accountLabel(to.accountId)}` : `Move to ${accountLabel(to.accountId)}`) : 'Save'}</button>
        <button type="button" className="btn" onClick={() => onDone(false)}>Cancel</button>
        {!across && providerFor(event.accountId)?.deleteEvent && <button type="button" className="btn danger ev-delete" onClick={() => void removeEvent(event, () => onDone(true))}>Delete event</button>}
      </div>
    </form>
  );
}
