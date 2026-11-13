// Tasks: the third view in Calendar & Reminders, the task pop-up (also used for "Make a task" from an email), and the
// small task rows used in Coming up and the calendar.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Icon } from './Icon';
import { Dialog } from './ui';
import { useMail, selectThread, setView, openScreen, toast, providerFor } from '../lib/mail';
import { threadKey } from '../lib/mailbox';
import { useSettings } from '../lib/settings';
import { reconnectAccount } from '../lib/mail';
import {
  useTasks, addTask, changeTask, deleteTask, moveTask, newList, setDone, refreshTasks, startTasks, defaultList, listForAccount,
  listsInGroup, tasksInGroup, dueText, isOverdue, doneToday, startOfToday,
} from '../lib/tasks';
import { readTaskWords } from '../lib/taskWords';
import { titleFromSubject } from '../lib/taskNotes';
import type { Message, Task, TaskList, TaskMail } from '../lib/types';
import '../styles/tasks.css';

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hmOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const msAt = (day: string, time?: string) => { const [y, m, d] = day.split('-').map(Number); const [h, mi] = (time || '00:00').split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0).getTime(); };

function useListColour() {
  const accounts = useMail((s) => s.accounts);
  const lists = useTasks((s) => s.lists);
  return (listId: string) => {
    const l = lists.find((x) => x.id === listId);
    const a = accounts.find((x) => x.id === l?.accountId);
    if (!l || !a) return '#888';
    // Lists in the same account get shades of its colour.
    const n = lists.filter((x) => x.accountId === l.accountId).indexOf(l);
    return n <= 0 ? a.colour : `color-mix(in srgb, ${a.colour} ${Math.max(45, 100 - n * 18)}%, #888)`;
  };
}

/** Opens the email a task was made from, in whichever folder it is now. */
export function openTaskMail(mail: TaskMail) {
  if (!mail.threadId || !mail.accountId) { toast({ text: "This task was made on another device, so the email can't be opened from here", ttl: 5000 }); return; }
  const m = useMail.getState().messages[mail.messageId];
  const inbox = providerFor(mail.accountId)?.systemFolderId('inbox');
  const sent = providerFor(mail.accountId)?.systemFolderId('sent');
  const folder = m && inbox && m.labels.includes(inbox) ? 'inbox' : m && sent && m.labels.includes(sent) ? 'sent' : 'archive';
  setView({ scope: { type: 'account', accountId: mail.accountId }, mailbox: { kind: 'system', folder } });
  useMail.setState({ screen: 'mail' });
  selectThread(m ? threadKey(m) : `${mail.accountId}|${mail.threadId}`);
}

// ---- The tick circle and a task row ----

export function TaskRing({ task, small }: { task: Task; small?: boolean }) {
  return (
    <button
      className={`task-ring${task.done ? ' done' : ''}${small ? ' small' : ''}`}
      role="checkbox" aria-checked={task.done} aria-label={task.done ? `Not done: ${task.title}` : `Done: ${task.title}`}
      title={task.done ? 'Mark as not done' : 'Mark as done'}
      onClick={(e) => { e.stopPropagation(); setDone(task, !task.done); }}
    >{task.done && <Icon name="check" size={small ? 9 : 11} />}</button>
  );
}

function TaskRow({ task, showList }: { task: Task; showList: boolean }) {
  const colour = useListColour();
  const lists = useTasks((s) => s.lists);
  const list = lists.find((l) => l.id === task.listId);
  const late = isOverdue(task);
  return (
    <div className={`task-row${task.done ? ' done' : ''}`} onClick={() => editTask(task)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && editTask(task)}>
      <TaskRing task={task} />
      <div className="grow">
        <div className="task-title">{task.title || 'Untitled task'}</div>
        <div className="task-sub">
          {task.done && task.completedAt ? <span>Done {new Date(task.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            : task.due !== undefined ? <span className={late ? 'late' : midnightOf(task.due) === startOfToday() ? 'due' : ''}>{cap(dueText(task))}</span> : null}
          {showList && list && <span>{list.name}</span>}
          {task.mail && <button className="task-mail" onClick={(e) => { e.stopPropagation(); openTaskMail(task.mail!); }} title="Open the email"><Icon name="mail" size={12} /> {task.mail.subject}</button>}
          {task.notes && <span className="task-notes">{task.notes.split('\n')[0]}</span>}
        </div>
      </div>
      <span className="dot" style={{ background: colour(task.listId) }} aria-hidden />
    </div>
  );
}

const midnightOf = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- The Tasks view ----

type Place = 'today' | 'scheduled' | 'all' | string;

export function TasksView() {
  useEffect(() => { startTasks(); }, []);
  const s = useSettings();
  const group = s.calendarGroup;
  const allLists = useTasks((x) => x.lists);
  const allTasks = useTasks((x) => x.tasks);
  const trouble = useTasks((x) => x.trouble);
  const accounts = useMail((x) => x.accounts);
  const lists = useMemo(() => listsInGroup(allLists, group), [allLists, group, s.calendarGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => tasksInGroup(allTasks, group), [allTasks, group, s.calendarGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const place: Place = s.tasksPlace === 'today' || s.tasksPlace === 'scheduled' || s.tasksPlace === 'all' || lists.some((l) => l.id === s.tasksPlace) ? s.tasksPlace : 'today';
  const [, tick] = useState(0);
  useEffect(() => { const t = () => tick((n) => n + 1); window.addEventListener('wgm-minute', t); return () => window.removeEventListener('wgm-minute', t); }, []);
  const [showOld, setShowOld] = useState(false);

  const today = startOfToday();
  const open = tasks.filter((t) => !t.done);
  const shown = place === 'today' ? tasks.filter((t) => (t.done ? doneToday(t) && (t.due === undefined || midnightOf(t.due) <= today) : t.due !== undefined && t.due < today + DAY))
    : place === 'scheduled' ? tasks.filter((t) => t.due !== undefined && (!t.done || doneToday(t)))
    : place === 'all' ? tasks.filter((t) => !t.done || doneToday(t))
    : tasks.filter((t) => t.listId === place && (!t.done || doneToday(t)));
  const older = (place === 'today' || place === 'scheduled' ? [] : tasks.filter((t) => t.done && !doneToday(t) && (place === 'all' || t.listId === place)))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const counts = {
    today: open.filter((t) => t.due !== undefined && t.due < today + DAY).length,
    scheduled: open.filter((t) => t.due !== undefined).length,
    all: open.length,
  };
  const byDue = (a: Task, b: Task) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.title.localeCompare(b.title);
  const sections: { key: string; label: string; items: Task[]; late?: boolean }[] = [
    { key: 'late', label: 'Overdue', late: true, items: shown.filter((t) => isOverdue(t)).sort(byDue) },
    { key: 'today', label: 'Today', items: shown.filter((t) => !isOverdue(t) && ((t.due !== undefined && midnightOf(t.due) === today) || (t.done && doneToday(t) && (t.due === undefined || midnightOf(t.due) < today)))).sort((a, b) => Number(a.done) - Number(b.done) || byDue(a, b)) },
    { key: 'tomorrow', label: 'Tomorrow', items: shown.filter((t) => t.due !== undefined && midnightOf(t.due) === today + DAY).sort(byDue) },
    { key: 'later', label: 'Later', items: shown.filter((t) => t.due !== undefined && midnightOf(t.due) > today + DAY).sort(byDue) },
    { key: 'none', label: 'No date', items: shown.filter((t) => t.due === undefined && !t.done).sort((a, b) => a.title.localeCompare(b.title)) },
  ];
  const target = lists.find((l) => l.id === place) || defaultList(group);
  const byAccount = accounts.map((a) => ({ a, lists: lists.filter((l) => l.accountId === a.id) })).filter((x) => x.lists.length > 0);
  const groupTrouble = Object.entries(trouble).filter(([id]) => accounts.some((a) => a.id === id) && groupHas(group, id));

  return (
    <div className="tasks-view card">
      <nav className="tasks-side" aria-label="Task lists">
        <SideItem on={place === 'today'} onClick={() => s.set({ tasksPlace: 'today' })} icon="sun" label="Today" n={counts.today} />
        <SideItem on={place === 'scheduled'} onClick={() => s.set({ tasksPlace: 'scheduled' })} icon="calendar" label="Scheduled" n={counts.scheduled} />
        <SideItem on={place === 'all'} onClick={() => s.set({ tasksPlace: 'all' })} icon="list" label="All Tasks" n={counts.all} />
        {byAccount.map(({ a, lists: ls }) => (
          <div key={a.id}>
            <div className="tasks-sh">{a.label || a.email}<span className="kind">{a.kind === 'microsoft' ? 'Microsoft To Do' : a.kind === 'demo' ? 'Demo' : 'Google Tasks'}</span></div>
            {ls.map((l) => {
              const late = open.filter((t) => t.listId === l.id && isOverdue(t)).length;
              const n = open.filter((t) => t.listId === l.id).length;
              const isDefault = defaultList(group)?.id === l.id;
              return <SideItem key={l.id} on={place === l.id} onClick={() => s.set({ tasksPlace: l.id })} dot={l.id} label={`${l.name}${isDefault ? ' ★' : ''}`} n={late ? `${late} late` : n} late={late > 0} title={isDefault ? 'New tasks go here while this group is picked' : undefined} />;
            })}
          </div>
        ))}
        <NewListButton accounts={accounts.filter((a) => groupHas(group, a.id) && lists.some((l) => l.accountId === a.id))} />
      </nav>
      <div className="tasks-main">
        {groupTrouble.map(([id, t]) => {
          const a = accounts.find((x) => x.id === id)!;
          return (
            <div className="tasks-trouble" key={id}>
              <span className="dot" style={{ background: a.colour }} />
              <div className="grow">{a.label || a.email}: {t.text}</div>
              {t.kind === 'permission' && <button className="btn small primary" onClick={() => void reconnectAccount(id).then(() => refreshTasks())}>Sign in</button>}
              {t.kind === 'apiOff' && <button className="btn small" onClick={() => openScreen('help')}>How</button>}
              {t.kind === 'other' && <button className="btn small" onClick={() => void refreshTasks()}>Try again</button>}
            </div>
          );
        })}
        <QuickAdd list={target} lists={lists} />
        {shown.length === 0 && !older.length ? (
          <div className="tasks-empty"><Icon name="check" size={24} /><div>{place === 'today' ? 'Nothing due today' : 'No tasks here'}</div></div>
        ) : sections.filter((x) => x.items.length).map((x) => (
          <section key={x.key}>
            <div className={`tasks-gh${x.late ? ' late' : ''}`}>{x.label} <span className="n">{x.items.filter((t) => !t.done).length || ''}</span></div>
            {x.items.map((t) => <TaskRow key={t.id} task={t} showList={place === 'today' || place === 'scheduled' || place === 'all'} />)}
          </section>
        ))}
        {older.length > 0 && (
          <>
            <button className="tasks-fold" onClick={() => setShowOld(!showOld)} aria-expanded={showOld}>
              <Icon name={showOld ? 'chevronDown' : 'chevronRight'} size={14} /> Completed before today <span className="chip">{older.length}</span>
            </button>
            {showOld && older.map((t) => <TaskRow key={t.id} task={t} showList={place === 'all'} />)}
          </>
        )}
      </div>
    </div>
  );
}

function groupHas(group: string, accountId: string): boolean {
  const g = useSettings.getState().calendarGroups.find((x) => x.id === group);
  return !g || g.calendars.some((c) => c.split('|')[0] === accountId);
}

function SideItem({ on, onClick, icon, dot, label, n, late, title }: { on: boolean; onClick: () => void; icon?: 'sun' | 'calendar' | 'list'; dot?: string; label: string; n?: number | string; late?: boolean; title?: string }) {
  const colour = useListColour();
  return (
    <button className={`tasks-si${on ? ' on' : ''}`} onClick={onClick} aria-current={on ? 'true' : undefined} title={title}>
      {icon ? <Icon name={icon} size={14} /> : <span className="dot" style={{ background: colour(dot!) }} />}
      <span className="grow">{label}</span>
      {n !== undefined && n !== 0 && <span className={`n${late ? ' late' : ''}`}>{n}</span>}
    </button>
  );
}

function NewListButton({ accounts }: { accounts: { id: string; label?: string; email: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [acc, setAcc] = useState(accounts[0]?.id || '');
  if (!accounts.length) return null;
  if (!open) return <button className="tasks-si muted" onClick={() => setOpen(true)}><Icon name="plus" size={14} /> <span className="grow">New list</span></button>;
  const make = async () => { if (!name.trim()) return; const l = await newList(acc || accounts[0].id, name.trim()); if (l) useSettings.getState().set({ tasksPlace: l.id }); setOpen(false); setName(''); };
  return (
    <div className="tasks-newlist">
      <input className="input" autoFocus placeholder="List name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void make(); if (e.key === 'Escape') setOpen(false); }} />
      {accounts.length > 1 && <select className="input" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Account">{accounts.map((a) => <option key={a.id} value={a.id}>{a.label || a.email}</option>)}</select>}
      <div className="row"><button className="btn small" onClick={() => setOpen(false)}>Cancel</button><button className="btn small primary" disabled={!name.trim()} onClick={() => void make()}>Make list</button></div>
    </div>
  );
}

// ---- Quick add ----

function QuickAdd({ list, lists }: { list?: TaskList; lists: TaskList[] }) {
  const [text, setText] = useState('');
  const [keepWords, setKeepWords] = useState(false);
  const [pick, setPick] = useState<string>('');
  const colour = useListColour();
  const words = useMemo(() => readTaskWords(text), [text]);
  const tagged = words.listTag ? lists.find((l) => l.name.toLowerCase().replace(/\s+/g, '') === words.listTag || l.name.toLowerCase().startsWith(words.listTag!)) : undefined;
  const target = lists.find((l) => l.id === pick) || tagged || list;
  useEffect(() => setPick(''), [list?.id]);
  const add = () => {
    if (!text.trim() || !target) return;
    const title = keepWords ? text.replace(/(^|\s)#[\p{L}\p{N}_-]+/u, '').trim() : words.title;
    void addTask(target.id, { title: title || text.trim(), ...(words.due !== undefined && !keepWords ? { due: words.due, hasTime: words.hasTime } : {}) });
    setText('');
    setKeepWords(false);
  };
  const shown = words.dateText && !keepWords ? highlight(text, words.dateText) : null;
  return (
    <div className="tasks-add-wrap">
      <div className="tasks-add">
        <Icon name="plus" size={14} />
        <div className="tasks-add-field">
          {shown && <div className="tasks-add-mirror" aria-hidden>{shown}</div>}
          <input
            className={shown ? 'see-through' : ''}
            value={text}
            placeholder={target ? `Add a task to ${target.name}, e.g. "Ring the dentist Friday 3pm"` : 'No task lists yet'}
            disabled={!target}
            onChange={(e) => { setText(e.target.value); if (!e.target.value) setKeepWords(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setText(''); }}
            aria-label="New task"
          />
        </div>
      </div>
      {text.trim() && target && (
        <div className="tasks-add-chips">
          {words.due !== undefined && !keepWords && <span className="chip when"><Icon name="calendar" size={12} /> {cap(dueText(words))}<button className="chip-x" aria-label="Keep the words as typed" title="Keep the words as typed" onClick={() => setKeepWords(true)}>×</button></span>}
          <select className="chip-select" value={target.id} onChange={(e) => setPick(e.target.value)} aria-label="List" style={{ borderColor: colour(target.id) }}>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <span className="grow" />
          <span className="hint">Enter to add</span>
        </div>
      )}
    </div>
  );
}

function highlight(text: string, part: string): ReactNode {
  const i = text.toLowerCase().indexOf(part.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + part.length)}</mark>{text.slice(i + part.length)}</>;
}

// ---- The task pop-up: changing a task, or making one from an email ----

interface EditorState { task?: Task; draft?: { title: string; notes?: string; due?: number; hasTime?: boolean; listId?: string; mail?: TaskMail }; seq: number }
const useEditor = create<EditorState>(() => ({ seq: 0 }));
/** The task pop-up for a new task, in the default list of the group being looked at. */
export function newTask(due?: number) {
  startTasks();
  useEditor.setState((s) => ({ task: undefined, draft: { title: '', due, hasTime: false, listId: defaultList()?.id }, seq: s.seq + 1 }));
}
export function editTask(task: Task) { useEditor.setState((s) => ({ task, draft: undefined, seq: s.seq + 1 })); }
const closeEditor = () => useEditor.setState({ task: undefined, draft: undefined });

/** "Make a task" from an email (right-click, T, or highlighted text): the pop-up filled in from it. */
export function makeTaskFromEmail(m: Message, chosenText?: string) {
  startTasks();
  const picked = chosenText?.replace(/\s+/g, ' ').trim();
  const mail: TaskMail = { messageId: m.id, threadId: m.threadId, accountId: m.accountId, subject: m.subject || '(no subject)', from: m.from.name || m.from.email, date: m.date };
  const source = picked || titleFromSubject(m.subject || '');
  const words = readTaskWords(source);
  // A date in the highlighted text, or in the email's opening words ("by end of day today").
  // Read from the day the email was sent ("by Friday" in Thursday's email is that Friday); a day already gone is left out.
  const read = words.due === undefined ? readTaskWords(m.snippet || '', m.date) : undefined;
  const fromSnippet = read?.due !== undefined && read.due >= startOfToday() ? read : undefined;
  const due = words.due ?? fromSnippet?.due;
  const hasTime = words.due !== undefined ? words.hasTime : Boolean(fromSnippet?.hasTime);
  useEditor.setState((s) => ({ task: undefined, draft: { title: (words.dateText ? words.title : source).slice(0, 200), due, hasTime, listId: listForAccount(m.accountId)?.id, mail }, seq: s.seq + 1 }));
}

export function TaskEditorHost() {
  const state = useEditor();
  if (!state.task && !state.draft) return null;
  return <TaskEditor key={state.seq} task={state.task} draft={state.draft} />;
}

function TaskEditor({ task, draft }: { task?: Task; draft?: EditorState['draft'] }) {
  const lists = useTasks((s) => s.lists);
  const loaded = useTasks((s) => s.loaded);
  const accounts = useMail((s) => s.accounts);
  const start = task || draft!;
  const [title, setTitle] = useState(start.title || '');
  const [day, setDay] = useState(start.due !== undefined ? ymdOf(start.due) : '');
  const [time, setTime] = useState(start.due !== undefined && start.hasTime ? hmOf(start.due) : '');
  const [notes, setNotes] = useState(start.notes || '');
  const [listId, setListId] = useState(task?.listId || draft?.listId || defaultList()?.id || '');
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); titleRef.current?.select(); }, []);
  // Lists can arrive after the pop-up opens (the first time Tasks is used).
  useEffect(() => { if (!listId && lists.length) setListId((draft?.mail && listForAccount(draft.mail.accountId)?.id) || defaultList()?.id || lists[0].id); }, [lists, listId, draft]);
  const mail = task?.mail || draft?.mail;
  const save = () => {
    if (!title.trim()) return;
    const due = day ? msAt(day, time || undefined) : null;
    const patch = { title: title.trim(), notes, due, hasTime: Boolean(day && time) };
    if (task) {
      const changed = patch.title !== task.title || notes !== (task.notes || '') || (due ?? undefined) !== task.due || patch.hasTime !== Boolean(task.hasTime);
      if (changed) void changeTask(task, patch);
      if (listId && listId !== task.listId) void moveTask({ ...task, ...patch, due: due ?? undefined }, listId);
    } else if (listId) {
      void addTask(listId, { ...patch, mail });
    }
    closeEditor();
  };
  const byAccount = accounts.map((a) => ({ a, ls: lists.filter((l) => l.accountId === a.id) })).filter((x) => x.ls.length);
  return (
    <Dialog title={task ? 'Task' : 'New task'} onClose={closeEditor} actions={<>
      {task && <button className="btn ghost danger" onClick={() => { void deleteTask(task); closeEditor(); }}>Delete</button>}
      <span className="grow" />
      <button className="btn" onClick={closeEditor}>Cancel</button>
      <button className="btn primary" disabled={!title.trim() || !listId} onClick={save}>{task ? 'Save' : 'Add task'}</button>
    </>}>
      <div className="task-form" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') save(); }}>
        <div className="row">
          {task ? <TaskRing task={task} /> : <span className="task-ring" aria-hidden />}
          <input ref={titleRef} className="input grow title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" placeholder="What needs doing" />
        </div>
        {mail && (
          <div className="task-from">
            <Icon name="mail" size={14} />
            <div className="grow">From: {mail.subject}{(mail.from || mail.date) && <small>{[mail.from, mail.date ? new Date(mail.date).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''].filter(Boolean).join(' · ')}</small>}</div>
            {mail.threadId && <button className="btn small" onClick={() => { openTaskMail(mail); closeEditor(); }}>Open email</button>}
          </div>
        )}
        <label className="row"><span className="k">Due</span>
          <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Due day" />
          <input type="time" className="input" value={time} disabled={!day} onChange={(e) => setTime(e.target.value)} aria-label="Due time" />
          {day && <button className="btn ghost small" onClick={(e) => { e.preventDefault(); setDay(''); setTime(''); }} title="No date">No date</button>}
        </label>
        {day && !time && <div className="hint">Add a time to be alerted then.</div>}
        <label className="row"><span className="k">List</span>
          {lists.length ? (
            <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
              {byAccount.map(({ a, ls }) => <optgroup key={a.id} label={a.label || a.email}>{ls.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}
            </select>
          ) : <span className="hint">{loaded ? 'No task lists yet. Accounts may need to sign in once more for tasks.' : 'Loading lists…'}</span>}
        </label>
        <label className="row top"><span className="k">Notes</span><textarea className="input grow" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {time && accounts.find((a) => a.id === lists.find((l) => l.id === listId)?.accountId)?.kind === 'gmail' && <div className="hint">Google Tasks keeps the day only, so the time is also written at the top of the notes for your phone.</div>}
      </div>
    </Dialog>
  );
}

// ---- Today's tasks, for Coming up ----

export function TasksToday({ limit = 6 }: { limit?: number }) {
  useEffect(() => { startTasks(); }, []);
  const s = useSettings();
  const all = useTasks((x) => x.tasks);
  const [, tick] = useState(0);
  useEffect(() => { const t = () => tick((n) => n + 1); window.addEventListener('wgm-minute', t); return () => window.removeEventListener('wgm-minute', t); }, []);
  const today = startOfToday();
  const items = tasksInGroup(all, s.calendarGroup)
    .filter((t) => (t.done ? doneToday(t) && t.due !== undefined && t.due < today + DAY : t.due !== undefined && t.due < today + DAY))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? 0) - (b.due ?? 0));
  if (!items.length) return null;
  const open = items.filter((t) => !t.done).length;
  return (
    <div className="cu-tasks">
      <div className="cu-tasks-h"><span>Tasks today</span><span className="grow" /><span className="muted">{open ? `${open} to do` : 'All done'}</span></div>
      {items.slice(0, limit).map((t) => (
        <div key={t.id} className={`cu-task${t.done ? ' done' : ''}`} onClick={() => editTask(t)} role="button" tabIndex={0}>
          <TaskRing task={t} small />
          <div className="grow">
            {isOverdue(t) && <span className="late">{new Date(t.due!).toLocaleDateString('en-GB', { weekday: 'short' })} </span>}
            {t.title}
            {(t.hasTime || t.mail) && !t.done && <small>{t.hasTime && t.due !== undefined ? hmOf(t.due) : ''}{t.hasTime && t.mail ? ' · ' : ''}{t.mail ? '✉ ' + t.mail.subject : ''}</small>}
          </div>
        </div>
      ))}
      <button className="link-btn cu-tasks-open" onClick={() => { openScreen('reminders'); useSettings.getState().set({ remindersView: 'tasks', tasksPlace: 'today' }); }}>{items.length > limit ? `${items.length - limit} more in Tasks` : 'Open Tasks'} ›</button>
    </div>
  );
}

// ---- Tasks for the calendar: by day ----

/** Open tasks (and today's done ones) with a due date, in the group being looked at. */
export function useCalendarTasks(): Task[] {
  useEffect(() => { startTasks(); }, []);
  const group = useSettings((s) => s.calendarGroup);
  useSettings((s) => s.calendarGroups);
  const all = useTasks((x) => x.tasks);
  return useMemo(() => tasksInGroup(all, group).filter((t) => t.due !== undefined && (!t.done || doneToday(t))), [all, group]);
}

/** A task in the calendar: the tick circle and its title. */
export function CalendarTask({ task, className, style }: { task: Task; className: string; style?: React.CSSProperties }) {
  const colour = useListColour();
  return (
    <div className={`${className}${task.done ? ' done' : ''}${isOverdue(task) ? ' late' : ''}`} style={{ ...style, borderColor: colour(task.listId) }} onClick={(e) => { e.stopPropagation(); editTask(task); }} onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} title={`${task.title}${task.due !== undefined ? ` · ${dueText(task)}` : ''}`}>
      <TaskRing task={task} small />
      <span className="t">{task.title}</span>
    </div>
  );
}

/** Month view: the tasks for the weeks on screen, beside the calendar. */
export function MonthTasksPanel({ from, to, picked }: { from: number; to: number; picked?: number }) {
  const tasks = useCalendarTasks().filter((t) => t.due! >= from && t.due! < to);
  const days = new Map<number, Task[]>();
  for (const t of tasks.sort((a, b) => a.due! - b.due!)) {
    const d = midnightOf(t.due!);
    days.set(d, [...(days.get(d) || []), t]);
  }
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (picked) ref.current?.querySelector(`[data-day="${picked}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [picked]);
  return (
    <aside className="month-tasks" ref={ref} aria-label="Tasks">
      <div className="mt-h">Tasks</div>
      {!days.size && <div className="muted small">No tasks with a date on these weeks.</div>}
      {[...days.entries()].map(([d, ts]) => (
        <div key={d} data-day={d} className={picked === d ? 'picked' : ''}>
          <div className="mt-day">{new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          {ts.map((t) => (
            <div key={t.id} className={`cu-task${t.done ? ' done' : ''}`} onClick={() => editTask(t)} role="button" tabIndex={0}>
              <TaskRing task={t} small />
              <div className="grow">{t.title}{t.hasTime && <small>{hmOf(t.due!)}</small>}</div>
            </div>
          ))}
        </div>
      ))}
      <button className="link-btn cu-tasks-open" onClick={() => useSettings.getState().set({ remindersView: 'tasks' })}>Open Tasks ›</button>
    </aside>
  );
}
