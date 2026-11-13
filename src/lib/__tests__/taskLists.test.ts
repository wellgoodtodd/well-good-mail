import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useTasks, renameList, deleteList, emailTaskIndex, threadTaskMark, todayCount, refreshDue, restFor, smartOrder,
  accountOrderAfterDrop, nextRoundHour, readDay, QUICK_REFRESH, SLOW_REFRESH,
} from '../tasks';
import { providers } from '../mail/store';
import type { Task, TaskList } from '../types';

const NOW = new Date(2026, 10, 13, 9, 20).getTime(); // Friday 13 November 2026, 09:20
const at = (d: number, h = 0, m = 0) => new Date(2026, 10, d, h, m).getTime();
const list: TaskList = { id: 'a|l1', accountId: 'a', providerId: 'l1', name: 'My Tasks' };
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, accountId: 'a', listId: 'a|l1', providerId: id, title: id, done: false, ...extra });

describe('Renaming and deleting a list', () => {
  beforeEach(() => { providers.clear(); useTasks.setState({ lists: [list, { ...list, id: 'a|l2', providerId: 'l2', name: 'Studio' }], tasks: [task('t1'), task('t2', { listId: 'a|l2' })] }); });

  it('shows the new name at once and keeps it when the account agrees', async () => {
    let agree: (l: TaskList) => void = () => {};
    providers.set('a', { renameTaskList: (_l: TaskList, name: string) => new Promise((ok) => { agree = () => ok({ ...list, name }); }) } as never);
    const saving = renameList(list, 'Errands');
    expect(useTasks.getState().lists[0].name).toBe('Errands');
    agree(list);
    expect(await saving).toBe(true);
    expect(useTasks.getState().lists[0].name).toBe('Errands');
  });

  it('puts the old name back if the account refuses', async () => {
    let refuse: (e: Error) => void = () => {};
    providers.set('a', { renameTaskList: () => new Promise((_, no) => { refuse = no; }) } as never);
    const saving = renameList(list, 'Errands');
    await vi.waitFor(() => expect(useTasks.getState().lists[0].name).toBe('Errands'));
    refuse(new Error('Forbidden'));
    expect(await saving).toBe(false);
    expect(useTasks.getState().lists[0].name).toBe('My Tasks');
  });

  it('leaves an unchanged or empty name alone', async () => {
    providers.set('a', { renameTaskList: vi.fn() } as never);
    expect(await renameList(list, '  ')).toBe(false);
    expect(await renameList(list, 'My Tasks')).toBe(false);
  });

  it('brings a list and its tasks back, in the same place, if the delete fails', async () => {
    providers.set('a', { deleteTaskList: async () => { throw new Error('Nope'); } } as never);
    expect(await deleteList(list)).toBe(false);
    expect(useTasks.getState().lists.map((l) => l.id)).toEqual(['a|l1', 'a|l2']);
    expect(useTasks.getState().tasks.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('takes the list and its tasks away when the delete works', async () => {
    providers.set('a', { deleteTaskList: async () => {} } as never);
    expect(await deleteList(list)).toBe(true);
    expect(useTasks.getState().lists.map((l) => l.id)).toEqual(['a|l2']);
    expect(useTasks.getState().tasks.map((t) => t.id)).toEqual(['t2']);
  });
});

describe('Emails and their tasks', () => {
  const mail = (messageId: string, threadId = 'th1') => ({ messageId, threadId, accountId: 'a', subject: 'Studio booking' });
  const tasks = [
    task('t1', { mail: mail('m1') }), task('t2', { mail: mail('m1'), done: true }), task('t3', { mail: mail('m2', 'th2'), done: true }),
    task('t4', { mail: { ...mail(''), threadId: '' } }), task('t5'),
  ];
  it('finds the tasks made from each email and each conversation', () => {
    const i = emailTaskIndex(tasks);
    expect(i.byMessage.get('m1')!.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(i.byThread.get('a|th2')!.map((t) => t.id)).toEqual(['t3']);
    expect(i.byMessage.has('')).toBe(false); // made on the phone: no email here
  });
  it('marks a conversation open while any task is to do, then done', () => {
    expect(threadTaskMark(tasks, 'a|th1')).toBe('open');
    expect(threadTaskMark(tasks, 'a|th2')).toBe('done');
    expect(threadTaskMark(tasks, 'a|th9')).toBeUndefined();
  });
});

describe('The Tasks count in the sidebar', () => {
  it('counts open tasks due today or overdue', () => {
    const ts = [
      task('today', { due: at(13) }), task('late', { due: at(10) }), task('tonight', { due: at(13, 22), hasTime: true }),
      task('tomorrow', { due: at(14) }), task('none'), task('done', { due: at(13), done: true }),
    ];
    expect(todayCount(ts, NOW)).toBe(3);
  });
});

describe('Refreshing from the phone', () => {
  it('looks every minute while tasks are on screen, every five minutes otherwise, never twice at once', () => {
    expect(refreshDue(NOW, NOW - QUICK_REFRESH, true, false)).toBe(true);
    expect(refreshDue(NOW, NOW - QUICK_REFRESH, false, false)).toBe(false);
    expect(refreshDue(NOW, NOW - SLOW_REFRESH, false, false)).toBe(true);
    expect(refreshDue(NOW, NOW - SLOW_REFRESH, true, true)).toBe(false);
  });
  it('rests a failing account longer each time', () => {
    expect([1, 2, 3, 4, 9].map(restFor)).toEqual([2, 4, 8, 15, 15].map((m) => m * 60000));
  });
});

describe('The Tasks sidebar order', () => {
  it('starts with All Tasks, and keeps a saved order', () => {
    expect(smartOrder(undefined)).toEqual(['all', 'today', 'scheduled']);
    expect(smartOrder(['scheduled', 'today'])).toEqual(['all', 'scheduled', 'today']);
    expect(smartOrder(['today', 'today', 'x', 'scheduled', 'all'])).toEqual(['today', 'scheduled', 'all']);
  });
  it('moves an account before or after another', () => {
    expect(accountOrderAfterDrop(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(accountOrderAfterDrop(['a', 'b', 'c'], 'a', 'b', true)).toEqual(['b', 'a', 'c']);
    expect(accountOrderAfterDrop(['a', 'b'], 'a', 'zz')).toEqual(['a', 'b']);
  });
});

describe('The task pop-up', () => {
  it('starts at the next round hour', () => {
    expect(nextRoundHour(NOW)).toBe(at(13, 10));
    expect(nextRoundHour(at(13, 10))).toBe(at(13, 11));
  });
  it('reads a typed day', () => {
    expect(readDay('18 Nov', NOW)).toEqual({ day: at(18) });
    expect(readDay('Wednesday', NOW)).toEqual({ day: at(18) });
    expect(readDay('next Friday', NOW)?.day).toBe(at(20));
    expect(readDay('today', NOW)).toEqual({ day: at(13) });
    expect(readDay('tomorrow 3pm', NOW)).toEqual({ day: at(14), minutes: 15 * 60 });
    expect(readDay('2026-12-01', NOW)).toEqual({ day: new Date(2026, 11, 1).getTime() });
    expect(readDay('banana', NOW)).toBeUndefined();
  });
});
