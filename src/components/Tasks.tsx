// Tasks: the third view in Calendar & Reminders, the task pop-up (also used for "Make a task" from an email), and the
// small task rows used in Coming up and the calendar.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { Icon } from './Icon';
import { Dialog, useMenu, type MenuItem } from './ui';
import { useMail, selectThread, setView, openScreen, toast, providerFor, reorderAccounts } from '../lib/mail';
import { threadKey } from '../lib/mailbox';
import { useSettings } from '../lib/settings';
import { reconnectAccount } from '../lib/mail';
import { askConfirm, askText } from '../lib/dialogs';
import {
  useTasks, addTask, changeTask, deleteTask, moveTask, newList, setDone, refreshTasks, startTasks, defaultList, listForAccount,
  listsInGroup, tasksInGroup, dueText, isOverdue, doneToday, startOfToday, renameList, deleteList, setDefaultList, groupName,
  useTaskPrefs, moveSmart, toggleHideDone, accountOrder, accountOrderAfterDrop, todayCount, emailTasks, nextRoundHour, readDay,
  type SmartPlace, SMART_PLACES,
} from '../lib/tasks';
import { readTaskWords } from '../lib/taskWords';
import { titleFromSubject } from '../lib/taskNotes';
import { openTaskDefaults } from '../lib/settingsNav';
import type { Account, Message, Task, TaskList, TaskMail } from '../lib/types';
import '../styles/tasks.css';

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hmOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const msAt = (day: string, time?: string) => { const [y, m, d] = day.split('-').map(Number); const [h, mi] = (time || '00:00').split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0).getTime(); };
const accName = (a?: Pick<Account, 'label' | 'email'>) => (a ? a.label || a.email : '');
const tasksApp = (a?: Pick<Account, 'kind'>) => (a?.kind === 'microsoft' ? 'Microsoft To Do' : a?.kind === 'demo' ? 'the demo' : 'Google Tasks');

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

/** Accounts in the order set in Settings › Accounts. */
function useSortedAccounts() {
  const accounts = useMail((s) => s.accounts);
  return useMemo(() => [...accounts].sort((a, b) => a.order - b.order), [accounts]);
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

/** Opens Calendar & Reminders on the Tasks view, at a place in its sidebar. */
export function openTasks(place: string = 'today') {
  openScreen('reminders');
  useSettings.getState().set({ remindersView: 'tasks', tasksPlace: place });
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

/** showAccount: in All Tasks, Today and Scheduled each line says whose task it is. showList: the list's name. */
function TaskRow({ task, showList, showAccount }: { task: Task; showList: boolean; showAccount?: boolean }) {
  const colour = useListColour();
  const lists = useTasks((s) => s.lists);
  const account = useMail((s) => s.accounts.find((a) => a.id === task.accountId));
  const list = lists.find((l) => l.id === task.listId);
  const several = lists.filter((l) => l.accountId === task.accountId).length > 1;
  const late = isOverdue(task);
  return (
    <div className={`task-row${task.done ? ' done' : ''}`} onClick={() => editTask(task)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && editTask(task)}>
      <TaskRing task={task} />
      <div className="grow">
        <div className="task-title">{task.title || 'Untitled task'}</div>
        <div className="task-sub">
          {showAccount && account && <span className="task-acc"><span className="dot" style={{ background: account.colour }} aria-hidden />{accName(account)}{several && list ? ` · ${list.name}` : ''}</span>}
          {task.done && task.completedAt ? <span>Done {new Date(task.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            : task.due !== undefined ? <span className={late ? 'late' : midnightOf(task.due) === startOfToday() ? 'due' : ''}>{cap(dueText(task))}</span> : null}
          {showList && !showAccount && list && <span>{list.name}</span>}
          {task.mail && <button className="task-mail" onClick={(e) => { e.stopPropagation(); openTaskMail(task.mail!); }} title="Open the email"><Icon name="mail" size={12} /> {task.mail.subject}</button>}
          {task.notes && <span className="task-notes">{task.notes.split('\n')[0]}</span>}
        </div>
      </div>
      {!showAccount && <span className="dot" style={{ background: colour(task.listId) }} aria-hidden />}
    </div>
  );
}

const midnightOf = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- The Tasks view ----

/** 'all', 'today', 'scheduled', `acc:<accountId>` (all of one account's tasks), or a list's id. */
type Place = string;

const SMART_LOOK: Record<SmartPlace, { label: string; icon: 'list' | 'sun' | 'calendar' }> = {
  all: { label: 'All Tasks', icon: 'list' },
  today: { label: 'Today', icon: 'sun' },
  scheduled: { label: 'Scheduled', icon: 'calendar' },
};

export function TasksView() {
  useEffect(() => { startTasks(); }, []);
  const s = useSettings();
  const group = s.calendarGroup;
  const allLists = useTasks((x) => x.lists);
  const allTasks = useTasks((x) => x.tasks);
  const trouble = useTasks((x) => x.trouble);
  const accounts = useSortedAccounts();
  const prefs = useTaskPrefs();
  const menu = useMenu();
  const lists = useMemo(() => listsInGroup(allLists, group), [allLists, group, s.calendarGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => tasksInGroup(allTasks, group), [allTasks, group, s.calendarGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const byAccount = accounts.map((a) => ({ a, lists: lists.filter((l) => l.accountId === a.id) })).filter((x) => x.lists.length > 0);
  const want = s.tasksPlace;
  const place: Place = (SMART_PLACES as string[]).includes(want) || (want.startsWith('acc:') && byAccount.some((x) => `acc:${x.a.id}` === want)) || lists.some((l) => l.id === want) ? want : prefs.smartOrder[0];
  const go = (p: Place) => s.set({ tasksPlace: p });
  const [, tick] = useState(0);
  useEffect(() => { const t = () => tick((n) => n + 1); window.addEventListener('wgm-minute', t); return () => window.removeEventListener('wgm-minute', t); }, []);
  const [showOld, setShowOld] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);

  const today = startOfToday();
  const open = tasks.filter((t) => !t.done);
  const placeAccount = place.startsWith('acc:') ? place.slice(4) : undefined;
  const hideDone = prefs.hideDone.includes(place);
  const inPlace = (t: Task) => (placeAccount ? t.accountId === placeAccount : t.listId === place);
  const shown = place === 'today' ? tasks.filter((t) => (t.done ? doneToday(t) && (t.due === undefined || midnightOf(t.due) <= today) : t.due !== undefined && t.due < today + DAY))
    : place === 'scheduled' ? tasks.filter((t) => t.due !== undefined && (!t.done || doneToday(t)))
    : place === 'all' ? tasks.filter((t) => !t.done || doneToday(t))
    : tasks.filter((t) => inPlace(t) && (!t.done || (doneToday(t) && !hideDone)));
  const older = (place === 'today' || place === 'scheduled' || hideDone ? [] : tasks.filter((t) => t.done && !doneToday(t) && (place === 'all' || inPlace(t))))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const counts: Record<SmartPlace, number> = {
    today: todayCount(tasks),
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
  const groupDefault = defaultList(group);
  const target = lists.find((l) => l.id === place)
    || (placeAccount ? (groupDefault?.accountId === placeAccount ? groupDefault : lists.find((l) => l.accountId === placeAccount)) : undefined)
    || groupDefault;
  const groupTrouble = Object.entries(trouble).filter(([id]) => accounts.some((a) => a.id === id) && groupHas(group, id));
  const smart = (SMART_PLACES as string[]).includes(place);

  // ---- Menus ----
  const isOpen = (id: string) => s.collapsed[`tacc:${id}`] === false || lists.some((l) => l.accountId === id && l.id === place);
  const setOpen = (id: string, v: boolean) => s.set({ collapsed: { ...useSettings.getState().collapsed, [`tacc:${id}`]: !v } });
  const makeList = async (a: Account) => {
    const name = (await askText(`New list in ${accName(a)}`, '', 'Make list'))?.trim();
    if (!name) return;
    const l = await newList(a.id, name);
    if (l) { setOpen(a.id, true); go(l.id); }
  };
  const accountMenu = (a: Account): MenuItem[] => [
    { heading: accName(a) },
    { label: `New list in ${accName(a)}`, icon: 'plus', onClick: () => void makeList(a) },
    { label: isOpen(a.id) ? 'Hide lists' : 'Show lists', icon: isOpen(a.id) ? 'chevronDown' : 'chevronRight', onClick: () => setOpen(a.id, !isOpen(a.id)) },
    { divider: true },
    { label: 'Account settings…', icon: 'settings', onClick: () => openScreen('settings', 'accounts') },
  ];
  const removeList = async (l: TaskList, a: Account) => {
    const n = allTasks.filter((t) => t.listId === l.id && !t.done).length;
    const ok = await askConfirm(
      `Delete ${l.name}?`,
      n ? `The ${n === 1 ? 'task' : `${n} tasks`} in it will be deleted too, here and in ${tasksApp(a)}.` : `It will be deleted in ${tasksApp(a)} too.`,
      'Delete list',
    );
    if (!ok) return;
    if (place === l.id) go(`acc:${a.id}`);
    void deleteList(l);
  };
  const listMenu = (l: TaskList, a: Account): MenuItem[] => {
    const isDefault = groupDefault?.id === l.id;
    const hidden = prefs.hideDone.includes(l.id);
    return [
      { heading: `${l.name} (${accName(a)})` },
      { label: 'Rename', icon: 'compose', onClick: () => setRenaming(l.id) },
      { label: isDefault ? `Default for ${groupName(group)}` : `Set as default for ${groupName(group)}`, icon: 'star', active: isDefault, disabled: isDefault, onClick: () => setDefaultList(group, l.id) },
      { label: 'Change defaults…', icon: 'settings', onClick: openTaskDefaults },
      { divider: true },
      { label: hidden ? 'Show completed' : 'Hide completed', icon: 'check', onClick: () => toggleHideDone(l.id) },
      { label: 'Delete list…', icon: 'trash', onClick: () => void removeList(l, a) },
    ];
  };

  // ---- Dragging: the top three among themselves, accounts among themselves (their order is the app's account order) ----
  const dropAt = (e: React.DragEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
  const dragProps = (kind: 'smart' | 'acc', id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(`text/wgm-task-${kind}`, id); e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e: React.DragEvent) => { if (!e.dataTransfer.types.includes(`text/wgm-task-${kind}`)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const after = dropAt(e); if (drop?.id !== id || drop.after !== after) setDrop({ id, after }); },
    onDragLeave: () => setDrop((d) => (d?.id === id ? null : d)),
    onDragEnd: () => setDrop(null),
    onDrop: (e: React.DragEvent) => {
      const from = e.dataTransfer.getData(`text/wgm-task-${kind}`);
      const after = dropAt(e);
      setDrop(null);
      if (!from || from === id) return;
      e.preventDefault();
      if (kind === 'smart') moveSmart(from as SmartPlace, id as SmartPlace, after);
      else reorderAccounts(accountOrderAfterDrop(accountOrder(), from, id, after));
    },
  });
  const dropClass = (id: string) => (drop?.id === id ? (drop.after ? ' drop-after' : ' drop-before') : '');

  return (
    <div className="tasks-view card">
      <nav className="tasks-side" aria-label="Task lists">
        {prefs.smartOrder.map((p) => (
          <div key={p} className={`side-row${dropClass(p)}`} {...dragProps('smart', p)} onContextMenu={(e) => e.preventDefault()}>
            <span className="tasks-grip" aria-hidden><Icon name="grip" size={12} /></span>
            <button className={`side-item${place === p ? ' selected' : ''}`} onClick={() => go(p)} aria-current={place === p ? 'true' : undefined} title={`${SMART_LOOK[p].label}. Drag to reorder.`}>
              <Icon name={SMART_LOOK[p].icon} /><span className="name">{SMART_LOOK[p].label}</span>{counts[p] ? <span className="count">{counts[p]}</span> : null}
            </button>
          </div>
        ))}
        {byAccount.length > 0 && <div className="tasks-sh">Accounts</div>}
        {byAccount.map(({ a, lists: ls }) => {
          const mine = open.filter((t) => t.accountId === a.id);
          const late = mine.filter((t) => isOverdue(t)).length;
          const on = place === `acc:${a.id}`;
          const unfolded = isOpen(a.id);
          return (
            <div key={a.id}>
              <div className={`side-row${dropClass(a.id)}`} {...dragProps('acc', a.id)} onContextMenu={(e) => { e.preventDefault(); menu.open({ x: e.clientX, y: e.clientY }, accountMenu(a)); }}>
                <button
                  className={`side-item${on ? ' selected' : ''}`}
                  style={on ? { background: `color-mix(in srgb, ${a.colour} 26%, transparent)`, boxShadow: `inset 3px 0 0 ${a.colour}` } : undefined}
                  onClick={() => go(`acc:${a.id}`)} aria-current={on ? 'true' : undefined} title={`All of ${accName(a)}'s tasks (${tasksApp(a)}). Drag to change the account order.`}
                >
                  <span className="twisty" onClick={(e) => { e.stopPropagation(); setOpen(a.id, !unfolded); }} role="button" aria-label={unfolded ? 'Hide lists' : 'Show lists'} aria-expanded={unfolded}>
                    <Icon name={unfolded ? 'chevronDown' : 'chevronRight'} size={13} />
                  </span>
                  <span className="dot" style={{ background: a.colour }} />
                  <span className="name">{accName(a)}</span>
                  {late ? <span className="count late">{late} late</span> : mine.length ? <span className="count">{mine.length}</span> : null}
                </button>
                <button className="side-more" aria-label={`Options for ${accName(a)}`} onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), accountMenu(a), 'right')}><Icon name="more" size={14} /></button>
              </div>
              {unfolded && ls.map((l) => (
                <ListRow key={l.id} list={l} on={place === l.id} isDefault={groupDefault?.id === l.id} group={group}
                  n={open.filter((t) => t.listId === l.id).length} late={open.filter((t) => t.listId === l.id && isOverdue(t)).length}
                  renaming={renaming === l.id} onRename={(v) => { setRenaming(null); if (v !== null) void renameList(l, v); }} startRename={() => setRenaming(l.id)}
                  onOpen={() => go(l.id)} onMenu={(at, align) => menu.open(at, listMenu(l, a), align)} />
              ))}
            </div>
          );
        })}
        <NewListButton accounts={byAccount.map((x) => x.a)} />
        {menu.node}
      </nav>
      <div className="tasks-main">
        {groupTrouble.map(([id, t]) => {
          const a = accounts.find((x) => x.id === id)!;
          return (
            <div className="tasks-trouble" key={id}>
              <span className="dot" style={{ background: a.colour }} />
              <div className="grow">{accName(a)}: {t.text}</div>
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
            {x.items.map((t) => <TaskRow key={t.id} task={t} showList={!lists.some((l) => l.id === place)} showAccount={smart} />)}
          </section>
        ))}
        {older.length > 0 && (
          <>
            <button className="tasks-fold" onClick={() => setShowOld(!showOld)} aria-expanded={showOld}>
              <Icon name={showOld ? 'chevronDown' : 'chevronRight'} size={14} /> Completed before today <span className="chip">{older.length}</span>
            </button>
            {showOld && older.map((t) => <TaskRow key={t.id} task={t} showList={!lists.some((l) => l.id === place)} showAccount={place === 'all'} />)}
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

/** A list under its account: click to open, a slow second click (or Rename) to rename, ★ to make it the group's default. */
function ListRow({ list, on, isDefault, group, n, late, renaming, onRename, startRename, onOpen, onMenu }: {
  list: TaskList; on: boolean; isDefault: boolean; group: string; n: number; late: number; renaming: boolean;
  onRename: (v: string | null) => void; startRename: () => void; onOpen: () => void; onMenu: (at: DOMRect | { x: number; y: number }, align?: 'left' | 'right') => void;
}) {
  const lastClick = useRef(0);
  return (
    <div className="side-row tasks-list-row" onContextMenu={(e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); }}>
      {renaming ? (
        <div className="side-item child"><NameEdit value={list.name} onSave={onRename} onCancel={() => onRename(null)} /></div>
      ) : (
        <button
          className={`side-item child${on ? ' selected' : ''}`}
          aria-current={on ? 'true' : undefined}
          onClick={() => {
            // Click the open list again after a short pause (like Explorer and the mail sidebar) to rename it.
            const gap = Date.now() - lastClick.current;
            lastClick.current = Date.now();
            if (on && gap > 450 && gap < 2500) return startRename();
            onOpen();
          }}
          title={isDefault ? `${list.name}: new tasks go here while ${groupName(group)} is picked` : list.name}
        >
          <span className="name">{list.name}</span>
          <span
            className={`tasks-star${isDefault ? ' on' : ''}`}
            role="button"
            aria-label={isDefault ? `Default for ${groupName(group)}` : `Set as default for ${groupName(group)}`}
            title={isDefault ? `Default for ${groupName(group)}` : `Set as default for ${groupName(group)}`}
            onClick={(e) => { e.stopPropagation(); if (!isDefault) setDefaultList(group, list.id); }}
          >{isDefault ? '★' : '☆'}</span>
          {late ? <span className="count late">{late} late</span> : n ? <span className="count">{n}</span> : null}
        </button>
      )}
      {!renaming && <button className="side-more" aria-label={`Options for ${list.name}`} onClick={(e) => onMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), 'right')}><Icon name="more" size={14} /></button>}
    </div>
  );
}

/** The text box that takes a name's place while renaming, as in the mail sidebar: Enter or clicking away saves, Escape cancels. */
function NameEdit({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(value);
  const box = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { box.current?.focus(); box.current?.select(); }, []);
  const finish = (save: boolean) => { if (done.current) return; done.current = true; if (save) onSave(v); else onCancel(); };
  return (
    <input
      ref={box} className="side-rename" value={v} aria-label="Rename list"
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); }}
      onBlur={() => finish(true)}
    />
  );
}

function NewListButton({ accounts }: { accounts: Account[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [acc, setAcc] = useState(accounts[0]?.id || '');
  if (!accounts.length) return null;
  if (!open) return <div className="side-row"><button className="side-item dim" onClick={() => setOpen(true)}><Icon name="plus" /><span className="name">New list</span></button></div>;
  const make = async () => { if (!name.trim()) return; const l = await newList(acc || accounts[0].id, name.trim()); if (l) useSettings.getState().set({ tasksPlace: l.id }); setOpen(false); setName(''); };
  return (
    <div className="tasks-newlist">
      <input className="input" autoFocus placeholder="List name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void make(); if (e.key === 'Escape') setOpen(false); }} />
      {accounts.length > 1 && <select className="input" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Account">{accounts.map((a) => <option key={a.id} value={a.id}>{accName(a)}</option>)}</select>}
      <div className="row"><button className="btn small" onClick={() => setOpen(false)}>Cancel</button><button className="btn small primary" disabled={!name.trim()} onClick={() => void make()}>Make list</button></div>
    </div>
  );
}

// ---- The list picker: each account's lists under its heading and colour dot; the choice reads "My Tasks · WGM" ----

export function ListPicker({ value, lists, onChange, small, id }: { value: string; lists: TaskList[]; onChange: (id: string) => void; small?: boolean; id?: string }) {
  const accounts = useSortedAccounts();
  const group = useSettings((s) => s.calendarGroup);
  const [at, setAt] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const cur = lists.find((l) => l.id === value);
  const acc = accounts.find((a) => a.id === cur?.accountId);
  const groups = accounts.map((a) => ({ a, ls: lists.filter((l) => l.accountId === a.id) })).filter((x) => x.ls.length);
  const close = () => { setAt(null); btn.current?.focus(); };
  return (
    <>
      <button
        type="button" id={id} ref={btn} className={`list-pick${small ? ' small' : ''}`} aria-haspopup="listbox" aria-expanded={Boolean(at)}
        aria-label={`List: ${cur ? `${cur.name}, ${accName(acc)}` : 'none'}`}
        onClick={(e) => setAt(e.currentTarget.getBoundingClientRect())}
      >
        {acc && <span className="dot" style={{ background: acc.colour }} aria-hidden />}
        <span className="lp-name">{cur ? cur.name : 'Pick a list'}{acc && <span className="lp-acc"> · {accName(acc)}</span>}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {at && <ListPickerMenu at={at} groups={groups} value={value} def={defaultList(group)?.id} onPick={(v) => { close(); onChange(v); }} onClose={close} />}
    </>
  );
}

function ListPickerMenu({ at, groups, value, def, onPick, onClose }: { at: DOMRect; groups: { a: Account; ls: TaskList[] }[]; value: string; def?: string; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(6, Math.min(at.left, window.innerWidth - w - 6));
    let top = at.bottom + 4;
    if (top + h > window.innerHeight - 6) top = Math.max(6, at.top - h - 4);
    setPos({ left, top });
    (el.querySelector<HTMLElement>('[aria-selected="true"]') || el.querySelector<HTMLElement>('button'))?.focus();
  }, [at]);
  useEffect(() => {
    // Caught first, so Escape closes only the picker and not the pop-up it sits in.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button') || []);
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <>
      <div className="overlay list-pick-overlay" onMouseDown={onClose} />
      <div className="menu list-pick-menu" ref={ref} style={pos} role="listbox" aria-label="Lists">
        {groups.map(({ a, ls }) => (
          <div key={a.id} role="group" aria-label={accName(a)}>
            <div className="menu-label lp-head"><span className="dot" style={{ background: a.colour }} aria-hidden />{accName(a)}</div>
            {ls.map((l) => (
              <button key={l.id} role="option" aria-selected={l.id === value} className={l.id === value ? 'active' : ''} onClick={() => onPick(l.id)}>
                <span className="lp-tick">{l.id === value && <Icon name="check" size={13} />}</span>
                <span>{l.name}</span>
                {l.id === def && <span className="kbd lp-star" title="The default list for this group">★</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}

// ---- Quick add ----

function QuickAdd({ list, lists }: { list?: TaskList; lists: TaskList[] }) {
  const [text, setText] = useState('');
  const [keepWords, setKeepWords] = useState(false);
  const [pick, setPick] = useState<string>('');
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
          <ListPicker small value={target.id} lists={lists} onChange={setPick} />
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
/** The task pop-up for a new task, in the default list of the group being looked at. It starts on today at the next round hour. */
export function newTask(due?: number) {
  startTasks();
  const start = due ?? nextRoundHour();
  useEditor.setState((s) => ({ task: undefined, draft: { title: '', due: start, hasTime: due === undefined, listId: defaultList()?.id }, seq: s.seq + 1 }));
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

/** How a day reads in the pop-up: Today, Tomorrow, or "Wed 18 Nov". */
function dayWords(ymd: string, now = Date.now()): string {
  if (!ymd) return '';
  const ms = msAt(ymd);
  const today = midnightOf(now);
  if (ms === today) return 'Today';
  if (ms === today + DAY) return 'Tomorrow';
  if (ms === today - DAY) return 'Yesterday';
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

function TaskEditor({ task, draft }: { task?: Task; draft?: EditorState['draft'] }) {
  const lists = useTasks((s) => s.lists);
  const loaded = useTasks((s) => s.loaded);
  const accounts = useMail((s) => s.accounts);
  const start = task || draft!;
  const [title, setTitle] = useState(start.title || '');
  const [day, setDay] = useState(start.due !== undefined ? ymdOf(start.due) : '');
  const [time, setTime] = useState(start.due !== undefined && start.hasTime ? hmOf(start.due) : '');
  // The day can be typed ("18 Nov", "Wednesday", "next Friday"): while typing, `typed` holds the words.
  const [typed, setTyped] = useState<string | null>(null);
  const [notes, setNotes] = useState(start.notes || '');
  const [listId, setListId] = useState(task?.listId || draft?.listId || defaultList()?.id || '');
  const titleRef = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); titleRef.current?.select(); }, []);
  // Lists can arrive after the pop-up opens (the first time Tasks is used).
  useEffect(() => { if (!listId && lists.length) setListId((draft?.mail && listForAccount(draft.mail.accountId)?.id) || defaultList()?.id || lists[0].id); }, [lists, listId, draft]);
  const mail = task?.mail || draft?.mail;
  const reading = typed !== null && typed.trim() ? readDay(typed) : undefined;
  /** The day and time as they stand, taking in any typed words not yet confirmed. */
  const current = (): { day: string; time: string } => {
    if (typed === null) return { day, time };
    if (!typed.trim()) return { day: '', time: '' };
    if (!reading) return { day, time };
    return { day: ymdOf(reading.day), time: reading.minutes !== undefined ? `${pad(Math.floor(reading.minutes / 60))}:${pad(reading.minutes % 60)}` : time };
  };
  const confirmDay = () => {
    if (typed === null) return;
    const c = current();
    if (typed.trim() && !reading) toast({ text: `"${typed.trim()}" isn't a date I can read, so the day stays as it was`, ttl: 4000 });
    setDay(c.day);
    setTime(c.day ? c.time : '');
    setTyped(null);
  };
  const save = () => {
    if (!title.trim()) return;
    const c = current();
    const due = c.day ? msAt(c.day, c.time || undefined) : null;
    const patch = { title: title.trim(), notes, due, hasTime: Boolean(c.day && c.time) };
    if (task) {
      const changed = patch.title !== task.title || notes !== (task.notes || '') || (due ?? undefined) !== task.due || patch.hasTime !== Boolean(task.hasTime);
      if (changed) void changeTask(task, patch);
      if (listId && listId !== task.listId) void moveTask({ ...task, ...patch, due: due ?? undefined }, listId);
    } else if (listId) {
      void addTask(listId, { ...patch, mail });
    }
    closeEditor();
  };
  const showing = typed !== null && reading ? dayWords(ymdOf(reading.day)) + (reading.minutes !== undefined ? `, ${pad(Math.floor(reading.minutes / 60))}:${pad(reading.minutes % 60)}` : '') : '';
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
        <div className="row"><span className="k">When</span>
          <span className="task-day">
            <input
              className="input day-text" aria-label="Due day (type a date, like 18 Nov or next Friday)" placeholder="No date"
              value={typed ?? dayWords(day)}
              onFocus={(e) => { setTyped(dayWords(day)); requestAnimationFrame(() => e.target.select()); }}
              onChange={(e) => setTyped(e.target.value)}
              onBlur={confirmDay}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmDay(); (e.target as HTMLInputElement).blur(); }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTyped(null); (e.target as HTMLInputElement).blur(); }
              }}
            />
            <button type="button" className="icon-btn day-pick" title="Pick from a calendar" aria-label="Pick from a calendar" onClick={() => { const p = picker.current; if (!p) return; try { p.showPicker(); } catch { p.focus(); } }}><Icon name="calendar" size={14} /></button>
            <input ref={picker} type="date" className="day-native" tabIndex={-1} aria-hidden value={day} onChange={(e) => { setDay(e.target.value); if (!e.target.value) setTime(''); }} />
          </span>
          <input type="time" className="input" value={time} disabled={!day && !reading} onChange={(e) => setTime(e.target.value)} aria-label="Due time" />
        </div>
        <div className="row task-when-sub">
          <span className="k" />
          <span className="hint">{typed !== null ? (typed.trim() ? (reading ? showing : 'Type a date, like 18 Nov, Wednesday or next Friday') : 'No date') : day && !time ? 'Add a time to be alerted then.' : ''}</span>
          <span className="grow" />
          {day && time && <button type="button" className="link-btn" onClick={() => setTime('')}>Clear time</button>}
          {day && <button type="button" className="link-btn" onClick={() => { setDay(''); setTime(''); setTyped(null); }}>Clear date and time</button>}
        </div>
        <div className="row"><span className="k">List</span>
          {lists.length ? <ListPicker value={listId} lists={lists} onChange={setListId} />
            : <span className="hint">{loaded ? 'No task lists yet. Accounts may need to sign in once more for tasks.' : 'Loading lists…'}</span>}
        </div>
        <label className="row top"><span className="k">Notes</span><textarea className="input grow" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {time && accounts.find((a) => a.id === lists.find((l) => l.id === listId)?.accountId)?.kind === 'gmail' && <div className="hint">Google Tasks keeps the day only, so the time is also written at the top of the notes for your phone.</div>}
      </div>
    </Dialog>
  );
}

// ---- An email's tasks: the "✓ 2 tasks" tag in the email, and its pop-up ----

/** The tasks made from an email (kept in this app only, nothing is written to the email). */
export function useEmailTasks(messageId: string): Task[] {
  const all = useTasks((s) => s.tasks);
  return useMemo(() => emailTasks(all).byMessage.get(messageId) || [], [all, messageId]);
}

export function EmailTasksTag({ message }: { message: Message }) {
  const tasks = useEmailTasks(message.id);
  const [at, setAt] = useState<DOMRect | null>(null);
  const accounts = useMail((s) => s.accounts);
  if (!tasks.length) return null;
  const open = tasks.filter((t) => !t.done).length;
  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? Infinity) - (b.due ?? Infinity));
  const words = open ? `${open} ${open === 1 ? 'task' : 'tasks'}` : 'All done';
  const listIds = [...new Set(tasks.map((t) => t.listId))];
  return (
    <>
      <button className={`email-tasks-tag${open ? '' : ' done'}`} aria-haspopup="dialog" aria-expanded={Boolean(at)} title={open ? `Tasks made from this email: ${open} still to do` : 'Every task made from this email is done'} onClick={(e) => setAt(e.currentTarget.getBoundingClientRect())}>
        <Icon name="check" size={12} /> {words} <Icon name="chevronDown" size={11} />
      </button>
      {at && <Popover at={at} onClose={() => setAt(null)} label="Tasks from this email">
        {sorted.map((t) => {
          const a = accounts.find((x) => x.id === t.accountId);
          return (
            <div key={t.id} className={`cu-task${t.done ? ' done' : ''}`} onClick={() => { setAt(null); editTask(t); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') { setAt(null); editTask(t); } }}>
              <TaskRing task={t} small />
              <div className="grow">{t.title || 'Untitled task'}<small>{[t.due !== undefined ? cap(dueText(t)) : '', accName(a)].filter(Boolean).join(' · ')}</small></div>
            </div>
          );
        })}
        <div className="email-tasks-links">
          <button className="link-btn" onClick={() => { setAt(null); makeTaskFromEmail(message); }}>+ Make another</button>
          <span className="grow" />
          <button className="link-btn" onClick={() => { setAt(null); openTasks(listIds.length === 1 ? listIds[0] : 'all'); }}>Open in Tasks ›</button>
        </div>
      </Popover>}
    </>
  );
}

/** A small card under a button, closed by clicking away or Escape. */
function Popover({ at, onClose, label, children }: { at: DOMRect; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(6, Math.min(at.right - w, window.innerWidth - w - 6));
    let top = at.bottom + 4;
    if (top + h > window.innerHeight - 6) top = Math.max(6, at.top - h - 4);
    setPos({ left, top });
  }, [at]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <>
      <div className="overlay list-pick-overlay" onMouseDown={onClose} />
      <div className="menu email-tasks-pop" ref={ref} style={pos} role="dialog" aria-label={label}>{children}</div>
    </>,
    document.body,
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
