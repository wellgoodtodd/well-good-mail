// The Calendar in its own window, for a second screen. It reads the same saved data as the main window, and the two
// keep each other's events and tasks in step over a BroadcastChannel. Anything that belongs to the mail (an email,
// Settings) opens from the main window, or in a pop out of its own.
import { useMail } from './mail/store';
import { useCalCache } from './calendarCache';
import { useTasks } from './tasks';
import { isTauri, openPopout } from './platform';
import type { MailState } from './mail/store';

const LABEL = 'popout-calendar';
const me = Math.random().toString(36).slice(2, 10);

/** Opens the Calendar window, or brings it to the front if it is open already. */
export async function openCalendarWindow(): Promise<boolean> {
  if (isTauri()) {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const open = await WebviewWindow.getByLabel(LABEL);
      if (open) {
        await open.unminimize();
        await open.show();
        await open.setFocus();
        return true;
      }
    } catch { /* opens a new one */ }
  }
  return openPopout('calendar', 'Calendar', undefined, LABEL);
}

let channel: BroadcastChannel | null = null;
let applying = false;
const peers = new Set<string>();
let isCalendarWindow = false;

function snapshot() {
  const m = useMail.getState();
  const c = useCalCache.getState();
  const t = useTasks.getState();
  return {
    type: 'state', from: me,
    near: m.events, calendarNames: m.calendarNames, calendarErrors: m.calendarErrors,
    copy: { events: c.events, from: c.from, to: c.to, at: c.at },
    tasks: t.loaded ? { lists: t.lists, tasks: t.tasks } : undefined,
  };
}

let timer: ReturnType<typeof setTimeout> | undefined;
function sendSoon() {
  // The main window only sends while a Calendar window is listening.
  if (applying || (!isCalendarWindow && !peers.size)) return;
  clearTimeout(timer);
  timer = setTimeout(() => { try { channel?.postMessage(snapshot()); } catch { /* window closing */ } }, 150);
}

type StateMsg = ReturnType<typeof snapshot>;
function apply(d: StateMsg) {
  applying = true;
  try {
    useMail.setState({ events: d.near, calendarNames: d.calendarNames, calendarErrors: d.calendarErrors });
    if (d.copy.events.length || !useCalCache.getState().events.length) useCalCache.setState(d.copy);
    if (d.tasks) useTasks.setState({ ...d.tasks, loaded: true });
  } finally {
    applying = false;
  }
}

/** Both windows: keeps the calendar, the longer calendar copy and the tasks the same in each. */
export function startCalendarSync(opts: { calendarWindow?: boolean } = {}) {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  isCalendarWindow = Boolean(opts.calendarWindow);
  channel = new BroadcastChannel('wgm-calendar');
  channel.onmessage = (e) => {
    const d = e.data;
    if (!d || d.from === me) return;
    if (d.type === 'hello') { peers.add(d.from); sendSoon(); return; }
    if (d.type === 'bye') { peers.delete(d.from); return; }
    if (d.type === 'state') apply(d as StateMsg);
  };
  useMail.subscribe((s, p) => { if (s.events !== p.events || s.calendarNames !== p.calendarNames) sendSoon(); });
  useCalCache.subscribe((s, p) => { if (s.events !== p.events) sendSoon(); });
  useTasks.subscribe((s, p) => { if (s.tasks !== p.tasks || s.lists !== p.lists) sendSoon(); });
  if (isCalendarWindow) {
    channel.postMessage({ type: 'hello', from: me });
    window.addEventListener('beforeunload', () => { try { channel?.postMessage({ type: 'bye', from: me }); } catch { /* closing */ } });
  }
}

/** Asks the main window to show one of its screens (Settings, Help) and come to the front. */
function toMain(screen: MailState['screen'], settingsTab?: string) {
  try {
    const bc = new BroadcastChannel('wgm');
    bc.postMessage({ type: 'open-screen', screen, settingsTab });
    bc.close();
  } catch { /* no main window to ask */ }
}

/**
 * Inside the Calendar window: it only ever shows the calendar. Opening an email opens it in a pop out, writing one
 * opens the writing window, and Settings or Help open in the main window.
 */
export function keepToCalendar() {
  useMail.setState({ screen: 'reminders' });
  useMail.subscribe((s, p) => {
    if (s.screen !== 'reminders' && s.screen !== p.screen) {
      const { screen, settingsTab } = s;
      useMail.setState({ screen: 'reminders' });
      if (screen !== 'mail') toMain(screen, settingsTab);
    }
    if (s.selectedKey && s.selectedKey !== p.selectedKey) {
      const key = s.selectedKey;
      useMail.setState({ selectedKey: undefined, selectedKeys: [] });
      void openPopout(`thread/${encodeURIComponent(key)}`, 'Email');
    }
    if (s.inlineDraftId && s.inlineDraftId !== p.inlineDraftId) {
      const id = s.inlineDraftId;
      useMail.setState({ inlineDraftId: undefined });
      void openPopout(`compose/${id}`, 'Email');
    }
  });
  // The now line and the list keep moving, without running the main window's jobs (alerts, sync) a second time.
  setInterval(() => window.dispatchEvent(new Event('wgm-minute')), 60000);
}
