// Settings, AI connection: the main switch, adding it to an AI app, each account's level, what it may look at,
// and the activity log. Only a person in the app can change any of this, never the connection itself.
import { useEffect, useState, type ReactNode } from 'react';
import { useMail, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { invoke, isTauri } from '../lib/platform';
import { CAPABILITIES, NEVER, LEVEL_WORDS, tidy, type AccountLevel, type Mode } from '../lib/mcp/permissions';
import { READY, TOOLS } from '../lib/mcp/tools';
import { setupText } from '../lib/mcp/server';
import { useActivity, clearActivity } from '../lib/mcp/activity';

type AppId = Parameters<typeof setupText>[0];

/** `auto`: the app can add itself to that AI app's settings, keeping everything else there. `steps`: doing it by hand. */
const APPS: { id: AppId; label: string; auto: boolean; steps: string[] }[] = [
  { id: 'claude-desktop', label: 'Claude Desktop', auto: true, steps: [
    'Click Copy.',
    'In Claude Desktop, open Settings, then Developer, then Edit config. This opens claude_desktop_config.json.',
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

export function AiConnectionTab() {
  const raw = useSettings((s) => s.mcp);
  const set = useSettings((s) => s.set);
  const accounts = useMail((s) => s.accounts);
  const activity = useActivity();
  const mcp = tidy(raw);
  const [app, setApp] = useState<AppId>('claude-desktop');
  const [text, setText] = useState('');
  const [installed, setInstalled] = useState<boolean | undefined>();
  const [busy, setBusy] = useState(false);
  const save = (patch: Partial<typeof mcp>) => set({ mcp: tidy({ ...mcp, ...patch }) });
  const ordered = [...accounts].filter((a) => a.kind !== 'demo').sort((a, b) => a.order - b.order);
  const levels = ordered.map((a) => mcp.accounts[a.id] ?? 'off');
  const allLevel = levels.length && levels.every((l) => l === levels[0]) ? levels[0] : undefined;
  const readCaps = CAPABILITIES.filter((c) => c.group === 'read' && TOOLS.some((t) => READY.has(t.name) && t.capability === c.id));
  const chosen = APPS.find((a) => a.id === app)!;
  const [copied, setCopied] = useState(false);
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text?: string }>({ state: 'idle' });
  const anyShared = ordered.some((a) => (mcp.accounts[a.id] ?? 'off') !== 'off');
  const added = chosen.auto ? Boolean(installed) : copied;
  const runTest = async () => {
    setTest({ state: 'running' });
    try { setTest({ state: 'ok', text: await invoke<string>('mcp_self_test') }); } catch (e) { setTest({ state: 'fail', text: e instanceof Error ? e.message : String(e) }); }
  };
  // Check itself once the connection is on, so the person sees it working before opening their AI app.
  useEffect(() => { if (mcp.enabled && isTauri() && test.state === 'idle') void runTest(); }, [mcp.enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!mcp.enabled) setTest({ state: 'idle' }); }, [mcp.enabled]);
  /** Questions to try, from a simple look to one that needs your yes. */
  const TRIES: { q: string; note: string }[] = [
    { q: 'What accounts can you see in Well Good Mail, and what is the newest email in each?', note: 'Lists your shared accounts and searches each one.' },
    { q: 'Find my most recent emails about invoices or quotes in Well Good Mail.', note: 'A search across shared accounts.' },
    { q: 'Open the newest email in my inbox in Well Good Mail and summarise it.', note: 'Reading a whole email is set to Ask, so Well Good Mail comes to the front and asks you first. Try Refuse once too.' },
  ];
  const restartWord = app === 'claude-code' ? 'Start a new Claude Code session' : `Restart ${chosen.label}`;
  const steps: { title: string; detail: string; done: boolean; action?: ReactNode; extra?: ReactNode }[] = [
    { title: 'Switch the connection on', detail: mcp.enabled ? 'On. Only apps on this computer can use it.' : 'Use the switch at the top of this page.', done: mcp.enabled },
    { title: 'Share at least one account', detail: anyShared ? 'Done. You can change each account below.' : 'Set an account to Read only below.', done: anyShared },
    {
      title: chosen.auto ? `Add it to ${chosen.label}` : `Copy the setup into ${chosen.label}`,
      detail: chosen.auto ? (installed ? 'Added. Your other settings there were kept, and a copy was saved.' : 'Adds Well Good Mail to its list of tools and keeps everything else there.') : 'Copy the setup below and follow the steps.',
      done: added,
      action: chosen.auto
        ? <span className="ai-actions"><button className={installed ? 'btn ghost small' : 'btn primary small'} disabled={busy || !isTauri()} onClick={() => install(false)}>{installed ? 'Add again' : 'Add'}</button>{installed && <button className="btn ghost small" disabled={busy} onClick={() => install(true)}>Take it out</button>}</span>
        : <button className="btn small" onClick={() => void copy()}>Copy</button>,
    },
    {
      title: 'Well Good Mail checks itself',
      detail: test.state === 'running' ? 'Checking...' : test.state === 'ok' ? (test.text || 'Working.') : test.state === 'fail' ? (test.text || 'Not working yet.') : 'Starts the connection the way your AI app will, and checks it answers.',
      done: test.state === 'ok',
      action: <button className="btn small" disabled={!mcp.enabled || test.state === 'running' || !isTauri()} onClick={runTest}>{test.state === 'idle' ? 'Test' : 'Test again'}</button>,
    },
    { title: restartWord, detail: activity.lastHello ? `Connected${activity.client ? `: ${activity.client}` : ''}, ${new Date(activity.lastHello).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'Quit it fully (from the tray too) and open it again. This ticks when it says hello.', done: Boolean(activity.lastHello) },
    {
      title: 'Ask it something',
      detail: activity.lastCall ? `Its last request was at ${new Date(activity.lastCall).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. Everything it does is listed under Activity. More to try:` : 'This ticks when it makes its first request. Copy one of these into your AI app:',
      done: Boolean(activity.lastCall),
      extra: <span className="ai-tries">{TRIES.map((t) => <span key={t.q} className="ai-question"><span className="grow"><span>"{t.q}"</span><small>{t.note}</small></span><button className="btn small" onClick={() => { void navigator.clipboard?.writeText(t.q).then(() => toast({ text: 'Copied. Paste it into your AI app.', ttl: 2500 })); }}>Copy</button></span>)}</span>,
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  useEffect(() => { void setupText(app).then(setText); }, [app]);

  useEffect(() => {
    setInstalled(undefined);
    if (chosen.auto && isTauri()) invoke<boolean>('mcp_installed', { kind: app }).then(setInstalled).catch(() => setInstalled(undefined));
  }, [app]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    const t = text || (await setupText(app));
    try { await navigator.clipboard.writeText(t); setCopied(true); toast({ text: `Copied the setup for ${chosen.label}`, ttl: 2500 }); } catch { toast({ text: 'Select the text below and copy it', ttl: 4000 }); }
  };
  const install = async (remove: boolean) => {
    setBusy(true);
    try {
      const msg = await invoke<string>('mcp_install', { kind: app, remove });
      toast({ text: msg, ttl: 8000 });
      setInstalled(!remove);
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), ttl: 12000 });
    } finally { setBusy(false); }
  };

  return (
    <>
      <h1>AI connection</h1>
      <section className="set-section">
        <div className="ai-row">
          <div className="grow"><strong>Let AI apps use Well Good Mail</strong><span className="hint">Off until you switch it on. Only apps on this computer can connect, and only to the accounts you choose below. Switching it off cuts every connection at once.</span></div>
          <input type="checkbox" role="switch" className="switch" aria-label="Let AI apps use Well Good Mail" checked={mcp.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        </div>
        {mcp.enabled && (
          <p className={activity.connected ? 'ai-status on' : 'ai-status'}>
            {activity.connected ? `Connected${activity.client ? `: ${activity.client}` : ''}${activity.lastCall ? `. Last request ${new Date(activity.lastCall).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Waiting for an AI app to connect'}
          </p>
        )}
        {!isTauri() && <p className="hint">The connection works in the desktop app, not in this browser preview.</p>}
      </section>

      <section className="set-section">
        <h2>Connect your AI app</h2>
        <div className="ai-row" style={{ flexWrap: 'wrap' }}>
          <select aria-label="Which AI app" value={app} onChange={(e) => setApp(e.target.value as AppId)}>
            {APPS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <span className="hint" style={{ margin: 0 }}>Each step ticks itself when it happens.</span>
        </div>
        <ol className="ai-check">
          {steps.map((s, i) => (
            <li key={s.title} className={s.done ? 'done' : i === current ? 'now' : 'wait'}>
              <span className="tick" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
              <div className="grow">
                <span>{s.title}</span>
                <small>{s.detail}</small>
                {s.extra}
              </div>
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
      </section>

      <section className="set-section">
        <h2>Accounts</h2>
        <p className="hint">Off: the AI can't see the account. Read only: it can search and read for context, and changes nothing. Read and write: it follows the switches below; anything that reaches other people always asks you first. New accounts start Off.</p>
        {ordered.length === 0 && <p className="hint">Add an account first.</p>}
        {ordered.length > 1 && (
          <div className="ai-row ai-all">
            <span className="ai-dot-space" aria-hidden="true" />
            <div className="grow"><strong>All accounts</strong><small>{allLevel ? `All set to ${LEVEL_WORDS[allLevel]}` : 'Mixed. Set them all at once, then change any below.'}</small></div>
            <Segmented<AccountLevel> label="AI access for all accounts" value={allLevel} options={LEVELS}
              onChange={(v) => save({ accounts: { ...mcp.accounts, ...Object.fromEntries(ordered.map((a) => [a.id, v])) } })} />
          </div>
        )}
        {ordered.map((a) => (
          <div key={a.id} className="ai-row">
            <span className="dot" style={{ background: a.colour, width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flex: 'none' }} />
            <div className="grow"><span>{a.label || a.email}</span><small>{a.email}</small></div>
            <Segmented<AccountLevel> label={`AI access for ${a.email}`} value={mcp.accounts[a.id] ?? 'off'} onChange={(v) => save({ accounts: { ...mcp.accounts, [a.id]: v } })} options={LEVELS} />
          </div>
        ))}
      </section>

      <section className="set-section">
        <h2>What it can look at</h2>
        <p className="hint">This first version can only look. Writing drafts, tidying and answering invitations come in later versions, each with its own switch. Ask means the app shows you what it wants each time.</p>
        {readCaps.map((c) => (
          <div key={c.id} className="ai-row">
            <div className="grow"><span>{c.label}</span><small>{c.description}</small></div>
            <Segmented<Mode> label={c.label} value={mcp.modes[c.id]} onChange={(v) => save({ modes: { ...mcp.modes, [c.id]: v } })}
              options={[{ value: 'off', label: 'Off' }, { value: 'ask', label: 'Ask' }, { value: 'allow', label: 'Allow', disabled: c.max !== 'allow' }]} />
          </div>
        ))}
        <details className="ai-never">
          <summary>Never possible, whatever the switches say</summary>
          <ul>{NEVER.map((n) => <li key={n.id}>{n.text}</li>)}</ul>
        </details>
      </section>

      <section className="set-section">
        <div className="ai-row"><h2 className="grow" style={{ margin: 0 }}>Activity</h2>{activity.entries.length > 0 && <button className="btn ghost small" onClick={clearActivity}>Clear</button>}</div>
        {activity.entries.length === 0 ? <p className="hint">Nothing yet. Everything the AI does shows here, newest first.</p> : (
          <ul className="ai-log">
            {activity.entries.slice(0, 50).map((e, i) => (
              <li key={i} className={e.outcome}><time>{new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time><span>{e.text}{e.outcome === 'refused' ? ' (refused)' : e.outcome === 'failed' ? ' (failed)' : ''}</span></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
