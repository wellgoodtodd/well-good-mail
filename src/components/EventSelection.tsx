// Several events at once: Ctrl-click or a box drawn across the calendar picks them, and the bar above the calendar
// (or right-click) moves them all to another calendar or deletes them. Only the calendar can change for a group,
// since names and times differ.
import { useEffect } from 'react';
import { create } from 'zustand';
import { Icon } from './Icon';
import { useMenu, type MenuItem } from './ui';
import { useMail, calendarChoices, writableCalendars, canMoveAcross, moveEventAcross, editEvent, deleteEvent, toast } from '../lib/mail';
import { useCalCache } from '../lib/calendarCache';
import { askChoice, askConfirm } from '../lib/dialogs';
import { guestsToTell } from '../lib/eventFlows';
import type { CalendarEvent } from '../lib/types';

export const useEventSelection = create<{ ids: string[] }>(() => ({ ids: [] }));
export const toggleSelected = (id: string) => useEventSelection.setState((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] }));
export const setSelected = (ids: string[], add = false) => useEventSelection.setState((s) => ({ ids: add ? [...new Set([...s.ids, ...ids])] : ids }));
export const clearSelected = () => { if (useEventSelection.getState().ids.length) useEventSelection.setState({ ids: [] }); };

/** The picked events, from the near list or the longer copy on this computer. */
export function selectedEvents(): CalendarEvent[] {
  const ids = useEventSelection.getState().ids;
  const near = useMail.getState().events;
  const copy = useCalCache.getState().events;
  return ids.map((id) => near.find((e) => e.id === id) || copy.find((e) => e.id === id)).filter((e): e is CalendarEvent => Boolean(e));
}

const accountName = (id: string) => { const a = useMail.getState().accounts.find((x) => x.id === id); return a ? a.label || a.email : ''; };

/** Every calendar the picked events could go in. */
function moveItems(list: CalendarEvent[], onPick: (to: { accountId: string; calendarName: string }) => void): MenuItem[] {
  const items: MenuItem[] = [];
  const accounts = new Set(list.map((e) => e.accountId));
  for (const { account, calendars } of calendarChoices()) {
    items.push({ heading: account.label || account.email });
    for (const c of calendars) items.push({ label: c, dot: account.colour, onClick: () => onPick({ accountId: account.id, calendarName: c }) });
  }
  // A calendar that only the events' own account has (e.g. not offered for new events) is still offered.
  for (const id of accounts) for (const c of writableCalendars(id)) if (!items.some((i) => 'label' in i && i.label === c)) items.push({ label: c, onClick: () => onPick({ accountId: id, calendarName: c }) });
  return items;
}

/** Runs the work for each item, four at a time (each change already shows on screen). */
async function inTurn<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => { while (queue.length) await work(queue.shift()!); }));
}

/** Moves the picked events to one calendar: within an account they keep their id and replies; across, they're made again. */
export async function moveSelected(list: CalendarEvent[], to: { accountId: string; calendarName: string }) {
  const mine = list.filter((e) => e.canEdit);
  const skipped = list.length - mine.length;
  const across = mine.filter((e) => e.accountId !== to.accountId);
  const withGuests = across.filter((e) => guestsToTell(e) > 0);
  const cantGo = across.filter((e) => !canMoveAcross(e) || e.recurring);
  let go = mine.filter((e) => !cantGo.includes(e));
  if (withGuests.length) {
    const ok = await askChoice(
      `${withGuests.length === 1 ? '1 of these has' : `${withGuests.length} of these have`} guests`,
      `Moving ${withGuests.length === 1 ? 'it' : 'them'} to ${accountName(to.accountId)} sends everyone a new invitation, and their replies are lost. Events in the same account move cleanly.`,
      [...(go.length > withGuests.length ? [{ id: 'others', label: `Move the other ${go.length - withGuests.length} only` }] : []), { id: 'all', label: `Move all ${go.length}`, primary: true }],
    );
    if (!ok) return;
    if (ok === 'others') go = go.filter((e) => !withGuests.includes(e));
  }
  let done = 0;
  const failed: string[] = [];
  clearSelected();
  // Each one shows in its new calendar at once; a few go to the calendar side by side, and any refused go back.
  await inTurn(go, async (e) => {
    try {
      if (e.accountId === to.accountId) { if (e.calendarName !== to.calendarName) await editEvent(e, { calendarName: to.calendarName }, { scope: 'one' }); }
      else await moveEventAcross(e, to, { removeOriginal: true });
      done++;
    } catch (err) { failed.push(`${e.title} (${err instanceof Error ? err.message : err})`); }
  });
  const notes = [
    skipped ? `${skipped} made by someone else stayed where ${skipped === 1 ? 'it was' : 'they were'}` : '',
    cantGo.length ? `${cantGo.length} repeating ${cantGo.length === 1 ? 'event' : 'events'} can only move one at a time from its own pop-up` : '',
    failed.length ? `Couldn't move ${failed.join('; ')}` : '',
  ].filter(Boolean);
  toast({ text: `${done} ${done === 1 ? 'event' : 'events'} moved to ${to.calendarName}.${notes.length ? ` ${notes.join('. ')}.` : ''}`, ttl: notes.length ? 12000 : 5000 });
}

/** Deletes the picked events (only these ones of any series). */
export async function deleteSelected(list: CalendarEvent[]) {
  const mine = list.filter((e) => e.canEdit);
  if (!mine.length) { toast({ text: 'These were made by someone else, so they can only be declined, not deleted.', ttl: 7000 }); return; }
  const guests = mine.filter((e) => guestsToTell(e) > 0).length;
  const ok = await askConfirm(`Delete ${mine.length} ${mine.length === 1 ? 'event' : 'events'}?`, `They're deleted from the calendars themselves.${guests ? ` ${guests === 1 ? 'One has guests, who are' : `${guests} have guests, who are`} told it's cancelled.` : ''}${mine.some((e) => e.recurring) ? ' For repeating events, only these ones go, not the whole series.' : ''}${mine.length < list.length ? ` ${list.length - mine.length} made by someone else stay.` : ''}`, 'Delete');
  if (!ok) return;
  let done = 0;
  clearSelected();
  await inTurn(mine, async (e) => { try { await deleteEvent(e, { scope: 'one', notify: true }); done++; } catch { /* counted below */ } });
  toast({ text: `${done} ${done === 1 ? 'event' : 'events'} deleted.${done < mine.length ? ` ${mine.length - done} couldn't be deleted and ${mine.length - done === 1 ? 'is' : 'are'} back.` : ''}` });
}

/** The right-click menu for a picked group. */
export function selectionMenuItems(_openMove?: (items: MenuItem[]) => void): MenuItem[] {
  const list = selectedEvents();
  return [
    { heading: `${list.length} events` },
    { label: 'Move to calendar', submenu: moveItems(list, (to) => void moveSelected(list, to)) },
    { label: `Delete ${list.length} events`, onClick: () => void deleteSelected(list) },
    { divider: true },
    { label: 'Clear selection', onClick: clearSelected },
  ];
}

/** The bar above the calendar while events are picked. */
export function SelectionBar({ extra }: { extra?: React.ReactNode } = {}) {
  const ids = useEventSelection((s) => s.ids);
  const menu = useMenu();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && useEventSelection.getState().ids.length && !document.querySelector('.ev-scrim, .dialog-scrim')) clearSelected(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  if (!ids.length) return null;
  const list = selectedEvents();
  return (
    <div className="sel-bar" role="toolbar" aria-label="Picked events">
      <b>{ids.length} {ids.length === 1 ? 'event' : 'events'} selected</b>
      <span className="grow" />
      {extra}
      <button className="btn" aria-haspopup="menu" onClick={(e) => menu.open(e.currentTarget.getBoundingClientRect(), moveItems(list, (to) => void moveSelected(list, to)))}>Move to calendar <Icon name="chevronDown" size={12} /></button>
      <button className="btn ghost danger" onClick={() => void deleteSelected(list)}>Delete</button>
      <button className="btn ghost" onClick={clearSelected}>Clear</button>
      {menu.node}
    </div>
  );
}
