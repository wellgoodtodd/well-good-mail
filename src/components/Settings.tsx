// Settings: accounts, signatures, groups, look and feel, reminders, privacy, updates.
import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Icon } from './Icon';
import { FormatBar } from './FormatBar';
import { editorExtensions, tidyForEditor, FONT_CHOICES } from './editorExtensions';
import { ColourPicker } from './ColourPicker';
import { PALETTES } from '../lib/palettes';
import { useMail, setLeaveOutOfAll, openScreen, refreshAccountPhotos, applyPalette, removeAccount, updateAccount, reconnectAccount, syncAccount, isSyncing, reorderAccounts, startDemo, leaveDemo, restartPolling, toast, restartSync, editAccount, syncWakes } from '../lib/mail';
import { useSettings, defaultSettings, type Settings as S } from '../lib/settings';
import { LEVEL_WORDS, tidy } from '../lib/mcp/permissions';
import { undoSteps } from '../lib/history';
import { allAliases } from '../lib/compose';
import type { Account } from '../lib/types';
import { useGoogleConfigured, useGoogleKeys } from '../lib/auth/google';
import { SKINS, type Skin } from '../lib/skins';
import { openGuide } from './SetupGuide';
import { IMAP_PRESETS } from '../lib/imapUtil';
import { addAccountItems } from '../lib/accountMenu';
import { exportCache, importCache } from '../lib/cacheTransfer';
import { exportKeys, importKeys } from '../lib/backup';
import { paceInfo } from '../lib/providers/gmail';
import { enableSettingsSync } from '../lib/settingsSync';
import { isTauri, setAutostart, setCloseQuits, notify, openExternal, previewsSize, clearPreviews, openPreviewsFolder, chooseFolder } from '../lib/platform';
import { showBanner } from '../lib/banners';
import { useSettingsAlerts } from '../lib/alerts';
import { useUpdates, checkForUpdates, installFoundUpdate, restartToUpdate, isBetaVersion } from '../lib/updater';
import { useMenu, Dialog, fileSize } from './ui';
import { UpdateLog } from './WhatsNew';
import { useBetaNotice, checkForBeta, wantsBetaNotices } from '../lib/betaNotice';
import { CalendarList } from './ComingUp';
import { AiConnectionTab } from './AiConnection';
import { OutOfOfficeTab } from './OutOfOffice';
import { useOoo } from '../lib/oooStore';
import { stateWords as oooStateWords, oooSupport } from '../lib/ooo';
import { SHORTCUTS, bindingsFor, comboFromEvent, isSingleKey, type ShortcutAction } from '../lib/shortcuts';

const TABS = [
  ['accounts', 'Accounts'],
  ['signatures', 'Signatures & Addresses'],
  ['groups', 'Inbox Groups'],
  ['appearance', 'Appearance'],
  ['writing', 'Composing'],
  ['ooo', 'Out of Office'],
  ['notifications', 'Notifications & Reminders'],
  ['privacy', 'Privacy'],
  ['offline', 'Search & Storage'],
  ['shortcuts', 'Keyboard Shortcuts'],
  ['access', 'Accessibility'],
  ['ai', 'AI Connection'],
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
  const ids: string[] = TABS.map(([id]) => id).filter((id) => id !== 'updates');
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
            <span className="name">{label}</span>{alerts.tabs[id] ? <span className="attn-dot" title={alerts.tabs[id]} aria-label={alerts.tabs[id]} /> : null}
          </button>
        ))}
        <div className="settings-foot">
          <button className={`side-item ${tab === 'updates' ? 'selected' : ''}`} onClick={() => useMail.setState({ settingsTab: 'updates' })}>
            <span className="name" style={{ textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Updates</span>{alerts.tabs.updates ? <span className="attn-dot" title={alerts.tabs.updates} aria-label={alerts.tabs.updates} /> : null}
          </button>
          <div className="settings-version">Version {version || '...'}</div>
        </div>
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
        {tab === 'access' && <AccessibilityTab />}
        {tab === 'ai' && <AiConnectionTab />}
        {tab === 'ooo' && <OutOfOfficeTab />}
        {tab === 'updates' && <UpdatesTab />}
        {tab === 'diagnostics' && <DiagnosticsTab />}
      </div>
    </div>
  );
}

/** An account's name: typing is instant, and it's saved (as one Undo step) after a short pause or when you leave the box. */
function AccountName({ a }: { a: Account }) {
  const [value, setValue] = useState(a.label);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setValue(a.label); }, [a.label]);
  const commit = (v: string) => { window.clearTimeout(timer.current); if (v !== a.label) editAccount(a.id, { label: v }, 'name'); };
  return (
    <input className="label-input acct-name" value={value} aria-label={`Name for ${a.email}`}
      onChange={(e) => { const v = e.target.value; setValue(v); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => commit(v), 600); }}
      onBlur={() => commit(value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
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

const RANGE_OPTS: { v: number | null; l: string }[] = [{ v: 90, l: '3 months' }, { v: 365, l: '1 year' }, { v: 1095, l: '3 years' }, { v: null, l: 'Everything' }];

/** How far back an account keeps mail on this PC. The same choice shows in Accounts and in Search & storage. */
function KeepMail({ a, compact }: { a: Account; compact?: boolean }) {
  const change = (v: number | null) => {
    const smaller = v !== null && (a.retentionDays === null || v < a.retentionDays);
    updateAccount(a.id, { retentionDays: v, syncCursor: undefined });
    toast({ text: smaller ? `${a.label} now keeps ${RANGE_OPTS.find((o) => o.v === v)?.l}. Older mail already on this PC stays, and nothing older is fetched.` : `${a.label} is fetching mail for the new range.`, ttl: 8000 });
    restartSync(a.id);
  };
  const select = (
    <select aria-label={`How much mail to keep for ${a.email}`} value={String(a.retentionDays)} onChange={(e) => change(e.target.value === 'null' ? null : Number(e.target.value))}>
      {RANGE_OPTS.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
    </select>
  );
  return compact ? <label className="keep-mail">Keep mail from {select}</label> : select;
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
  const [selId, setSelId] = useState<string | undefined>(undefined);
  const [dropOn, setDropOn] = useState<string | null>(null);
  // The account shown on the right: the one you picked, else the first that needs attention, else the first.
  const sel = sorted.find((a) => a.id === selId) || sorted.find((a) => wantsSignIn(a) || a.status === 'error') || sorted[0];
  const oooAcc = useOoo((o) => (sel ? o.byAccount[sel.id] : undefined));
  const mcp = tidy(s.mcp);
  const events = useMail((st) => st.events);
  const calNames = useMail((st) => st.calendarNames);
  const kindName = (a: Account) => (a.kind === 'gmail' ? 'Google' : a.kind === 'microsoft' ? 'Microsoft 365' : a.kind === 'demo' ? 'Demo' : IMAP_PRESETS.find((p) => p.host === a.imap?.host)?.name || 'IMAP');
  const statusWords = (a: Account) => (a.status === 'error' ? 'Problem syncing' : a.status === 'syncing' ? (a.syncDone ? `Syncing, ${a.syncDone.toLocaleString()}` : 'Syncing') : 'Connected');
  const sigLine = (a: Account) => {
    const own = a.aliases.find((x) => x.isDefault)?.email || a.email;
    const html = own in s.signatures ? s.signatures[own] : a.aliases.find((x) => x.email === own)?.providerSignatureHtml || '';
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    return text ? (text.length > 42 ? `${text.slice(0, 42)}…` : text) : 'None';
  };
  const calLine = (a: Account) => {
    const names = new Set<string>([...(calNames[a.id] || []), ...events.filter((e) => e.accountId === a.id).map((e) => e.calendarName)]);
    s.hiddenCalendars.filter((k) => k.startsWith(`${a.id}|`)).forEach((k) => names.add(k.slice(a.id.length + 1)));
    if (!names.size) return a.kind === 'imap' ? 'None (plain email account)' : 'None yet';
    const hidden = [...names].filter((n) => s.hiddenCalendars.includes(`${a.id}|${n}`)).length;
    return `${names.size - hidden} of ${names.size} shown`;
  };
  // If an account says Syncing but nothing is really syncing, check it again every few seconds until it settles.
  useEffect(() => {
    const t = setInterval(() => {
      for (const a of useMail.getState().accounts) if (a.status === 'syncing' && !isSyncing(a.id)) syncAccount(a.id, { quiet: true });
    }, 4000);
    return () => clearInterval(t);
  }, []);
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
      <section className="set-section acct-section">
        {/* Like Apple Mail: your accounts on the left, everything about the one you pick on the right. */}
        <div className="acct-md">
          <div className="acct-list" role="listbox" aria-label="Accounts">
            {sorted.map((a) => {
              const issue = wantsSignIn(a) || a.status === 'error';
              return (
                <button key={a.id} role="option" aria-selected={sel?.id === a.id} className={`acct-item ${sel?.id === a.id ? 'on' : ''} ${dropOn === a.id ? 'drop-before' : ''}`}
                  onClick={() => setSelId(a.id)} draggable title="Drag to change the order"
                  onDragStart={(e) => { e.dataTransfer.setData('text/wgm-account', a.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('text/wgm-account')) { e.preventDefault(); setDropOn(a.id); } }}
                  onDragLeave={() => setDropOn(null)}
                  onDrop={(e) => { const from = e.dataTransfer.getData('text/wgm-account'); setDropOn(null); if (!from || from === a.id) return; e.preventDefault(); const ids = sorted.map((x) => x.id).filter((x) => x !== from); ids.splice(ids.indexOf(a.id), 0, from); reorderAccounts(ids); }}>
                  <span className="dot" style={{ background: a.colour }} />
                  <span className="acct-item-name">{a.label || a.email}</span>
                  {issue && <span className="acct-warn" aria-label={wantsSignIn(a) ? 'Needs signing in' : 'Problem syncing'} title={wantsSignIn(a) ? 'Needs signing in' : 'Problem syncing'} />}
                </button>
              );
            })}
            <button className="acct-item add" onClick={(e) => addMenu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), addAccountItems())}><Icon name="plus" size={14} /> Add account</button>
          </div>
          {sel ? (
            <div className="acct-detail">
              <div className="acct-head">
                <button className="acct-avatar" style={{ background: sel.colour }} aria-label={`Colour for ${sel.email}`} title="Change colour" onClick={(e) => setPicker({ accountId: sel.id, anchor: { x: e.clientX, y: e.clientY + 12 } })}>{(sel.label || sel.email).slice(0, 1).toUpperCase()}</button>
                <div className="acct-head-text">
                  <AccountName key={sel.id} a={sel} />
                  <div className="acct-sub">{sel.email} · {kindName(sel)}</div>
                </div>
                {wantsSignIn(sel)
                  ? <button className="btn primary small" onClick={() => reconnectAccount(sel.id)}>Sign in</button>
                  : <span className={`acct-pill ${sel.status === 'error' ? 'bad' : sel.status === 'syncing' ? 'busy' : 'ok'}`} title={sel.status === 'error' ? sel.error : undefined}>{statusWords(sel)}</span>}
              </div>

              {sel.kind !== 'demo' && (
                <>
                  <div className="acct-group">Mail</div>
                  {sorted.length > 1 && (
                    <div className="acct-line">
                      <span className="k">Show in All Inboxes</span>
                      <span className="v">{sel.leaveOutOfAll ? 'Kept out' : 'Included'}</span>
                      <input type="checkbox" role="switch" className="switch" aria-label="Show in All Inboxes" checked={!sel.leaveOutOfAll} onChange={(e) => setLeaveOutOfAll(sel.id, !e.target.checked)} />
                    </div>
                  )}
                  <div className="acct-line">
                    <span className="k">Keep mail from</span>
                    <span className="v"><KeepMail a={sel} /></span>
                    <span />
                  </div>
                  <div className="acct-line">
                    <span className="k">Signature</span>
                    <span className="v">{sigLine(sel)}</span>
                    <button className="link-btn" onClick={() => openScreen('settings', 'signatures')}>Edit in Signatures</button>
                  </div>

                  <div className="acct-group">Calendar and AI</div>
                  <div className="acct-line">
                    <span className="k">Calendars</span>
                    <span className="v">{calLine(sel)}</span>
                    <button className="link-btn" onClick={() => document.getElementById('acct-calendars')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Choose</button>
                  </div>
                  <div className="acct-line">
                    <span className="k">Out of Office</span>
                    <span className="v">{oooSupport(sel).native ? (oooAcc?.needsPermission ? 'Needs one more sign in' : oooStateWords(oooAcc?.reply).words) : 'Set in its own web mail'}</span>
                    <button className="link-btn" onClick={() => openScreen('settings', 'ooo')}>Open Out of Office</button>
                  </div>
                  <div className="acct-line">
                    <span className="k">AI Connection</span>
                    <span className="v">{mcp.enabled ? LEVEL_WORDS[mcp.accounts[sel.id] ?? 'off'] : 'Switched off'}</span>
                    <button className="link-btn" onClick={() => openScreen('settings', 'ai')}>Open AI Connection</button>
                  </div>
                </>
              )}

              <div className="acct-foot">
                <span>{sel.lastSync ? `Checked ${new Date(sel.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not checked yet'} · <button className="link-btn" onClick={() => restartSync(sel.id)}>Resync</button></span>
                <button className="link-btn danger" onClick={() => setConfirm(sel.id)}>Remove account</button>
              </div>
            </div>
          ) : (
            <div className="acct-detail empty">Add an account to get started.</div>
          )}
        </div>
        <p className="hint acct-hint">Click the name to rename it and the coloured square to change its colour. Drag accounts in the list to change their order.</p>
        {!isTauri() && <p className="hint" style={{ marginTop: 10 }}>Signing in to real accounts works in the desktop app. This browser preview runs in demo mode.</p>}
        {isTauri() && !googleOn && <p className="hint" style={{ marginTop: 10 }}>Gmail isn't set up yet. The setup guide takes about 10 minutes.</p>}
        {isTauri() && (
          <details className="own-keys">
            <summary>Use your own app keys</summary>
            <p className="hint">Only needed for a different Google project, or if your organisation blocks the shared Microsoft app.</p>
          {googleOn && (
            <div className="set-card">
              <div className="tx"><strong>Google key</strong><span>Only needed if you have changed your Google Cloud project, or want to run the setup guide again. A new key means signing in to each account again.</span></div>
              <button className="btn" onClick={() => openGuide('setup')}>Set up with a different key…</button>
            </div>
        )}
          <div className="set-card">
            <div className="tx"><strong>Microsoft app ID</strong><span>Microsoft accounts sign in through a shared app that comes with Well Good Mail. Only change it if your organisation blocks it and you have registered your own.</span></div>
            <button className="btn" onClick={() => openGuide('microsoft')}>Use my own ID…</button>
          </div>
          </details>
        )}
      </section>
      {accounts.some((a) => a.kind !== 'demo') && (
        <section className="set-section" id="acct-calendars">
          <h2>Calendars</h2>
          <p className="hint">Switch calendars on or off here, or from the Calendars button on the Reminders page and in the Coming up panel. It is the same list, so they always agree.</p>
          <CalendarList variant="cards" />
          <h3 className="sub-head">Alerts from hidden calendars</h3>
          <Radio name="hidalerts" value={s.hiddenCalendarsAlerts} onChange={(v) => s.set({ hiddenCalendarsAlerts: v })} options={[
            { value: 'all', label: 'Keep all their alerts', sub: 'Hiding only tidies the views.' },
            { value: 'meetings', label: 'Mute ordinary reminders, keep video meeting alerts', sub: 'Recommended. You will not miss a call because you hid its calendar.' },
            { value: 'none', label: 'Mute everything from them', sub: 'No reminders, notifications or banner. Meetings you have said No to are always quiet.' },
          ]} />
        </section>
      )}
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
      {picker && <ColourPicker anchor={picker.anchor} value={accounts.find((x) => x.id === picker.accountId)?.colour || '#888888'} onPick={(c) => editAccount(picker.accountId, { colour: c }, 'colour')} onClose={() => setPicker(null)} />}
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
      <h1>Signatures &amp; Addresses</h1>
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
  // One section back to how it started (one Undo step).
  const resetPart = (what: string, patch: Partial<S>) => {
    s.set(patch);
    toast({ text: `${what} set back to the default.`, undo: () => void undoSteps(1) });
  };
  const d0 = defaultSettings;
  const partReset = (what: string, patch: Partial<S>) => <button className="link-btn set-reset" onClick={() => resetPart(what, patch)} title={`Set ${what.toLowerCase()} back to the default`}>Reset</button>;
  // Back to how the app first looked. One step in Undo; account colours are left as you set them.
  const resetLook = () => {
    const d = defaultSettings;
    s.set({ theme: d.theme, accent: d.accent, density: d.density, textScale: d.textScale, darkSkin: d.darkSkin, lightSkin: d.lightSkin, colourBlindAccounts: d.colourBlindAccounts, panePosition: d.panePosition, previewLines: d.previewLines, threaded: d.threaded, newestFirstInThread: d.newestFirstInThread, badges: d.badges, unreadColour: d.unreadColour, showAccountStripe: d.showAccountStripe, accountIcons: d.accountIcons, senderPhotos: d.senderPhotos, toolbarOrder: d.toolbarOrder });
    toast({ text: 'Appearance set back to the default. Account colours are unchanged.', undo: () => void undoSteps(1) });
  };
  return (
    <>
      <div className="set-title-row">
        <h1>Appearance</h1>
        <button className="btn small" onClick={resetLook} title="Theme, colours, text size, layout and counts back to how they started">Reset to defaults</button>
      </div>
      <section className="set-section">
        <div className="set-h2-row"><h2>Colour theme</h2>{partReset('Colour theme', { theme: d0.theme, accent: d0.accent, darkSkin: d0.darkSkin, lightSkin: d0.lightSkin, colourBlindAccounts: d0.colourBlindAccounts })}</div>
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
      </section>
      {/* Every colour choice in one calm card, one row each, instead of separate rows of dots across the page. */}
      <section className="set-section">
        <div className="set-h2-row"><h2>Colours</h2>{partReset('Colours', { accent: d0.accent, unreadColour: d0.unreadColour, colourBlindAccounts: d0.colourBlindAccounts, showAccountStripe: d0.showAccountStripe })}</div>
        <div className="colour-rows">
          <div className="colour-row">
            <span className="k">Accent</span>
            <span className="swatches">
              {['#3B82F6', '#0A84FF', '#EEC32A', '#1EAB8F', '#A855F7', '#EF4444'].map((c) => (
                <button key={c} className={`swatch ${s.accent.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} aria-label={`Accent ${c}`} onClick={() => s.set({ accent: c })} />
              ))}
              <input type="color" aria-label="Your own accent colour" title="Your own colour" value={s.accent} onChange={(e) => s.set({ accent: e.target.value })} />
            </span>
          </div>
          <div className="colour-row">
            <span className="k">Account colours</span>
            <span className="swatches">
              <select aria-label="Account colour palette" value={palette} onChange={(e) => applyPalette(e.target.value)}>
                {!PALETTES.some((p) => p.id === palette) && <option value={palette}>Your own colours</option>}
                {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <span className="chips-preview">{[...accounts].sort((a, b) => a.order - b.order).slice(0, 8).map((a) => <span key={a.id} title={a.label} style={{ background: a.colour }} />)}</span>
            </span>
          </div>
          <div className="colour-row">
            <span className="k">Unread dot</span>
            <span className="swatches">
              {['', '#3B82F6', '#E5484D', '#1EAB8F', '#EEC32A'].map((c) => (
                <button key={c || 'accent'} className={`swatch ${s.unreadColour === c ? 'on' : ''}`} style={{ background: c || s.accent }} aria-label={c ? `Unread colour ${c}` : 'Same as accent'} title={c ? c : 'Same as accent colour'} onClick={() => s.set({ unreadColour: c })} />
              ))}
            </span>
          </div>
        </div>
        <p className="hint">Click any account's dot in the sidebar, or its square in Settings, Accounts, to give it its own colour.</p>
        <Check checked={s.colourBlindAccounts} onChange={(v) => { s.set({ colourBlindAccounts: v }); applyPalette(v ? 'accessible' : `skin-${activeId}`); }}>Colour blind friendly account colours (works with any theme)</Check>
        <Check checked={stripe} onChange={(v) => useSettings.getState().set({ showAccountStripe: v })}>Show the account colour stripe on each email</Check>
      </section>
      <section className="set-section">
        <div className="set-h2-row"><h2>Display</h2>{partReset('Display', { theme: d0.theme, textScale: d0.textScale, density: d0.density })}</div>
        <Row label="Theme">
          <Radio name="theme" value={s.theme} onChange={(v) => s.set({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Follow Windows' }]} />
        </Row>
        <Row label="Text size" htmlFor="scale">
          <TextSizeSlider id="scale" />
        </Row>
        <Row label="List spacing">
          <Radio name="density" value={s.density} onChange={(v) => s.set({ density: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        </Row>
      </section>
      <section className="set-section">
        <div className="set-h2-row"><h2>Unread counts</h2>{partReset('Unread counts', { badges: d0.badges })}</div>
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
      </section>
      <section className="set-section">
        <div className="set-h2-row"><h2>Pictures</h2>{partReset('Pictures', { accountIcons: d0.accountIcons, senderPhotos: d0.senderPhotos })}</div>
        <Check checked={s.accountIcons} onChange={(v) => { s.set({ accountIcons: v }); if (v) refreshAccountPhotos(); }}>Use each Google account's profile picture in the sidebar instead of its coloured dot</Check>
        <Check checked={s.senderPhotos} onChange={(v) => s.set({ senderPhotos: v })}>Show a small photo or initials beside each message in the list</Check>
      </section>
      <section className="set-section">
        <div className="set-h2-row"><h2>Layout</h2>{partReset('Layout', { panePosition: d0.panePosition, previewLines: d0.previewLines, threaded: d0.threaded, newestFirstInThread: d0.newestFirstInThread, sidebarVisible: d0.sidebarVisible, toolbarOrder: d0.toolbarOrder })}</div>
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
      <h1>Composing</h1>
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
        <Row label="Scheduled email when the app is closed" htmlFor="wake">
          <select id="wake" value={s.wakeToSend ? 'wake' : 'wait'} onChange={(e) => { s.set({ wakeToSend: e.target.value === 'wake' }); syncWakes(); }}>
            <option value="wake">Start Well Good Mail and send it (wakes the PC from sleep)</option>
            <option value="wait">Wait until Well Good Mail is open</option>
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

const MINUTE_CHOICES = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180];
const timeLabel = (n: number) => (n >= 120 && n % 60 === 0 ? `${n / 60} hours` : `${n} ${n === 1 ? 'minute' : 'minutes'}`);

/** A time before a meeting. Pick from the list, or type a number and choose minutes or hours. The list opens upwards when it would run off the bottom of the window. */
function MinutesPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [unit, setUnit] = useState<'minutes' | 'hours'>(value >= 120 && value % 60 === 0 ? 'hours' : 'minutes');
  const per = unit === 'hours' ? 60 : 1;
  const top = unit === 'hours' ? 3 : 180;
  const show = (n: number) => String(Math.max(1, Math.round(n / per)));
  const [text, setText] = useState(show(value));
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setText(show(value)), [value, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  });
  const choices = unit === 'hours' ? [60, 120, 180] : MINUTE_CHOICES;
  const shown = typed && text ? choices.filter((n) => String(n / per).startsWith(text)) : choices;
  const openList = () => {
    const r = box.current?.getBoundingClientRect();
    if (r) { const below = window.innerHeight - r.bottom; setUp(below < 280 && r.top > below); }
    setOpen(true);
  };
  const close = () => { setOpen(false); setTyped(false); const n = Number(text); if (!(Number.isInteger(n) && n >= 1 && n <= top)) setText(show(value)); };
  const pick = (n: number) => { if (n >= 120 && n % 60 === 0) setUnit('hours'); else if (unit === 'hours' && n < 120) setUnit('minutes'); onChange(n); setText(show(n)); setOpen(false); setTyped(false); };
  const changeUnit = (u: 'minutes' | 'hours') => {
    setUnit(u);
    if (u === 'hours') onChange(Math.min(3, Math.max(1, Math.round(value / 60))) * 60);
  };
  return (
    <>
      <div className="mins-box" ref={box}>
        <input
          className="mins-input" type="text" inputMode="numeric" role="combobox" aria-expanded={open} aria-label={`${label}: time before`} aria-autocomplete="list"
          value={text}
          onFocus={(e) => { openList(); e.target.select(); }}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setText(v); setTyped(true); openList(); setActive(0); const n = Number(v); if (v && n >= 1 && n <= top) onChange(n * per); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); openList(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (open && shown[active] !== undefined && typed) pick(shown[active]); else close(); }
            else if (e.key === 'Escape') close();
          }}
        />
        <button type="button" className="mins-arrow" tabIndex={-1} aria-label="Show common times" onClick={() => { setTyped(false); if (open) setOpen(false); else openList(); }}><Icon name="chevronDown" size={14} /></button>
        {open && (
          <ul className={`mins-list ${up ? 'up' : ''}`} role="listbox" aria-label="Time before the meeting">
            {shown.length === 0 && <li className="none">No match. Up to {top} {unit} is fine.</li>}
            {shown.map((n, i) => (
              <li key={n} role="option" aria-selected={n === value} className={`${n === value ? 'sel' : ''} ${typed && i === active ? 'act' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(n); }}>{timeLabel(n)}</li>
            ))}
            <li className="none">Or type a number, up to {top} {unit}</li>
          </ul>
        )}
      </div>
      <select className="mins-unit" aria-label={`${label}: minutes or hours`} value={unit} onChange={(e) => changeUnit(e.target.value as 'minutes' | 'hours')}>
        <option value="minutes">{Number(text) === 1 && unit === 'minutes' ? 'minute' : 'minutes'}</option>
        <option value="hours">{Number(text) === 1 && unit === 'hours' ? 'hour' : 'hours'}</option>
      </select>
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
        <h3 className="sub-head">Video meeting notifications</h3>
        <p className="hint">For events that have a Teams, Zoom or Google Meet link. Pick a time from the list, or type your own number of minutes. Other events use the reminder time set in your calendar.</p>
        <div className="min-grid"><div className="min-row"><Check checked={s.meetingAlert1On} onChange={(v) => s.set({ meetingAlert1On: v })}>First notification</Check><MinutesPicker label="First notification" value={s.meetingAlert1Mins} onChange={(n) => s.set({ meetingAlert1Mins: n })} /><span>before</span></div>
        <div className="min-row"><Check checked={s.meetingAlert2On} onChange={(v) => s.set({ meetingAlert2On: v })}>Second notification</Check><MinutesPicker label="Second notification" value={s.meetingAlert2Mins} onChange={(n) => s.set({ meetingAlert2Mins: n })} /><span>before</span></div>
        <div className="min-row"><Check checked={s.meetingBanner} onChange={(v) => s.set({ meetingBanner: v })}>Banner in the app, with a Join button</Check><MinutesPicker label="Banner in the app" value={s.meetingBannerMins} onChange={(n) => s.set({ meetingBannerMins: n })} /><span>before</span></div></div>
        <p className="hint">A <strong>notification</strong> is the Windows pop up. The <strong>banner</strong> is the bar across the top of the app. The banner turns amber as the meeting starts, then coral, and goes by itself 10 minutes after the start. Meetings you have said No to don't alert you.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => notify('Test meeting in 5 minutes', `${new Date(Date.now() + 5 * 60000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · Google Meet link in Well Good Mail`)}>Test notification</button>
          <button className="btn" onClick={() => window.dispatchEvent(new Event('wgm-test-meeting-bar'))}>Test banner</button>
        </div>
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
        <h2>Suggested events</h2>
        <Check checked={s.suggestEvents} onChange={(v) => s.set({ suggestEvents: v })}>Offer to add dates and times from emails to my calendar</Check>
        <p className="hint" style={{ margin: '4px 0 0' }}>Only for emails from people (not newsletters or receipts), and only when there's a clear day and time. Read on this computer, with no AI. Nothing is added unless you click.{s.suggestMuted.length > 0 && <> {s.suggestMuted.length} sender{s.suggestMuted.length === 1 ? '' : 's'} never suggested: <button className="link-btn" onClick={() => s.set({ suggestMuted: [] })}>Allow again</button></>}</p>
      </section>
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
          <button className="btn" onClick={() => notify('Isla Grant', 'This is how a new email will look. You can ignore this one.')}>Test notification</button>
          <button className="btn" onClick={() => showBanner({ title: 'Isla Grant', body: 'This is how a new email will look in the app.', run: () => {} , actionLabel: 'Open' })}>Test banner</button>
          {isTauri() && <button className="btn" onClick={() => openExternal('ms-settings:notifications')}>Open Windows notification settings</button>}
        </div>
      </section>
      <section className="set-section">
        <h2>Per account</h2>
        {accounts.map((a) => (
          <Row key={a.id} label={a.label}>
            <select aria-label={`Alerts for ${a.email}`} value={a.notify} onChange={(e) => editAccount(a.id, { notify: e.target.value as typeof a.notify }, 'alerts')}>
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

/** The one text size setting, shown in both Appearance and Accessibility: moving either moves the other. */
function TextSizeSlider({ id }: { id: string }) {
  const scale = useSettings((st) => st.textScale) || 1;
  const pct = Math.round(scale * 100);
  return (
    <>
      <input id={id} type="range" min={0.85} max={1.3} step={0.05} value={scale} aria-valuetext={`${pct}%`} onChange={(e) => useSettings.getState().set({ textScale: Number(e.target.value) })} />
      <span>{pct}%</span>
    </>
  );
}

function AccessibilityTab() {
  const s = useSettings();
  return (
    <>
      <h1>Accessibility</h1>
      <section className="set-section">
        <h2>Seeing</h2>
        <Row label="Text size" htmlFor="scale-a11y">
          <TextSizeSlider id="scale-a11y" />
        </Row>
        <Row label="Keyboard focus" htmlFor="focusring">
          <select id="focusring" value={s.focusRing} onChange={(e) => s.set({ focusRing: e.target.value as 'standard' | 'bold' })}>
            <option value="standard">Standard ring</option>
            <option value="bold">Bold ring, easier to spot</option>
          </select>
        </Row>
        <p className="hint" style={{ margin: '4px 0 0' }}>Windows high contrast themes (Settings, Accessibility, Contrast themes) are followed, with selected rows and buttons outlined.</p>
      </section>
      <section className="set-section">
        <h2>Motion</h2>
        <Radio name="motion" value={s.motion} onChange={(v) => s.set({ motion: v })} options={[
          { value: 'system', label: 'Follow Windows', sub: 'Uses "Animation effects" in Windows Settings, Accessibility, Visual effects.' },
          { value: 'reduce', label: 'Keep things still', sub: 'No sliding, fading or pulsing anywhere in the app.' },
        ]} />
      </section>
      <section className="set-section">
        <h2>Keyboard and Narrator</h2>
        <p className="hint" style={{ margin: 0 }}>Everything works from the keyboard: Tab and Shift+Tab move between controls, the arrow keys move through lists, Enter opens and Escape closes. Every button and box has a name that Windows Narrator reads out.</p>
        <div style={{ marginTop: 10 }}><button className="btn" onClick={() => useMail.setState({ settingsTab: 'shortcuts' })}>Keyboard Shortcuts</button></div>
      </section>
    </>
  );
}

function AttachmentsSection() {
  const folder = useSettings((st) => st.downloadFolder);
  const [size, setSize] = useState<{ bytes: number; files: number } | null>(null);
  const load = () => { void previewsSize().then(setSize).catch(() => setSize(null)); };
  useEffect(load, []);
  const pick = async () => { const d = await chooseFolder('Choose where attachments are saved'); if (d) useSettings.getState().set({ downloadFolder: d }); };
  return (
    <section className="set-section">
      <h2>Attachments</h2>
      <div className="set-row">
        <label htmlFor="dlfolder">Save attachments to</label>
        <select id="dlfolder" value={folder ? 'folder' : 'ask'} onChange={(e) => { if (e.target.value === 'ask') useSettings.getState().set({ downloadFolder: '' }); else void pick(); }}>
          <option value="ask">Ask each time</option>
          <option value="folder">{folder ? folder : 'Choose a folder...'}</option>
        </select>
        {folder && <button className="link-btn" onClick={pick}>Change</button>}
      </div>
      <p className="hint">Files that can't be previewed here (like Word, Excel or Pages) open straight away in their own app, from a private Previews folder. Changes you make there aren't saved back to the email: use Save to keep a copy. Programs and scripts are never opened straight from an email.</p>
      {isTauri() && (
        <div className="set-row">
          <span className="label">Previews</span>
          <span className="v">{size ? (size.files ? `${fileSize(size.bytes)} in ${size.files} file${size.files === 1 ? '' : 's'}` : 'Empty') : '...'}</span>
          <button className="btn" onClick={() => void openPreviewsFolder()}>Open folder</button>
          <button className="btn" disabled={!size?.files} onClick={async () => { await clearPreviews(); load(); toast({ text: 'Previews cleared.' }); }}>Clear previews</button>
        </div>
      )}
      {isTauri() && <p className="hint" style={{ marginBottom: 0 }}>Previews older than 30 days are cleared by themselves.</p>}
    </section>
  );
}

function OfflineTab() {
  const s = useSettings();
  const accounts = useMail((st) => st.accounts);
  const count = useMail((st) => Object.keys(st.messages).length);
  const opts = RANGE_OPTS;
  return (
    <>
      <h1>Search &amp; Storage</h1>
      <AttachmentsSection />
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
            <KeepMail a={a} />
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
      <h1>Keyboard Shortcuts</h1>
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
  const beta = useBetaNotice();
  const onBeta = isBetaVersion(u.currentVersion);
  useEffect(() => { if (u.status === 'idle') checkForUpdates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (u.currentVersion) checkForBeta(u.currentVersion); }, [u.currentVersion, s.testVersionNotices]);
  return (
    <>
      <h1>Updates</h1>
      <section className="set-section">
        <Row label="Version"><span>{u.currentVersion || '...'}</span></Row>
        <Row label="Status">
          <span>
            {u.status === 'checking' && 'Checking...'}
            {u.status === 'none' && `${onBeta ? (beta.found ? 'A newer test version is out' : beta.status === 'done' && beta.checkedAt ? 'This is the latest test version' : 'No newer full release') : 'Up to date'}${u.checkedAt ? ` (checked ${new Date(u.checkedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})` : ''}`}
            {u.status === 'available' && `Version ${u.version} is available`}
            {u.status === 'downloading' && `Downloading ${u.version}...`}
            {u.status === 'ready' && `Version ${u.version} is ready`}
            {u.status === 'error' && <span className="status-bad">Couldn't check ({u.error})</span>}
          </span>
        </Row>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => { checkForUpdates({ userInitiated: true }); checkForBeta(u.currentVersion, { force: true }); }}>Check now</button>
          {u.status === 'available' && <button className="btn primary" onClick={installFoundUpdate}>Download and restart</button>}
          {u.status === 'ready' && <button className="btn primary" onClick={restartToUpdate}>Restart to update</button>}
        </div>
        {wantsBetaNotices(u.currentVersion) && beta.found && (
          <div className={`beta-card ${onBeta ? 'prominent' : ''}`} role="status">
            <div><strong>{onBeta ? `A newer test version is out: ${beta.found.version}` : `A test version is available: ${beta.found.version}`}</strong><span>{onBeta ? 'It does not install by itself. Read what changed, then download it if you want it.' : 'Optional. You stay on the live version, which only updates to the next full release, unless you download this yourself.'}</span></div>
            <div className="beta-actions"><button className="btn" onClick={() => openExternal(beta.found!.notesUrl)}>What's new in it</button><button className="btn" onClick={() => openExternal(beta.found!.downloadUrl)}>Download</button></div>
          </div>
        )}
        <Check checked={s.autoUpdate} onChange={(v) => s.set({ autoUpdate: v })}>Download updates in the background (installs when the app opens, or when you choose Restart)</Check>
        <Check checked={onBeta || s.testVersionNotices} onChange={(v) => { if (!onBeta) s.set({ testVersionNotices: v }); }}>Tell me about test versions{onBeta ? ' (always on while you are on a test version)' : ''}</Check>
      </section>
      <section className="set-section">
        <h2>Startup and window</h2>
        <Check checked={s.startWithWindows} onChange={(v) => { s.set({ startWithWindows: v }); setAutostart(v); }}>Start with Windows (sits quietly in the tray)</Check>
        <Check checked={s.closeQuits} onChange={(v) => { s.set({ closeQuits: v }); setCloseQuits(v); }}>The close button quits the app (otherwise it keeps running in the tray, so mail and reminders still arrive)</Check>
      </section>
      <UpdateLog />
      <p className="hint" style={{ marginTop: 18 }}>© 2026 Well Good Media Ltd. Free and open source under the MIT licence. <button className="link-btn" onClick={() => openExternal('https://github.com/wellgoodtodd/well-good-mail/blob/main/LICENSE')}>Read the licence</button></p>
    </>
  );
}
