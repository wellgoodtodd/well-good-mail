// At the top of an email that is a calendar invitation: when it is, who's invited, a Join button,
// Yes / No / Maybe, and Add to calendar.
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { JoinButton } from './ComingUp';
import { addInviteToCalendar, answerInvite, canAddToCalendar, getAttachmentData, inviteStatus, reconnectAccount, toast, useMail } from '../lib/mail';
import { parseInvite, RSVP_WORDS, whichIsMe, type Invite, type Rsvp } from '../lib/invites';
import { CalendarPermissionError } from '../lib/providers/provider';
import { calendarEditAllowed } from '../lib/auth/google';
import { saveFile } from '../lib/platform';
import type { CalendarEvent, Message } from '../lib/types';

const isCalendarFile = (a: Message['attachments'][number]) => /calendar|ics/i.test(a.mimeType) || /\.ics$/i.test(a.filename);

const dayText = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeText = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function whenText(i: Invite): string {
  if (i.allDay) return `${dayText(i.start)}, all day`;
  const sameDay = new Date(i.start).toDateString() === new Date(i.end).toDateString();
  return `${dayText(i.start)}, ${timeText(i.start)} to ${sameDay ? '' : `${dayText(i.end)}, `}${timeText(i.end)}`;
}

const personName = (p?: { email: string; name?: string }) => (p ? p.name || p.email : '');

export function InviteCard({ message }: { message: Message }) {
  const account = useMail((s) => s.accounts.find((a) => a.id === message.accountId));
  const [invite, setInvite] = useState<Invite | undefined>();
  const [fileIndex, setFileIndex] = useState(-1);
  const [server, setServer] = useState<{ inCalendar: boolean; response?: Rsvp } | undefined>();
  const [answer, setAnswer] = useState<Rsvp | undefined>();
  const [busy, setBusy] = useState(false);
  const [wanted, setWanted] = useState<Rsvp | undefined>();
  const [needsPermission, setNeedsPermission] = useState(false);
  const [hint, setHint] = useState('');
  const files = message.attachments.filter(isCalendarFile);
  const fileKey = files.map((f) => f.id).join('|');

  useEffect(() => {
    let alive = true;
    setInvite(undefined); setServer(undefined); setAnswer(undefined); setNeedsPermission(false); setHint('');
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
      setAnswer(status); setNeedsPermission(false); setHint('');
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
      setServer({ inCalendar: true, response: server?.response });
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
    try { await saveFile(f.filename || 'invite.ics', await getAttachmentData(message.id, f.id), 'text/calendar'); } catch (e) { toast({ text: `Couldn't save it: ${e instanceof Error ? e.message : e}` }); }
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

      {canReply && (
        <div className="inv-row">
          <span className="inv-label">Going?</span>
          <div className="inv-pill" role="group" aria-label="Your answer">
            {(['accepted', 'declined', 'tentative'] as Rsvp[]).map((s) => (
              <button key={s} className={current === s ? 'on' : ''} aria-pressed={current === s} disabled={busy} onClick={() => reply(s)}>{RSVP_WORDS[s].label}</button>
            ))}
          </div>
          <span className="inv-small">Replying as {account.email}</span>
        </div>
      )}

      {!cancelled && invite.method !== 'REPLY' && (
        <div className="inv-row">
          {server?.inCalendar ? (
            <span className="inv-ok"><Icon name="check" size={14} /> In your calendar{current ? `, you said ${RSVP_WORDS[current].label}` : ''}</span>
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
        <details className="inv-guests">
          <summary>Guests ({invite.attendees.length})</summary>
          <ul>
            {invite.attendees.map((a) => (
              <li key={a.email}>{personName(a)}{a.status === 'ACCEPTED' ? ' · Yes' : a.status === 'DECLINED' ? ' · No' : a.status === 'TENTATIVE' ? ' · Maybe' : ''}{invite.organizer?.email === a.email ? ' · organiser' : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
