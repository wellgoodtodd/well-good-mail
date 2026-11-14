import { describe, expect, it } from 'vitest';
import { taskAlertsDue } from '../tasks';
import type { Task } from '../types';

const due = new Date(2026, 10, 20, 15, 0).getTime();
const task = (p: Partial<Task> = {}): Task => ({ id: 'a|l|1', accountId: 'a', listId: 'a|l', providerId: '1', title: 'Dentist', due, hasTime: true, done: false, ...p });
const MIN = 60000;

describe('when task alerts go off', () => {
  it('alerts at the time when none are set', () => {
    expect(taskAlertsDue([task()], due - MIN, new Set())).toEqual([]);
    expect(taskAlertsDue([task()], due + MIN, new Set()).map((d) => d.mins)).toEqual([0]);
  });
  it('alerts at each chosen time before', () => {
    const t = task({ alerts: [10, 60] });
    expect(taskAlertsDue([t], due - 60 * MIN, new Set()).map((d) => d.mins)).toEqual([60]);
    expect(taskAlertsDue([t], due - 9 * MIN, new Set()).map((d) => d.mins)).toEqual([10]);
    expect(taskAlertsDue([t], due, new Set())).toEqual([]);
  });
  it('gives nothing for Alert: none, done tasks, tasks without a time, or alerts already given', () => {
    expect(taskAlertsDue([task({ alerts: [] })], due, new Set())).toEqual([]);
    expect(taskAlertsDue([task({ done: true })], due, new Set())).toEqual([]);
    expect(taskAlertsDue([task({ hasTime: false })], due, new Set())).toEqual([]);
    const [first] = taskAlertsDue([task()], due, new Set());
    expect(taskAlertsDue([task()], due + MIN, new Set([first.key]))).toEqual([]);
  });
  it('lets one go once it is over 10 minutes old', () => {
    expect(taskAlertsDue([task()], due + 11 * MIN, new Set())).toEqual([]);
  });
});
