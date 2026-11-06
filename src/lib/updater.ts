// Automatic updates from GitHub releases.
import { create } from 'zustand';
import { isTauri } from './platform';
import { settings } from './settings';

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error';
  version?: string;
  notes?: string;
  error?: string;
  currentVersion?: string;
}

export const useUpdates = create<UpdateState>(() => ({ status: 'idle' }));

/** True while a newer version is found, downloading or waiting for a restart. */
export const useUpdatePending = () => useUpdates((s) => s.status === 'available' || s.status === 'downloading' || s.status === 'ready');

/** An update that has been downloaded and is waiting for the person to restart. */
let waiting: { install: () => Promise<void> } | undefined;
/** The newest version found, for "Download and restart" when nothing has been downloaded yet. */
let found: { downloadAndInstall: () => Promise<void> } | undefined;

// A new version installs by itself when the app has only just been opened. While the app is
// already open and in use, it downloads quietly and waits for "Restart to update".
export async function checkForUpdates(opts: { userInitiated?: boolean; atStart?: boolean } = {}) {
  if (waiting) {
    if (opts.userInitiated) useUpdates.setState({ status: 'ready' });
    return;
  }
  if (useUpdates.getState().status === 'downloading') return;
  if (!isTauri()) {
    useUpdates.setState({ status: 'none', currentVersion: 'browser preview' });
    return;
  }
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    // Background looks stay quiet, so the dot doesn't blink off while one is running.
    const current = useUpdates.getState().status;
    const quiet = !opts.userInitiated && (current === 'available' || current === 'ready' || current === 'downloading');
    useUpdates.setState(quiet ? { currentVersion: await getVersion() } : { status: 'checking', currentVersion: await getVersion() });
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) {
      useUpdates.setState({ status: 'none' });
      return;
    }
    found = update;
    useUpdates.setState({ status: 'available', version: update.version, notes: update.body });
    if (opts.atStart && settings().autoUpdate) {
      useUpdates.setState({ status: 'downloading' });
      await update.downloadAndInstall();
      useUpdates.setState({ status: 'ready' });
    } else if (!opts.userInitiated && settings().autoUpdate) {
      // Download quietly, install only when you choose Restart to update.
      // (Check now only looks: you then choose whether to download and restart.)
      useUpdates.setState({ status: 'downloading' });
      await update.download();
      waiting = update;
      useUpdates.setState({ status: 'ready' });
    }
  } catch (e) {
    useUpdates.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** For "Download and restart": fetches the version that Check now found, installs it and relaunches. */
export async function installFoundUpdate() {
  if (waiting) return restartToUpdate();
  if (!found) return;
  try {
    useUpdates.setState({ status: 'downloading' });
    await found.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    useUpdates.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

export async function restartToUpdate() {
  if (waiting) await waiting.install();
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

export function startUpdateChecks() {
  setTimeout(() => checkForUpdates({ atStart: true }), 8000);
  // A tiny look at the update file every 30 minutes, and when you come back to the window after a while away.
  let last = Date.now();
  const look = () => { last = Date.now(); checkForUpdates(); };
  setInterval(look, 30 * 60 * 1000);
  window.addEventListener('focus', () => { if (Date.now() - last > 10 * 60 * 1000) look(); });
}
