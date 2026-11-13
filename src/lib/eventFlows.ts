// Changing and deleting events the same way everywhere (the pop-up, the full form, dragging, several at once):
// a repeating event asks which ones, an event with guests asks whether to tell them, and the change has Undo.
import { askChoice, askConfirm } from './dialogs';
import { record, undoEntry } from './history';
import { deleteEvent, editEvent, toast, useMail } from './mail';
import type { CalendarEvent, EventPatch, SeriesScope } from './types';

/** Guests other than you, on an event you organise (only then are they told about changes). */
export function guestsToTell(ev: CalendarEvent): number {
  if (!ev.canEdit) return 0;
  return (ev.guests || []).filter((g) => !g.self).length;
}

/** For a repeating event: which ones. Null when cancelled. */
export async function askScope(ev: CalendarEvent, verb: 'change' | 'delete' | 'move'): Promise<SeriesScope | null> {
  if (!ev.recurring) return 'one';
  const title = verb === 'delete' ? 'Delete a repeating event' : 'Change a repeating event';
  const what = verb === 'delete' ? 'Delete just this one, this one and every one after it, or the whole series?' : verb === 'move' ? 'Move just this one, or this one and every one after it?' : 'Change just this one, this one and every one after it, or the whole series?';
  // Reading order, left to right: the smallest change first.
  const choices = [
    { id: 'one', label: 'Only this event', primary: true, danger: verb === 'delete' },
    { id: 'following', label: 'This and all future events', danger: verb === 'delete' },
    ...(verb === 'move' ? [] : [{ id: 'all', label: 'The whole series', danger: verb === 'delete' }]),
  ];
  const r = await askChoice(title, `"${ev.title}" repeats. ${what}`, choices);
  return (r as SeriesScope | null) || null;
}

/** Whether to email the guests about a change. Null when cancelled. */
export async function askNotify(ev: CalendarEvent, verb: 'change' | 'delete'): Promise<boolean | null> {
  const n = guestsToTell(ev);
  if (!n) return true;
  const who = n === 1 ? 'your guest' : `your ${n} guests`;
  if (verb === 'delete') {
    const r = await askChoice(`Cancel "${ev.title}"?`, `It has ${n === 1 ? 'a guest' : `${n} guests`}. Tell ${who} the meeting is cancelled?`, [
      { id: 'quiet', label: 'Delete without telling them', danger: true },
      { id: 'tell', label: 'Cancel the meeting and tell guests', primary: true, danger: true },
    ]);
    return r === null ? null : r === 'tell';
  }
  const r = await askChoice(`Send an update to ${who}?`, `"${ev.title}" has ${n === 1 ? 'a guest' : `${n} guests`}. They can be emailed about the change.`, [
    { id: 'quiet', label: "Don't send" },
    { id: 'tell', label: n === 1 ? 'Send an update' : `Send an update to ${n} guests`, primary: true },
  ]);
  return r === null ? null : r === 'tell';
}

/** The patch that puts back what a patch changed (the simple fields only). */
export function undoPatch(ev: CalendarEvent, patch: EventPatch): EventPatch | undefined {
  const back: EventPatch = {};
  if (patch.title !== undefined) back.title = ev.title;
  if (patch.start !== undefined || patch.end !== undefined || patch.allDay !== undefined) { back.start = ev.start; back.end = ev.end; back.allDay = ev.allDay; }
  if (patch.location !== undefined) back.location = ev.location || '';
  if (patch.description !== undefined) back.description = ev.description || '';
  if (patch.calendarName !== undefined) back.calendarName = ev.calendarName;
  const other = (['alerts', 'guests', 'video', 'repeat'] as const).some((k) => patch[k] !== undefined);
  return other || !Object.keys(back).length ? undefined : back;
}

/**
 * Changes an event after asking what's needed. `scope` can be given (a form that already asked).
 * Returns false if cancelled or it failed.
 */
export async function changeEvent(ev: CalendarEvent, patch: EventPatch, opts: { scope?: SeriesScope; quietToast?: boolean } = {}): Promise<boolean> {
  if (!Object.keys(patch).length) return true;
  const scope = opts.scope ?? (await askScope(ev, patch.start !== undefined && Object.keys(patch).every((k) => k === 'start' || k === 'end') ? 'move' : 'change'));
  if (!scope) return false;
  const timeOrPlace = patch.start !== undefined || patch.end !== undefined || patch.allDay !== undefined || patch.location !== undefined || patch.title !== undefined || patch.guests !== undefined || patch.video !== undefined || patch.repeat !== undefined;
  const notify = timeOrPlace ? await askNotify(ev, 'change') : true;
  if (notify === null) return false;
  try {
    await editEvent(ev, patch, { scope, notify });
  } catch (e) {
    toast({ text: `Couldn't save "${ev.title}", so it's back as it was: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
    return false;
  }
  if (opts.quietToast) return true;
  const back = scope === 'one' && !guestsToTell(ev) ? undoPatch(ev, patch) : undefined;
  const title = patch.title ?? ev.title;
  // Ctrl+Z and the Undo button do the same thing, through the app's list of steps.
  const current = () => useMail.getState().events.find((x) => x.id === ev.id) || ({ ...ev } as CalendarEvent);
  const fail = (e: unknown) => { toast({ text: `Couldn't undo it: ${e instanceof Error ? e.message : e}`, ttl: 8000 }); };
  const step = back ? record(`Change event: ${title}`, () => editEvent(current(), back, { scope: 'one' }).catch(fail), () => editEvent(current(), patch, { scope: 'one' }).catch(fail)) : undefined;
  toast({
    text: `"${title}" saved${patch.calendarName ? `, now in ${patch.calendarName}` : ''}.${guestsToTell(ev) && notify ? ' Guests are told.' : ''}`,
    ttl: step ? 7000 : 4000,
    undo: step ? () => { void undoEntry(step); } : undefined,
  });
  return true;
}

/**
 * The organiser's own copy of an event that is on several of your calendars. Deleting a guest's copy (another of your
 * calendars the organiser's account can also write to) only takes it off that calendar and tells nobody, so a
 * cancellation has to delete the organiser's copy for the calendar to email the guests.
 */
export function organiserCopy(ev: CalendarEvent, all: CalendarEvent[] = useMail.getState().events): CalendarEvent {
  const who = ev.organiser?.email?.toLowerCase();
  if (!who) return ev;
  const copies = all.filter((e) => e.title === ev.title && e.start === ev.start && e.end === ev.end && e.canEdit);
  const accounts = useMail.getState().accounts;
  const own = copies.find((e) => e.id.toLowerCase().includes(`|${who}|`))
    || copies.find((e) => e.organiser?.self && accounts.find((a) => a.id === e.accountId)?.email.toLowerCase() === who);
  return own || ev;
}

/** Deletes an event after asking what's needed. Returns false if cancelled or it failed. */
export async function removeEvent(ev: CalendarEvent, opts: { quietToast?: boolean; asked?: boolean } = {}): Promise<boolean> {
  let scope: SeriesScope | null = 'one';
  if (ev.recurring) scope = await askScope(ev, 'delete');
  else if (!guestsToTell(ev) && !opts.asked && !(await askConfirm(`Delete "${ev.title}"?`, "It's deleted from the calendar itself.", 'Delete event'))) return false;
  if (!scope) return false;
  const notify = await askNotify(ev, 'delete');
  if (notify === null) return false;
  try {
    await deleteEvent(notify && guestsToTell(ev) ? organiserCopy(ev) : ev, { scope, notify });
  } catch (e) {
    toast({ text: `Couldn't delete "${ev.title}", so it's back: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
    return false;
  }
  if (!opts.quietToast) toast({ text: scope === 'one' ? `"${ev.title}" deleted.` : scope === 'all' ? `"${ev.title}" series deleted.` : `"${ev.title}" deleted from this one on.` });
  return true;
}
