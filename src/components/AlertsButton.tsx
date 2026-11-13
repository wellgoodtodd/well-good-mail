// The Alerts button beside List / Calendar / Tasks: a summary of how alerts reach you, Pause for 1 hour, and a way
// into Settings › Alerts & Notifications. It's settings only, so it never shows a dot or a count.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { openAlertSettings } from '../lib/settingsNav';
import { useSettings, type Settings } from '../lib/settings';

/** One line per kind of alert, in plain words. */
export function alertLines(s: Settings, now = Date.now()): string[] {
  const lines: string[] = [];
  if (s.alertsPausedUntil > now) lines.push(`Paused until ${new Date(s.alertsPausedUntil).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
  lines.push(s.reminderMode === 'never' ? 'No pop-ups for events' : s.reminderMode === 'daily' ? `A daily summary at ${s.summaryTime}` : s.reminderMode === 'important' ? 'Pop-ups for important events only' : 'Pop-ups for every event');
  if (s.reminderMode === 'important') lines.push(`Daily summary at ${s.summaryTime}`);
  const times = [s.meetingAlert1On && s.meetingAlert1Mins, s.meetingAlert2On && s.meetingAlert2Mins].filter(Boolean).sort((x, y) => Number(y) - Number(x));
  lines.push(times.length ? `Video calls: ${times.join(' and ')} minutes before` : 'No alerts before video calls');
  lines.push(s.reminderMode === 'never' ? 'Tasks with a time: no alert' : 'Tasks with a time: at that time');
  if (s.quietHours.enabled) lines.push(`Quiet hours ${s.quietHours.from} to ${s.quietHours.to}`);
  if (s.flashTaskbar) lines.push('The taskbar icon flashes');
  return lines;
}

export function AlertsButton() {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  const paused = s.alertsPausedUntil > Date.now();
  return (
    <div className="cal-picker alerts-pick" ref={box}>
      <button className="btn ghost alerts-btn" aria-expanded={open} title="How alerts reach you" onClick={() => setOpen(!open)}><Icon name="bell" size={14} /> Alerts</button>
      {open && (
        <div className="cal-pop alerts-pop" role="dialog" aria-label="Alerts">
          <strong>Alerts</strong>
          <ul className="alerts-lines">{alertLines(s).map((l) => <li key={l}>{l}</li>)}</ul>
          <div className="alerts-acts">
            {paused
              ? <button className="btn small" onClick={() => s.set({ alertsPausedUntil: 0 })}>Resume alerts</button>
              : <button className="btn small" onClick={() => { s.set({ alertsPausedUntil: Date.now() + 3600000 }); setOpen(false); }}>Pause for 1 hour</button>}
            <span className="grow" />
            <button className="btn small" onClick={() => { setOpen(false); openAlertSettings({ calendar: true }); }}>Change alerts</button>
          </div>
        </div>
      )}
    </div>
  );
}
