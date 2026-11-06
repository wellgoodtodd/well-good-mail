// Thin wrappers over Tauri so the same code also runs in a normal browser
// (demo mode and development).

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** fetch that bypasses browser CORS rules inside the desktop app. */
export async function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

/** Secure secret storage (Windows Credential Manager). Browser fallback is
 * sessionStorage so demo/dev never writes tokens to disk. */
export const secrets = {
  async get(key: string): Promise<string | null> {
    if (isTauri()) return invoke<string | null>('secret_get', { key });
    try { return sessionStorage.getItem('secret:' + key); } catch { return null; }
  },
  async set(key: string, value: string): Promise<void> {
    if (isTauri()) return invoke('secret_set', { key, value });
    try { sessionStorage.setItem('secret:' + key, value); } catch { /* ignore */ }
  },
  async remove(key: string): Promise<void> {
    if (isTauri()) return invoke('secret_delete', { key });
    try { sessionStorage.removeItem('secret:' + key); } catch { /* ignore */ }
  },
};

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

export async function notify(title: string, body: string): Promise<void> {
  try {
    if (isTauri()) {
      const n = await import('@tauri-apps/plugin-notification');
      let granted = await n.isPermissionGranted();
      if (!granted) granted = (await n.requestPermission()) === 'granted';
      if (granted) n.sendNotification({ title, body });
      return;
    }
    if ('Notification' in window) {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission === 'granted') new Notification(title, { body });
    }
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

/** Save bytes to a file the user picks. */
export async function saveFile(filename: string, data: Uint8Array, mimeType: string): Promise<void> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: filename });
    if (path) await writeFile(path, data);
    return;
  }
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Save several files into one folder, asking for the folder once. Returns how many were saved (0 if cancelled). */
export async function saveFilesToFolder(files: { filename: string; data: Uint8Array; mimeType: string }[]): Promise<number> {
  if (!isTauri()) {
    for (const f of files) await saveFile(f.filename, f.data, f.mimeType);
    return files.length;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { writeFile, exists } = await import('@tauri-apps/plugin-fs');
  const dir = await open({ directory: true, recursive: true, title: 'Choose a folder for these files' });
  if (!dir || typeof dir !== 'string') return 0;
  const sep = dir.includes('\\') ? '\\' : '/';
  let saved = 0;
  for (const f of files) {
    // Never overwrite something already in the folder: add (2), (3)... to the name instead.
    const dot = f.filename.lastIndexOf('.');
    const stem = dot > 0 ? f.filename.slice(0, dot) : f.filename;
    const ext = dot > 0 ? f.filename.slice(dot) : '';
    let name = f.filename;
    for (let n = 2; await exists(`${dir}${sep}${name}`); n++) name = `${stem} (${n})${ext}`;
    await writeFile(`${dir}${sep}${name}`, f.data);
    saved++;
  }
  return saved;
}

/** Open a separate window (pop out) on a route like "compose/abc". */
/** Returns false when the window couldn't open (the caller then shows it inline). */
const POPOUT_DEFAULT = { compose: { width: 980, height: 680 }, thread: { width: 980, height: 720 } };

/** The size this kind of window was last left at, or a wider than tall default. */
function popoutSize(kind: string, given?: { width: number; height: number }) {
  if (given) return given;
  try {
    const saved = JSON.parse(localStorage.getItem(`wgm.popout.${kind}`) || 'null');
    if (saved && saved.width >= 520 && saved.height >= 400) return saved as { width: number; height: number };
  } catch { /* no saved size */ }
  return POPOUT_DEFAULT[kind as keyof typeof POPOUT_DEFAULT] || POPOUT_DEFAULT.thread;
}

/** Called inside a pop out window: remembers its size for the next one of the same kind. */
export function rememberPopoutSize(kind: string) {
  let t: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      try { localStorage.setItem(`wgm.popout.${kind}`, JSON.stringify({ width: window.innerWidth, height: window.innerHeight })); } catch { /* storage unavailable */ }
    }, 400);
  });
  // Where it was left, in screen pixels, so the next one opens on the same monitor.
  if (isTauri()) {
    import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      let m: ReturnType<typeof setTimeout> | undefined;
      await getCurrentWindow().onMoved(({ payload }) => {
        clearTimeout(m);
        m = setTimeout(() => {
          try { localStorage.setItem(`wgm.popoutpos.${kind}`, JSON.stringify({ x: payload.x, y: payload.y })); } catch { /* storage unavailable */ }
        }, 400);
      });
    }).catch(() => {});
  }
}

/** The saved spot for this kind of window, if that part of the screen is still there (a monitor may be unplugged). */
async function popoutPosition(kind: string): Promise<{ x: number; y: number } | undefined> {
  try {
    const saved = JSON.parse(localStorage.getItem(`wgm.popoutpos.${kind}`) || 'null') as { x: number; y: number } | null;
    if (!saved) return undefined;
    const { availableMonitors } = await import('@tauri-apps/api/window');
    const monitors = await availableMonitors();
    const on = monitors.find((mo) => saved.x >= mo.position.x - 40 && saved.x < mo.position.x + mo.size.width - 120 && saved.y >= mo.position.y - 40 && saved.y < mo.position.y + mo.size.height - 120);
    if (!on) return undefined;
    // New windows are placed in logical pixels, saved positions are physical ones.
    return { x: Math.round(saved.x / on.scaleFactor), y: Math.round(saved.y / on.scaleFactor) };
  } catch {
    return undefined;
  }
}

export async function openPopout(route: string, title: string, given?: { width: number; height: number }): Promise<boolean> {
  const size = popoutSize(route.split('/')[0], given);
  const url = `index.html#/popout/${route}`;
  if (isTauri()) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const label = 'popout-' + Math.random().toString(36).slice(2, 10);
    const at = await popoutPosition(route.split('/')[0]);
    new WebviewWindow(label, { url, title, width: size.width, height: size.height, minWidth: 520, minHeight: 400, ...(at ? { x: at.x, y: at.y } : {}) });
    return true;
  }
  try {
    return Boolean(window.open(`${location.pathname}#/popout/${route}`, '_blank', `width=${size.width},height=${size.height}`));
  } catch {
    return false;
  }
}

/** Makes the taskbar icon flash until the window is brought to the front. */
export async function flashTaskbar(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow, UserAttentionType } = await import('@tauri-apps/api/window');
    await getCurrentWindow().requestUserAttention(UserAttentionType.Informational);
  } catch { /* not allowed or not supported */ }
}

export async function closeThisWindow(): Promise<void> {
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  } else {
    window.close();
  }
}

export async function onTauriEvent<T>(name: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(name, (e) => handler(e.payload));
}

export async function setUnreadCount(count: number): Promise<void> {
  if (isTauri()) await invoke('set_unread_count', { count }).catch(() => {});
}

export async function setCloseQuits(on: boolean): Promise<void> {
  if (isTauri()) await invoke('set_close_quits', { on }).catch(() => {});
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const a = await import('@tauri-apps/plugin-autostart');
  const on = await a.isEnabled();
  if (enabled && !on) await a.enable();
  if (!enabled && on) await a.disable();
}

export const isPopout = (): boolean => location.hash.startsWith('#/popout/');
