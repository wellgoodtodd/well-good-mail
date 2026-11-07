// The list of things you've done that can be undone, and redone. Archive, delete, move, snooze, star and read marks
// add to it. It lives only while the app is open. Each entry brings its own way of reversing and repeating itself,
// so this file knows nothing about mail.
import { create } from 'zustand';

export interface HistoryEntry {
  id: string;
  label: string;
  at: number;
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
}

/** How many steps are kept. */
export const HISTORY_MAX = 20;

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const useHistory = create<HistoryState>(() => ({ past: [], future: [] }));

/** Adds a step you've just taken. Anything you had undone is dropped, as in any app. Returns the step's id. */
export function record(label: string, undo: HistoryEntry['undo'], redo: HistoryEntry['redo']): string {
  const entry: HistoryEntry = { id: Math.random().toString(36).slice(2), label, at: Date.now(), undo, redo };
  useHistory.setState((s) => ({ past: [...s.past, entry].slice(-HISTORY_MAX), future: [] }));
  return entry.id;
}

/** Undoes the latest step, or several. The history is updated first so a quick double click can't repeat a step. */
export async function undoSteps(count = 1): Promise<void> {
  for (let i = 0; i < count; i++) {
    const past = useHistory.getState().past;
    const entry = past[past.length - 1];
    if (!entry) return;
    useHistory.setState((s) => ({ past: s.past.slice(0, -1), future: [...s.future, entry] }));
    await entry.undo();
  }
}

export async function redoSteps(count = 1): Promise<void> {
  for (let i = 0; i < count; i++) {
    const future = useHistory.getState().future;
    const entry = future[future.length - 1];
    if (!entry) return;
    useHistory.setState((s) => ({ future: s.future.slice(0, -1), past: [...s.past, entry] }));
    await entry.redo();
  }
}

/** For the "Undo" button on a pop-up message: undoes that step, whether or not it is still the latest. */
export async function undoEntry(id: string): Promise<void> {
  const { past } = useHistory.getState();
  const i = past.findIndex((e) => e.id === id);
  if (i < 0) return;
  if (i === past.length - 1) return undoSteps(1);
  const entry = past[i];
  useHistory.setState((s) => ({ past: s.past.filter((e) => e.id !== id) }));
  await entry.undo();
}

/** "5 min", "just now": how long ago a step was taken. */
export function ago(at: number, now = Date.now()): string {
  const mins = Math.floor((now - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr`;
}

export function clearHistory() {
  useHistory.setState({ past: [], future: [] });
}
