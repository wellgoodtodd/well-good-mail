// "Add to event…" on an attachment: pick an event and the file goes onto it (Google, through Drive), with the
// "From email" link back to the email. Events that look like they go with the email come first.
import { useMemo, useState } from 'react';
import { attachEmailToEvent, providerFor, toast, useMail } from '../lib/mail';
import { eventsForEmail, searchEvents, type Pickable } from '../lib/eventPick';
import type { CalendarEvent, Message } from '../lib/types';
import { Dialog } from './ui';

const when = (e: CalendarEvent) => {
  const day = new Date(e.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return e.allDay ? day : `${day}, ${new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

export function AddToEvent({ message, attachmentIds, onClose }: { message: Message; attachmentIds: string[]; onClose: () => void }) {
  const events = useMail((s) => s.events);
  const accounts = useMail((s) => s.accounts);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const lists = useMemo(() => eventsForEmail(events, message, now), [events, message]); // eslint-disable-line react-hooks/exhaustive-deps
  const found = useMemo(() => searchEvents(events, query, now), [events, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const names = (message.attachments || []).filter((a) => attachmentIds.includes(a.id)).map((a) => a.filename);
  const what = names.length === 1 ? names[0] : `${names.length} files`;

  const add = async (ev: CalendarEvent) => {
    if (busy) return;
    setBusy(true);
    const holdsFiles = Boolean(providerFor(ev.accountId)?.attachEmailToEvent);
    try {
      await attachEmailToEvent(ev, message.id, attachmentIds);
      toast({ text: holdsFiles ? `Added ${what} to ${ev.title}` : `${ev.title} now links to this email. Its calendar can't hold files, so ${what} stayed with the email.`, ttl: holdsFiles ? 5000 : 9000 });
      onClose();
    } catch (e) {
      toast({ text: `Couldn't add it: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
      setBusy(false);
    }
  };

  const row = ({ event: e, why }: Pickable) => {
    const acc = accounts.find((a) => a.id === e.accountId);
    const linkOnly = !providerFor(e.accountId)?.attachEmailToEvent;
    return (
      <button key={e.id} className="ate-row" disabled={busy} onClick={() => void add(e)}>
        <span className="dot" style={{ background: acc?.colour }} aria-hidden="true" />
        <span className="ate-text">
          <span className="ate-title">{e.title || '(no title)'}</span>
          <span className="ate-sub">{when(e)}{why ? ` · ${why}` : ''}{linkOnly ? ' · Link only' : ''}</span>
        </span>
      </button>
    );
  };

  const searching = query.trim().length > 0;
  return (
    <Dialog title={`Add ${what} to an event`} onClose={onClose} actions={<button className="btn" onClick={onClose}>Cancel</button>}>
      <input className="ate-search" autoFocus placeholder="Search events" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search events" />
      <div className="ate-list">
        {searching ? (
          found.length ? found.map((event) => row({ event })) : <p className="hint">No events called that.</p>
        ) : (
          <>
            {lists.suggested.length > 0 && <div className="ate-head">Suggested</div>}
            {lists.suggested.map(row)}
            <div className="ate-head">Next two weeks</div>
            {lists.soon.length ? lists.soon.map(row) : <p className="hint">Nothing in the next two weeks. Search for an event above.</p>}
          </>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>The event also gets a "From email" link back to this email. Google calendars keep the file in your Well Good Mail folder in Google Drive; other calendars get the link only.</p>
    </Dialog>
  );
}
