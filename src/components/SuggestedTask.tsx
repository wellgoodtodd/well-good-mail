// A quiet card at the top of an email that asks you for something by a day ("Could you send me the venue list by
// Friday?"): Add task, Not now, or change it first. Nothing is added unless you click. An email that suggests an
// event shows that card instead.
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useMenu } from './ui';
import { useMail } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { visibleText } from '../lib/cleanText';
import { suggestEvent } from '../lib/suggestEvents';
import { suggestTask, dueWords } from '../lib/suggestTasks';
import { addTask, defaultList, listForAccount, startTasks, threadTaskMark, useTasks } from '../lib/tasks';
import type { Message, TaskMail } from '../lib/types';
import { rfcIdOf } from '../lib/taskNotes';

export function SuggestedTask({ message }: { message: Message }) {
  const on = useSettings((s) => s.suggestTasks);
  const eventsOn = useSettings((s) => s.suggestEvents);
  const hidden = useSettings((s) => s.suggestHidden);
  const muted = useSettings((s) => s.suggestMuted);
  const accounts = useMail((s) => s.accounts);
  const events = useMail((s) => s.events);
  const key = `${message.accountId}|${message.threadId}`;
  const hasTask = useTasks((st) => Boolean(threadTaskMark(st.tasks, key)));
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const menu = useMenu();
  const sender = message.from.email.toLowerCase();
  const found = useMemo(() => {
    if (!on || !message.bodyLoaded || message.isDraft) return undefined;
    const text = visibleText(message.bodyHtml, message.bodyText, 8000);
    // An event (a day and a time) is offered instead, when that card is on.
    if (eventsOn && suggestEvent(message, text, Date.now(), events)) return undefined;
    return suggestTask(message, text);
  }, [on, eventsOn, message.id, message.bodyLoaded, events.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const hideKey = `task:${message.id}`;
  if (added) return <section className="invite-card suggest-card" aria-label="Suggested task"><span className="inv-ok"><Icon name="check" size={14} /> Added to Tasks</span></section>;
  if (!found || hasTask || hidden.includes(hideKey) || muted.includes(sender)) return null;
  // Not for your own requests: an email from this account (or one of its aliases) to itself.
  const acc = accounts.find((a) => a.id === message.accountId);
  if (acc && [acc.email, ...acc.aliases.map((x) => x.email)].some((e) => e.toLowerCase() === sender)) return null;

  const hide = () => useSettings.getState().set({ suggestHidden: [...hidden, hideKey].slice(-300) }, { quiet: true });
  const mail: TaskMail = { messageId: message.id, threadId: message.threadId, accountId: message.accountId, subject: message.subject || '(no subject)', from: message.from.name || message.from.email, date: message.date, rfcId: rfcIdOf(message.messageIdHeader) };
  const add = async () => {
    setBusy(true);
    startTasks();
    const list = listForAccount(message.accountId) || defaultList();
    const made = list ? await addTask(list.id, { title: found.title, due: found.due, hasTime: false, mail }) : undefined;
    setBusy(false);
    if (made || list) { setAdded(true); hide(); }
  };
  const change = () => { void import('./Tasks').then((t) => t.makeTaskFromEmail(message, found.phrase)); hide(); };

  return (
    <section className="invite-card suggest-card" aria-label="Suggested task">
      <div className="inv-top">
        <div className="inv-main">
          <div className="inv-small suggest-kicker"><Icon name="check" size={13} /> Make a task?</div>
          <div className="inv-title">{found.title}</div>
          <div className="inv-line"><Icon name="clock" size={14} /> Due {dueWords(found.due)}</div>
          <div className="inv-line suggest-found">Found in the email: <mark>{found.phrase}</mark></div>
        </div>
      </div>
      <div className="inv-actions">
        <button className="btn primary" disabled={busy} onClick={() => void add()}>Add task</button>
        <button className="btn" onClick={hide}>Not now</button>
        <button className="btn ghost icon-only" aria-label="More choices" title="More choices" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), [
          { label: 'Change it first...', icon: 'compose', onClick: change },
          { label: `Don't suggest from ${message.from.name || sender}`, icon: 'mute', onClick: () => useSettings.getState().set({ suggestMuted: [...muted, sender] }) },
          { label: 'Turn off suggested tasks', icon: 'settings', onClick: () => useSettings.getState().set({ suggestTasks: false }) },
        ])}><Icon name="more" /></button>
      </div>
      {menu.node}
    </section>
  );
}
