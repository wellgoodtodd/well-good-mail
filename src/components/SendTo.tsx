// Send To: the Send to › menu, the place and rule editors, Find my invoices, and Settings › Send To.
import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Dialog, Check, Radio, fullDate, useMenu, type MenuItem } from './ui';
import { RecipientField } from './RecipientField';
import { useMail } from '../lib/mail';
import { myAddresses } from '../lib/compose';
import { isTauri } from '../lib/platform';
import { askConfirm, askText } from '../lib/dialogs';
import { useSettings, settings, type SendPlace, type SendRule } from '../lib/settings';
import {
  addRule, closeSendToDialog, findInvoiceSenders, forwardName, openFindInvoices, openPlaceEditor, placeSummary, sendLog, sendToPlace,
  subfolderFor, useSendToDialog, type InvoiceSender, type SendLogEntry,
} from '../lib/sendTo';
import type { Message } from '../lib/types';

const placeIcon = (p: SendPlace) => (p.forwardTo && (p.folder || p.askFolder) ? 'layers' : p.forwardTo ? 'mail' : 'folder');

/** The Send to › flyout for a menu: each place, then New place.... */
export function sendToItems(messages: () => Message[], attachmentId?: string): MenuItem {
  const places = settings().sendPlaces;
  const go = (p: SendPlace) => void sendToPlace(p, messages(), { attachmentId });
  return {
    label: 'Send to',
    icon: 'send',
    submenu: [
      ...places.map((p) => ({ label: `${p.name} · ${placeSummary(p)}`, icon: placeIcon(p) as MenuItem['icon'], onClick: () => go(p) })),
      ...(places.length ? [{ divider: true }] : []),
      { label: 'New place...', icon: 'plus', onClick: () => openPlaceEditor(undefined, (p) => go(p)) },
    ],
  };
}

// ---------- dialogs ----------

export function SendToHost() {
  const open = useSendToDialog((s) => s.open);
  if (!open) return null;
  if (open.kind === 'place') return <PlaceEditor place={open.place} then={open.then} />;
  if (open.kind === 'rule') return <RuleEditor rule={open.rule} />;
  if (open.kind === 'invoices') return <FindInvoices />;
  return <SentLog />;
}

function PlaceEditor({ place, then }: { place?: SendPlace; then?: (p: SendPlace) => void }) {
  const [p, setP] = useState<SendPlace>(place || { id: `place-${Date.now().toString(36)}`, name: '', forwardTo: '', sendMode: 'now', filesOnly: true, folder: '', subfolders: 'month', askFolder: false });
  const [forward, setForward] = useState(Boolean(place ? place.forwardTo : true));
  const [save, setSave] = useState(Boolean(place ? place.folder || place.askFolder : false));
  const change = (patch: Partial<SendPlace>) => setP((x) => ({ ...x, ...patch }));
  const contacts = useMail((m) => m.contacts);
  const choose = async () => {
    if (!isTauri()) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const dir = await open({ directory: true, title: 'Choose the folder for this place' });
    if (typeof dir === 'string') change({ folder: dir });
  };
  const email = (p.forwardTo || '').trim();
  const okEmail = !forward || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const okFolder = !save || p.askFolder || Boolean(p.folder);
  const name = p.name.trim() || (forward && email ? forwardName(email) : '');
  const ready = Boolean(name) && (forward || save) && okEmail && okFolder;
  const example = p.folder ? `${p.folder.replace(/[\\/]+$/, '')}${subfolderFor(p, Date.now()) ? `\\${subfolderFor(p, Date.now()).replace('/', '\\')}` : ''}\\Invoice.pdf` : '';
  const done = () => {
    const final: SendPlace = { ...p, name, forwardTo: forward ? email : '', folder: save ? p.folder : '', askFolder: save ? p.askFolder : false };
    const list = settings().sendPlaces;
    useSettings.getState().set({ sendPlaces: list.some((x) => x.id === final.id) ? list.map((x) => (x.id === final.id ? final : x)) : [...list, final] });
    closeSendToDialog();
    then?.(final);
  };
  return (
    <Dialog title={place ? `Edit ${place.name}` : 'New place'} onClose={closeSendToDialog} actions={<><button className="btn ghost" onClick={closeSendToDialog}>Cancel</button><button className="btn primary" disabled={!ready} onClick={done}>{place ? 'Save' : then ? 'Save and send' : 'Save place'}</button></>}>
      <div className="sendto-form">
        <label className="sendto-field"><span>Name</span><input value={p.name} placeholder={forward && email ? forwardName(email) : 'Bookkeeping'} onChange={(e) => change({ name: e.target.value })} autoFocus /></label>
        <Check checked={forward} onChange={setForward}>Forward to an address</Check>
        {forward && (
          <div className="sendto-indent">
            <RecipientField label="Forward to" anyAddress placeholder="Type a name or address, like your Hubdoc one" contacts={contacts} value={email ? [{ email }] : []}
              onAdd={(list) => change({ forwardTo: list[list.length - 1].email })} onRemove={() => change({ forwardTo: '' })} />
            <Radio name="Sending" value={p.sendMode} onChange={(v) => change({ sendMode: v })} options={[{ value: 'now', label: 'Send straight away', sub: 'With Undo, like any send. Rules always do this.' }, { value: 'open', label: 'Open the writing window first' }]} />
            <Check checked={p.filesOnly} onChange={(v) => change({ filesOnly: v })}>Only the attachments, not the email's text</Check>
          </div>
        )}
        <Check checked={save} onChange={setSave}>Save the files in a folder</Check>
        {save && (
          <div className="sendto-indent">
            {!p.askFolder && (
              <div className="sendto-folder"><input readOnly aria-label="Folder" value={p.folder || ''} placeholder={isTauri() ? 'No folder chosen' : 'Folders work in the desktop app'} /><button className="btn" onClick={() => void choose()} disabled={!isTauri()}>Choose...</button></div>
            )}
            {!p.askFolder && <Radio name="Put it in" value={p.subfolders} onChange={(v) => change({ subfolders: v })} options={[{ value: 'none', label: 'That folder' }, { value: 'year', label: 'Year' }, { value: 'month', label: 'Year › Month' }]} />}
            {!p.askFolder && example && <p className="hint">Saves as {example}</p>}
            <Check checked={Boolean(p.askFolder)} onChange={(v) => change({ askFolder: v })}>Ask me for a folder each time</Check>
          </div>
        )}
        {!okEmail && email && <p className="hint status-bad">{email} doesn't look like an email address.</p>}
      </div>
    </Dialog>
  );
}

function RuleEditor({ rule }: { rule: SendRule }) {
  const places = useSettings((s) => s.sendPlaces);
  const [r, setR] = useState(rule);
  const isNew = !settings().sendRules.some((x) => x.id === rule.id);
  const change = (patch: Partial<SendRule>) => setR((x) => ({ ...x, ...patch }));
  const save = () => {
    const final = { ...r, from: r.from.trim(), name: r.name.trim() || r.from.trim(), since: isNew ? Date.now() : r.since };
    const list = settings().sendRules;
    useSettings.getState().set({ sendRules: isNew ? [...list, final] : list.map((x) => (x.id === r.id ? final : x)) });
    closeSendToDialog();
  };
  return (
    <Dialog title={isNew ? 'New rule' : `Edit ${rule.name}`} onClose={closeSendToDialog} actions={<><button className="btn ghost" onClick={closeSendToDialog}>Cancel</button><button className="btn primary" disabled={!r.from.trim() || !r.placeId} onClick={save}>{isNew ? 'Make rule' : 'Save'}</button></>}>
      <div className="sendto-form">
        <label className="sendto-field"><span>Name</span><input value={r.name} placeholder={r.from || 'Canva'} onChange={(e) => change({ name: e.target.value })} /></label>
        <label className="sendto-field"><span>From</span><input value={r.from} placeholder="canva.com or someone@example.com" onChange={(e) => change({ from: e.target.value })} /></label>
        <Check checked={r.needsPdf} onChange={(v) => change({ needsPdf: v })}>Only emails with a PDF</Check>
        <label className="sendto-field"><span>Subject has</span><input value={r.subjectHas || ''} placeholder="Optional, like invoice" onChange={(e) => change({ subjectHas: e.target.value })} /></label>
        <label className="sendto-field"><span>Send to</span>
          <select value={r.placeId} onChange={(e) => change({ placeId: e.target.value })}>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <p className="hint">Rules run on new mail as it arrives while Well Good Mail is open, and catch up when it opens. Nothing is sent twice.</p>
      </div>
    </Dialog>
  );
}

const PAST = [{ v: 1, l: 'the last month' }, { v: 3, l: 'the last 3 months' }, { v: 6, l: 'the last 6 months' }, { v: 12, l: 'the last year' }];

function FindInvoices() {
  const places = useSettings((s) => s.sendPlaces);
  const rules = useSettings((s) => s.sendRules);
  const found = useMemo<InvoiceSender[]>(() => {
    const st = useMail.getState();
    const covered = new Set(rules.map((r) => r.from.toLowerCase()));
    return findInvoiceSenders(Object.values(st.messages), myAddresses(st.accounts)).filter((s) => !covered.has(s.key));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [past, setPast] = useState(false);
  const [months, setMonths] = useState(3);
  const firstPlace = places[0]?.id;
  const chosen = found.filter((s) => picked[s.key]);
  const pastMessages = (s: InvoiceSender) => s.ids.map((id) => useMail.getState().messages[id]).filter((m): m is Message => Boolean(m) && m.date >= Date.now() - months * 31 * 86400000);
  const pastCount = chosen.reduce((n, s) => n + pastMessages(s).length, 0);
  const go = async () => {
    for (const s of chosen) addRule({ name: s.name, from: s.key, needsPdf: pastMessages(s).some((m) => m.attachments.some((a) => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.filename))), placeId: picked[s.key] });
    closeSendToDialog();
    if (past && pastCount) {
      for (const place of places) {
        const msgs = chosen.filter((s) => picked[s.key] === place.id).flatMap(pastMessages);
        if (msgs.length) await sendToPlace(place, msgs);
      }
    }
  };
  return (
    <Dialog wide title="Find my invoices" onClose={closeSendToDialog} actions={<><button className="btn ghost" onClick={closeSendToDialog}>Cancel</button>{places.length > 0 && found.length > 0 && <button className="btn primary" disabled={!chosen.length} onClick={() => void go()}>{chosen.length === 1 ? 'Make 1 rule' : `Make ${chosen.length || ''} rules`.replace('  ', ' ')}</button>}</>}>
      {!places.length ? (
        <div className="sendto-form">
          <p className="hint">First make a place for them to go, like Bookkeeping: your Hubdoc address, an invoices folder, or both.</p>
          <button className="btn" onClick={() => openPlaceEditor(undefined, () => openFindInvoices())}><Icon name="plus" /> New place</button>
        </div>
      ) : !found.length ? (
        <p className="hint">No new senders of invoices or receipts in the mail on this computer from the last year{rules.length ? ', other than the ones your rules already cover' : ''}.</p>
      ) : (
        <div className="sendto-form">
          <p className="hint">Emails from the last year with words like invoice or receipt, by sender. Tick the ones to send on, and pick where each goes.</p>
          <div className="sendto-list">
            {found.slice(0, 40).map((s) => (
              <div key={s.key} className="sendto-row">
                <input type="checkbox" aria-label={s.name} checked={Boolean(picked[s.key])} onChange={(e) => setPicked((x) => { const n = { ...x }; if (e.target.checked) n[s.key] = x[s.key] || firstPlace; else delete n[s.key]; return n; })} />
                <div className="grow"><strong>{s.name}</strong><small>{s.key} · last on {fullDate(s.last)} · {s.cadence}</small></div>
                <span className="sendto-count">{s.count === 1 ? '1 email' : `${s.count} emails`}</span>
                <select aria-label={`Where ${s.name} goes`} value={picked[s.key] || firstPlace} onChange={(e) => setPicked((x) => ({ ...x, [s.key]: e.target.value }))}>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
            ))}
          </div>
          <div className="sendto-past">
            <label className="check-inline"><input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> Also send the ones already here, from</label>
            <select aria-label="How far back" value={months} onChange={(e) => setMonths(Number(e.target.value))}>{PAST.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
            {past && <small className="hint">{pastCount === 1 ? '1 email' : `${pastCount} emails`}, each as its own forward.</small>}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function SentLog() {
  const [list, setList] = useState<SendLogEntry[] | null>(null);
  if (list === null) void sendLog().then(setList);
  return (
    <Dialog wide title="What's been sent" onClose={closeSendToDialog} actions={<button className="btn primary" onClick={closeSendToDialog}>Done</button>}>
      {!list?.length ? <p className="hint">Nothing has been sent to a place yet.</p> : (
        <div className="sendto-list">
          {list.slice(0, 100).map((e, i) => (
            <div key={i} className="sendto-row"><div className="grow"><strong>{e.subject || '(no subject)'}</strong><small>{e.from} › {e.place}{e.rule ? ` (rule: ${e.rule})` : ''}{e.saved ? ` · saved in ${e.saved}` : ''}</small></div><span className="sendto-count">{fullDate(e.at)}</span></div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

// ---------- Settings › Send To ----------

function useDragOrder<T extends { id: string }>(list: T[], save: (next: T[]) => void) {
  const from = useRef<string | null>(null);
  return (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { from.current = id; e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e: React.DragEvent) => { if (from.current) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const a = from.current;
      from.current = null;
      if (!a || a === id) return;
      const moving = list.find((x) => x.id === a)!;
      const rest = list.filter((x) => x.id !== a);
      rest.splice(rest.findIndex((x) => x.id === id), 0, moving);
      save(rest);
    },
  });
}

export function SendToTab() {
  const places = useSettings((s) => s.sendPlaces);
  const rules = useSettings((s) => s.sendRules);
  const set = useSettings((s) => s.set);
  const menu = useMenu();
  const dragPlace = useDragOrder(places, (next) => set({ sendPlaces: next }));
  const dragRule = useDragOrder(rules, (next) => set({ sendRules: next }));
  const placeName = (id: string) => places.find((p) => p.id === id)?.name || 'a place that was deleted';
  const renamePlace = async (p: SendPlace) => { const n = await askText('Rename place', p.name, 'Rename'); if (n?.trim()) set({ sendPlaces: places.map((x) => (x.id === p.id ? { ...x, name: n.trim() } : x)) }); };
  const deletePlace = async (p: SendPlace) => {
    const using = rules.filter((r) => r.placeId === p.id);
    if (!(await askConfirm(`Delete ${p.name}?`, using.length ? `${using.length === 1 ? '1 rule sends' : `${using.length} rules send`} there, and ${using.length === 1 ? 'it goes' : 'they go'} too.` : undefined, 'Delete'))) return;
    set({ sendPlaces: places.filter((x) => x.id !== p.id), sendRules: rules.filter((r) => r.placeId !== p.id) });
  };
  const renameRule = async (r: SendRule) => { const n = await askText('Rename rule', r.name, 'Rename'); if (n?.trim()) set({ sendRules: rules.map((x) => (x.id === r.id ? { ...x, name: n.trim() } : x)) }); };
  const placeMenu = (p: SendPlace): MenuItem[] => [
    { label: 'Edit...', icon: 'compose', onClick: () => openPlaceEditor(p) },
    { label: 'Rename...', icon: 'pen', onClick: () => void renamePlace(p) },
    { divider: true },
    { label: 'Delete...', icon: 'trash', onClick: () => void deletePlace(p) },
  ];
  const ruleMenu = (r: SendRule): MenuItem[] => [
    { label: 'Edit...', icon: 'compose', onClick: () => useSendToDialog.setState({ open: { kind: 'rule', rule: r } }) },
    { label: 'Rename...', icon: 'pen', onClick: () => void renameRule(r) },
    { label: r.on ? 'Pause' : 'Turn on', icon: r.on ? 'clock' : 'check', onClick: () => set({ sendRules: rules.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)) }) },
    { divider: true },
    { label: 'Delete', icon: 'trash', onClick: () => set({ sendRules: rules.filter((x) => x.id !== r.id) }) },
  ];
  return (
    <>
      <h1>Send To</h1>
      <section className="set-section">
        <h2>Places</h2>
        <p className="hint">Right-click an attachment or an email, then Send to. A place forwards to an address (like Hubdoc for bookkeeping), saves the files in a folder, or both. Drag to change the order; right-click to edit, rename or delete.</p>
        <div className="sendto-list">
          {places.map((p) => (
            <div key={p.id} className="sendto-row" {...dragPlace(p.id)} onContextMenu={(e) => { e.preventDefault(); menu.open({ x: e.clientX, y: e.clientY }, placeMenu(p)); }} onDoubleClick={() => openPlaceEditor(p)}>
              <Icon name="grip" size={13} />
              <Icon name={placeIcon(p) as 'mail'} size={15} />
              <div className="grow"><strong>{p.name}</strong><small>{[p.forwardTo, p.askFolder ? 'asks for a folder' : p.folder ? `${p.folder}${p.subfolders === 'month' ? ' › Year › Month' : p.subfolders === 'year' ? ' › Year' : ''}` : ''].filter(Boolean).join(' · ')}</small></div>
              <button className="icon-btn" aria-label={`Options for ${p.name}`} onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), placeMenu(p), 'right')}><Icon name="more" size={15} /></button>
            </div>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => openPlaceEditor()}><Icon name="plus" /> New place</button>
      </section>
      <section className="set-section">
        <h2>Rules</h2>
        <p className="hint">New mail from these senders goes to its place by itself. Make one with New rule, with Make a rule after sending something, or with Find my invoices. Rules run while Well Good Mail is open and catch up when it opens; mail from before a rule was made is left alone, and nothing is sent twice.</p>
        <div className="sendto-list">
          {rules.map((r) => (
            <div key={r.id} className={`sendto-row${r.on ? '' : ' off'}`} {...dragRule(r.id)} onContextMenu={(e) => { e.preventDefault(); menu.open({ x: e.clientX, y: e.clientY }, ruleMenu(r)); }} onDoubleClick={() => useSendToDialog.setState({ open: { kind: 'rule', rule: r } })}>
              <Icon name="grip" size={13} />
              <div className="grow"><strong>{r.name}</strong><small>From {r.from}{r.needsPdf ? ', with a PDF' : ''}{r.subjectHas ? `, subject has "${r.subjectHas}"` : ''} › {placeName(r.placeId)}</small></div>
              <span className="sendto-count">{r.sent} sent</span>
              <input type="checkbox" role="switch" className="switch" aria-label={`${r.name} on`} checked={r.on} onChange={(e) => set({ sendRules: rules.map((x) => (x.id === r.id ? { ...x, on: e.target.checked } : x)) })} />
            </div>
          ))}
        </div>
        <div className="sendto-actions">
          <button className="btn" disabled={!places.length} title={places.length ? undefined : 'Make a place first'} onClick={() => useSendToDialog.setState({ open: { kind: 'rule', rule: { id: `rule-${Date.now().toString(36)}`, name: '', from: '', needsPdf: true, placeId: places[0]?.id || '', on: true, since: Date.now(), sent: 0 } } })}><Icon name="plus" /> New rule</button>
          <button className="btn" onClick={openFindInvoices}><Icon name="search" /> Find my invoices...</button>
          <button className="btn ghost" onClick={() => useSendToDialog.setState({ open: { kind: 'log' } })}>What's been sent</button>
        </div>
      </section>
      {menu.node}
    </>
  );
}
