// Settings › Contact Groups: the groups kept in Google Contacts (labels), to rename, delete, and add or take out people.
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { RecipientField } from '../RecipientField';
import { addToGroup, deleteContactGroup, groupAccounts, newContactGroup, refreshContactGroups, removeFromGroup, renameContactGroup, useMail } from '../../lib/mail';
import type { ContactGroup } from '../../lib/types';

function GroupName({ g }: { g: ContactGroup }) {
  const [name, setName] = useState(g.name);
  useEffect(() => setName(g.name), [g.name]);
  const commit = () => { if (name.trim() && name.trim() !== g.name) void renameContactGroup(g.id, name); else setName(g.name); };
  return (
    <input className="label-input" value={name} aria-label="Group name" onChange={(e) => setName(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setName(g.name); (e.target as HTMLInputElement).blur(); } }} />
  );
}

export function ContactGroupsTab() {
  const groups = useMail((s) => s.contactGroups);
  const contacts = useMail((s) => s.contacts);
  const accounts = useMail((s) => s.accounts);
  const able = groupAccounts();
  const [where, setWhere] = useState(able[0]?.id || '');
  useEffect(() => { void refreshContactGroups(); }, []);
  const accName = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? a.label || a.email : ''; };
  return (
    <>
      <h1>Contact Groups</h1>
      <section className="set-section">
        <h2>Your groups</h2>
        <p className="hint">
          Type a group's name in To, Cc or Bcc and everyone in it is added, each as their own name, so you can still take someone out or move them to Cc.
          Groups are kept in Google Contacts as labels, so they work in Gmail and on your phone too.
        </p>
        {!able.length && <p className="hint">Contact groups are kept in Google Contacts, so they need a Google account.</p>}
        {groups.map((g) => (
          <div key={g.id} className="contact-group">
            <div className="cg-head">
              <Icon name="user" size={14} />
              <GroupName g={g} />
              {able.length > 1 && <span className="hint">{accName(g.accountId)}</span>}
              <span className="grow" />
              <span className="hint">{g.members.length === 1 ? '1 person' : `${g.members.length} people`}</span>
              <button className="btn ghost danger" onClick={() => void deleteContactGroup(g.id)}>Delete</button>
            </div>
            <RecipientField label="People" placeholder="Add someone by name or address" value={g.members} contacts={contacts}
              onAdd={(list) => void addToGroup(g.id, list)} onRemove={(email) => void removeFromGroup(g.id, [email])} />
          </div>
        ))}
        {able.length > 0 && (
          <div className="cg-head" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => void newContactGroup([], { accountId: where })}><Icon name="plus" /> New group</button>
            {able.length > 1 && (
              <label className="hint">in{' '}
                <select value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Account for new groups">
                  {able.map((a) => <option key={a.id} value={a.id}>{a.label || a.email}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        <p className="hint">You can also right-click anyone's name in an email for Contact groups, or right-click an email for New group from everyone on this email.</p>
      </section>
    </>
  );
}
