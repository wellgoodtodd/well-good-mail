// Files saved from the app: a short list for the Downloads button in the toolbar, and the note after each save
// with Open and Show in folder. Kept on this computer only, for 7 days or 20 files.
import { create } from 'zustand';
import { invoke, isTauri } from './platform';
import { toast } from './mail';

export interface SavedFile { path: string; name: string; at: number }

const KEY = 'wgm-recent-saves';
const KEEP_MS = 7 * 86400000;

function load(): SavedFile[] {
  try { return (JSON.parse(localStorage.getItem(KEY) || '[]') as SavedFile[]).filter((f) => Date.now() - f.at < KEEP_MS); } catch { return []; }
}

export const useSaves = create<{ list: SavedFile[]; unseen: boolean }>(() => ({ list: load(), unseen: false }));

function store(list: SavedFile[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* fine */ }
}

const nameOf = (path: string) => path.split(/[\\/]/).pop() || path;
const folderOf = (path: string) => { const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')); return i > 0 ? path.slice(0, i) : path; };

export async function openSaved(path: string) {
  try { await invoke('open_saved', { path }); } catch (e) { toast({ text: `Couldn't open it: ${e instanceof Error ? e.message : e}`, ttl: 9000 }); }
}
export async function showSaved(path: string) {
  try { await invoke('reveal_saved', { path }); } catch (e) { toast({ text: `Couldn't show it: ${e instanceof Error ? e.message : e}`, ttl: 9000 }); }
}

/** Notes saved files, and says where they went with Open (for one) and Show in folder. */
export function noteSaved(paths: string[]) {
  if (!paths.length || !isTauri()) return;
  const now = Date.now();
  const list = [...paths.map((p) => ({ path: p, name: nameOf(p), at: now })), ...useSaves.getState().list.filter((f) => !paths.includes(f.path))].slice(0, 20);
  useSaves.setState({ list, unseen: true });
  store(list);
  const one = paths.length === 1;
  toast({
    text: one ? `Saved ${nameOf(paths[0])} to ${folderOf(paths[0])}` : `Saved ${paths.length} files to ${folderOf(paths[0])}`,
    actions: [
      ...(one ? [{ label: 'Open', run: () => void openSaved(paths[0]) }] : []),
      { label: 'Show in folder', run: () => void showSaved(paths[0]) },
    ],
    ttl: 9000,
  });
}

export function clearSaves() {
  useSaves.setState({ list: [], unseen: false });
  store([]);
}
export const markSavesSeen = () => useSaves.setState({ unseen: false });
