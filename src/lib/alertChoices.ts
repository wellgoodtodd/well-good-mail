// The Alert and Second alert choices, the same in Well Good Mail and Well Good Calendar. Minutes before the event
// starts (or the task is due); 0 is at the time.

export interface AlertChoice { mins: number; label: string }

export const TIMED_ALERTS: AlertChoice[] = [
  { mins: 0, label: 'At the time of the event' }, { mins: 5, label: '5 minutes before' }, { mins: 10, label: '10 minutes before' }, { mins: 15, label: '15 minutes before' },
  { mins: 30, label: '30 minutes before' }, { mins: 60, label: '1 hour before' }, { mins: 120, label: '2 hours before' }, { mins: 1440, label: '1 day before' },
  { mins: 2880, label: '2 days before' }, { mins: 10080, label: '1 week before' },
];

// All-day events start at midnight, so "the day before at 09:00" is 15 hours before.
export const ALLDAY_ALERTS: AlertChoice[] = [
  { mins: 900, label: 'The day before at 09:00' }, { mins: 2340, label: '2 days before at 09:00' }, { mins: 9540, label: 'A week before at 09:00' },
];

export const TASK_ALERTS: AlertChoice[] = [
  { mins: 0, label: 'At the time' }, { mins: 5, label: '5 minutes before' }, { mins: 10, label: '10 minutes before' }, { mins: 15, label: '15 minutes before' },
  { mins: 30, label: '30 minutes before' }, { mins: 60, label: '1 hour before' }, { mins: 120, label: '2 hours before' }, { mins: 1440, label: '1 day before' },
];

/** Words for any number of minutes before, for alerts set elsewhere that aren't in the lists. */
export function minsWords(m: number): string {
  if (m === 0) return 'At the time';
  if (m % 1440 === 0) return `${m / 1440} ${m === 1440 ? 'day' : 'days'} before`;
  if (m % 60 === 0) return `${m / 60} ${m === 60 ? 'hour' : 'hours'} before`;
  return `${m} ${m === 1 ? 'minute' : 'minutes'} before`;
}

/** The choices for one picker: the usual ones plus any odd value already set (so it shows rather than vanishing). */
export function choicesWith(list: AlertChoice[], ...set: (number | null | undefined)[]): AlertChoice[] {
  const extra = set.filter((m): m is number => typeof m === 'number' && !list.some((a) => a.mins === m)).map((mins) => ({ mins, label: minsWords(mins) }));
  return [...list, ...extra].sort((a, b) => a.mins - b.mins);
}
