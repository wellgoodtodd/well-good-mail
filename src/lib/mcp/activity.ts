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
  /** The name an AI app gave itself when it last said hello, e.g. "claude-ai". */
  client?: string;
  /** When an AI app last said hello, and last asked for something. These tick the setup checklist. */
  lastHello?: number;
  lastCall?: number;
}

const KEY = 'wgm-mcp-activity';
const STATUS = 'wgm-mcp-status';
const MAX = 200;

function load(): ActivityEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function loadStatus(): Pick<ActivityState, 'client' | 'lastHello' | 'lastCall'> {
  try { return JSON.parse(localStorage.getItem(STATUS) || '{}'); } catch { return {}; }
}

export const useActivity = create<ActivityState>(() => ({ entries: load(), connected: 0, ...loadStatus() }));

export function logActivity(text: string, outcome: ActivityEntry['outcome'] = 'done') {
  const entries = [{ at: Date.now(), text, outcome }, ...useActivity.getState().entries].slice(0, MAX);
  useActivity.setState({ entries });
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* storage full or blocked: the log is a courtesy */ }
}

/** Remembers that an AI app said hello or asked for something, so the checklist stays ticked after a restart. */
export function noteStatus(patch: Pick<ActivityState, 'client' | 'lastHello' | 'lastCall'>) {
  useActivity.setState(patch);
  const s = useActivity.getState();
  try { localStorage.setItem(STATUS, JSON.stringify({ client: s.client, lastHello: s.lastHello, lastCall: s.lastCall })); } catch { /* fine */ }
}

export function clearActivity() {
  useActivity.setState({ entries: [] });
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
