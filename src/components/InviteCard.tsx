// At the top of an email that is a calendar invitation: when it is, who's invited, a Join button,
// Yes / No / Maybe, and Add to calendar.
import { noteSaved } from '../lib/saves';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { GuestList, JoinButton } from './ComingUp';
import { addInviteToCalendar, answerInvite, canAddToCalendar, getAttachmentData, inviteStatus, reconnectAccount, toast, useMail } from '../lib/mail';
import { parseInvite, RSVP_WORDS, whichIsMe, type Invite, type Rsvp } from '../lib/invites';
import { CalendarPermissionError } from '../lib/providers/provider';
import { calendarEditAllowed } from '../lib/auth/google';
import { saveFile } from '../lib/platform';
import type { CalendarEvent, EventGuest, Message } from '../lib/types';

const isCalendarFile = (a: Message['attachments'][number]) => /calendar|ics/i.test(a.mimeType) || /\.ics$/i.test(a.filename);

const dayText = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeText = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function whenText(i: Invite): string {
  if (i.allDay) return `${dayText(i.start)}, all day`;
  const sameDay = new Date(i.start).toDateString() === new Date(i.end).toDateString();
  return `${dayText(i.start)}, ${timeText(i.start)} to ${sameDay ? '' : `${dayText(i.end)}, `}${timeText(i.end)}`;
}

const personName = (p?: { email: string; name?: string }) => (p ? p.name || p.email : '');

const CHIP: Record<Rsvp, { word: string; cls: 'yes' | 'no' | 'maybe'; glyph: string }> = {
  accepted: { word: 'Going', cls: 'yes', glyph: '✓' },
  declined: { word: 'Not going', cls: 'no', glyph: '✕' },
  tentative: { word: 'Maybe', cls: 'maybe', glyph: '?' },
};

export function InviteCard({ message }: { message: Message }) {
  const account = useMail((s) => s.accounts.find((a) => a.id === message.accountId));
  const [invite, setInvite] = useState<Invite | undefined>();
  const [fileIndex, setFileIndex] = useState(-1);
  const [server, setServer] = useState<{ inCalendar: boolean; response?: Rsvp; guests?: EventGuest[] } | undefined>();
  const [answer, setAnswer] = useState<Rsvp | undefined>();
  const [busy, setBusy] = useState(false);
  const [wanted, setWanted] = useState<Rsvp | undefined>();
  const [needsPermission, setNeedsPermission] = useState(false);
  const [hint, setHint] = useState('');
  const [how, setHow] = useState<'calendar' | 'email' | undefined>();
  const [fresh, setFresh] = useState(false);
  const [menu, setMenu] = useState(false);
  const freshTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { if (freshTimer.current) clearTimeout(freshTimer.current); }, []);
  const files = message.attachments.filter(isCalendarFile);
  const fileKey = files.map((f) => f.id).join('|');

  useEffect(() => {
    let alive = true;
    setInvite(undefined); setServer(undefined); setAnswer(undefined); setNeedsPermission(false); setHint(''); setHow(undefined); setFresh(false); setMenu(false);
    (async () => {
      for (const [i, f] of files.entries()) {
        try {
          const data = await getAttachmentData(message.id, f.id);
          const found = parseInvite(new TextDecoder().decode(data));
          if (found) {
            if (!alive) return;
            setInvite(found); setFileIndex(i);
            inviteStatus(message.id, found).then((s) => { if (alive) setServer(s); });
            return;
          }
        } catch { /* try the next file */ }
      }
    })();
    return () => { alive = false; };
  }, [message.id, fileKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!invite || !account) return null;

  const mine = [account.email, ...(account.aliases || []).map((a) => a.email), message.deliveredTo || '', ...message.to.map((a) => a.email)].filter(Boolean);
  // Only the addresses that are really yours: the account, its aliases and the one this was delivered to. Not everyone it was sent to.
  const own = [account.email, ...(account.aliases || []).map((a) => a.email), message.deliveredTo || ''].filter(Boolean);
  const me = whichIsMe(invite, mine);
  const organiserIsMe = invite.organizer ? mine.some((m) => m.toLowerCase() === invite.organizer!.email) : false;
  const cancelled = invite.method === 'CANCEL';
  const canReply = invite.method === 'REQUEST' && !organiserIsMe && Boolean(invite.organizer);
  const current = answer || server?.response || (me?.status === 'ACCEPTED' ? 'accepted' : me?.status === 'DECLINED' ? 'declined' : me?.status === 'TENTATIVE' ? 'tentative' : undefined);
  const missingPermission = needsPermission || (account.kind === 'gmail' && calendarEditAllowed(account.email) === false);

  const reply = async (status: Rsvp, byEmail = false) => {
    setWanted(status);
    if (!byEmail && account.kind === 'gmail' && calendarEditAllowed(account.email) === false) { setNeedsPermission(true); return; }
    setBusy(true);
    try {
      const how = await answerInvite(message.id, invite, status, { byEmail });
      setAnswer(status); setNeedsPermission(false); setHint(''); setHow(how); setMenu(false); setFresh(true);
      if (freshTimer.current) clearTimeout(freshTimer.current);
      freshTimer.current = setTimeout(() => setFresh(false), 30000);
      toast({ text: how === 'calendar' ? `${RSVP_WORDS[status].past}. The organiser has been told.` : `${RSVP_WORDS[status].past}. A reply has been emailed to ${personName(invite.organizer)}.`, ttl: 4000 });
    } catch (e) {
      if (e instanceof CalendarPermissionError) setNeedsPermission(true);
      else toast({ text: `Couldn't send your answer: ${e instanceof Error ? e.message : e}`, ttl: 8000 });
    } finally { setBusy(false); }
  };

  const add = async () => {
    setBusy(true);
    try {
      await addInviteToCalendar(message.id, invite);
      setServer({ inCalendar: true, response: server?.response, guests: server?.guests });
      toast({ text: 'Added to your calendar', ttl: 3000 });
    } catch (e) {
      if (e instanceof CalendarPermissionError) { setWanted(undefined); setNeedsPermission(true); }
      else toast({ text: `Couldn't add it: ${e instanceof Error ? e.message : e}`, ttl: 8000 });
    } finally { setBusy(false); }
  };

  const allow = async () => {
    setBusy(true);
    await reconnectAccount(account.id);
    setBusy(false);
    if (calendarEditAllowed(account.email) !== false) { setNeedsPermission(false); setHint('Thanks, you are signed in again. Choose your answer once more.'); }
  };

  const saveFileCopy = async () => {
    const f = files[fileIndex];
    if (!f) return;
    try { const where = await saveFile(f.filename || 'invite.ics', await getAttachmentData(message.id, f.id), 'text/calendar'); if (where) noteSaved([where]); } catch (e) { toast({ text: `Couldn't save it: ${e instanceof Error ? e.message : e}` }); }
  };

  return (
    <section className="invite-card" aria-label="Calendar invitation">
      <div className="inv-top">
        <div className="inv-main">
          <div className="inv-title">{invite.title}</div>
          <div className="inv-line"><Icon name="clock" size={14} /> {whenText(invite)}</div>
          {invite.location && !invite.location.startsWith('http') && <div className="inv-line"><Icon name="folder" size={14} /> {invite.location}</div>}
          {invite.organizer && <div className="inv-line"><Icon name="user" size={14} /> From {personName(invite.organizer)}</div>}
        </div>
        {invite.meetingUrl && !cancelled && <JoinButton event={{ meetingUrl: invite.meetingUrl } as CalendarEvent} />}
      </div>

      {cancelled && <div className="inv-note bad">This meeting has been cancelled.</div>}
      {invite.method === 'REPLY' && (
        <div className="inv-note">{personName(invite.attendees[0])} answered: {invite.attendees[0]?.status === 'ACCEPTED' ? 'Yes' : invite.attendees[0]?.status === 'DECLINED' ? 'No' : invite.attendees[0]?.status === 'TENTATIVE' ? 'Maybe' : 'no answer yet'}.</div>
      )}

      {canReply && !current && (
        <div className="inv-row">
          <span className="inv-label">Going?</span>
          <div className="inv-pill" role="group" aria-label="Your answer">
            {(['accepted', 'declined', 'tentative'] as Rsvp[]).map((s) => (
              <button key={s} disabled={busy} onClick={() => reply(s)}>{RSVP_WORDS[s].label}</button>
            ))}
          </div>
          <span className="inv-small">You haven't responded yet. Replying as {account.email}</span>
        </div>
      )}

      {canReply && current && (
        <div className="inv-row">
          <span className={`inv-chip ${CHIP[current].cls}`}><span aria-hidden="true">{CHIP[current].glyph}</span> {CHIP[current].word}</span>
          <span className="inv-saved" role="status">{fresh ? (how === 'email' ? 'Your reply has been emailed' : 'Your calendar has been updated') : how === 'email' ? 'Reply sent by email' : 'Saved to your calendar'}</span>
          <span className="cal-picker">
            <button className="btn ghost small" aria-expanded={menu} disabled={busy} onClick={() => setMenu(!menu)}>Change answer <Icon name="chevronDown" size={12} /></button>
            {menu && (
              <div className="cal-pop inv-change" role="menu">
                {(['accepted', 'declined', 'tentative'] as Rsvp[]).filter((s) => s !== current).map((s) => (
                  <button key={s} role="menuitem" className="btn ghost" onClick={() => reply(s)}>{RSVP_WORDS[s].label}</button>
                ))}
              </div>
            )}
          </span>
          <span className="inv-small">Replying as {account.email}</span>
        </div>
      )}

      {!cancelled && invite.method !== 'REPLY' && !(canReply && current && (server?.inCalendar || how)) && (
        <div className="inv-row">
          {server?.inCalendar ? (
            <span className="inv-ok"><Icon name="check" size={14} /> Saved to your calendar</span>
          ) : canAddToCalendar(message.id) ? (
            <button className="btn" disabled={busy} onClick={add}><Icon name="calendar" size={14} /> Add to calendar</button>
          ) : (
            <button className="btn" onClick={saveFileCopy}><Icon name="download" size={14} /> Save invite file</button>
          )}
        </div>
      )}

      {missingPermission && (
        <div className="inv-perm" role="alert">
          <strong>One more permission needed</strong>
          <span>To answer invitations and add them to your calendar from here, Google needs you to allow Well Good Mail to edit your calendar events. You will sign in to {account.email} once more. Your mail stays where it is.</span>
          <div className="inv-actions">
            <button className="btn primary" disabled={busy} onClick={allow}>Sign in and allow</button>
            {canReply && wanted && <button className="btn" disabled={busy} onClick={() => reply(wanted, true)}>Reply by email instead</button>}
          </div>
        </div>
      )}
      {hint && <div className="inv-note">{hint}</div>}

      {invite.attendees.length > 0 && (
        <div className="inv-guests">
          <GuestList subject={invite.title} guests={server?.guests?.length ? server.guests : invite.attendees.map((a): EventGuest => ({
            email: a.email,
            name: a.name,
            answer: a.status === 'ACCEPTED' ? 'yes' : a.status === 'DECLINED' ? 'no' : a.status === 'TENTATIVE' ? 'maybe' : 'waiting',
            organiser: invite.organizer?.email === a.email || undefined,
            self: own.some((m) => m.toLowerCase() === a.email.toLowerCase()) || undefined,
          }))} />
        </div>
      )}
    </section>
  );
}
