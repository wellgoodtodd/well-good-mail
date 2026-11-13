// Tasks inside the Coming up blocks (Today, Later, and a day picked in the calendar): the tick circle, the title and
// its time, in the Calendar Group being looked at.
import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '../lib/settings';
import { useTasks, tasksInGroup, isOverdue, doneToday, startTasks, startOfToday } from '../lib/tasks';
import { TaskRing, editTask } from './Tasks';
import type { Task } from '../lib/types';

const DAY = 86400000;
const hm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * Tasks due from `from` up to `to`: open ones, and ones ticked off today (they stay crossed out for the day).
 * With `overdue`, open tasks from before `from` come first, so nothing late slips out of view.
 */
export function pickTasks(all: Task[], from: number, to: number, overdue: boolean): Task[] {
  return all
    .filter((t) => t.due !== undefined && t.due < to && (t.done ? doneToday(t) && t.due >= from : t.due >= from || overdue))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? 0) - (b.due ?? 0));
}

export function useTasksBetween(from: number, to: number, overdue = false): Task[] {
  useEffect(() => { startTasks(); }, []);
  const group = useSettings((s) => s.calendarGroup);
  useSettings((s) => s.calendarGroups);
  const all = useTasks((x) => x.tasks);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = () => setTick((n) => n + 1); window.addEventListener('wgm-minute', t); return () => window.removeEventListener('wgm-minute', t); }, []);
  return useMemo(() => pickTasks(tasksInGroup(all, group), from, to, overdue), [all, group, from, to, overdue, tick]);
}

/** The task rows. `showDay` adds the day under each one (for Later). */
export function TaskLines({ tasks, showDay, limit = 8 }: { tasks: Task[]; showDay?: boolean; limit?: number }) {
  const today = startOfToday();
  return (
    <>
      {tasks.slice(0, limit).map((t) => {
        const day = t.due !== undefined ? new Date(t.due).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
        const late = isOverdue(t) && t.due! < today;
        const bits = [showDay || late ? day : '', t.hasTime && t.due !== undefined ? hm(t.due) : '', t.mail && !t.done ? `✉ ${t.mail.subject}` : ''].filter(Boolean);
        return (
          <div key={t.id} className={`cu-task${t.done ? ' done' : ''}`} onClick={() => editTask(t)} role="button" tabIndex={0} onKeyDown={(k) => { if (k.key === 'Enter') editTask(t); }}>
            <TaskRing task={t} small />
            <div className="grow">
              {t.title}
              {bits.length > 0 && !t.done && <small className={late ? 'late' : ''}>{bits.join(' · ')}</small>}
            </div>
          </div>
        );
      })}
      {tasks.length > limit && <div className="cu-more">{tasks.length - limit} more in Tasks</div>}
    </>
  );
}

export { DAY as TASK_DAY };
