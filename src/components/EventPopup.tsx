// The pop-up for one event: its details, and the form for changing or moving it (to any account).
import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useMail, refreshEvents, lastEventsRefresh, toast, writableCalendars, providerFor, calendarChoices, canMoveAcross, eventCopy, moveEventAcross } from '../lib/mail';
import { changeEvent, removeEvent } from '../lib/eventFlows';
import { askConfirm } from '../lib/dialogs';
import { EventForm, openMeetingSettings } from './NewEvent';
import { useDialogFocus, useMenu, type MenuItem } from './ui';
import { describeRepeat } from '../lib/recurrence';
import { meetingService, dedupeEvents, inviteText } from '../lib/meetings';
import { startCompose } from '../lib/composeActions';
import { openExternal } from '../lib/platform';
import type { CalendarEvent, EventGuest, EventPatch } from '../lib/types';
import { InviteAnswers } from './Invitations';
import { isInvitation } from '../lib/invites';
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
  const calMenu = useMenu();
  const editable = Boolean(event.canEdit && providerFor(event.accountId)?.editEvent);
  // Two clicks to put it somewhere else. Anything with guests, a video link or a repeat says what happens first, then moves.
  const quickMove = async (to: CalTarget) => {
    if (to.accountId === event.accountId && to.calendarName === event.calendarName) return;
    if (to.accountId === event.accountId) { await changeEvent(event, { calendarName: to.calendarName }, { scope: 'one' }); return; }
    const guestCount = (event.guests || []).filter((g) => !g.self).length;
    if (event.recurring || event.meetingUrl || guestCount) {
      const notes = [
        `It's made in ${accountLabel(to.accountId)} and taken out of ${accountLabel(event.accountId)}.`,
        guestCount ? (guestCount === 1 ? 'Your guest gets a new invitation.' : `Your ${guestCount} guests get a new invitation.`) : '',
        event.meetingUrl ? `The ${meetingService(event.meetingUrl)} link changes to a new one.` : '',
        event.recurring ? 'The series is copied from this one on.' : '',
      ].filter(Boolean).join(' ');
      if (!(await askConfirm(`Move "${event.title}" to ${accountLabel(to.accountId)}?`, notes, 'Move'))) return;
    }
    try { const newId = await moveEventAcross(event, to, { removeOriginal: true }); movedToast(event, newId, to); onClose(); } catch (e) { toast({ text: `Couldn't move it: ${e instanceof Error ? e.message : e}`, ttl: 9000 }); }
  };
  const refresh = async () => { setRefreshing(true); try { await refreshEvents({ everyone: true }); } finally { setRefreshing(false); } };
  // Opening an event with guests pulls the latest answers, unless they were fetched in the last minute.
  useEffect(() => { if (picked.guests?.length && Date.now() - lastEventsRefresh() > 60000) void refresh(); }, [picked.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The quick edit: name, day and times change right here; Save shows once something has changed.
  const placeOf = (ev: CalendarEvent) => (ev.location && !ev.location.startsWith('http') ? ev.location : '');
  const quickOf = (ev: CalendarEvent) => ({ title: ev.title, day: ymdOf(ev.start), from: hmOf(ev.start), to: hmOf(ev.end), endDay: ymdOf(ev.allDay ? ev.end - 1 : ev.end), place: placeOf(ev) });
  const [q, setQ] = useState(() => quickOf(event));
  useEffect(() => { setQ(quickOf(event)); }, [event.id, event.start, event.end, event.title, event.location]); // eslint-disable-line react-hooks/exhaustive-deps
  const qStart = event.allDay ? msAt(q.day) : msAt(q.day, q.from);
  const qEnd = event.allDay ? msAt(q.endDay < q.day ? q.day : q.endDay) + 86400000 : msAt(q.endDay <= q.day ? q.day : q.endDay, q.to);
  const qPatch: EventPatch = {};
  if (q.title.trim() && q.title.trim() !== event.title) qPatch.title = q.title.trim();
  if (qStart !== event.start || qEnd !== event.end) { qPatch.start = qStart; qPatch.end = qEnd; }
  if (q.place.trim() !== placeOf(event)) qPatch.location = q.place.trim();
  // No call yet: one click adds one (Google Meet, or Teams on Microsoft), where the Join button would be.
  const accKind = accounts.find((a) => a.id === event.accountId)?.kind;
  const videoName = accKind === 'microsoft' ? 'Teams meeting' : accKind === 'gmail' || accKind === 'demo' ? 'Google Meet' : '';
  const [addingCall, setAddingCall] = useState(false);
  const addCall = async () => { setAddingCall(true); try { await changeEvent(event, { video: true }); } finally { setAddingCall(false); } };
  const qChanged = Object.keys(qPatch).length > 0;
  const qBad = qEnd <= qStart ? 'It ends before it starts.' : '';
  const [saving, setSaving] = useState(false);
  const saveQuick = async () => {
    if (!qChanged || qBad || saving) return;
    setSaving(true);
    const ok = await changeEvent(event, qPatch);
    setSaving(false);
    if (ok) onClose();
  };
  const ids = event.accountIds?.length ? event.accountIds : [event.accountId];
  const labels = ids.map((id) => accounts.find((a) => a.id === id)?.label || accounts.find((a) => a.id === id)?.email || '').filter(Boolean);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (!editing) onClose(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, editing]);
  // An invitation you haven't answered yet can be answered right here.
  const unanswered = isInvitation(event) && !event.cancelled && event.myResponse === 'waiting' && Boolean(providerFor(event.accountId)?.respondToEvent);
  const sameDay = new Date(event.start).toDateString() === new Date(event.end).toDateString();
  const guestList = (event.guests || []).map((g) => { if (!g.self || g.name) return g; const acc = accounts.find((x) => x.email.toLowerCase() === g.email || x.aliases.some((al) => al.email.toLowerCase() === g.email)); const name = acc?.aliases.find((al) => al.isDefault)?.name || acc?.aliases[0]?.name; return name ? { ...g, name } : g; });
  const others = guestList.filter((g) => !g.self);
  const writeTo = (to: EventGuest[]) => { void startCompose('new', undefined, { extra: { to: to.map((g) => ({ email: g.email, name: g.name })), subject: event.title } }); };
  if (editing) return <EventForm event={event} expanded onClose={(closeAll) => { setEditing(false); if (closeAll) onClose(); }} />;
  return (
    <div className="ev-scrim" onClick={() => { if (!qChanged) onClose(); }}>
      <div className="ev-pop" role="dialog" aria-modal="true" aria-label={event.title} ref={focusRef} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e) => { e.preventDefault(); void saveQuick(); }}>
        <div className="ev-head">
          <span className="ev-bar" style={{ background: chipBackground(ids, colour) }} />
          {editable ? <input className="ev-title-in ev-quick-title" aria-label="Title" value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} /> : <h2>{event.title}</h2>}
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        {editable ? (
          <div className="ev-line ev-quick-when"><Icon name="clock" size={15} />
            <input type="date" aria-label="Day" value={q.day} onChange={(e) => { if (!e.target.value) return; const len = msAt(q.endDay) - msAt(q.day); setQ({ ...q, day: e.target.value, endDay: ymdOf(msAt(e.target.value) + Math.max(0, len)) }); }} />
            {event.allDay ? <span>all day</span> : <>
              <input type="time" aria-label="From" value={q.from} onChange={(e) => { const keep = msAt(q.endDay, q.to) - msAt(q.day, q.from); const ne = msAt(q.day, e.target.value) + Math.max(15 * 60000, keep); setQ({ ...q, from: e.target.value, to: hmOf(ne), endDay: ymdOf(ne) }); }} />
              <span>to</span>
              {q.endDay !== q.day && <input type="date" aria-label="Last day" value={q.endDay} min={q.day} onChange={(e) => setQ({ ...q, endDay: e.target.value })} />}
              <input type="time" aria-label="To" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} />
            </>}
          </div>
        ) : <div className="ev-line"><Icon name="clock" size={15} /> {event.allDay ? `${dayText(event.start)}, all day` : `${dayText(event.start)}, ${timeText(event.start)} to ${sameDay ? '' : `${dayText(event.end)}, `}${timeText(event.end)}`}</div>}
        {qBad && <p className="hint ev-note bad">{qBad}</p>}
        {event.recurring && <RepeatLine event={event} />}
        {editable && calendarChoices().length
          ? <button className="ev-line ev-cal-link" title="Put it in another calendar" onClick={(e) => calMenu.open(e.currentTarget.getBoundingClientRect(), calendarItems(event, { accountId: event.accountId, calendarName: event.calendarName }, (to) => void quickMove(to)))}><Icon name="calendar" size={15} /> <span>{event.calendarName}{labels.length ? ` · ${labels.join(', ')}` : ''}</span><Icon name="chevronDown" size={12} /></button>
          : <div className="ev-line"><Icon name="calendar" size={15} /> {event.calendarName}{labels.length ? ` · ${labels.join(', ')}` : ''}</div>}
        {calMenu.node}
        {ids.length > 1 && <div className="ev-line"><AccountDots event={event} /> On {ids.length} of your calendars</div>}
        {editable
          ? <div className="ev-line ev-quick-place"><Icon name="folder" size={15} /><input aria-label="Location" placeholder="Add a location" value={q.place} onChange={(e) => setQ({ ...q, place: e.target.value })} /></div>
          : event.location && !event.location.startsWith('http') && <div className="ev-line"><Icon name="folder" size={15} /> {event.location}</div>}
        {event.meetingUrl && <div className="ev-line"><Icon name="link" size={15} /> {meetingService(event.meetingUrl)} call</div>}
        {event.description && <p className="ev-notes">{event.description}</p>}
        {event.guests && event.guests.length > 0 && (
          <div className="ev-guests">
            <GuestList guests={guestList} subject={event.title} actions={false} />
          </div>
        )}
        {!event.canEdit && event.guests?.some((g) => g.organiser && !g.self) && <p className="hint ev-note">Only the organiser can change the time or details.{unanswered ? '' : ' You can still change your answer in Invitations.'}</p>}
        {unanswered && <InviteAnswers event={event} />}
        <div className="ev-actions">
          {editable && qChanged && <button type="submit" className="btn primary" disabled={Boolean(qBad) || saving}>{saving ? 'Saving…' : 'Save'}</button>}
          {editable && <button type="button" className="btn" onClick={() => setEditing(true)}>More options</button>}
          {event.meetingUrl
            ? <><JoinButton event={event} />{event.htmlLink && editable && <button type="button" className="link-btn ev-meet-settings" onClick={() => void openMeetingSettings(event.id, event.htmlLink)}>{meetingService(event.meetingUrl)} settings ↗</button>}</>
            : editable && videoName && !qChanged && <button type="button" className="btn" disabled={addingCall} onClick={() => void addCall()}><Icon name="plus" size={13} /> {addingCall ? 'Adding…' : `Add ${videoName}`}</button>}
          <button type="button" className="btn" onClick={() => { void navigator.clipboard?.writeText(inviteText(event)).then(() => toast({ text: 'Invite copied. Paste it anywhere.', ttl: 2500 }), () => toast({ text: "Couldn't copy the invite", ttl: 4000 })); }}>Copy invite</button>
          <span className="cal-picker">
            <button className="btn" aria-expanded={more} onClick={() => setMore(!more)}>More <Icon name="chevronDown" size={12} /></button>
            {more && (
              <div className="cal-pop inv-change up" role="menu">
                {others.length > 0 && <button role="menuitem" className="btn ghost" onClick={() => { setMore(false); writeTo(others); }}>Email everyone</button>}
                {others.some((g) => g.answer === 'waiting') && <button role="menuitem" className="btn ghost" onClick={() => { setMore(false); writeTo(others.filter((g) => g.answer === 'waiting')); }}>Email those waiting</button>}
                {guestList.length > 0 && <button role="menuitem" className="btn ghost" disabled={refreshing} onClick={() => { setMore(false); void refresh(); }}>{refreshing ? 'Checking...' : 'Refresh answers'}</button>}
                {event.htmlLink && event.meetingUrl && editable && <button type="button" role="menuitem" className="btn ghost" onClick={() => { setMore(false); void openMeetingSettings(event.id, event.htmlLink); }}>Meeting settings</button>}
                {event.htmlLink && <button type="button" role="menuitem" className="btn ghost" onClick={() => { setMore(false); openExternal(event.htmlLink!); }}>Open in calendar</button>}
                {editable && providerFor(event.accountId)?.deleteEvent && <button type="button" role="menuitem" className="btn ghost danger" onClick={() => { setMore(false); let closed = false; void removeEvent(event, { answered: () => { closed = true; onClose(); } }).then((ok) => { if (ok && !closed) onClose(); }); }}>Delete event</button>}
              </div>
            )}
          </span>
        </div>
        </form>
      </div>
    </div>
  );
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
