import { beforeEach, describe, expect, it } from 'vitest';
import { HISTORY_MAX, ago, clearHistory, record, redoSteps, undoEntry, undoSteps, useHistory } from '../history';

let log: string[] = [];
const step = (name: string) => record(name, () => { log.push(`undo ${name}`); }, () => { log.push(`redo ${name}`); });

beforeEach(() => { clearHistory(); log = []; });

describe('undo history', () => {
  it('undoes the latest step first, then the one before', async () => {
    step('a'); step('b');
    await undoSteps(1);
    await undoSteps(1);
    expect(log).toEqual(['undo b', 'undo a']);
    expect(useHistory.getState().past).toHaveLength(0);
    expect(useHistory.getState().future).toHaveLength(2);
  });
  it('redoes in the order things were done', async () => {
    step('a'); step('b');
    await undoSteps(2);
    log = [];
    await redoSteps(2);
    expect(log).toEqual(['redo a', 'redo b']);
    expect(useHistory.getState().past.map((e) => e.label)).toEqual(['a', 'b']);
  });
  it('undoes several steps at once, back to a chosen one', async () => {
    step('a'); step('b'); step('c');
    await undoSteps(2);
    expect(log).toEqual(['undo c', 'undo b']);
    expect(useHistory.getState().past.map((e) => e.label)).toEqual(['a']);
  });
  it('forgets what could be redone when something new is done', async () => {
    step('a'); step('b');
    await undoSteps(1);
    step('c');
    expect(useHistory.getState().future).toHaveLength(0);
  });
  it('keeps only the most recent steps', () => {
    for (let i = 0; i < HISTORY_MAX + 5; i++) step(`s${i}`);
    const past = useHistory.getState().past;
    expect(past).toHaveLength(HISTORY_MAX);
    expect(past[0].label).toBe('s5');
  });
  it('does nothing when there is nothing to undo or redo', async () => {
    await undoSteps(3);
    await redoSteps(3);
    expect(log).toEqual([]);
  });
  it('does not repeat a step on a quick double click', async () => {
    step('a');
    await Promise.all([undoSteps(1), undoSteps(1)]);
    expect(log).toEqual(['undo a']);
  });
  it('undoes an older step from its pop-up without touching the newer ones', async () => {
    const a = step('a'); step('b');
    await undoEntry(a);
    expect(log).toEqual(['undo a']);
    expect(useHistory.getState().past.map((e) => e.label)).toEqual(['b']);
  });
  it('says how long ago', () => {
    const now = 10 * 3600000;
    expect(ago(now - 20000, now)).toBe('just now');
    expect(ago(now - 5 * 60000, now)).toBe('5 min');
    expect(ago(now - 2 * 3600000, now)).toBe('2 hr');
  });
});
