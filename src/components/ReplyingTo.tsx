// "Replying to Maria Hale · 25 Nov": a button on an AI draft's card that opens the conversation it answers, as the
// same folded emails the reading pane shows (newest first, one open at a time), so you can read what was said while you
// check the draft. Reads from the mail on this computer; nothing about the draft changes.
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { MessageView } from './MessageView';
import { useMail } from '../lib/mail';
import { popoutMessage } from '../lib/composeActions';
import { replyThreadOf } from '../lib/replyThread';
import type { Draft } from '../lib/types';

const FIRST = 4;
const MORE = 6;
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(new Date(ms).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });

export function useReplyThread(d: Draft) {
  const messages = useMail((s) => s.messages);
  return useMemo(() => replyThreadOf(d, messages), [d.mode, d.sourceMessageId, d.serverDraftMessageId, d.serverAccountId, messages]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function ReplyingTo({ draft }: { draft: Draft }) {
  const thread = useReplyThread(draft);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(FIRST);
  if (!thread) return null;
  const { source, messages, key } = thread;
  const who = source.from.name || source.from.email;
  const verb = draft.mode === 'forward' ? 'Forwarding' : 'Replying to';
  const toggle = () => { setOpen(!open); if (!open && !openId) setOpenId(source.id); };
  const shown = messages.slice(0, limit);
  const rest = messages.length - shown.length;
  return (
    <div className="ai-reply">
      <button type="button" className="ai-reply-pill" aria-expanded={open} onClick={toggle} title={open ? 'Hide the conversation' : 'Show the conversation this replies to'}>
        <Icon name={draft.mode === 'forward' ? 'forward' : 'reply'} size={13} />
        <span>{verb} <b>{who}</b> · {day(source.date)}</span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
      </button>
      {open && (
        <div className="ai-reply-list">
          {shown.map((m) => <MessageView key={m.id} message={m} expanded={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} />)}
          <div className="ai-reply-more">
            {rest > 0 && <button type="button" className="btn ghost" onClick={() => setLimit(limit + MORE)}>Show {Math.min(rest, MORE)} more{rest > MORE ? ` (${rest} left)` : ''}</button>}
            <button type="button" className="btn ghost" onClick={() => void popoutMessage(key)}><Icon name="popout" size={13} /> Open the conversation in a window</button>
          </div>
        </div>
      )}
    </div>
  );
}
