// Settings, AI connection: the main switch, adding it to an AI app, each account's level, what it may look at,
// and the activity log. Only a person in the app can change any of this, never the connection itself.
import { useEffect, useState } from 'react';
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

  useEffect(() => { void setupText(app).then(setText); }, [app]);

  useEffect(() => {
    setInstalled(undefined);
    if (chosen.auto && isTauri()) invoke<boolean>('mcp_installed', { kind: app }).then(setInstalled).catch(() => setInstalled(undefined));
  }, [app]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    const t = text || (await setupText(app));
    try { await navigator.clipboard.writeText(t); toast({ text: `Copied the setup for ${chosen.label}`, ttl: 2500 }); } catch { toast({ text: 'Select the text below and copy it', ttl: 4000 }); }
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
            {activity.connected ? `Connected${activity.client ? `: ${activity.client}` : ''}` : 'Waiting for an AI app to connect'}
          </p>
        )}
        {!isTauri() && <p className="hint">The connection works in the desktop app, not in this browser preview.</p>}
      </section>

      <section className="set-section">
        <h2>Add it to your AI app</h2>
        <div className="ai-row" style={{ flexWrap: 'wrap' }}>
          <select aria-label="Which AI app" value={app} onChange={(e) => setApp(e.target.value as AppId)}>
            {APPS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {chosen.auto && <button className="btn primary" disabled={busy || !isTauri()} onClick={() => install(false)}>{installed ? `Update in ${chosen.label}` : `Add to ${chosen.label}`}</button>}
          {chosen.auto && installed && <button className="btn ghost" disabled={busy} onClick={() => install(true)}>Take it out</button>}
        </div>
        {chosen.auto && <p className="hint" style={{ marginTop: 6 }}>{installed ? `Already added to ${chosen.label}.` : `Adds Well Good Mail to ${chosen.label}'s list of tools and keeps everything else there. A copy of its settings is saved first.`}</p>}
        <div className="ai-code">
          <div className="ai-code-head"><span>{chosen.auto ? 'Or add it by hand' : 'Add it by hand'}</span><button className="btn small" onClick={copy}>Copy</button></div>
          <pre className="ai-setup">{text || '...'}</pre>
          <ol className="ai-steps">{chosen.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      </section>

      <section className="set-section">
        <h2>Accounts</h2>
        <p className="hint">Off: the AI can't see the account. Read only: it can search and read for context, and changes nothing. Read and write: it follows the switches below; anything that reaches other people always asks you first. New accounts start Off.</p>
        {ordered.length === 0 && <p className="hint">Add an account first.</p>}
        {ordered.length > 1 && (
          <div className="ai-row ai-all">
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
