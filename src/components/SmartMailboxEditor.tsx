// Making and changing a Smart Mailbox: a name, "all" or "any", and rule rows like Apple Mail. Shows how many
// emails match as you go. Also the menu for a Smart Mailbox in the sidebar.
import { askUndoable } from './AiDrafts';
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { Icon } from './Icon';
import { Dialog, type MenuItem } from './ui';
import { useMail, providerFor, setView, toast, markViewRead } from '../lib/mail';
import { useSettings, settings } from '../lib/settings';
import { askText } from '../lib/dialogs';
import { myAddresses } from '../lib/compose';
import { matchSmart, newSmartMailbox, type SmartField, type SmartMailbox, type SmartRule } from '../lib/smartMailboxes';
import type { SystemFolder, View } from '../lib/types';

const useEditor = create<{ box: SmartMailbox | null; isNew: boolean }>(() => ({ box: null, isNew: false }));

/** Opens the editor: for a new Smart Mailbox (optionally starting from some search words), or to change one. */
export function openSmartEditor(box?: SmartMailbox, words = '', isNew = !box) {
  useEditor.setState(box ? { box: structuredClone(box), isNew } : { box: newSmartMailbox('', words), isNew: true });
}

const save = (boxes: SmartMailbox[]) => useSettings.getState().set({ smartMailboxes: boxes });
const boxes = () => settings().smartMailboxes || [];
const viewOf = (id: string): View => ({ scope: { type: 'all' }, mailbox: { kind: 'smart', id } });

/** Right-click and ⋯ choices for a Smart Mailbox in the sidebar. */
export function smartItems(b: SmartMailbox): MenuItem[] {
  return [
    { heading: b.name },
    { label: 'Edit...', icon: 'filter', onClick: () => openSmartEditor(b) },
    { label: 'Rename', icon: 'compose', onClick: async () => { const v = (await askText('Rename Smart Mailbox', b.name, 'Rename'))?.trim(); if (v) save(boxes().map((x) => (x.id === b.id ? { ...x, name: v } : x))); } },
    { label: 'Duplicate', icon: 'layers', onClick: () => { const copy = { ...structuredClone(b), id: `sm${Date.now().toString(36)}`, name: `${b.name} copy` }; save([...boxes(), copy]); openSmartEditor(copy); } },
    { label: 'Mark all as read', icon: 'mailOpen', onClick: () => void markViewRead(viewOf(b.id)) },
    b.hidden
      ? { label: 'Show in sidebar', icon: 'eye', onClick: () => save(boxes().map((x) => (x.id === b.id ? { ...x, hidden: false } : x))) }
      : { label: 'Hide', icon: 'imageOff', onClick: () => save(boxes().map((x) => (x.id === b.id ? { ...x, hidden: true } : x))) },
    { divider: true },
    {
      label: 'Delete', icon: 'trash', onClick: async () => {
        if (!(await askUndoable('deleteSmart', `Delete the Smart Mailbox ${b.name}?`, 'Only the saved rules go. No emails are moved or deleted.', 'Delete'))) return;
        save(boxes().filter((x) => x.id !== b.id));
        const v = useMail.getState().view;
        if (v.mailbox.kind === 'smart' && v.mailbox.id === b.id) setView({ scope: { type: 'all' }, mailbox: { kind: 'system', folder: 'inbox' } });
      },
    },
  ];
}

const FIELDS: { id: SmartField; label: string }[] = [
  { id: 'from', label: 'From' },
  { id: 'to', label: 'To or Cc' },
  { id: 'subject', label: 'Subject' },
  { id: 'words', label: 'Any text' },
  { id: 'account', label: 'Account' },
  { id: 'folder', label: 'Folder' },
  { id: 'status', label: 'Status' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'date', label: 'Date' },
];
const FOLDERS: { id: SystemFolder; label: string }[] = [
  { id: 'inbox', label: 'Inbox' }, { id: 'sent', label: 'Sent' }, { id: 'archive', label: 'Archive' }, { id: 'flagged', label: 'Flagged' }, { id: 'junk', label: 'Junk' }, { id: 'bin', label: 'Bin' },
];
const STATUSES = [
  { id: 'unread', label: 'Unread' }, { id: 'read', label: 'Read' }, { id: 'flagged', label: 'Flagged' }, { id: 'vip', label: 'From an important sender' }, { id: 'toMe', label: 'Sent to me directly' },
];
const DAYS = [
  { id: '1', label: 'the last day' }, { id: '7', label: 'the last week' }, { id: '30', label: 'the last 30 days' }, { id: '90', label: 'the last 3 months' }, { id: '365', label: 'the last year' },
];
const PLACEHOLDER: Partial<Record<SmartField, string>> = {
  from: 'sam@studio.co, @bloom.co', to: 'team@wellgood.media', subject: 'invoice OR receipt', words: 'quote, booking',
};

/** "contains" or "is" words for each kind of rule. */
function ops(field: SmartField): [string, string] {
  if (field === 'attachments') return ['has some', 'has none'];
  if (field === 'date') return ['is within', 'is older than'];
  if (field === 'account' || field === 'folder' || field === 'status') return ['is', "isn't"];
  return ['contains', "doesn't contain"];
}

/** A sensible starting value when the kind of rule changes. */
function startValue(field: SmartField, firstAccount: string): string {
  switch (field) {
    case 'account': return firstAccount;
    case 'folder': return 'inbox';
    case 'status': return 'unread';
    case 'date': return '30';
    default: return '';
  }
}

export function SmartMailboxEditor() {
  const { box, isNew } = useEditor();
  if (!box) return null;
  return <Editor key={box.id} initial={box} isNew={isNew} />;
}

function Editor({ initial, isNew }: { initial: SmartMailbox; isNew: boolean }) {
  const [box, setBox] = useState(initial);
  const [error, setError] = useState('');
  const accounts = useMail((s) => s.accounts);
  const messages = useMail((s) => s.messages);
  const vips = useSettings((s) => s.vips);
  const close = () => useEditor.setState({ box: null });

  const count = useMemo(() => {
    const ctx = { vips: new Set(vips), mine: myAddresses(accounts) };
    let n = 0;
    for (const m of Object.values(messages)) if (matchSmart(m, box, providerFor(m.accountId), ctx)) n++;
    return n;
  }, [box, messages, vips, accounts]);

  const setRule = (i: number, r: Partial<SmartRule>) => setBox({ ...box, rules: box.rules.map((x, j) => (j === i ? { ...x, ...r } : x)) });
  const addRule = (i: number) => setBox({ ...box, rules: [...box.rules.slice(0, i + 1), { field: 'from', value: '' }, ...box.rules.slice(i + 1)] });
  const removeRule = (i: number) => setBox({ ...box, rules: box.rules.length > 1 ? box.rules.filter((_, j) => j !== i) : [{ field: 'from', value: '' }] });

  const done = () => {
    const name = box.name.trim();
    if (!name) { setError('Give it a name'); return; }
    const clean = { ...box, name };
    const list = boxes();
    save(list.some((b) => b.id === clean.id) ? list.map((b) => (b.id === clean.id ? clean : b)) : [...list, clean]);
    close();
    setView(viewOf(clean.id));
    if (isNew) toast({ text: `${name} is in the sidebar under Smart Mailboxes`, ttl: 4000 });
  };

  return (
    <Dialog
      title={isNew ? 'New Smart Mailbox' : 'Edit Smart Mailbox'}
      onClose={close}
      actions={
        <>
          <span className="smart-count">{count === 1 ? '1 email matches' : `${count.toLocaleString('en-GB')} emails match`}</span>
          <span className="grow" />
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" onClick={done}>{isNew ? 'Create' : 'Save'}</button>
        </>
      }
    >
      <div className="smart-editor">
        <label className="smart-name">
          <span>Name</span>
          <input autoFocus value={box.name} placeholder="Unread from clients" onChange={(e) => { setBox({ ...box, name: e.target.value }); setError(''); }} aria-invalid={Boolean(error)} />
        </label>
        {error && <div className="smart-error">{error}</div>}
        <div className="smart-match">
          Show emails that match
          <select value={box.match} onChange={(e) => setBox({ ...box, match: e.target.value as 'all' | 'any' })} aria-label="All or any">
            <option value="all">all</option>
            <option value="any">any</option>
          </select>
          of these:
        </div>
        <div className="smart-rules">
          {box.rules.map((r, i) => {
            const [yes, no] = ops(r.field);
            return (
              <div className="smart-rule" key={i}>
                <select aria-label="What to check" value={r.field} onChange={(e) => { const f = e.target.value as SmartField; setRule(i, { field: f, value: startValue(f, accounts[0]?.id || ''), not: false }); }}>
                  {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <select aria-label="How" value={r.not ? 'no' : 'yes'} onChange={(e) => setRule(i, { not: e.target.value === 'no' })}>
                  <option value="yes">{yes}</option>
                  <option value="no">{no}</option>
                </select>
                {r.field === 'account' ? (
                  <select aria-label="Account" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.label || a.email}</option>)}
                  </select>
                ) : r.field === 'folder' ? (
                  <select aria-label="Folder" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })}>
                    {FOLDERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                ) : r.field === 'status' ? (
                  <select aria-label="Status" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })}>
                    {STATUSES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                ) : r.field === 'date' ? (
                  <select aria-label="Period" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })}>
                    {DAYS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                ) : r.field === 'attachments' ? (
                  <span className="smart-fill" />
                ) : (
                  <input aria-label="Words or addresses" value={r.value} placeholder={PLACEHOLDER[r.field]} onChange={(e) => setRule(i, { value: e.target.value })} />
                )}
                <button className="icon-btn" aria-label="Remove this rule" title="Remove this rule" onClick={() => removeRule(i)}><span aria-hidden="true">−</span></button>
                <button className="icon-btn" aria-label="Add a rule below" title="Add a rule below" onClick={() => addRule(i)}><Icon name="plus" size={14} /></button>
              </div>
            );
          })}
        </div>
        <p className="hint">Several words or addresses can go in one box, split by commas or OR. Nothing is moved: an email can show in several Smart Mailboxes.</p>
        <label className="smart-check">
          <input type="checkbox" checked={Boolean(box.includeBinJunk)} onChange={(e) => setBox({ ...box, includeBinJunk: e.target.checked })} /> Include emails in Bin and Junk
        </label>
      </div>
    </Dialog>
  );
}
