import { describe, expect, it } from 'vitest';
import { copiesOf, deleteFromLabel, namesList } from '../eventFlows';
import { pickTasks } from '../../components/TaskBlocks';
import { alertLines } from '../../components/AlertsButton';
import { useSettings } from '../settings';
import type { CalendarEvent, Task } from '../types';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const ev = (id: string, accountId: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, accountId, calendarName: 'Main', title: 'Studio walkthrough', start: at(19, 14), end: at(19, 15), allDay: false, reminderMinutes: [], canEdit: true, ...extra,
});

describe('Deleting from several calendars', () => {
  it('finds one copy per account and calendar', () => {
    const shown = ev('1', 'a', { accountIds: ['a', 'b'] });
    const all = [ev('1', 'a'), ev('2', 'b'), ev('3', 'c'), ev('4', 'b', { title: 'Other' })];
    expect(copiesOf(shown, all).map((e) => e.accountId)).toEqual(['a', 'b']);
  });
  it('is just the one event when it is on one calendar', () => {
    const one = ev('1', 'a');
    expect(copiesOf(one, [one, ev('2', 'b')])).toEqual([one]);
  });
  it('names what the button does', () => {
    expect(namesList(['WGM'])).toBe('WGM');
    expect(namesList(['WGM', 'TBWELLER', 'TWF'])).toBe('WGM, TBWELLER and TWF');
    expect(deleteFromLabel(['WGM'], 3)).toBe('Delete from WGM');
    expect(deleteFromLabel(['WGM', 'TBWELLER'], 3)).toBe('Delete from WGM and TBWELLER');
    expect(deleteFromLabel(['WGM', 'TBWELLER'], 2)).toBe('Delete everywhere');
  });
});

describe('Tasks in the Coming up blocks', () => {
  const day = new Date(2026, 10, 13).getTime();
  const task = (id: string, due: number | undefined, extra: Partial<Task> = {}): Task => ({ id, listId: 'l', accountId: 'a', title: id, due, done: false, ...extra } as Task);
  const tasks = [task('late', day - 2 * 86400000), task('today', day + 3600000), task('tomorrow', day + 86400000 + 1), task('none', undefined)];
  it('Today takes overdue ones too, first', () => {
    expect(pickTasks(tasks, day, day + 86400000, true).map((t) => t.id)).toEqual(['late', 'today']);
  });
  it('a picked day only takes its own', () => {
    expect(pickTasks(tasks, day, day + 86400000, false).map((t) => t.id)).toEqual(['today']);
  });
});

describe('The Alerts card', () => {
  it('says how alerts reach you, one line each', () => {
    const s = { ...useSettings.getState(), reminderMode: 'important', summaryTime: '08:30', meetingAlert1On: true, meetingAlert1Mins: 5, meetingAlert2On: true, meetingAlert2Mins: 15, quietHours: { enabled: true, from: '22:00', to: '07:00' }, flashTaskbar: false, alertsPausedUntil: 0 } as ReturnType<typeof useSettings.getState>;
    expect(alertLines(s)).toEqual(['Pop-ups for important events only', 'Daily summary at 08:30', 'Video calls: 15 and 5 minutes before', 'Tasks with a time: at that time', 'Quiet hours 22:00 to 07:00']);
  });
  it('says when they are paused', () => {
    const now = new Date(2026, 10, 13, 14, 0).getTime();
    const s = { ...useSettings.getState(), alertsPausedUntil: now + 3600000 } as ReturnType<typeof useSettings.getState>;
    expect(alertLines(s, now)[0]).toBe('Paused until 15:00');
  });
});
