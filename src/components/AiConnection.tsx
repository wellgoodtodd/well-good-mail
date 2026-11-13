// Settings › AI Connection. Once set up it stays compact: the main switch, the connected apps, each account's
// level (with its own settings only where you want them), what it can do, and Activity folded away. Setting up a
// new AI app happens in a pop-up checklist. Only a person in the app can change any of this, never the connection.
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useDialogFocus, useMenu, type MenuItem } from './ui';
import { useMail, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { useTasks, startTasks, defaultList } from '../lib/tasks';
import type { Account, TaskList } from '../lib/types';
import { invoke, isTauri } from '../lib/platform';
import { CAPABILITIES, IDLE_CHOICES, NEVER, LEVEL_WORDS, effectiveMode, tidy, type AccountLevel, type McpSettings, type Mode } from '../lib/mcp/permissions';
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

/** True when this account has its own setting for a switch that isn't what every account gets. */
export const differs = (mcp: McpSettings, accountId: string, capabilityId: string) => {
  const own = mcp.overrides[accountId]?.[capabilityId];
  return own !== undefined && own !== mcp.modes[capabilityId];
};

const listWords = (l: TaskList | undefined, accounts: Account[]) => {
  if (!l) return 'none yet';
  const a = accounts.find((x) => x.id === l.accountId);
  return a ? `${l.name}, ${a.label || a.email}` : l.name;
};
const groupName = (id: string) => (id ? useSettings.getState().calendarGroups.find((g) => g.id === id)?.name : undefined);

/** Where AI apps' tasks go, in words, for the Add tasks row. The same setting as Settings › Calendar & Reminders › Tasks. */
export function taskTargetWords(target: string, accounts: Account[]): string {
  if (target === 'ask') return 'Ask each time';
  if (target.startsWith('group:')) {
    const id = target.slice(6);
    const name = groupName(id);
    return `${name ? `${name}'s default` : 'The default list'} (${listWords(defaultList(id), accounts)})`;
  }
  const l = useTasks.getState().lists.find((x) => x.id === target);
  return l ? listWords(l, accounts) : `The default list (${listWords(defaultList(''), accounts)})`;
}

/** The choices for the Add tasks row: ask, a group's default list, or any list, account by account in the Accounts order. */
function taskTargetItems(target: string, pick: (v: string) => void, accounts: Account[]): MenuItem[] {
  const lists = useTasks.getState().lists;
  const groups = [{ id: '', name: 'All calendars' }, ...useSettings.getState().calendarGroups];
  const ordered = [...accounts].sort((a, b) => a.order - b.order).filter((a) => lists.some((l) => l.accountId === a.id));
  return [
    { label: 'Ask each time', active: target === 'ask', onClick: () => pick('ask') },
    { divider: true },
    { heading: 'Default list of a group' },
    ...groups.map((g) => ({ label: `${g.id ? g.name : 'All calendars'} (${defaultList(g.id)?.name || 'none yet'})`, active: target === `group:${g.id}`, onClick: () => pick(`group:${g.id}`) })),
    ...(ordered.length ? [{ divider: true }, { heading: 'A list' } as MenuItem] : []),
    ...ordered.map((a) => ({
      label: a.label || a.email, dot: a.colour, active: lists.some((l) => l.accountId === a.id && l.id === target),
      submenu: lists.filter((l) => l.accountId === a.id).map((l) => ({ label: l.name, active: l.id === target, onClick: () => pick(l.id) })),
    })),
  ];
}

/** Each AI app's own mark, small like an app icon. Drawn here so nothing is fetched. */
export function AppLogo({ id, letter }: { id: AppId | 'add'; letter?: string }) {
  const tile = (bg: string, child: ReactNode, extra?: string) => <span className={`ai-logo ${extra || ''}`} style={{ background: bg }} aria-hidden="true">{child}</span>;
  // Claude's sparkle: rays of different lengths round a centre.
  const sparkle = (colour: string) => (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <g stroke={colour} strokeWidth="2.6" strokeLinecap="round">
        {[0, 45, 90, 135, 180, 225, 270, 315, 22, 202, 112, 292].map((deg, i) => <line key={deg} x1="12" y1="12" x2="12" y2={i < 8 ? (i % 2 ? 4.5 : 2.5) : 5.5} transform={`rotate(${deg} 12 12)`} />)}
      </g>
    </svg>
  );
  switch (id) {
    case 'claude-desktop': return tile('#D97757', sparkle('#FCF2EE'));
    case 'claude-code': return tile('#1F1E1D', <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#E08A6A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 7 5 5-5 5" /><path d="M13 17h6" /></svg>);
    case 'codex': return tile('#0D0D0D', (
      // ChatGPT's knot: six rounded links turning round the centre.
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="1.7">
        {[0, 60, 120].map((deg) => <ellipse key={deg} cx="12" cy="12" rx="8.5" ry="4" transform={`rotate(${deg} 12 12)`} />)}
      </svg>
    ));
    case 'gemini': return tile('#fff', (
      <svg viewBox="0 0 24 24" width="15" height="15">
        <defs><linearGradient id="ai-gemini" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#1C7DFF" /><stop offset="0.55" stopColor="#7B6CF6" /><stop offset="1" stopColor="#E66F8B" /></linearGradient></defs>
        <path d="M12 2c.6 5.3 4.7 9.4 10 10-5.3.6-9.4 4.7-10 10-.6-5.3-4.7-9.4-10-10 5.3-.6 9.4-4.7 10-10Z" fill="url(#ai-gemini)" />
      </svg>
    ), 'light');
    case 'add': return tile('transparent', <Icon name="plus" size={12} />, 'add');
    default: return tile('var(--bg-subtle)', <span className="ai-logo-letter">{(letter || 'A').slice(0, 1).toUpperCase()}</span>, 'plain');
  }
}

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
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  const [testing, setTesting] = useState<AppId | null>(null);
  const aiTaskTarget = useSettings((s) => s.aiTaskTarget);
  useTasks((x) => x.lists); // the Add tasks "Into" words name a list, so follow the lists as they load
  useSettings((s) => s.taskDefaults);
  useSettings((s) => s.calendarGroups);
  useEffect(() => { if (mcp.enabled) startTasks(); }, [mcp.enabled]);
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
  // The same overrides the account's own AI page uses (Settings › Accounts), so changing either changes both.
  // Picking the same as every account clears the account's own setting, as it does there.
  const setOverride = (accountId: string, capability: string, mode: Mode | undefined) => {
    const own = { ...(mcp.overrides[accountId] || {}) };
    if (mode === undefined || mode === mcp.modes[capability]) delete own[capability]; else own[capability] = mode;
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
              <AppLogo id={a.id} letter={a.id === 'other' ? activity.client : undefined} />
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
          <AppLogo id="add" />
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
          const level = mcp.accounts[a.id] ?? 'off';
          // How many switches this account has set its own way (the fold-out rows under "What it can do").
          const changed = caps.filter((c) => (level === 'write' || c.group === 'read') && differs(mcp, a.id, c.id)).length;
          return (
            <div key={a.id} className="ai-acc">
              <div className="ai-row">
                <span className="dot" style={{ background: a.colour, width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flex: 'none' }} />
                <div className="grow"><span>{a.label || a.email}</span><small>{level !== 'off' && changed ? `${a.email}. Set differently for ${changed} ${changed === 1 ? 'switch' : 'switches'} below` : a.email}</small></div>
                <Segmented<AccountLevel> label={`AI access for ${a.email}`} value={level} onChange={(v) => save({ accounts: { ...mcp.accounts, [a.id]: v } })} options={LEVELS} />
              </div>
            </div>
          );
        })}
      </section>

      <section className="set-section">
        <h2>What it can do</h2>
        <p className="hint">Each switch is for every shared account. Open a switch with its arrow to set it for each account. Writing applies only to accounts set to Read and write. Ask means it asks you each time. Tidying, invitations and sending come later, each with its own switch.</p>
        {(() => {
          // One row to set every switch at once. Allow only goes as far as each switch allows, so sending still asks.
          // A switch that can only go to Ask (Out of Office, sending) counts as "as far as it can go" when the rest are Allow.
          const upTo = (v: Mode, max: Mode): Mode => (v === 'allow' && max !== 'allow' ? 'ask' : v);
          const all = (['off', 'ask', 'allow'] as Mode[]).find((v) => caps.every((c) => mcp.modes[c.id] === upTo(v, c.max)));
          return (
            <div className="ai-row ai-all">
              <div className="grow"><strong>All switches</strong><small>{all ? `All set to ${all === 'off' ? 'Off' : all === 'ask' ? 'Ask' : 'Allow, as far as each one can go'}` : 'Mixed. Set them all at once, then change any below.'}</small></div>
              <Segmented<Mode> label="Set every switch" value={all} options={modeOptions('allow')} onChange={(v) => save({ modes: { ...mcp.modes, ...Object.fromEntries(caps.map((c) => [c.id, upTo(v, c.max)])) } })} />
            </div>
          );
        })()}
        {GROUPS.filter((g) => caps.some((c) => c.group === g.id)).map((g) => [
          <div key={g.id} className="ai-group">{g.label}</div>,
          ...caps.filter((c) => c.group === g.id).map((c) => {
            const open = unfolded.has(c.id);
            // Accounts that can use this switch at all: shared, and Read and write for anything beyond looking.
            const usable = (a: (typeof ordered)[number]) => { const l = mcp.accounts[a.id] ?? 'off'; return l === 'write' || (l === 'read' && c.group === 'read'); };
            const different = ordered.filter((a) => usable(a) && differs(mcp, a.id, c.id));
            const fold = () => setUnfolded((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
            return (
              <div key={c.id} className={`ai-cap ${open ? 'open' : ''}`}>
                <div className="ai-row">
                  <button className="icon-btn ai-fold" aria-expanded={open} aria-label={open ? `Close ${c.label} for each account` : `Set ${c.label} for each account`} disabled={!ordered.length} onClick={fold}><Icon name="chevronDown" size={14} /></button>
                  <div className="grow">
                    <span className="ai-cap-name" onClick={ordered.length ? fold : undefined}>{c.label}</span>
                    {c.id === 'organise.task' ? <small>Into: <button className="link-btn ai-into" aria-label="Where tasks from AI apps go" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), taskTargetItems(aiTaskTarget, (v) => set({ aiTaskTarget: v }), accounts))}>{taskTargetWords(aiTaskTarget, accounts)} <Icon name="chevronDown" size={11} /></button></small> : <small>{c.description}</small>}
                  </div>
                  <div className="ai-cap-right">
                    <Segmented<Mode> label={c.label} value={mcp.modes[c.id]} onChange={(v) => save({ modes: { ...mcp.modes, [c.id]: v } })} options={modeOptions(c.max)} />
                    {different.length > 0 && <button className="ai-flag" title={different.map((a) => `${a.label || a.email}: ${MODE_WORDS[effectiveMode(mcp, c.id, a.id)]}`).join(', ')} onClick={() => { if (!open) fold(); }}>▲ {different.length} {different.length === 1 ? 'account' : 'accounts'} set differently</button>}
                  </div>
                </div>
                {open && (
                  <div className="ai-per">
                    {ordered.map((a) => {
                      const level = mcp.accounts[a.id] ?? 'off';
                      const name = a.label || a.email;
                      if (!usable(a)) return (
                        <div key={a.id} className="ai-per-row off">
                          <span className="dot" style={{ background: a.colour }} />
                          <span className="grow"><span>{name}</span><small>{level === 'off' ? 'Off under Accounts' : 'Read only under Accounts'}</small></span>
                        </div>
                      );
                      const own = differs(mcp, a.id, c.id);
                      return (
                        <div key={a.id} className={`ai-per-row ${own ? 'diff' : ''}`}>
                          <span className="dot" style={{ background: a.colour }} />
                          <span className="grow"><span>{name}</span></span>
                          {own ? <button className="link-btn ai-same" onClick={() => setOverride(a.id, c.id, undefined)}>Reset</button> : <small className="ai-same">Same as all</small>}
                          <Segmented<Mode> label={`${c.label} for ${name}`} value={effectiveMode(mcp, c.id, a.id)} onChange={(v) => setOverride(a.id, c.id, v)} options={modeOptions(c.max)} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })])}
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
