// The AI connection's activity log and live status: plain words, newest first, kept on this computer only.
import { create } from 'zustand';

export interface ActivityEntry {
  at: number;
  /** "Searched WGM for "invoice"", "Asked to read ... (refused)" */
  text: string;
  outcome: 'done' | 'refused' | 'failed';
}

interface ActivityState {
  entries: ActivityEntry[];
  /** How many AI apps are connected right now. */
  connected: number;
  /** The name an AI app gave itself when it connected, e.g. "claude-ai". */
  client?: string;
}

const KEY = 'wgm-mcp-activity';
const MAX = 200;

function load(): ActivityEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export const useActivity = create<ActivityState>(() => ({ entries: load(), connected: 0 }));

export function logActivity(text: string, outcome: ActivityEntry['outcome'] = 'done') {
  const entries = [{ at: Date.now(), text, outcome }, ...useActivity.getState().entries].slice(0, MAX);
  useActivity.setState({ entries });
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* storage full or blocked: the log is a courtesy */ }
}

export function clearActivity() {
  useActivity.setState({ entries: [] });
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
