// A quiet card at the top of an email that mentions a future date and time: Add to calendar, Not now, or change
// the details first. Nothing is added unless you click.
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Dialog, useMenu } from './ui';
import { addInviteToCalendar, canAddToCalendar, toast, useMail } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { visibleText } from '../lib/cleanText';
import { suggestEvent, whenWords, type Suggestion } from '../lib/suggestEvents';
import type { Invite } from '../lib/invites';
import type { Message } from '../lib/types';

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
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Suggestion | null>(null);
  const menu = useMenu();
  const sender = message.from.email.toLowerCase();
  const found = useMemo(() => {
    if (!on || !message.bodyLoaded || message.isDraft) return undefined;
    return suggestEvent(message, visibleText(message.bodyHtml, message.bodyText, 8000), Date.now(), events);
  }, [on, message.id, message.bodyLoaded, events.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (added) {
    return <section className="invite-card suggest-card" aria-label="Suggested event"><span className="inv-ok"><Icon name="check" size={14} /> Added to your calendar</span></section>;
  }
  if (!found || hidden.includes(message.id) || muted.includes(sender) || !canAddToCalendar(message.id)) return null;

  const hide = () => useSettings.getState().set({ suggestHidden: [...hidden, message.id].slice(-300) }, { quiet: true });
  const add = async (s: Suggestion) => {
    setBusy(true);
    const invite: Invite = {
      method: 'PUBLISH', uid: `wgm-${message.id.replace(/[^A-Za-z0-9]/g, '')}-${s.start}@wellgood.mail`, sequence: 0,
      title: s.title, start: s.start, end: s.end, allDay: false,
      location: s.meetingUrl, description: s.meetingUrl ? `Join: ${s.meetingUrl}` : undefined, meetingUrl: s.meetingUrl,
      attendees: [], startLine: '',
    };
    try {
      await addInviteToCalendar(message.id, invite);
      setAdded(true);
      // Once added it isn't offered again, even for dates beyond what the app keeps of the calendar.
      useSettings.getState().set({ suggestHidden: [...useSettings.getState().suggestHidden, message.id].slice(-300) }, { quiet: true });
      const acc = useMail.getState().accounts.find((a) => a.id === message.accountId);
      toast({ text: `"${s.title}" added to ${acc ? `${acc.label || acc.email}'s` : 'your'} calendar, ${whenWords(s)}.` });
    } catch (e) {
      toast({ text: `Couldn't add it: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
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
