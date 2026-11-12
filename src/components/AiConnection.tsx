// Settings › AI Connection. Once set up it stays compact: the main switch, the connected apps, each account's
// level (with its own settings only where you want them), what it can do, and Activity folded away. Setting up a
// new AI app happens in a pop-up checklist. Only a person in the app can change any of this, never the connection.
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useDialogFocus, useMenu } from './ui';
import { useMail, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { invoke, isTauri } from '../lib/platform';
import { CAPABILITIES, IDLE_CHOICES, NEVER, LEVEL_WORDS, effectiveMode, tidy, type AccountLevel, type Mode } from '../lib/mcp/permissions';
import { READY, TOOLS } from '../lib/mcp/tools';
import { setupText, pauseMcp, resumeMcp } from '../lib/mcp/server';
import { useActivity, clearActivity } from '../lib/mcp/activity';
import { groupColour, nextGroupColour, moveGroup, DRAFTS_LABEL } from '../lib/mcp/aiDrafts';
import { groupItems, newGroup } from './AiDrafts';

type AppId = Parameters<typeof setupText>[0];

/** `auto`: the app can add itself to that AI app's settings, keeping everything else there. `steps`: doing it by hand. */
const APPS: { id: AppId; label: string; auto: boolean; steps: string[] }[] = [
  { id: 'claude-desktop', label: 'Claude Desktop', auto: true, steps: [
    'Click Copy.',
    'In Claude Desktop, open Settings › Developer › Edit config. This opens claude_desktop_config.json.',
    'If the file is empty, paste it all in. If it already has settings, add the "mcpServers" part after the first {, followed by a comma. If it already has "mcpServers", add only the "well-good-mail" part inside it.',
    'Save, quit Claude Desktop fully (from the tray too) and open it again.',
  ] },
  { id: 'claude-code', label: 'Claude Code', auto: true, steps: [
    'Click Copy.',
    'Open a terminal (PowerShell or Windows Terminal), paste and press Enter.',
    'Start Claude Code and type /mcp to check Well Good Mail is listed.',
  ] },
  { id: 'codex', label: 'ChatGPT desktop', auto: true, steps: [
    'Click Copy.',
    'Open config.toml in the .codex folder in your user folder (make the file if it is not there).',
    'Paste at the end of the file, save, and restart ChatGPT. Not yet tried with Well Good Mail.',
  ] },
  { id: 'gemini', label: 'Gemini CLI', auto: true, steps: [
    'Click Copy.',
    'Open settings.json in the .gemini folder in your user folder.',
    'Add the "well-good-mail" part inside "mcpServers" (or the whole "mcpServers" part if there is none), save, and restart Gemini CLI. Not yet tried with Well Good Mail.',
  ] },
  { id: 'other', label: 'Another app', auto: false, steps: [
    'Click Copy.',
    'In your AI app\'s tool or MCP settings, add a new local tool (it may be called stdio or command) and paste this as its command.',
    'Restart the AI app.',
  ] },
];

/** The plain name an app uses when it says hello, for matching it to its row. */
const HELLO_NAME: Record<AppId, string> = { 'claude-desktop': 'Claude Desktop', 'claude-code': 'Claude Code', codex: 'ChatGPT', gemini: 'Gemini', other: '' };

/** Questions to try, from a simple look to one that needs your yes. */
const TRIES: { q: string; note: string }[] = [
  { q: 'What accounts can you see in Well Good Mail, and what is the newest email in each?', note: 'Lists your shared accounts and searches each one.' },
  { q: 'Find my most recent emails about invoices or quotes in Well Good Mail.', note: 'A search across shared accounts.' },
  { q: 'Open the newest email in my inbox in Well Good Mail and summarise it.', note: 'Reading a whole email is set to Ask, so Well Good Mail comes to the front and asks you first. Try Refuse once too.' },
];

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const idleWords = (m: number) => (m === 0 ? 'Never' : m < 60 ? `After ${m} minutes` : m === 60 ? 'After 1 hour' : `After ${m / 60} hours`);

function Segmented<T extends string>({ value, options, onChange, label }: { value: T | undefined; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg ai-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} disabled={o.disabled} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

const LEVELS = (['off', 'read', 'write'] as AccountLevel[]).map((v) => ({ value: v, label: LEVEL_WORDS[v] }));
/** Headings for the switches, in the order they show. */
const GROUPS: { id: string; label: string }[] = [
  { id: 'read', label: 'Looking' },
  { id: 'organise', label: 'Writing and tidying' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'send', label: 'Reaches other people' },
];
/** Switches for what the AI can actually do so far. */
const readyCaps = () => CAPABILITIES.filter((c) => TOOLS.some((t) => READY.has(t.name) && t.capability === c.id));

const MODE_WORDS: Record<Mode, string> = { off: 'off', ask: 'asks', allow: 'allowed' };
const modeOptions = (max: Mode) => [{ value: 'off' as Mode, label: 'Off' }, { value: 'ask' as Mode, label: 'Ask' }, { value: 'allow' as Mode, label: 'Allow', disabled: max !== 'allow' }];

/** The pop-up that walks you through connecting one AI app, ticking itself as each step happens. */
function SetupDialog({ initial, onClose, onChanged }: { initial: AppId; onClose: () => void; onChanged: () => void }) {
  const focusRef = useDialogFocus();
  const raw = useSettings((s) => s.mcp);
  const set = useSettings((s) => s.set);
  const accounts = useMail((s) => s.accounts);
  const activity = useActivity();
  const mcp = tidy(raw);
  const [app, setApp] = useState<AppId>(initial);
  const [text, setText] = useState('');
  const [installed, setInstalled] = useState<boolean | undefined>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text?: string }>({ state: 'idle' });
  const [openedAt] = useState(Date.now());
  const chosen = APPS.find((a) => a.id === app)!;
  const anyShared = accounts.some((a) => a.kind !== 'demo' && (mcp.accounts[a.id] ?? 'off') !== 'off');
  const added = chosen.auto ? Boolean(installed) : copied;
  const hello = activity.lastHello && (!HELLO_NAME[app] || activity.client === HELLO_NAME[app]) ? activity.lastHello : undefined;
  const runTest = async () => {
    setTest({ state: 'running' });
    try { setTest({ state: 'ok', text: await invoke<string>('mcp_self_test') }); } catch (e) { setTest({ state: 'fail', text: e instanceof Error ? e.message : String(e) }); }
  };
  useEffect(() => { void setupText(app).then(setText); setCopied(false); }, [app]);
  useEffect(() => {
    setInstalled(undefined);
    if (chosen.auto && isTauri()) invoke<boolean>('mcp_installed', { kind: app }).then(setInstalled).catch(() => setInstalled(undefined));
  }, [app]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mcp.enabled && isTauri() && test.state === 'idle') void runTest(); }, [mcp.enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const copy = async () => {
    const t = text || (await setupText(app));
    try { await navigator.clipboard.writeText(t); setCopied(true); toast({ text: `Copied the setup for ${chosen.label}`, ttl: 2500 }); } catch { toast({ text: 'Select the text below and copy it', ttl: 4000 }); }
  };
  const install = async (remove: boolean) => {
    setBusy(true);
    try {
      toast({ text: await invoke<string>('mcp_install', { kind: app, remove }), ttl: 8000 });
      setInstalled(!remove);
      onChanged();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), ttl: 12000 });
    } finally { setBusy(false); }
  };

  const steps: { title: string; detail: string; done: boolean; action?: ReactNode; extra?: ReactNode }[] = [
    {
      title: 'Switch the connection on and share an account',
      detail: mcp.enabled && anyShared ? 'Done.' : !mcp.enabled ? 'Switch it on here.' : 'Set at least one account to Read only on the AI Connection page.',
      done: mcp.enabled && anyShared,
      action: !mcp.enabled ? <button className="btn small primary" onClick={() => set({ mcp: tidy({ ...mcp, enabled: true }) })}>Switch on</button> : undefined,
    },
    {
      title: chosen.auto ? `Add it to ${chosen.label}` : `Copy the setup into ${chosen.label}`,
      detail: chosen.auto ? (installed ? 'Added. Your other settings there were kept, and a copy was saved.' : 'Adds Well Good Mail to its list of tools and keeps everything else there.') : 'Copy the setup below and follow the steps.',
      done: added,
      action: chosen.auto
        ? <button className={installed ? 'btn small' : 'btn primary small'} disabled={busy || !isTauri()} onClick={() => install(false)}>{installed ? 'Add again' : 'Add'}</button>
        : <button className="btn small" onClick={() => void copy()}>Copy</button>,
    },
    {
      title: 'Well Good Mail checks itself',
      detail: test.state === 'running' ? 'Checking...' : test.state === 'ok' ? (test.text || 'Working.') : test.state === 'fail' ? (test.text || 'Not working yet.') : 'Starts the connection the way your AI app will, and checks it answers.',
      done: test.state === 'ok',
      action: <button className="btn small" disabled={!mcp.enabled || test.state === 'running' || !isTauri()} onClick={runTest}>{test.state === 'idle' ? 'Test' : 'Test again'}</button>,
    },
    {
      title: app === 'claude-code' ? 'Start a new Claude Code session' : `Restart ${chosen.label}`,
      detail: hello ? `Connected at ${timeOf(hello)}.` : 'Quit it fully (from the tray too) and open it again. This ticks when it says hello.',
      done: Boolean(hello),
    },
    {
      title: 'Ask it something',
      detail: activity.lastCall && activity.lastCall > openedAt ? `Working. Its last request was at ${timeOf(activity.lastCall)}.` : 'This ticks when it makes its first request. Copy one of these into it:',
      done: Boolean(activity.lastCall && activity.lastCall > openedAt),
      extra: <span className="ai-tries">{TRIES.map((t) => <span key={t.q} className="ai-question"><span className="grow"><span>"{t.q}"</span><small>{t.note}</small></span><button className="btn small" onClick={() => { void navigator.clipboard?.writeText(t.q).then(() => toast({ text: 'Copied. Paste it into your AI app.', ttl: 2500 })); }}>Copy</button></span>)}</span>,
    },
  ];
  const current = steps.findIndex((s) => !s.done);
  const allDone = current === -1;

  return (
    <div className="ev-scrim" onClick={onClose}>
      <div className="ev-pop ai-setup-pop" role="dialog" aria-modal="true" aria-label={`Connect ${chosen.label}`} ref={focusRef} onClick={(e) => e.stopPropagation()}>
        <div className="ev-head">
          <h2>Connect {chosen.label}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div className="ai-row" style={{ borderTop: 0 }}>
          <select aria-label="Which AI app" value={app} onChange={(e) => setApp(e.target.value as AppId)}>
            {APPS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <span className="hint" style={{ margin: 0 }}>Each step ticks itself when it happens.</span>
        </div>
        <ol className="ai-check">
          {steps.map((s, i) => (
            <li key={s.title} className={s.done ? 'done' : i === current ? 'now' : 'wait'}>
              <span className="tick" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
              <div className="grow"><span>{s.title}</span><small>{s.detail}</small>{s.extra}</div>
              {s.action}
            </li>
          ))}
        </ol>
        <details className="ai-code" open={!chosen.auto}>
          <summary>{chosen.auto ? 'Add it by hand instead' : 'How to add it'}</summary>
          <div className="ai-code-head"><span>The setup for {chosen.label}</span><button className="btn small" onClick={copy}>Copy</button></div>
          <pre className="ai-setup">{text || '...'}</pre>
          <ol className="ai-steps">{chosen.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </details>
        <div className="ev-actions" style={{ justifyContent: 'flex-end' }}>
          {allDone ? <button className="btn primary" onClick={onClose}>Done, it's connected</button> : <button className="btn" onClick={onClose}>Finish later</button>}
        </div>
      </div>
    </div>
  );
}

export function AiConnectionTab() {
  const raw = useSettings((s) => s.mcp);
  const set = useSettings((s) => s.set);
  const accounts = useMail((s) => s.accounts);
  const activity = useActivity();
  const mcp = tidy(raw);
  const menu = useMenu();
  const [setup, setSetup] = useState<AppId | null>(null);
  const [installed, setInstalled] = useState<Partial<Record<AppId, boolean>>>({});
  const [customising, setCustomising] = useState<string | null>(null);
  const [testing, setTesting] = useState<AppId | null>(null);
  const save = (patch: Partial<typeof mcp>) => set({ mcp: tidy({ ...mcp, ...patch }) });
  const ordered = [...accounts].filter((a) => a.kind !== 'demo').sort((a, b) => a.order - b.order);
  const levels = ordered.map((a) => mcp.accounts[a.id] ?? 'off');
  const allLevel = levels.length && levels.every((l) => l === levels[0]) ? levels[0] : undefined;
  const caps = readyCaps();
  const unseen = activity.entries.length - (activity.seen ?? activity.entries.length);
  const groups = useSettings((s) => s.draftGroups) || [];
  const signOff = useSettings((s) => s.draftSignOff) || '';

  const loadInstalled = () => {
    if (!isTauri()) return;
    for (const a of APPS.filter((x) => x.auto)) invoke<boolean>('mcp_installed', { kind: a.id }).then((v) => setInstalled((s) => ({ ...s, [a.id]: v }))).catch(() => undefined);
  };
  useEffect(loadInstalled, []);

  // Apps that are set up: added automatically, or seen saying hello.
  const connectedApps = APPS.filter((a) => installed[a.id] || (HELLO_NAME[a.id] && activity.client === HELLO_NAME[a.id]));
  const testApp = async (id: AppId) => {
    setTesting(id);
    try { toast({ text: await invoke<string>('mcp_self_test'), ttl: 5000 }); } catch (e) { toast({ text: e instanceof Error ? e.message : String(e), ttl: 10000 }); } finally { setTesting(null); }
  };
  const takeOut = async (id: AppId) => {
    try { toast({ text: await invoke<string>('mcp_install', { kind: id, remove: true }), ttl: 8000 }); loadInstalled(); } catch (e) { toast({ text: e instanceof Error ? e.message : String(e), ttl: 10000 }); }
  };
  const setOverride = (accountId: string, capability: string, mode: Mode | undefined) => {
    const own = { ...(mcp.overrides[accountId] || {}) };
    if (mode === undefined) delete own[capability]; else own[capability] = mode;
    save({ overrides: { ...mcp.overrides, [accountId]: own } });
  };

  return (
    <>
      <h1>AI Connection</h1>
      <section className="set-section">
        <div className="ai-row">
          <div className="grow"><strong>Let AI apps use Well Good Mail</strong><span className="hint">Off until you switch it on. Only apps on this computer can connect, and only to the accounts you choose. Switching it off cuts every connection at once.</span></div>
          <input type="checkbox" role="switch" className="switch" aria-label="Let AI apps use Well Good Mail" checked={mcp.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        </div>
        {mcp.enabled && (
          <>
            <div className="ai-row">
              <div className="grow">
                <span className={activity.paused ? 'ai-status' : activity.connected ? 'ai-status on' : 'ai-status'}>
                  {activity.paused ? 'Paused. The next request asks you to resume.' : activity.connected ? `Connected${activity.client ? `: ${activity.client}` : ''}${activity.lastCall ? `. Last request ${timeOf(activity.lastCall)}` : ''}` : 'On, waiting for an AI app to connect'}
                </span>
              </div>
              {activity.paused ? <button className="btn small" onClick={() => resumeMcp()}>Resume</button> : <button className="btn small" onClick={() => pauseMcp()}>Pause</button>}
            </div>
            <div className="ai-row">
              <div className="grow"><span>Pause when not in use</span><small>When nothing has asked for a while. The next request asks you to resume, so an unexpected one is easy to spot.</small></div>
              <select aria-label="Pause when not in use" value={mcp.idleMinutes} onChange={(e) => save({ idleMinutes: Number(e.target.value), noPauseUntil: undefined })}>
                {IDLE_CHOICES.map((m) => <option key={m} value={m}>{idleWords(m)}</option>)}
              </select>
            </div>
          </>
        )}
        {!isTauri() && <p className="hint">The connection works in the desktop app, not in this browser preview.</p>}
      </section>

      <section className="set-section">
        <h2>Connected AI apps</h2>
        {connectedApps.map((a) => {
          const live = activity.connected > 0 && activity.client === HELLO_NAME[a.id];
          return (
            <div key={a.id} className="ai-row">
              <span className={`ai-dot ${live ? 'on' : ''}`} aria-hidden="true" />
              <div className="grow"><span>{a.label}</span><small>{live ? `Connected${activity.lastCall ? `. Last request ${timeOf(activity.lastCall)}` : ''}` : activity.client === HELLO_NAME[a.id] && activity.lastHello ? `Added. Last connected ${new Date(activity.lastHello).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Added. Not used yet'}</small></div>
              <button className="btn small" disabled={!mcp.enabled || testing !== null || !isTauri()} onClick={() => void testApp(a.id)}>{testing === a.id ? 'Testing...' : 'Test'}</button>
              <button className="icon-btn" aria-label={`More for ${a.label}`} onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), [
                { label: 'Run setup again', icon: 'refresh', onClick: () => setSetup(a.id) },
                ...(installed[a.id] ? [{ label: `Take it out of ${a.label}`, icon: 'trash' as const, onClick: () => void takeOut(a.id) }] : []),
              ], 'right')}><Icon name="more" /></button>
            </div>
          );
        })}
        <div className="ai-row">
          <span className="ai-dot add" aria-hidden="true" />
          <div className="grow"><span>{connectedApps.length ? 'Connect another AI app' : 'Connect an AI app'}</span><small>Claude Desktop, Claude Code, ChatGPT desktop, Gemini CLI or another app.</small></div>
          <button className={connectedApps.length ? 'btn small' : 'btn primary small'} onClick={() => setSetup(connectedApps.length ? (APPS.find((a) => !connectedApps.includes(a))?.id || 'other') : 'claude-desktop')}>Set up</button>
        </div>
      </section>

      <section className="set-section">
        <h2>Accounts</h2>
        <p className="hint">Off: the AI can't see the account. Read only: it can search and read, and changes nothing. Read and write: it can do what the switches below allow; anything that reaches other people always asks you first. New accounts start Off.</p>
        {ordered.length === 0 && <p className="hint">Add an account first.</p>}
        {ordered.length > 1 && (
          <div className="ai-row ai-all">
            <span className="ai-dot-space" aria-hidden="true" />
            <div className="grow"><strong>All accounts</strong><small>{allLevel ? `All set to ${LEVEL_WORDS[allLevel]}` : 'Mixed. Set them all at once, then change any below.'}</small></div>
            <Segmented<AccountLevel> label="AI access for all accounts" value={allLevel} options={LEVELS}
              onChange={(v) => save({ accounts: { ...mcp.accounts, ...Object.fromEntries(ordered.map((a) => [a.id, v])) } })} />
          </div>
        )}
        {ordered.map((a) => {
          const own = mcp.overrides[a.id] || {};
          const level = mcp.accounts[a.id] ?? 'off';
          const mine = caps.filter((c) => level === 'write' || c.group === 'read');
          const changed = mine.filter((c) => own[c.id] !== undefined);
          const open = customising === a.id;
          return (
            <div key={a.id} className="ai-acc">
              <div className="ai-row">
                <span className="dot" style={{ background: a.colour, width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flex: 'none' }} />
                <div className="grow"><span>{a.label || a.email}</span><small>{changed.length ? `Customised: ${changed.map((c) => `${c.label.toLowerCase()} ${own[c.id] === 'allow' ? 'allowed' : own[c.id] === 'ask' ? 'asks' : 'off'}`).join(', ')}` : a.email}</small></div>
                {(mcp.accounts[a.id] ?? 'off') !== 'off' && <button className="link-btn ai-customise" aria-expanded={open} onClick={() => setCustomising(open ? null : a.id)}>{open ? 'Done' : changed.length ? 'Edit' : 'Customise'}</button>}
                <Segmented<AccountLevel> label={`AI access for ${a.email}`} value={mcp.accounts[a.id] ?? 'off'} onChange={(v) => save({ accounts: { ...mcp.accounts, [a.id]: v } })} options={LEVELS} />
              </div>
              {open && (
                <div className="ai-own">
                  <p className="hint" style={{ margin: '0 0 4px' }}>Only what you change here is different for {a.label || a.email}. Everything else follows "What it can do".</p>
                  {GROUPS.filter((g) => mine.some((c) => c.group === g.id)).map((g) => [
                    <div key={g.id} className="ai-group">{g.label}</div>,
                    ...mine.filter((c) => c.group === g.id).map((c) => (
                    <div key={c.id} className="ai-row">
                      <div className="grow"><span className={own[c.id] === undefined ? 'muted' : ''}>{c.label}</span></div>
                      {own[c.id] === undefined ? <small className="muted ai-same">Same as all</small> : <button className="link-btn ai-same" onClick={() => setOverride(a.id, c.id, undefined)}>Reset</button>}
                      <Segmented<Mode> label={`${c.label} for ${a.email}`} value={effectiveMode(mcp, c.id, a.id)} onChange={(v) => setOverride(a.id, c.id, v)} options={modeOptions(c.max)} />
                    </div>
                  ))])}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="set-section">
        <h2>What it can do</h2>
        <p className="hint">For every shared account, unless you customise one above. Writing applies only to accounts set to Read and write. Ask means it asks you each time. Tidying, invitations and sending come later, each with its own switch.</p>
        {(() => {
          // One row to set every switch at once. Allow only goes as far as each switch allows, so sending still asks.
          const values = new Set(caps.map((c) => mcp.modes[c.id]));
          const all = values.size === 1 ? [...values][0] : undefined;
          return (
            <div className="ai-row ai-all">
              <div className="grow"><strong>All switches</strong><small>{all ? `All set to ${all === 'off' ? 'Off' : all === 'ask' ? 'Ask' : 'Allow, as far as each one can go'}` : 'Mixed. Set them all at once, then change any below.'}</small></div>
              <Segmented<Mode> label="Set every switch" value={all} options={modeOptions('allow')} onChange={(v) => save({ modes: { ...mcp.modes, ...Object.fromEntries(caps.map((c) => [c.id, v])) } })} />
            </div>
          );
        })()}
        {GROUPS.filter((g) => caps.some((c) => c.group === g.id)).map((g) => [
          <div key={g.id} className="ai-group">{g.label}</div>,
          ...caps.filter((c) => c.group === g.id).map((c) => (
          <div key={c.id} className="ai-row">
            <div className="grow"><span>{c.label}</span><small>{c.description}</small>
              {(() => {
                // Say so when an account follows its own setting, so this switch never looks like it is being ignored.
                const own = ordered.filter((a) => (mcp.accounts[a.id] ?? 'off') !== 'off' && mcp.overrides[a.id]?.[c.id] !== undefined && mcp.overrides[a.id][c.id] !== mcp.modes[c.id]);
                return own.length ? <small className="ai-differs">Except {own.map((a) => `${a.label || a.email} (${MODE_WORDS[mcp.overrides[a.id][c.id]]})`).join(', ')}, set under Accounts</small> : null;
              })()}
            </div>
            <Segmented<Mode> label={c.label} value={mcp.modes[c.id]} onChange={(v) => save({ modes: { ...mcp.modes, [c.id]: v } })} options={modeOptions(c.max)} />
          </div>
        ))])}
        <details className="ai-never">
          <summary>Never possible, whatever the switches say</summary>
          <ul>{NEVER.map((n) => <li key={n.id}>{n.text}</li>)}</ul>
        </details>
      </section>

      <section className="set-section">
        <h2>Drafting</h2>
        <p className="hint">Sent to every AI app with its drafting rules. Your signature is always added when a draft is sent.</p>
        <div className="ai-row">
          <span className="ai-dot-space" aria-hidden="true" />
          <div className="grow"><span>Sign-off</span><small>How drafts end, on their own line before your signature. Leave it empty to let the AI choose.</small></div>
          <input className="label-input ai-signoff" aria-label="Sign-off for drafts" placeholder="All the best," value={signOff} maxLength={40} onChange={(e) => set({ draftSignOff: e.target.value })} />
        </div>
        <div className="ai-group">Draft groups</div>
        {groups.map((g, i) => (
          <div key={g.id} className="ai-row">
            <button className="ai-dot ai-dot-btn" style={{ background: groupColour(g) }} aria-label={`Change colour for ${g.name}`} title="Change colour" onClick={() => nextGroupColour(g.id)} />
            <div className="grow"><span>{g.name}</span><small>Gmail label: {DRAFTS_LABEL}/{g.name}</small></div>
            <button className="icon-btn" aria-label={`Move ${g.name} up`} disabled={i === 0} onClick={() => moveGroup(g.id, -1)}><Icon name="chevronDown" className="rot180" /></button>
            <button className="icon-btn" aria-label={`Move ${g.name} down`} disabled={i === groups.length - 1} onClick={() => moveGroup(g.id, 1)}><Icon name="chevronDown" /></button>
            <button className="icon-btn" aria-label={`More for ${g.name}`} onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), groupItems(g.id, g.name), 'right')}><Icon name="more" /></button>
          </div>
        ))}
        <div className="ai-row">
          <span className="ai-dot add" aria-hidden="true" />
          <div className="grow"><span>New group</span><small>Groups show as chips on AI Drafts and in the sidebar, and become Gmail labels.</small></div>
          <button className="btn small" onClick={() => void newGroup()}>Add</button>
        </div>
      </section>

      <section className="set-section">
        <details className="ai-activity" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) useActivity.setState({ seen: activity.entries.length }); }}>
          <summary>
            <Icon name="chevronDown" size={14} className="ai-chev" />
            <strong>Activity</strong>
            <span className="hint" style={{ margin: 0 }}>{activity.entries.length ? `${activity.entries.length} ${activity.entries.length === 1 ? 'entry' : 'entries'}, last ${new Date(activity.entries[0].at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Nothing yet'}</span>
            {unseen > 0 && <span className="ai-new" aria-label={`${unseen} new`}>{unseen} new</span>}
          </summary>
          {activity.entries.length === 0 ? <p className="hint">Everything an AI app does shows here, newest first.</p> : (
            <>
              <ul className="ai-log">
                {activity.entries.slice(0, 100).map((e, i) => (
                  <li key={i} className={e.outcome}>
                    <time>{new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                    {e.app && <span className="ai-log-app">{e.app}</span>}
                    <span>{e.text}{e.outcome === 'refused' ? ' (refused)' : e.outcome === 'failed' ? ' (failed)' : ''}</span>
                  </li>
                ))}
              </ul>
              <button className="btn small" onClick={clearActivity}>Clear</button>
            </>
          )}
        </details>
      </section>

      {setup && <SetupDialog initial={setup} onClose={() => { setSetup(null); loadInstalled(); }} onChanged={loadInstalled} />}
      {menu.node}
    </>
  );
}
