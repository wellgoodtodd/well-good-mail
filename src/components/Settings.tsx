// Settings: accounts, signatures, groups, look and feel, reminders, privacy, updates.
import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Icon } from './Icon';
import { FormatBar } from './FormatBar';
import { editorExtensions, tidyForEditor, FONT_CHOICES } from './editorExtensions';
import { ColourPicker } from './ColourPicker';
import { PALETTES, paletteById } from '../lib/palettes';
import { useMail, setLeaveOutOfAll, openScreen, refreshAccountPhotos, applyPalette, removeAccount, updateAccount, reconnectAccount, syncAccount, isSyncing, reorderAccounts, startDemo, leaveDemo, restartPolling, toast } from '../lib/mail';
import { useSettings, type Settings as S } from '../lib/settings';
import { allAliases } from '../lib/compose';
import { useGoogleConfigured, useGoogleKeys } from '../lib/auth/google';
import { SKINS, type Skin } from '../lib/skins';
import { openGuide } from './SetupGuide';
import { IMAP_PRESETS } from '../lib/imapUtil';
import { addAccountItems } from '../lib/accountMenu';
import { exportCache, importCache } from '../lib/cacheTransfer';
import { exportKeys, importKeys } from '../lib/backup';
import { paceInfo } from '../lib/providers/gmail';
import { enableSettingsSync } from '../lib/settingsSync';
import { isTauri, setAutostart, setCloseQuits, notify, openExternal } from '../lib/platform';
import { showBanner } from '../lib/banners';
import { useSettingsAlerts } from '../lib/alerts';
import { useUpdates, checkForUpdates, installFoundUpdate, restartToUpdate } from '../lib/updater';
import { useMenu, Dialog } from './ui';
import { SHORTCUTS, bindingsFor, comboFromEvent, isSingleKey, type ShortcutAction } from '../lib/shortcuts';

const TABS = [
  ['accounts', 'Accounts'],
  ['signatures', 'Signatures & Addresses'],
  ['groups', 'Inbox Groups'],
  ['appearance', 'Appearance'],
  ['writing', 'Composing'],
  ['notifications', 'Notifications & Reminders'],
  ['privacy', 'Privacy'],
  ['offline', 'Search & Storage'],
  ['shortcuts', 'Keyboard Shortcuts'],
  ['updates', 'Updates'],
  ['diagnostics', 'Diagnostics'],
] as const;

// Older links to tabs that were folded into others.
const TAB_ALIAS: Record<string, string> = { reminders: 'notifications', templates: 'writing', people: 'privacy' };

export function SettingsScreen() {
  const version = useUpdates((u) => u.currentVersion);
  const rawTab = useMail((s) => s.settingsTab);
  const tab = TAB_ALIAS[rawTab] || rawTab;
  const alerts = useSettingsAlerts();
  const order = useSettings((s) => s.settingsOrder);
  const ids: string[] = TABS.map(([id]) => id);
  const ordered = [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))];
  const drag = useRef<string | null>(null);
  const lastMove = useRef(0);
  const moveTab = (from: string, over: string) => {
    if (from === over) return;
    const next = ordered.filter((id) => id !== from);
    next.splice(next.indexOf(over) + (ordered.indexOf(from) < ordered.indexOf(over) ? 1 : 0), 0, from);
    if (next.join() !== ordered.join()) useSettings.getState().set({ settingsOrder: next });
  };
  return (
    <div className="settings" role="main">
      <nav className="settings-nav" aria-label="Settings sections">
        <button className="side-item" onClick={() => useMail.setState({ screen: 'mail' })}><Icon name="chevronLeft" /> <span className="name">Back to mail</span></button>
        <div className="side-heading" style={{ marginTop: 8 }}>Settings</div>
        {ordered.map((id) => [id, TABS.find(([t]) => t === id)![1]] as const).map(([id, label]) => (
          <button
            key={id}
            className={`side-item ${tab === id ? 'selected' : ''}`}
            onClick={() => useMail.setState({ settingsTab: id })}
            draggable
            title="Drag to change the order"
            onDragStart={(e) => { drag.current = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }}
            onDragOver={(e) => {
              if (!drag.current) return;
              e.preventDefault();
              // Calmer than before: swap only once the pointer is well into the next tab, and not more than about 4 times a second.
              const r = e.currentTarget.getBoundingClientRect();
              const frac = (e.clientY - r.top) / r.height;
              const down = ordered.indexOf(drag.current) < ordered.indexOf(id);
              if ((down ? frac > 0.65 : frac < 0.35) && Date.now() - lastMove.current > 250) { lastMove.current = Date.now(); moveTab(drag.current, id); }
            }}
            onDrop={(e) => { e.preventDefault(); drag.current = null; }}
            onDragEnd={() => { drag.current = null; }}
          >
            <span className="name" style={id === 'updates' ? { textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 } : undefined}>{label}</span>{alerts.tabs[id] ? <span className="attn-dot" title={alerts.tabs[id]} aria-label={alerts.tabs[id]} /> : null}
          </button>
        ))}
        <div className="settings-version">Version {version || '...'}</div>
      </nav>
      <div className="settings-body">
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'signatures' && <SignaturesTab />}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'writing' && <><WritingTab /><TemplatesTab /></>}
        {tab === 'notifications' && <><NotificationsTab /><RemindersTab /></>}
        {tab === 'privacy' && <><PrivacyTab /><PeopleTab /></>}
        {tab === 'offline' && <OfflineTab />}
        {tab === 'shortcuts' && <ShortcutsTab />}
        {tab === 'updates' && <UpdatesTab />}
        {tab === 'diagnostics' && <DiagnosticsTab />}
      </div>
    </div>
  );
}

function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return <div className="set-row"><label htmlFor={htmlFor}>{label}</label>{children}</div>;
}

function Radio<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="radio-list" role="radiogroup">
      {options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span><span>{o.label}</span>{o.sub && <><br /><span className="sub">{o.sub}</span></>}</span>
        </label>
      ))}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{children}</span></label>;
}

// ---------- accounts ----------

/** True when signing in again is the likely fix: a sign in problem, including a sign in saved under a different Google key. */
function wantsSignIn(a: { status: string; error?: string }): boolean {
  return a.status === 'needs-signin' || (a.status === 'error' && /sign in|unauthori[sz]ed|invalid_grant|invalid_client/i.test(a.error || ''));
}

function AccountsTab() {
  const accounts = useMail((s) => s.accounts);
  const demo = useSettings((s) => s.demoMode);
  const s = useSettings();
  const googleOn = useGoogleConfigured();
  const addMenu = useMenu();
  const keys = useGoogleKeys();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ accountId: string; anchor: { x: number; y: number } } | null>(null);
  const sorted = [...accounts].sort((a, b) => a.order - b.order);
  // If an account says Syncing but nothing is really syncing, check it again every few seconds until it settles.
  useEffect(() => {
    const t = setInterval(() => {
      for (const a of useMail.getState().accounts) if (a.status === 'syncing' && !isSyncing(a.id)) syncAccount(a.id, { quiet: true });
    }, 4000);
    return () => clearInterval(t);
  }, []);
  const move = (id: string, d: -1 | 1) => {
    const ids = sorted.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderAccounts(ids);
  };
  return (
    <>
      <h1>Accounts</h1>
      {!accounts.some((a) => a.kind !== 'demo') && (
        <section className="set-section">
          <h2>Demo mode</h2>
          <p className="hint">Pretend accounts and emails for trying things out. Nothing is sent anywhere. This goes away once you connect a real account.</p>
          {demo ? <button className="btn" onClick={leaveDemo}>Leave demo mode and clear demo data</button> : <button className="btn" onClick={() => startDemo()}>Try demo mode</button>}
        </section>
      )}
      <section className="set-section">
        <h2>Your accounts</h2>
        <p className="hint">All of these feed into All Inboxes. Rename them, pick a colour by clicking the dot, and change the order they appear in. Colour palettes are in Settings, then Appearance.</p>
        {sorted.map((a, i) => (
          <div className="acct-row" key={a.id}>
            <button className="icon-btn" aria-label={`Colour for ${a.email}`} title="Change colour" onClick={(e) => setPicker({ accountId: a.id, anchor: { x: e.clientX, y: e.clientY + 12 } })}><span className="dot" style={{ background: a.colour, width: 16, height: 16 }} /></button>
            <input className="label-input" value={a.label} aria-label={`Name for ${a.email}`} onChange={(e) => updateAccount(a.id, { label: e.target.value })} />
            <div className="grow">
              <div>{a.email}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88em' }}>
                {a.kind === 'gmail' ? 'Google' : a.kind === 'microsoft' ? 'Microsoft 365' : a.kind === 'demo' ? 'Demo' : IMAP_PRESETS.find((p) => p.host === a.imap?.host)?.name || 'IMAP'}
                {' · '}
                {a.status === 'needs-signin' ? <span className="status-bad">Needs signing in again</span> : a.status === 'error' ? <span className="status-bad" title={a.error}>Problem syncing</span> : a.status === 'syncing' ? (a.syncDone ? `Syncing... ${a.syncDone.toLocaleString()} ${a.syncDone === 1 ? 'message' : 'messages'}` : 'Syncing...') : <span className="status-ok">Connected</span>}
                {a.lastSync ? ` · checked ${new Date(a.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </div>
              {a.kind !== 'demo' && sorted.length > 1 && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '0.88em', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!a.leaveOutOfAll} onChange={(e) => setLeaveOutOfAll(a.id, !e.target.checked)} /> Show in All Inboxes
                </label>
              )}
            </div>
            <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(a.id, -1)}><Icon name="chevronDown" className="rot180" /></button>
            <button className="icon-btn" aria-label="Move down" disabled={i === sorted.length - 1} onClick={() => move(a.id, 1)}><Icon name="chevronDown" /></button>
            {wantsSignIn(a) && <button className="btn primary" onClick={() => reconnectAccount(a.id)}>Sign in</button>}
            <button className="btn ghost" onClick={() => syncAccount(a.id, { full: true })}>Resync</button>
            <button className="btn ghost danger" onClick={() => setConfirm(a.id)}>Remove</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={(e) => addMenu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), addAccountItems())}><Icon name="plus" /> Add account <Icon name="chevronDown" size={14} /></button>
        </div>
        {!isTauri() && <p className="hint" style={{ marginTop: 10 }}>Signing in to real accounts works in the desktop app. This browser preview runs in demo mode.</p>}
        {isTauri() && !googleOn && <p className="hint" style={{ marginTop: 10 }}>Gmail isn't set up yet. The setup guide takes about 10 minutes.</p>}
        {isTauri() && (
          <details className="own-keys">
            <summary>Use your own app keys</summary>
            <p className="hint">Only needed for a different Google project, or if your organisation blocks the shared Microsoft app.</p>
          {googleOn && (
            <div className="set-card">
              <div className="tx"><strong>Google key</strong><span>Only needed if you have changed your Google Cloud project, or want to run the setup guide again. A new key means signing in to each account again.</span></div>
              <button className="btn" onClick={() => openGuide('setup')}>Set up with a different key...</button>
            </div>
        )}
          <div className="set-card">
            <div className="tx"><strong>Microsoft app ID</strong><span>Microsoft accounts sign in through a shared app that comes with Well Good Mail. Only change it if your organisation blocks it and you have registered your own.</span></div>
            <button className="btn" onClick={() => openGuide('microsoft')}>Use my own ID...</button>
          </div>
          </details>
        )}
      </section>
      <div className="set-card" style={{ marginTop: 0, marginBottom: 18, maxWidth: 760 }}>
        <div className="tx"><strong>Colours and appearance</strong><span>Pick a colour theme, the account colour palettes, fonts and layout.</span></div>
        <button className="btn" onClick={() => openScreen('settings', 'appearance')}>Open Appearance</button>
      </div>
      {isTauri() && googleOn && keys.own && !s.googlePublished && (
        <section className="set-section">
          <div className="weekly-card">
            <Icon name="clock" size={20} />
            <div style={{ flex: 1 }}>
              <strong>Stop signing in every week</strong>
              <p className="hint" style={{ margin: '2px 0 8px' }}>While your Google project is in testing mode, Google signs you out after 7 days. Publishing it takes about two minutes and needs no review for personal use.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={() => openGuide('publish')}>Show me how</button>
                <button className="btn ghost" onClick={() => s.set({ googlePublished: true })}>I've already done this</button>
              </div>
            </div>
          </div>
        </section>
      )}
      {addMenu.node}
      {picker && <ColourPicker anchor={picker.anchor} value={accounts.find((x) => x.id === picker.accountId)?.colour || '#888888'} onPick={(c) => updateAccount(picker.accountId, { colour: c })} onClose={() => setPicker(null)} />}
      {confirm && (
        <Dialog title="Remove account?" onClose={() => setConfirm(null)} actions={<>
          <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn primary" onClick={() => { removeAccount(confirm); setConfirm(null); }}>Remove</button>
        </>}>
          <p>This signs out and removes its emails from this computer. Nothing is deleted from Gmail itself.</p>
        </Dialog>
      )}
    </>
  );
}

// ---------- signatures & addresses ----------

function SignatureEditor({ email, initial, onChange }: { email: string; initial: string; onChange: (html: string) => void }) {
  const font = useSettings((s) => s.writingFont);
  const size = useSettings((s) => s.writingSize);
  const editor = useEditor({ extensions: editorExtensions('Type or paste a signature'), editorProps: { attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Signature' } }, content: tidyForEditor(initial), onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()) }, [email]);
  return (
    <div className="sig-editor">
      <FormatBar editor={editor} defaultFont={font} defaultSize={size} />
      <div className="editor-wrap"><EditorContent editor={editor} /></div>
    </div>
  );
}

function SignaturesTab() {
  const accounts = useMail((s) => s.accounts);
  const s = useSettings();
  const aliases = allAliases(accounts);
  const [selected, setSelected] = useState(aliases[0]?.alias.email || '');
  const current = aliases.find((a) => a.alias.email === selected);
  const providerSig = current?.alias.providerSignatureHtml || '';
  const value = selected in s.signatures ? s.signatures[selected] : providerSig;
  return (
    <>
      <h1>Signatures &amp; addresses</h1>
      <section className="set-section">
        <h2>Default From address</h2>
        <p className="hint">Used for new emails from All Inboxes. Replies always go from whichever address the email was sent to.</p>
        <Row label="Send new emails from" htmlFor="def-from">
          <select id="def-from" value={s.defaultFromEmail} onChange={(e) => s.set({ defaultFromEmail: e.target.value })}>
            {aliases.map(({ alias, account }) => <option key={alias.email} value={alias.email}>{alias.email} ({account.label})</option>)}
          </select>
        </Row>
      </section>
      <section className="set-section">
        <h2>Signatures</h2>
        <p className="hint">Each address can have its own. Gmail signatures are pulled in automatically; edit here to override.</p>
        <Row label="Address" htmlFor="sig-addr">
          <select id="sig-addr" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {aliases.map(({ alias, account }) => <option key={alias.email} value={alias.email}>{alias.email} ({account.label})</option>)}
          </select>
        </Row>
        {selected && <SignatureEditor key={selected} email={selected} initial={value} onChange={(html) => s.set({ signatures: { ...useSettings.getState().signatures, [selected]: html } })} />}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {selected in s.signatures && <button className="btn ghost" onClick={() => { const next = { ...s.signatures }; delete next[selected]; s.set({ signatures: next }); setSelected(''); setTimeout(() => setSelected(selected)); }}>Use Gmail's signature</button>}
          <button className="btn ghost" onClick={() => { s.set({ signatures: { ...s.signatures, [selected]: '' } }); setSelected(''); setTimeout(() => setSelected(selected)); }}>No signature</button>
        </div>
        <Row label="Place signature">
          <Radio name="sigplace" value={s.signaturePlacement} onChange={(v) => s.set({ signaturePlacement: v })} options={[{ value: 'above', label: 'Above the quoted email' }, { value: 'below', label: 'Below the quoted email' }]} />
        </Row>
      </section>
      <section className="set-section">
        <h2>Send as addresses</h2>
        <p className="hint">These come from each Gmail account's "Send mail as" setting. Add new aliases in Gmail on the web, then press Resync on the account.</p>
        {accounts.map((a) => (
          <div key={a.id} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ background: a.colour }} />{a.label}</div>
            {a.aliases.map((al) => <div key={al.email} style={{ paddingLeft: 16, color: 'var(--text-muted)' }}>{al.name} &lt;{al.email}&gt;{al.isDefault ? ' · default' : ''}</div>)}
          </div>
        ))}
      </section>
    </>
  );
}

// ---------- groups ----------

function GroupsTab() {
  const accounts = useMail((s) => s.accounts);
  const groups = useSettings((s) => s.groups);
  const set = useSettings((s) => s.set);
  const update = (id: string, patch: Partial<S['groups'][number]>) => set({ groups: groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  return (
    <>
      <h1>Inbox groups</h1>
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

/** Shows how the account colours look in the sidebar and as the stripe on emails. Uses your own accounts when you have them. */
function AccountPreview() {
  const accounts = useMail((st) => st.accounts);
  const stripe = useSettings((st) => st.showAccountStripe);
  const palette = useSettings((st) => st.palette);
  const real = [...accounts].sort((a, b) => a.order - b.order).slice(0, 5).map((a) => ({ name: a.label, colour: a.colour }));
  const fake = ['Work', 'Personal', 'Studio', 'Club', 'Old mail'].map((name, i) => ({ name, colour: paletteById(palette).colours[i % 8] }));
  const rows = real.length ? real : fake;
  const mails = [['Isla Grant', 'Brand film: rough cut thoughts'], ['Ledger and Co', 'Q3 VAT return ready to review'], ['Frame.io', '3 new comments on Anthem_v4']];
  return (
    <div className="acct-preview" aria-label="Preview of your account colours">
      <div className="ap-side">
        {rows.map((r) => <div className="ap-row" key={r.name}><i style={{ background: r.colour }} /><span>{r.name}</span></div>)}
      </div>
      <div className="ap-list">
        {mails.map(([from, subject], i) => (
          <div className="ap-msg" key={from} style={{ borderLeftColor: stripe ? rows[i % rows.length].colour : 'transparent' }}>
            <b>{from}</b><span>{subject}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppearanceTab() {
  const s = useSettings();
  const accounts = useMail((st) => st.accounts);
  const palette = useSettings((st) => st.palette);
  const stripe = useSettings((st) => st.showAccountStripe);
  const systemDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = s.theme === 'system' ? (systemDark ? 'dark' : 'light') : s.theme;
  const activeId = mode === 'dark' ? s.darkSkin : s.lightSkin;
  const choose = (k: Skin) => {
    s.set({ ...(k.mode === 'dark' ? { darkSkin: k.id } : { lightSkin: k.id }), ...(s.theme !== 'system' ? { theme: k.mode } : {}), accent: k.accent });
    applyPalette(s.colourBlindAccounts ? 'accessible' : `skin-${k.id}`);
  };
  return (
    <>
      <h1>Appearance</h1>
      <section className="set-section">
        <h2>Colour theme</h2>
        <p className="hint">Each theme changes the whole look and brings its own account colours. Pick one, then change any colour you like.</p>
        <div className="skin-grid">
          {SKINS.map((k) => (
            <button key={k.id} className={`skin-tile ${k.id === activeId ? 'on' : ''}`} aria-pressed={k.id === activeId} onClick={() => choose(k)}>
              <span className="skin-sw" style={{ background: k.vars['--bg'] || (k.mode === 'dark' ? '#1c1c1e' : '#ffffff') }}>
                {k.colours.slice(0, 5).map((c) => <i key={c} style={{ background: c }} />)}
              </span>
              <b>{k.name}</b>
              <small>{k.blurb}</small>
            </button>
          ))}
        </div>
        <Check checked={s.colourBlindAccounts} onChange={(v) => { s.set({ colourBlindAccounts: v }); applyPalette(v ? 'accessible' : `skin-${activeId}`); }}>Colour blind friendly account colours (works with any theme)</Check>
      </section>
      <section className="set-section">
        <h2>Account colours</h2>
        <p className="hint">Each account's colour shows in the sidebar and as a thin stripe on its emails in combined inboxes. Pick a palette to colour them all at once, or click any account's dot to choose one colour.</p>
        <AccountPreview />
        <div className="palette-list">
          {PALETTES.map((p) => (
            <button key={p.id} className={`palette-row ${palette === p.id ? 'on' : ''}`} onClick={() => applyPalette(p.id)}>
              <span className="chips-preview">{p.colours.slice(0, Math.min(8, Math.max(5, accounts.length))).map((c) => <span key={c} style={{ background: c }} />)}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <Check checked={stripe} onChange={(v) => useSettings.getState().set({ showAccountStripe: v })}>Show the account colour stripe on each email</Check>
      </section>
      <section className="set-section">
        <h2>Display</h2>
        <Row label="Theme">
          <Radio name="theme" value={s.theme} onChange={(v) => s.set({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Follow Windows' }]} />
        </Row>
        <Row label="Accent colour" htmlFor="accent">
          <input id="accent" type="color" value={s.accent} onChange={(e) => s.set({ accent: e.target.value })} />
          {['#3B82F6', '#0A84FF', '#EEC32A', '#1EAB8F', '#A855F7', '#EF4444'].map((c) => (
            <button key={c} className="icon-btn" aria-label={`Accent ${c}`} onClick={() => s.set({ accent: c })}><span className="dot" style={{ background: c, width: 16, height: 16 }} /></button>
          ))}
        </Row>
        <Row label="Text size" htmlFor="scale">
          <input id="scale" type="range" min={0.85} max={1.3} step={0.05} value={s.textScale} onChange={(e) => s.set({ textScale: Number(e.target.value) })} />
          <span>{Math.round(s.textScale * 100)}%</span>
        </Row>
        <Row label="List spacing">
          <Radio name="density" value={s.density} onChange={(v) => s.set({ density: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        </Row>
      </section>
      <section className="set-section">
        <h2>Unread counts</h2>
        <p className="hint">The numbers next to mailboxes in the sidebar. A collapsed account shows the total of everything underneath it. Right click any mailbox to hide just its count.</p>
        <Check checked={s.badges.enabled} onChange={(v) => s.set({ badges: { ...s.badges, enabled: v } })}>Show unread counts</Check>
        {s.badges.enabled && (
          <>
            <div className="set-row">
              <span className="label">Count</span>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Check checked={s.badges.inbox} onChange={(v) => s.set({ badges: { ...s.badges, inbox: v } })}>Unread in Inbox</Check>
                <Check checked={s.badges.drafts} onChange={(v) => s.set({ badges: { ...s.badges, drafts: v } })}>Drafts</Check>
                <Check checked={s.badges.labels} onChange={(v) => s.set({ badges: { ...s.badges, labels: v } })}>Unread in labels</Check>
                <Check checked={s.badges.junk} onChange={(v) => s.set({ badges: { ...s.badges, junk: v } })}>Unread in Junk</Check>
                <Check checked={s.badges.flagged} onChange={(v) => s.set({ badges: { ...s.badges, flagged: v } })}>Flagged</Check>
              </div>
            </div>
            <Row label="Style">
              <Radio name="badgestyle" value={s.badges.style} onChange={(v) => s.set({ badges: { ...s.badges, style: v } })} options={[{ value: 'pill', label: 'Coloured badge' }, { value: 'plain', label: 'Plain number' }, { value: 'dot', label: 'Just a dot (no numbers)' }]} />
            </Row>
            {s.badges.style !== 'plain' && (
              <Row label="Badge colour">
                {['#F28C76', '#F5B971', '#8FB8F2', '#7DCFB6', '#B9A7E8', '#A9A9B0', '#E5484D'].map((c) => (
                  <button key={c} className={`swatch ${s.badges.colour === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Badge colour ${c}`} onClick={() => s.set({ badges: { ...s.badges, colour: c } })} />
                ))}
                <input type="color" aria-label="Custom badge colour" value={s.badges.colour} onChange={(e) => s.set({ badges: { ...s.badges, colour: e.target.value } })} />
              </Row>
            )}
          </>
        )}
        <Row label="Unread dot in the list">
          {['', '#3B82F6', '#E5484D', '#1EAB8F', '#EEC32A'].map((c) => (
            <button key={c || 'accent'} className={`swatch ${s.unreadColour === c ? 'on' : ''}`} style={{ background: c || s.accent }} aria-label={c ? `Unread colour ${c}` : 'Same as accent'} title={c ? c : 'Same as accent colour'} onClick={() => s.set({ unreadColour: c })} />
          ))}
        </Row>
      </section>
      <section className="set-section">
        <h2>Pictures</h2>
        <Check checked={s.accountIcons} onChange={(v) => { s.set({ accountIcons: v }); if (v) refreshAccountPhotos(); }}>Use each Google account's profile picture in the sidebar instead of its coloured dot</Check>
        <Check checked={s.senderPhotos} onChange={(v) => s.set({ senderPhotos: v })}>Show a small photo or initials beside each message in the list</Check>
      </section>
      <section className="set-section">
        <h2>Layout</h2>
        <Row label="Reading pane">
          <Radio name="pane" value={s.panePosition} onChange={(v) => s.set({ panePosition: v })} options={[{ value: 'right', label: 'On the right' }, { value: 'bottom', label: 'Below the list' }, { value: 'off', label: 'Off (open emails in their own window)' }]} />
        </Row>
        <Row label="Preview lines" htmlFor="plines">
          <select id="plines" value={s.previewLines} onChange={(e) => s.set({ previewLines: Number(e.target.value) as S['previewLines'] })}>
            <option value={0}>None</option><option value={1}>1 line</option><option value={2}>2 lines</option><option value={3}>3 lines</option>
          </select>
        </Row>
        <Check checked={s.threaded} onChange={(v) => s.set({ threaded: v })}>Group replies into conversations</Check>
        <Check checked={s.newestFirstInThread} onChange={(v) => s.set({ newestFirstInThread: v })}>Show the newest message first in an open conversation</Check>
        <Check checked={s.sidebarVisible} onChange={(v) => s.set({ sidebarVisible: v })}>Show the mailbox sidebar (Ctrl+Shift+S)</Check>
        <button className="btn ghost" onClick={() => s.set({ sidebarWidth: 240, listWidth: 380, listHeight: 320 })}>Reset column sizes</button>
        <button className="btn ghost" onClick={() => s.set({ toolbarOrder: ['archive', 'bin', 'junk', 'read', 'flag', 'snooze', 'popout', 'more'] })}>Reset toolbar order</button>
      </section>
    </>
  );
}

// ---------- writing ----------

function WritingTab() {
  const s = useSettings();
  return (
    <>
      <h1>Fonts &amp; writing</h1>
      <section className="set-section">
        <h2>Fonts</h2>
        <Row label="Interface font" htmlFor="uifont">
          <select id="uifont" value={s.interfaceFont} onChange={(e) => s.set({ interfaceFont: e.target.value })}>{['Inter', 'Segoe UI', 'Rubik'].map((f) => <option key={f}>{f}</option>)}</select>
        </Row>
        <Row label="Writing font" htmlFor="wfont">
          <select id="wfont" value={s.writingFont} onChange={(e) => s.set({ writingFont: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f}>{f}</option>)}</select>
        </Row>
        <Row label="Writing size" htmlFor="wsize">
          <select id="wsize" value={s.writingSize} onChange={(e) => s.set({ writingSize: Number(e.target.value) })}>{[9, 10, 11, 12, 13, 14, 16].map((n) => <option key={n} value={n}>{n}pt</option>)}</select>
        </Row>
        <Row label="Writing colour" htmlFor="wcol">
          <input id="wcol" type="color" value={s.writingColour || '#1d1d1f'} onChange={(e) => s.set({ writingColour: e.target.value })} />
          {s.writingColour && <button className="btn ghost" onClick={() => s.set({ writingColour: '' })}>Default</button>}
        </Row>
        <Row label="Reading font for plain emails" htmlFor="rfont">
          <select id="rfont" value={s.readingFont} onChange={(e) => s.set({ readingFont: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f}>{f}</option>)}</select>
        </Row>
        <p className="hint">Rubik and Inter are built into the app. People reading your emails see them if they have the font, otherwise a similar one.</p>
      </section>
      <section className="set-section">
        <h2>Sending</h2>
        <Row label="Undo send window" htmlFor="undo">
          <select id="undo" value={s.undoSendSeconds} onChange={(e) => s.set({ undoSendSeconds: Number(e.target.value) as S['undoSendSeconds'] })}>
            {[0, 10, 20, 30, 60].map((n) => <option key={n} value={n}>{n === 0 ? 'Off' : `${n} seconds`}</option>)}
          </select>
        </Row>
        <Row label="Closing an unsent email" htmlFor="closeunsent">
          <select id="closeunsent" value={s.closeUnsent} onChange={(e) => s.set({ closeUnsent: e.target.value as S['closeUnsent'] })}>
            <option value="ask">Ask me</option>
            <option value="save">Save it as a draft</option>
            <option value="discard">Close without saving</option>
          </select>
        </Row>
        <Row label="Reply button does">
          <Radio name="defreply" value={s.defaultReply} onChange={(v) => s.set({ defaultReply: v })} options={[{ value: 'reply', label: 'Reply' }, { value: 'replyAll', label: 'Reply All' }]} />
        </Row>
        <Check checked={s.popOutCompose} onChange={(v) => s.set({ popOutCompose: v })}>Always open replies in their own window</Check>
        <Check checked={s.spellCheck} onChange={(v) => s.set({ spellCheck: v })}>Underline spelling mistakes while I write</Check>
      </section>
      <section className="set-section">
        <h2>Warnings before sending</h2>
        <p className="hint">Each warning also has a "Don't warn me again" box. Switch them back on here.</p>
        <Check checked={s.warnings.noSubject} onChange={(v) => s.set({ warnings: { ...s.warnings, noSubject: v } })}>No subject line</Check>
        <Check checked={s.warnings.missingAttachment} onChange={(v) => s.set({ warnings: { ...s.warnings, missingAttachment: v } })}>You mention an attachment but nothing is attached</Check>
        <Check checked={s.warnings.manyRecipients} onChange={(v) => s.set({ warnings: { ...s.warnings, manyRecipients: v } })}>Sending to more than 10 people</Check>
        <Check checked={s.warnings.fromMismatch} onChange={(v) => s.set({ warnings: { ...s.warnings, fromMismatch: v } })}>Replying from a different address than the email was sent to</Check>
      </section>
      <section className="set-section">
        <h2>Sidebar</h2>
        <p className="hint">Right click anything in the sidebar (or use its ⋯ button) to add it to Favourites or hide it. Drag items into Favourites to pin them, and drag them out to remove them.</p>
        <button className="btn" onClick={() => s.set({ favourites: ['all|inbox', 'all|vip', 'all|flagged'] })}>Reset Favourites</button>{' '}
        <button className="btn" disabled={!s.hiddenItems.length} onClick={() => s.set({ hiddenItems: [] })}>Show all hidden items ({s.hiddenItems.length})</button>
      </section>
    </>
  );
}

// ---------- reminders ----------

/** A number of minutes: pick from the list or type one. Only whole numbers are kept. */
function WholeMinutes({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Math.round(Number(raw));
    if (raw.trim() !== '' && Number.isFinite(n) && n >= 1 && n <= 180) onChange(n);
    else setText(String(value));
  };
  return (
    <>
      <input className="mins-input" type="text" inputMode="numeric" list="wgm-mins" aria-label={`${label}: minutes before`} value={text}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setText(v); const n = Number(v); if (v && n >= 1 && n <= 180) onChange(n); }}
        onBlur={(e) => commit(e.target.value)} />
      <datalist id="wgm-mins">{[1, 2, 3, 5, 10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n} />)}</datalist>
    </>
  );
}

function RemindersTab() {
  const s = useSettings();
  return (
    <>
      <h1>Reminders</h1>
      <section className="set-section">
        <p className="hint">Reminders always collect in the Reminders list. These settings only control interruptions.</p>
        <Radio name="remmode" value={s.reminderMode} onChange={(v) => s.set({ reminderMode: v })} options={[
          { value: 'never', label: 'Never pop up', sub: 'Just add them to the list. Check it when you want.' },
          { value: 'daily', label: 'Once a day summary', sub: 'One notification listing what is on today.' },
          { value: 'important', label: 'Important only, plus a daily summary', sub: 'Pop up only for events you star in the Reminders list, and follow ups.' },
          { value: 'all', label: 'Every reminder', sub: 'The usual pop up for everything.' },
        ]} />
        {(s.reminderMode === 'daily' || s.reminderMode === 'important') && (
          <Row label="Summary time" htmlFor="sumtime"><input id="sumtime" type="time" value={s.summaryTime} onChange={(e) => s.set({ summaryTime: e.target.value })} /></Row>
        )}
        <Check checked={s.flashTaskbar} onChange={(v) => s.set({ flashTaskbar: v })}>Flash the taskbar icon for reminders and new mail when the app is in the background</Check>
        <h3 className="sub-head">Video meetings</h3>
        <p className="hint">For meetings that have a Teams, Zoom or Google Meet link. Choose the times in whole minutes, from the list or typed in.</p>
        <div className="min-row"><Check checked={s.meetingAlert1On} onChange={(v) => s.set({ meetingAlert1On: v })}>First notification</Check><WholeMinutes label="First notification" value={s.meetingAlert1Mins} onChange={(n) => s.set({ meetingAlert1Mins: n })} /><span>minutes before</span></div>
        <div className="min-row"><Check checked={s.meetingAlert2On} onChange={(v) => s.set({ meetingAlert2On: v })}>Second notification</Check><WholeMinutes label="Second notification" value={s.meetingAlert2Mins} onChange={(n) => s.set({ meetingAlert2Mins: n })} /><span>minutes before</span></div>
        <div className="min-row"><Check checked={s.meetingBanner} onChange={(v) => s.set({ meetingBanner: v })}>Bar over my mail, with a Join button</Check><WholeMinutes label="Bar over my mail" value={s.meetingBannerMins} onChange={(n) => s.set({ meetingBannerMins: n })} /><span>minutes before</span></div>
        <p className="hint">Windows notifications from Well Good Mail never cover your work and never need dismissing one by one.</p>
      </section>
    </>
  );
}

// ---------- notifications ----------

function NotificationsTab() {
  const s = useSettings();
  const accounts = useMail((st) => st.accounts);
  return (
    <>
      <h1>Notifications</h1>
      <section className="set-section">
        <h2>New mail</h2>
        <Radio name="newmail" value={s.newMailAlerts} onChange={(v) => s.set({ newMailAlerts: v })} options={[
          { value: 'important', label: 'Only from important senders' },
          { value: 'all', label: 'All new mail' },
          { value: 'off', label: 'Off' },
        ]} />
      </section>
      <section className="set-section">
        <h2>How alerts appear</h2>
        <p className="hint">While the app is open and in front of you:</p>
        <Radio name="appopen" value={s.appOpenAlerts} onChange={(v) => s.set({ appOpenAlerts: v })} options={[
          { value: 'banner', label: 'A small banner inside the app' },
          { value: 'windows', label: 'A Windows notification' },
          { value: 'off', label: 'Nothing' },
        ]} />
        <p className="hint" style={{ marginTop: 10 }}>When the app is minimised or in the background, new mail always uses a Windows notification. Its sound, and whether it appears at all, are set in Windows. The app plays no sounds of its own.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn" onClick={() => notify('Isla Grant', 'This is how a new email will look. You can ignore this one.')}>Test Windows notification</button>
          <button className="btn" onClick={() => showBanner({ title: 'Isla Grant', body: 'This is how a new email will look in the app.', run: () => {} , actionLabel: 'Open' })}>Test in-app banner</button>
          {isTauri() && <button className="btn" onClick={() => openExternal('ms-settings:notifications')}>Open Windows notification settings</button>}
        </div>
      </section>
      <section className="set-section">
        <h2>Per account</h2>
        {accounts.map((a) => (
          <Row key={a.id} label={a.label}>
            <select aria-label={`Alerts for ${a.email}`} value={a.notify} onChange={(e) => updateAccount(a.id, { notify: e.target.value as typeof a.notify })}>
              <option value="all">Follow the setting above</option>
              <option value="important">Important senders only</option>
              <option value="off">Never</option>
            </select>
          </Row>
        ))}
      </section>
      <section className="set-section">
        <h2>Quiet hours</h2>
        <Check checked={s.quietHours.enabled} onChange={(v) => s.set({ quietHours: { ...s.quietHours, enabled: v } })}>No notifications during quiet hours</Check>
        {s.quietHours.enabled && (
          <div className="set-row">
            <span className="label">From</span>
            <input type="time" aria-label="Quiet hours start" value={s.quietHours.from} onChange={(e) => s.set({ quietHours: { ...s.quietHours, from: e.target.value } })} />
            <span>to</span>
            <input type="time" aria-label="Quiet hours end" value={s.quietHours.to} onChange={(e) => s.set({ quietHours: { ...s.quietHours, to: e.target.value } })} />
          </div>
        )}
      </section>
    </>
  );
}

// ---------- privacy ----------

function PrivacyTab() {
  const s = useSettings();
  return (
    <>
      <h1>Images &amp; privacy</h1>
      <section className="set-section">
        <h2>Images in emails</h2>
        <Radio name="img" value={s.imagePolicy} onChange={(v) => s.set({ imagePolicy: v })} options={[
          { value: 'block', label: 'Hide images until I load them', sub: 'Recommended. Senders can\'t tell when you open their email.' },
          { value: 'known', label: 'Load images from people in my contacts' },
          { value: 'always', label: 'Always load images' },
        ]} />
        <Check checked={s.blockTrackers} onChange={(v) => s.set({ blockTrackers: v })}>Block tracking pixels, even when images are loaded</Check>
        <Check checked={s.darkEmails} onChange={(v) => s.set({ darkEmails: v })}>Show emails in dark mode when the app is dark</Check>
      </section>
      <section className="set-section">
        <h2>Trusted senders ({s.trustedSenders.length})</h2>
        <p className="hint">Images always load from these addresses.</p>
        <div className="tag-list">
          {s.trustedSenders.map((t) => <span key={t} className="chip">{t}<button aria-label={`Remove ${t}`} onClick={() => s.toggleIn('trustedSenders', t)}><Icon name="close" size={12} /></button></span>)}
          {!s.trustedSenders.length && <span style={{ color: 'var(--text-muted)' }}>None yet</span>}
        </div>
      </section>
    </>
  );
}

// ---------- offline ----------

function OfflineTab() {
  const s = useSettings();
  const accounts = useMail((st) => st.accounts);
  const count = useMail((st) => Object.keys(st.messages).length);
  const opts: { v: number | null; l: string }[] = [{ v: 90, l: '3 months' }, { v: 365, l: '1 year' }, { v: 1095, l: '3 years' }, { v: null, l: 'Everything' }];
  return (
    <>
      <h1>Search &amp; storage</h1>
      <section className="set-section">
        <h2>Moving to another computer</h2>
        <Check checked={s.syncSettings} onChange={(v) => { s.set({ syncSettings: v }); if (v) enableSettingsSync(); }}>Keep my settings the same on every computer (uses a small file in your Google Drive)</Check>
        <p className="hint">Export saves the mail kept on this PC into one file (no passwords in it). Import reads that file on another computer so it doesn't have to download everything again. Sign in to your accounts there as usual, then import: each account only fetches what's new.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => exportCache().catch((e) => toast({ text: `Export failed: ${e instanceof Error ? e.message : e}` }))}>Export mail cache...</button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            Import mail cache...
            <input type="file" accept=".wgmcache,application/gzip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCache(f).catch((err) => toast({ text: `Import failed: ${err instanceof Error ? err.message : err}` })); }} />
          </label>
        </div>
      </section>
      {isTauri() && (
        <section className="set-section">
          <h2>Back up your app keys</h2>
          <p className="hint">The Google key from the setup guide is kept in Windows Credential Manager. If you reinstall Windows or move to a new PC it is gone, and making another takes ten minutes. This saves the keys to a file you choose. It holds no mail and no sign ins, but it does hold your Google secret, so keep it somewhere private such as a password manager.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" onClick={() => exportKeys().catch((e) => toast({ text: `Backup failed: ${e instanceof Error ? e.message : e}` }))}>Back up my keys...</button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              Restore keys...
              <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importKeys(f).then((n) => { toast({ text: `${n} key${n === 1 ? '' : 's'} restored. Restart the app, then sign in to your accounts again.`, ttl: 8000 }); }).catch((err) => toast({ text: `Restore failed: ${err instanceof Error ? err.message : err}` })); }} />
            </label>
            <span className="hint" style={{ margin: 0 }}>{s.keysBackedUpAt ? `Last backed up ${new Date(s.keysBackedUpAt).toLocaleDateString('en-GB')}` : 'Not backed up yet'}</span>
          </div>
        </section>
      )}
      <section className="set-section">
        <h2>Mail kept on this computer</h2>
        <p className="hint">Mail in this window is stored on your PC for instant search and offline reading. Recent mail (about 6 weeks) is stored in full; older mail downloads when you open it. Searches also check Google's servers for anything older. {count.toLocaleString('en-GB')} emails stored now.</p>
        {accounts.map((a) => (
          <Row key={a.id} label={a.label}>
            <select aria-label={`How much mail to keep for ${a.email}`} value={String(a.retentionDays)} onChange={(e) => { updateAccount(a.id, { retentionDays: e.target.value === 'null' ? null : Number(e.target.value), syncCursor: undefined }); toast({ text: `${a.label} will resync with the new range` }); setTimeout(() => syncAccount(a.id, { full: true }), 300); }}>
              {opts.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
            </select>
          </Row>
        ))}
        <Row label="New accounts keep" htmlFor="defret">
          <select id="defret" value={String(s.defaultRetentionDays)} onChange={(e) => s.set({ defaultRetentionDays: e.target.value === 'null' ? null : Number(e.target.value) })}>
            {opts.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
          </select>
        </Row>
      </section>
      <section className="set-section">
        <h2>Checking for mail</h2>
        <Row label="Check every" htmlFor="poll">
          <select id="poll" value={s.pollSeconds} onChange={(e) => { s.set({ pollSeconds: Number(e.target.value) }); setTimeout(restartPolling); }}>
            {[15, 30, 60, 120, 300].map((n) => <option key={n} value={n}>{n < 60 ? `${n} seconds` : `${n / 60} minute${n > 60 ? 's' : ''}`}</option>)}
          </select>
        </Row>
        <p className="hint">You can also press F5 or the refresh button any time.</p>
      </section>
      <section className="set-section">
        <h2>Search tips</h2>
        <p className="hint">Type words to search everything. You can also use from:isla, to:euan, has:attachment, is:unread, is:flagged, after:2026-01-01 and before:2026-06-30.</p>
      </section>
    </>
  );
}

// ---------- templates ----------

function TemplatesTab() {
  const templates = useSettings((s) => s.templates);
  const set = useSettings((s) => s.set);
  const [editing, setEditing] = useState<string | null>(templates[0]?.id || null);
  const current = templates.find((t) => t.id === editing);
  return (
    <>
      <h1>Templates</h1>
      <section className="set-section">
        <p className="hint">Saved replies for quotes, bookings and common questions. Insert them from the template button in the toolbar while writing. Use [Name] style blanks to fill in.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {templates.map((t) => <button key={t.id} className={`btn ${t.id === editing ? 'primary' : ''}`} onClick={() => setEditing(t.id)}>{t.name}</button>)}
          <button className="btn ghost" onClick={() => { const t = { id: `tpl-${Date.now()}`, name: 'New template', html: '' }; set({ templates: [...templates, t] }); setEditing(t.id); }}><Icon name="plus" /> New</button>
        </div>
        {current && (
          <>
            <Row label="Name"><input type="text" aria-label="Template name" value={current.name} onChange={(e) => set({ templates: templates.map((t) => (t.id === current.id ? { ...t, name: e.target.value } : t)) })} /></Row>
            <SignatureEditor key={current.id} email={current.id} initial={current.html} onChange={(html) => set({ templates: useSettings.getState().templates.map((t) => (t.id === current.id ? { ...t, html } : t)) })} />
            <button className="btn ghost danger" style={{ marginTop: 10 }} onClick={() => { set({ templates: templates.filter((t) => t.id !== current.id) }); setEditing(null); }}>Delete template</button>
          </>
        )}
      </section>
    </>
  );
}

// ---------- people ----------

function PeopleTab() {
  const s = useSettings();
  const [add, setAdd] = useState('');
  const [blockAdd, setBlockAdd] = useState('');
  return (
    <>
      <h1>Important senders</h1>
      <section className="set-section">
        <p className="hint">Emails from these people get their own Important mailbox and can alert you when everything else is quiet.</p>
        <div className="tag-list">
          {s.vips.map((v) => <span key={v} className="chip">{v}<button aria-label={`Remove ${v}`} onClick={() => s.toggleIn('vips', v)}><Icon name="close" size={12} /></button></span>)}
        </div>
        <form className="set-row" onSubmit={(e) => { e.preventDefault(); if (add.includes('@')) { s.toggleIn('vips', add.trim()); setAdd(''); } }}>
          <input type="email" placeholder="name@example.com" value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add important sender" />
          <button className="btn" type="submit">Add</button>
        </form>
      </section>
      <section className="set-section">
        <h2>Blocked senders ({s.blockedSenders.length})</h2>
        <p className="hint">Emails from these addresses go straight to Junk, and never alert you. Block someone from the More menu on any of their emails.</p>
        <div className="tag-list">
          {s.blockedSenders.map((v) => <span key={v} className="chip">{v}<button aria-label={`Unblock ${v}`} onClick={() => s.toggleIn('blockedSenders', v)}><Icon name="close" size={12} /></button></span>)}
        </div>
        <form className="set-row" onSubmit={(e) => { e.preventDefault(); if (blockAdd.includes('@')) { s.toggleIn('blockedSenders', blockAdd.trim()); setBlockAdd(''); } }}>
          <input type="email" placeholder="name@example.com" value={blockAdd} onChange={(e) => setBlockAdd(e.target.value)} aria-label="Block a sender" />
          <button className="btn" type="submit">Block</button>
        </form>
      </section>
      <section className="set-section">
        <h2>Muted conversations ({s.mutedThreads.length})</h2>
        <p className="hint">New replies in muted conversations skip your inbox. Unmute from the conversation's menu.</p>
        {s.mutedThreads.length > 0 && <button className="btn ghost" onClick={() => s.set({ mutedThreads: [] })}>Unmute all</button>}
      </section>
    </>
  );
}

// ---------- shortcuts ----------

function ShortcutsTab() {
  const s = useSettings();
  const [capturing, setCapturing] = useState<{ id: string; index: number } | null>(null);
  const bindings = bindingsFor(s.keybindings);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setCapturing(null); return; }
      const combo = comboFromEvent(e);
      if (!combo) return;
      const current = [...bindingsFor(useSettings.getState().keybindings)[capturing.id as ShortcutAction]];
      current[capturing.index] = combo;
      // A combo can only belong to one action.
      const next: Record<string, string[]> = { ...useSettings.getState().keybindings, [capturing.id]: [...new Set(current)] };
      for (const def of SHORTCUTS) {
        if (def.id === capturing.id) continue;
        const theirs = bindingsFor(next)[def.id];
        if (theirs.includes(combo)) next[def.id] = theirs.filter((k) => k !== combo);
      }
      s.set({ keybindings: next });
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = (id: ShortcutAction, k: string) => s.set({ keybindings: { ...s.keybindings, [id]: bindings[id].filter((x) => x !== k) } });
  const reset = (id: ShortcutAction) => { const next = { ...s.keybindings }; delete next[id]; s.set({ keybindings: next }); };

  return (
    <>
      <h1>Keyboard shortcuts</h1>
      <section className="set-section">
        <p className="hint">Based on Apple Mail, with Ctrl in place of Cmd. Click a shortcut to change it, or Add to give an action another one. Press Escape to cancel.</p>
        <Check checked={s.shortcuts === 'gmail'} onChange={(v) => s.set({ shortcuts: v ? 'gmail' : 'none' })}>Single key shortcuts (like E to archive, J and K to move), when you're not typing</Check>
        <table className="shortcut-table">
          <tbody>
            {SHORTCUTS.map((def) => (
              <tr key={def.id}>
                <td className="sc-label">{def.label}</td>
                <td>
                  <div className="sc-keys">
                    {bindings[def.id].map((k, i) => (
                      <span key={k} className={`kbd-chip ${isSingleKey(k) && s.shortcuts !== 'gmail' ? 'off' : ''}`}>
                        <button className="kbd-key" onClick={() => setCapturing({ id: def.id, index: i })}>
                          {capturing?.id === def.id && capturing.index === i ? 'Press keys...' : k}
                        </button>
                        <button className="kbd-x" aria-label={`Remove ${k}`} onClick={() => remove(def.id, k)}><Icon name="close" size={11} /></button>
                      </span>
                    ))}
                    {capturing?.id === def.id && capturing.index === bindings[def.id].length && <span className="kbd-chip"><span className="kbd-key">Press keys...</span></span>}
                    <button className="btn ghost" onClick={() => setCapturing({ id: def.id, index: bindings[def.id].length })}>Add</button>
                    {def.id in s.keybindings && <button className="btn ghost" onClick={() => reset(def.id)}>Reset</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => s.set({ keybindings: {} })}>Reset all to defaults</button>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>While writing: Ctrl+B, I and U for bold, italic and underline, Ctrl+K for a link, Tab and Shift+Tab to indent, Ctrl+Shift+V to paste as plain text.</p>
      </section>
    </>
  );
}

// ---------- diagnostics ----------

function DiagnosticsTab() {
  const accounts = useMail((st) => st.accounts);
  const messages = useMail((st) => st.messages);
  const u = useUpdates();
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 2000); return () => clearInterval(t); }, []);
  const rows = accounts.map((a) => {
    const n = Object.values(messages).filter((m) => m.accountId === a.id).length;
    const pace = paceInfo(a.email);
    const waitS = pace?.pausedUntil ? Math.ceil((pace.pausedUntil - Date.now()) / 1000) : 0;
    return { a, n, pace, waitS, last: a.lastSync ? new Date(a.lastSync).toLocaleString('en-GB') : 'never' };
  });
  const report = () => [
    `Well Good Mail ${u.currentVersion || ''}`,
    `Emails stored: ${Object.keys(messages).length}`,
    ...rows.map((r) => `${r.a.email}: ${r.a.status}${r.a.error ? ` (${r.a.error})` : ''}, ${r.n} emails, last checked ${r.last}, request spacing ${r.pace?.gapMs ?? 'n/a'} ms${r.waitS ? `, paused ${r.waitS}s by Google` : ''}`),
  ].join('\n');
  void tick;
  return (
    <>
      <h1>Diagnostics</h1>
      <section className="set-section">
        <p className="hint">If something isn't syncing, this shows why. Google limits how fast mail can be fetched, so the app spaces its requests out and slows down further when Google pushes back.</p>
        <Row label="Version"><span>{u.currentVersion || '...'}</span></Row>
        <Row label="Emails stored"><span>{Object.keys(messages).length.toLocaleString('en-GB')}</span></Row>
      </section>
      {rows.map((r) => (
        <section className="set-section diag-section" key={r.a.id}>
          <h2>{r.a.label} <span className="hint" style={{ fontWeight: 400 }}>{r.a.email}</span></h2>
          <Row label="Status"><span>{r.a.status === 'needs-signin' ? <span className="status-bad">Needs signing in again</span> : r.a.status === 'error' ? <span className="status-bad">{r.a.error || 'Problem syncing'}</span> : r.a.status === 'syncing' ? `Syncing${r.a.syncDone ? `: ${r.a.syncDone.toLocaleString('en-GB')} emails so far` : '...'}` : <span className="status-ok">Connected</span>}</span></Row>
          <Row label="Emails stored"><span>{r.n.toLocaleString('en-GB')}</span></Row>
          <Row label="Last checked"><span>{r.last}</span></Row>
          <Row label="Request spacing"><span>{r.pace ? `${r.pace.gapMs} ms${r.pace.gapMs > 200 ? ' (slowed down)' : ''}` : 'not used yet'}{r.waitS ? `. Paused by Google for ${r.waitS} s` : ''}</span></Row>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button className="btn" onClick={() => syncAccount(r.a.id)}>Check this account now</button>
            {wantsSignIn(r.a) && <button className="btn primary" onClick={() => reconnectAccount(r.a.id)}>Sign in again</button>}
          </div>
        </section>
      ))}
      <section className="set-section">
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(report()); toast({ text: 'Report copied' }); }}>Copy report</button>
      </section>
    </>
  );
}

// ---------- updates ----------

function UpdatesTab() {
  const s = useSettings();
  const u = useUpdates();
  useEffect(() => { if (u.status === 'idle') checkForUpdates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <h1>Updates</h1>
      <section className="set-section">
        <Row label="Version"><span>{u.currentVersion || '...'}</span></Row>
        <Row label="Status">
          <span>
            {u.status === 'checking' && 'Checking...'}
            {u.status === 'none' && 'Up to date'}
            {u.status === 'available' && `Version ${u.version} is available`}
            {u.status === 'downloading' && `Downloading ${u.version}...`}
            {u.status === 'ready' && `Version ${u.version} is ready`}
            {u.status === 'error' && <span className="status-bad">Couldn't check ({u.error})</span>}
          </span>
        </Row>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => checkForUpdates({ userInitiated: true })}>Check now</button>
          {u.status === 'available' && <button className="btn primary" onClick={installFoundUpdate}>Download and restart</button>}
          {u.status === 'ready' && <button className="btn primary" onClick={restartToUpdate}>Restart to update</button>}
        </div>
        <Check checked={s.autoUpdate} onChange={(v) => s.set({ autoUpdate: v })}>Download updates in the background (installs when the app opens, or when you choose Restart)</Check>
        <Check checked={s.startWithWindows} onChange={(v) => { s.set({ startWithWindows: v }); setAutostart(v); }}>Start with Windows (sits quietly in the tray)</Check>
        <Check checked={s.closeQuits} onChange={(v) => { s.set({ closeQuits: v }); setCloseQuits(v); }}>The close button quits the app (otherwise it keeps running in the tray, so mail and reminders still arrive)</Check>
      </section>
    </>
  );
}
