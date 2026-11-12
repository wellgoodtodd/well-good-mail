// Settings › Groups.
import { Icon } from '../Icon';
import { useMail } from '../../lib/mail';
import { useSettings, type Settings as S } from '../../lib/settings';
import { Check } from '../ui';

export function GroupsTab() {
  const accounts = useMail((s) => s.accounts);
  const groups = useSettings((s) => s.groups);
  const set = useSettings((s) => s.set);
  const update = (id: string, patch: Partial<S['groups'][number]>) => set({ groups: groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  return (
    <>
      <h1>Inbox Groups</h1>
      <section className="set-section">
        <h2>Your groups</h2>
        <p className="hint">Make your own combined mailboxes, like "Work" for your studio and a side project. Each group gets its own Inbox, Sent and so on in the sidebar.</p>
        {groups.map((g) => (
          <div key={g.id} className="acct-row" style={{ alignItems: 'flex-start' }}>
            <input className="label-input" value={g.name} aria-label="Group name" onChange={(e) => update(g.id, { name: e.target.value })} />
            <div className="grow">
              {accounts.map((a) => (
                <Check key={a.id} checked={g.accountIds.includes(a.id)} onChange={(on) => update(g.id, { accountIds: on ? [...g.accountIds, a.id] : g.accountIds.filter((x) => x !== a.id) })}>
                  <span className="dot" style={{ background: a.colour, display: 'inline-block', marginRight: 6 }} />{a.label}
                </Check>
              ))}
            </div>
            <button className="btn ghost danger" onClick={() => set({ groups: groups.filter((x) => x.id !== g.id) })}>Delete</button>
          </div>
        ))}
        <button className="btn" style={{ marginTop: 10 }} onClick={() => set({ groups: [...groups, { id: `grp-${Date.now()}`, name: 'New group', accountIds: [] }] })}><Icon name="plus" /> New group</button>
      </section>
    </>
  );
}

// ---------- appearance ----------
