// Settings › Calendar & Reminders › Tasks: where new tasks go for each Calendar Group, and where AI apps put theirs.
import { useEffect } from 'react';
import { useSettings } from '../../lib/settings';
import { useMail } from '../../lib/mail';
import { useTasks, startTasks, defaultList } from '../../lib/tasks';
import { Row } from '../ui';

export function TaskDefaults() {
  useEffect(() => { startTasks(); }, []);
  const s = useSettings();
  const lists = useTasks((x) => x.lists);
  const accounts = useMail((x) => x.accounts);
  if (!lists.length) return <p className="hint" style={{ marginTop: 0 }}>No task lists yet. Google and Microsoft accounts sign in once more to show their tasks (Calendar &amp; Reminders › Tasks).</p>;
  const options = accounts.map((a) => ({ a, ls: lists.filter((l) => l.accountId === a.id) })).filter((x) => x.ls.length);
  const listSelect = (id: string, value: string, onChange: (v: string) => void, extra?: React.ReactNode) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {extra}
      {options.map(({ a, ls }) => <optgroup key={a.id} label={a.label || a.email}>{ls.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}
    </select>
  );
  const groups = [{ id: '', name: 'All calendars' }, ...s.calendarGroups];
  const setDefault = (group: string, listId: string) => s.set({ taskDefaults: { ...s.taskDefaults, [group]: listId } });
  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>Tasks follow Calendar Groups: picking a group shows the task lists of its accounts. Quick add uses the default list of the group you're looking at, and a task made from an email goes into the default list of that email's group.</p>
      {groups.map((g) => (
        <Row key={g.id || 'all'} label={g.name} htmlFor={`taskdef-${g.id || 'all'}`}>
          {listSelect(`taskdef-${g.id || 'all'}`, defaultList(g.id)?.id || '', (v) => setDefault(g.id, v))}
        </Row>
      ))}
      <Row label="Tasks from AI apps go into" htmlFor="ai-task-target">
        {listSelect('ai-task-target', s.aiTaskTarget, (v) => s.set({ aiTaskTarget: v }), <>
          <option value="ask">Ask each time</option>
          {groups.map((g) => <option key={`g${g.id}`} value={`group:${g.id}`}>{g.name}'s default ({defaultList(g.id)?.name || 'none'})</option>)}
        </>)}
      </Row>
      <p className="hint" style={{ margin: '4px 0 0' }}>An AI app adding a task asks first, like its other changes, and the approval card says which list it goes into.</p>
    </>
  );
}
