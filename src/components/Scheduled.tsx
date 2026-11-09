// Scheduled: every email waiting to go at a later time, from any account. Click one to read it in full,
// change its time, cancel it, or take it back into the editor.
import { useState } from 'react';
import { Icon } from './Icon';
import { Dialog } from './ui';
import { SendLaterPicker } from './SendLaterPicker';
import { useMail, cancelSend, rescheduleSend } from '../lib/mail';
import { htmlToText } from '../lib/mcp/aiDrafts';
import type { OutboxItem } from '../lib/types';

const when = (t: number) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const people = (list: { email: string; name?: string }[]) => list.map((a) => a.name || a.email).join(', ');

/** The scheduled emails, soonest first. */
export function useScheduled(): OutboxItem[] {
  const outbox = useMail((s) => s.outbox);
  return outbox.filter((o) => o.kind === 'scheduled').sort((a, b) => a.sendAt - b.sendAt);
}

/** One scheduled email, read in full, with what can be done with it. */
export function ScheduledViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const item = useMail((s) => s.outbox.find((o) => o.id === id));
  const accounts = useMail((s) => s.accounts);
  const [picking, setPicking] = useState(false);
  if (!item) return null;
  const d = item.draft;
  const acc = accounts.find((a) => a.id === d.fromAccountId);
  if (picking) {
    return <SendLaterPicker title="Change send time" confirmLabel="Change time" initial={item.sendAt} onClose={() => setPicking(false)} onPick={(at) => { setPicking(false); void rescheduleSend(id, at); }} />;
  }
  return (
    <Dialog
      title="Scheduled email"
      onClose={onClose}
      actions={<>
        <button className="btn ghost" title="Stops it being sent and puts it back in your drafts" onClick={() => { onClose(); void cancelSend(id, { reopen: false }); }}><Icon name="undo" size={14} /> Back to drafts</button>
        <span className="grow" />
        <button className="btn" title="Takes it out of Scheduled and opens it, so you can change it and send it again" onClick={() => { onClose(); void cancelSend(id); }}>Open in editor</button>
        <button className="btn primary" onClick={() => setPicking(true)}><Icon name="clock" size={14} /> Change time</button>
      </>}
    >
      <div className="sched-view">
        <div className="ai-draft-row"><b>Sends</b><span>{when(item.sendAt)}</span></div>
        <div className="ai-draft-row"><b>From</b><span>{acc ? `${acc.label} (${d.fromEmail || acc.email})` : d.fromEmail}</span></div>
        <div className="ai-draft-row"><b>To</b><span>{people(d.to) || 'Nobody yet'}</span></div>
        {d.cc.length > 0 && <div className="ai-draft-row"><b>Cc</b><span>{people(d.cc)}</span></div>}
        {d.bcc.length > 0 && <div className="ai-draft-row"><b>Bcc</b><span>{people(d.bcc)}</span></div>}
        <div className="ai-draft-row"><b>Subject</b><span>{d.subject || '(no subject)'}</span></div>
        <div className="sched-body">{htmlToText(d.html) || '(empty)'}</div>
        {d.attachments.length > 0 && <div className="ai-quick-note">{d.attachments.length === 1 ? '1 attachment' : `${d.attachments.length} attachments`}</div>}
      </div>
    </Dialog>
  );
}

export function ScheduledScreen() {
  const items = useScheduled();
  const accounts = useMail((s) => s.accounts);
  const [viewing, setViewing] = useState<string | null>(null);
  return (
    <div className="screen ai-drafts" role="main">
      <div className="ai-drafts-inner">
        <h1>Scheduled</h1>
        <p className="lead">Emails set to send later. Click one to read it, change its time or put it back in your drafts.</p>
        {items.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Icon name="clock" size={24} />
            <div style={{ marginTop: 8 }}>Nothing scheduled. Use the arrow next to Send to send an email later.</div>
          </div>
        ) : (
          <div className="ai-cards">
            {items.map((o) => {
              const acc = accounts.find((a) => a.id === o.draft.fromAccountId);
              return (
                <div key={o.id} className="ai-draft-wrap" style={{ borderLeftColor: acc?.colour || 'var(--border)' }}>
                  <button className="sched-item" onClick={() => setViewing(o.id)}>
                    <span className="sched-who">{people(o.draft.to) || 'Nobody yet'}</span>
                    <time>{when(o.sendAt)}</time>
                    <span className="sched-subj">{o.draft.subject || '(no subject)'}</span>
                    <span className="sched-acc">{acc?.label || o.draft.fromEmail}</span>
                    <span className="sched-prev">{htmlToText(o.draft.html).replace(/\s+/g, ' ').slice(0, 200)}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {viewing && <ScheduledViewer id={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
