// Regular jobs: polling for mail, the minute tick (outbox, snoozes, Out of Office), loading the Inbox ahead.
import { settings, isQuietNow } from '../settings';
import { notify } from '../platform';
import { unsnooze } from './actions';
import { warmInbox } from './bodies';
import { flushOutbox } from './outbox';
import { useMail } from './store';
import { refreshAll } from './sync';

const get = useMail.getState;

let pollTimer: ReturnType<typeof setInterval> | undefined;
let minuteTimer: ReturnType<typeof setInterval> | undefined;

export function restartPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => refreshAll(), Math.max(15, settings().pollSeconds) * 1000);
}

/** The minute tick, every 30 seconds from start up. */
export function startMinuteTick() {
  minuteTimer = setInterval(minuteTick, 30000);
}

export function stopTimers() {
  if (pollTimer) clearInterval(pollTimer);
  if (minuteTimer) clearInterval(minuteTimer);
}

export function minuteTick() {
  flushOutbox();
  void import('../oooStore').then((m) => m.oooTick()).catch(() => { /* not ready yet */ });
  void import('../tasks').then((m) => m.taskTick()).catch(() => { /* not ready yet */ });
  const now = Date.now();
  const due = get().snoozes.filter((s) => s.until <= now);
  if (due.length) {
    unsnooze(due.map((s) => s.messageId));
    if (!isQuietNow(settings())) notify('Snoozed email is back', due.map((d) => d.subject).join(', '));
  }
  window.dispatchEvent(new Event('wgm-minute'));
}

// After starting: once the accounts have had a moment to sync, load the top of each Inbox.
let warmedAtStart = false;
export function warmAfterStart() {
  if (warmedAtStart) return;
  warmedAtStart = true;
  setTimeout(() => warmInbox(), 8000);
}
