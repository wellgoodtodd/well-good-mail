// Calendar Groups: Work, Personal and so on, each a set of calendars from any account. Picking one only changes what
// the calendar, the List view and Coming up show; the calendars and events themselves never change.
import { useState } from 'react';
import { Dialog, SwitchLine } from './ui';
import { useSettings } from '../lib/settings';
import { toast } from '../lib/mail';
import type { CalendarGroup } from '../lib/meetings';
import { useCalendarsByAccount } from './ComingUp';

const newId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Picks a group to look at ('' for All calendars). */
export const pickGroup = (id: string) => useSettings.getState().set({ calendarGroup: id });

/** The list of groups, with New group, and the editor for one. Opened from the Calendars menu and Settings. */
export function CalendarGroupsDialog({ start, onClose }: { start?: CalendarGroup | 'new'; onClose: () => void }) {
  const groups = useSettings((s) => s.calendarGroups);
  const [editing, setEditing] = useState<CalendarGroup | 'new' | undefined>(start);
  if (editing) return <GroupEditor group={editing === 'new' ? undefined : editing} onClose={() => (start ? onClose() : setEditing(undefined))} />;
  return (
    <Dialog title="Calendar Groups" onClose={onClose} actions={<><button className="btn" onClick={() => setEditing('new')}>New group</button><button className="btn primary" onClick={onClose}>Done</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>Groups gather calendars from any account, so you can look at just Work or just Personal. They only change what you see.</p>
      {!groups.length && <p className="hint">No groups yet.</p>}
      <div className="cg-list">
        {groups.map((g) => (
          <div key={g.id} className="cg-row">
            <span className="grow"><b>{g.name}</b><small>{g.calendars.length} {g.calendars.length === 1 ? 'calendar' : 'calendars'}</small></span>
            <button className="btn small" onClick={() => setEditing(g)}>Edit</button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/** One group: its name and a tick for each calendar, under each account. A calendar can be in more than one group. */
function GroupEditor({ group, onClose }: { group?: CalendarGroup; onClose: () => void }) {
  const { groups: byAccount } = useCalendarsByAccount();
  const all = useSettings((s) => s.calendarGroups);
  const [name, setName] = useState(group?.name || '');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(group?.calendars || []));
  const clash = all.some((g) => g.id !== group?.id && g.name.trim().toLowerCase() === name.trim().toLowerCase());
  const bad = !name.trim() ? 'Give the group a name.' : clash ? 'There is already a group with that name.' : !picked.size ? 'Tick at least one calendar.' : '';
  const flip = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const save = () => {
    if (bad) return;
    const g: CalendarGroup = { id: group?.id || newId(), name: name.trim(), calendars: [...picked] };
    useSettings.getState().set({ calendarGroups: group ? all.map((x) => (x.id === g.id ? g : x)) : [...all, g] });
    toast({ text: group ? `"${g.name}" saved.` : `"${g.name}" made. Pick it from Calendars.`, ttl: 3000 });
    onClose();
  };
  const remove = () => {
    if (!group) return;
    const s = useSettings.getState();
    s.set({ calendarGroups: all.filter((x) => x.id !== group.id), ...(s.calendarGroup === group.id ? { calendarGroup: '' } : {}) });
    toast({ text: `"${group.name}" deleted. Your calendars haven't changed.`, ttl: 4000 });
    onClose();
  };
  return (
    <Dialog title={group ? 'Edit group' : 'New group'} onClose={onClose} actions={<>
      {group && <button className="btn danger cg-delete" onClick={remove}>Delete group</button>}
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={Boolean(bad)} onClick={save}>Save</button>
    </>}>
      <input className="cg-name" aria-label="Group name" placeholder="Work, Personal..." value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      <div className="cg-cals">
        {byAccount.map(({ account, calendars }) => (
          <div key={account.id} className="cg-acc">
            <div className="cg-acc-head"><span className="dot" style={{ background: account.colour }} />{account.label || account.email}{account.label ? <small> · {account.email}</small> : null}</div>
            {calendars.map((c) => {
              const k = `${account.id}|${c}`;
              return <label key={k} className="check cg-cal"><input type="checkbox" checked={picked.has(k)} onChange={() => flip(k)} /><span className="dot" style={{ background: account.colour }} /><span>{c}</span></label>;
            })}
          </div>
        ))}
        {!byAccount.length && <p className="hint">Calendars appear here once your accounts have loaded them.</p>}
      </div>
      {bad && name.trim() && <p className="hint ev-note bad">{bad}</p>}
    </Dialog>
  );
}

/** Settings › Calendar & Reminders: the groups, and whether alerts follow the group you're looking at. */
export function CalendarGroupsCard() {
  const groups = useSettings((s) => s.calendarGroups);
  const current = useSettings((s) => s.calendarGroup);
  const alertsOnly = useSettings((s) => s.groupAlertsOnly);
  const [open, setOpen] = useState<CalendarGroup | 'new' | null>(null);
  return (
    <>
      <div className="cg-list">
        {groups.map((g) => (
          <div key={g.id} className="cg-row">
            <span className="grow"><b>{g.name}</b><small>{g.calendars.length} {g.calendars.length === 1 ? 'calendar' : 'calendars'}{current === g.id ? ' · showing now' : ''}</small></span>
            <button className="btn small" onClick={() => setOpen(g)}>Edit</button>
          </div>
        ))}
        {!groups.length && <p className="hint" style={{ margin: '0 0 8px' }}>No groups yet. A group such as Work or Personal gathers calendars from any account, and is picked from Calendars.</p>}
      </div>
      <button className="btn" onClick={() => setOpen('new')}>New group</button>
      <SwitchLine checked={alertsOnly} onChange={(v) => useSettings.getState().set({ groupAlertsOnly: v })}>
        Only alert me from the group I'm looking at<br /><span className="sub">Off: alerts come from every shown calendar, whichever group is picked.</span>
      </SwitchLine>
      {open && <CalendarGroupsDialog start={open} onClose={() => setOpen(null)} />}
    </>
  );
}
