// Invitations in one place: the envelope button in the Calendar & Reminders header with a count while new invitations
// wait, and its pop-up with New and Replied. Each invitation is answered with Accept, Maybe or Decline (one click, with
// an optional note to the organiser). The sidebar line and the "Not answered" tag in Coming up open the same pop-up.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { Icon } from './Icon';
import { useDialogFocus } from './ui';
import { EventPreview } from './EventPopup';
import { useCalendarFilter, useMinute, useColour, dayText, timeText } from './calendarBits';
import { useMail, answerEvent, deleteEvent, openScreen, reconnectAccount, toast } from '../lib/mail';
import { useCalCache } from '../lib/calendarCache';
import { visibleEvents, meetingService } from '../lib/meetings';
import { RSVP_ORDER, RSVP_WORDS, clashFor, copiesOf, invitationLists, newInvitationCount, rsvpOfAnswer, type Rsvp } from '../lib/invites';
import { CalendarPermissionError } from '../lib/providers/provider';
import type { CalendarEvent } from '../lib/types';
import '../styles/invitations.css';

/** Whether the pop-up is open, so the sidebar line and Coming up can open it from anywhere. */
export const useInvitationsPop = create<{ open: boolean; tab: 'new' | 'replied' }>(() => ({ open: false, tab: 'new' }));

/** Goes to Calendar & Reminders with the Invitations pop-up open on New. */
export function openInvitations() {
  if (useMail.getState().screen !== 'reminders') openScreen('reminders');
  useInvitationsPop.setState({ open: true, tab: 'new' });
}

/**
 * Every event the calendar knows about (the near events, fresher, then the copy that reaches a year ahead), from the
 * calendars being shown, split into New and Replied invitations.
 */
export function useInvitations() {
  const near = useMail((s) => s.events);
  const copy = useCalCache((c) => c.events);
  const { hidden, only } = useCalendarFilter();
  const tick = useMinute();
  return useMemo(() => {
    const seen = new Set(near.map((e) => e.id));
    const all = visibleEvents([...near, ...copy.filter((e) => !seen.has(e.id))], hidden, only);
    const lists = invitationLists(all, Date.now());
    return { all, ...lists, count: newInvitationCount(lists) };
  }, [near, copy, hidden, only, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

const initials = (name: string) => {
  const words = name.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
};

function whenText(e: CalendarEvent): string {
  if (e.allDay) {
    const days = Math.round((e.end - e.start) / 86400000);
    return days > 1 ? `${dayText(e.start)} to ${dayText(e.end - 1)}, all day` : `${dayText(e.start)}, all day`;
  }
  const sameDay = new Date(e.start).toDateString() === new Date(e.end).toDateString();
  return `${dayText(e.start)}, ${timeText(e.start)} to ${sameDay ? '' : `${dayText(e.end)}, `}${timeText(e.end)}`;
}

const organiserOf = (e: CalendarEvent) => e.organiser || e.guests?.find((g) => g.organiser);

/** The envelope button for the Calendar & Reminders header, with its pop-up. */
export function InvitationsButton() {
  const { all, fresh, replied, count } = useInvitations();
  const open = useInvitationsPop((p) => p.open);
  const tab = useInvitationsPop((p) => p.tab);
  const [preview, setPreview] = useState<CalendarEvent | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const focusRef = useDialogFocus();
  // Placed against the window, under the button, so the screen's scrolling areas can't clip it.
  const [place, setPlace] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const at = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(440, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.right - width, window.innerWidth - width - 16));
      const top = r.bottom + 8;
      setPlace({ top, left, width, maxHeight: Math.max(220, Math.min(640, window.innerHeight - top - 16)) });
    };
    at();
    window.addEventListener('resize', at);
    return () => window.removeEventListener('resize', at);
  }, [open]);
  const close = () => useInvitationsPop.setState({ open: false });
  useEffect(() => {
    if (!open || preview) return;
    // Clicks on a note (its Undo) or a dialog opened from here don't close it.
    const away = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!box.current?.contains(t) && !t.closest?.('.toasts, .modal, [role="dialog"]')) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open, preview]);
  // Leaving Calendar & Reminders closes it.
  useEffect(() => () => { if (useMail.getState().screen !== 'reminders') close(); }, []);
  const label = count ? `Invitations, ${count} new` : 'Invitations';
  const list = tab === 'new' ? fresh : replied;
  return (
    <div className="inv-wrap" ref={box}>
      <button ref={btn} className={`icon-btn inv-btn ${count ? 'has-new' : ''}`} title={label} aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => useInvitationsPop.setState({ open: !open, tab: open ? tab : 'new' })}>
        <Icon name="mail" size={16} />
        {count > 0 && <span className="inv-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="inv-pop" role="dialog" aria-label="Invitations" ref={focusRef} style={place ? { top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight } : { visibility: 'hidden' }}>
          <div className="inv-pop-head">
            <strong className="grow">Invitations</strong>
            <div className="seg" role="group" aria-label="Show">
              <button className={tab === 'new' ? 'on' : ''} aria-pressed={tab === 'new'} onClick={() => useInvitationsPop.setState({ tab: 'new' })}>New{count ? ` · ${count}` : ''}</button>
              <button className={tab === 'replied' ? 'on' : ''} aria-pressed={tab === 'replied'} onClick={() => useInvitationsPop.setState({ tab: 'replied' })}>Replied</button>
            </div>
            <button className="icon-btn" aria-label="Close Invitations" onClick={close}><Icon name="close" size={14} /></button>
          </div>
          <div className="inv-list">
            {!list.length ? (
              <div className="inv-empty">{tab === 'new' ? 'No new invitations. You\'re all caught up.' : 'Invitations you\'ve answered show here until they\'ve happened.'}</div>
            ) : list.map((e) => <InvitationRow key={e.id} event={e} all={all} onOpen={() => setPreview(e)} />)}
          </div>
        </div>
      )}
      {preview && <EventPreview event={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function InvitationRow({ event: e, all, onOpen }: { event: CalendarEvent; all: CalendarEvent[]; onOpen: () => void }) {
  const accounts = useMail((s) => s.accounts);
  const colour = useColour();
  const [busy, setBusy] = useState(false);
  const org = organiserOf(e);
  const orgName = org ? org.name || org.email : 'Someone';
  const account = accounts.find((a) => a.id === e.accountId);
  const current = rsvpOfAnswer(e.myResponse);
  const clash = useMemo(() => (current ? undefined : clashFor(e, all)), [e, all, current]);
  const where = e.meetingUrl ? meetingService(e.meetingUrl) : e.location && !/^https?:/i.test(e.location) ? e.location : '';

  const remove = async () => {
    setBusy(true);
    try { await deleteEvent(e); toast({ text: `"${e.title}" removed from your calendar.` }); } catch (err) {
      toast({ text: `Couldn't remove it: ${err instanceof Error ? err.message : err}`, ttl: 9000 });
    } finally { setBusy(false); }
  };

  return (
    <div className={`inv-item ${e.cancelled ? 'cancelled' : ''}`}>
      <span className="inv-bar" style={{ background: colour(e.accountId) }} aria-hidden="true" />
      <span className="inv-av" aria-hidden="true">{initials(orgName)}</span>
      <div className="inv-body">
        <div className="inv-name">{e.title}</div>
        <div className="inv-sub">
          {e.cancelled ? `${orgName} · cancelled by the organiser` : `${orgName} · ${account?.label || account?.email || e.calendarName}${e.repeatText ? ` · ${e.repeatText}` : e.recurring ? ' · repeats' : ''}`}
        </div>
        <div className="inv-when">{whenText(e)}{where ? ` · ${where}` : ''}</div>
        {clash && <div className="inv-clash"><Icon name="alert" size={12} /> Clashes with {clash.title}</div>}
        {e.cancelled ? (
          <div className="inv-answers"><button className="btn small" disabled={busy} onClick={remove}>Remove from my calendar</button></div>
        ) : <InviteAnswers event={e} all={all} />}
      </div>
      <button className="icon-btn inv-open" title="Open the event" aria-label={`Open ${e.title}`} onClick={onOpen}><Icon name="chevronRight" size={14} /></button>
    </div>
  );
}

/**
 * Accept, Maybe and Decline for an invitation, with Add a note (sent with the answer). Used in Invitations and on the
 * event pop-up. Once answered, picking another answer changes it, and a note can go with that too.
 */
export function InviteAnswers({ event: e, all }: { event: CalendarEvent; all?: CalendarEvent[] }) {
  const accounts = useMail((s) => s.accounts);
  const near = useMail((s) => s.events);
  const copy = useCalCache((c) => c.events);
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const org = organiserOf(e);
  const orgName = org ? org.name || org.email : 'Someone';
  const account = accounts.find((a) => a.id === e.accountId);
  const current = rsvpOfAnswer(e.myResponse);

  const answer = async (status: Rsvp) => {
    if (busy || (status === current && !note.trim())) return;
    setBusy(true);
    const before = current;
    const everything = all || [...near, ...copy.filter((x) => !near.some((n) => n.id === x.id))];
    const copies = copiesOf(e, everything);
    const said = note.trim() || undefined;
    try {
      await answerEvent(copies, status, said);
      setNote(''); setNoteOpen(false);
      toast({
        text: `"${e.title}": ${RSVP_WORDS[status].past}.${said ? ' Your note went with it.' : ''} ${org ? `${orgName} has been told.` : 'The organiser has been told.'}`,
        ttl: 7000,
        // Google has no "not answered" to go back to, so Undo is only there when changing an earlier answer.
        undo: before && before !== status ? () => { answerEvent(copies, before).catch((err) => toast({ text: `Couldn't change it back: ${err instanceof Error ? err.message : err}`, ttl: 9000 })); } : undefined,
      });
    } catch (err) {
      if (err instanceof CalendarPermissionError && account) {
        toast({ text: `${account.label || account.email} needs one more sign in so Well Good Mail can answer invitations.`, action: { label: 'Sign in', run: () => void reconnectAccount(account.id) }, ttl: 12000 });
      } else toast({ text: `Couldn't send your answer: ${err instanceof Error ? err.message : err}`, ttl: 9000 });
    } finally { setBusy(false); }
  };

  return (
    <div className="inv-answer-block">
      <div className="inv-answers" role="group" aria-label={`Your answer to ${e.title}`}>
        {RSVP_ORDER.map((s) => (
          <button type="button" key={s} className={`inv-ans ${current === s ? `on ${s}` : ''}`} aria-pressed={current === s} disabled={busy} title={current === s && note.trim() ? 'Send your note with this answer' : undefined} onClick={() => answer(s)}>{RSVP_WORDS[s].label}</button>
        ))}
      </div>
      {noteOpen ? (
        <>
          <textarea className="inv-note-box" rows={2} autoFocus placeholder={`A note for ${orgName}, sent with your answer`} aria-label={`Note for ${orgName}`} value={note} onChange={(x) => setNote(x.target.value)} />
          <div className="inv-note-hint">{current ? `Pick an answer to send it. Picking ${RSVP_WORDS[current].label} again sends just the note.` : 'Pick an answer above to send it.'}</div>
        </>
      ) : (
        <button type="button" className="link-btn inv-add-note" onClick={() => setNoteOpen(true)}>{current ? 'Change your answer with a note' : 'Add a note'}</button>
      )}
    </div>
  );
}

/** The small "Not answered" tag on an invitation in Coming up. Opens the Invitations pop-up. */
export function NotAnsweredTag() {
  return (
    <button className="inv-tag" title="Open Invitations to answer it" onClick={(k) => { k.stopPropagation(); openInvitations(); }} onKeyDown={(k) => k.stopPropagation()}>Not answered</button>
  );
}
