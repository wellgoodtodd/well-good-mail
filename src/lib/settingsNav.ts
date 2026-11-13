// Opening Settings at a particular place, for buttons elsewhere in the app (the calendar's Alerts card,
// the Tasks list menu). Kept apart from Settings.tsx so callers don't pull in every Settings tab.
import { openScreen } from './mail';

/** Scrolls a Settings section into view once its tab has drawn (it may take a frame or two). */
function scrollToSection(id: string, tries = 20) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  if (tries > 0 && typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => scrollToSection(id, tries - 1));
}

/** Settings › Alerts & Notifications, at its Calendar and tasks section when `calendar` is set. */
export function openAlertSettings(opts: { calendar?: boolean } = {}) {
  openScreen('settings', 'notifications');
  if (opts.calendar) scrollToSection('settings-calendar-alerts');
}

/** Settings › Calendar & Reminders, scrolled to Tasks (the default list for each group, and where AI apps' tasks go). */
export function openTaskDefaults() {
  openScreen('settings', 'calendar');
  scrollToSection('settings-tasks');
}
