// Settings, AI connection: the main switch, how to add it to an AI app, each account's level, what it may look at,
// and the activity log. Only a person in the app can change any of this, never the connection itself.
import { useState } from 'react';
import { useMail, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { isTauri } from '../lib/platform';
import { CAPABILITIES, NEVER, LEVEL_WORDS, tidy, type AccountLevel, type Mode } from '../lib/mcp/permissions';
import { READY, TOOLS } from '../lib/mcp/tools';
import { setupText } from '../lib/mcp/server';
import { useActivity, clearActivity } from '../lib/mcp/activity';

const APPS: { id: Parameters<typeof setupText>[0]; label: string; how: string }[] = [
  { id: 'claude-desktop', label: 'Claude Desktop', how: 'In Claude Desktop, open Settings, then Developer, then Edit config. Paste this in (or merge it with what is there), save, and restart Claude Desktop.' },
  { id: 'claude-code', label: 'Claude Code', how: 'Paste this into a terminal. Claude Code sessions, like the business hub, can then use your mail.' },
  { id: 'codex', label: 'ChatGPT desktop', how: 'ChatGPT\'s desktop app reads its connections from the Codex settings file, config.toml in the .codex folder in your user folder. Add these lines and restart it. Not yet tried with Well Good Mail.' },
  { id: 'gemini', label: 'Gemini CLI', how: 'Add this to settings.json in the .gemini folder in your user folder. Not yet tried with Well Good Mail.' },
  { id: 'other', label: 'Another app', how: 'Any AI app that can start a local tool (an MCP server over standard input and output) can use this command.' },
];

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg ai-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} disabled={o.disabled} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function AiConnectionTab() {
  const raw = useSettings((s) => s.mcp);
  const set = useSettings((s) => s.set);
  const accounts = useMail((s) => s.accounts);
  const activity = useActivity();
  const mcp = tidy(raw);
  const [app, setApp] = useState<(typeof APPS)[number]['id']>('claude-desktop');
  const [text, setText] = useState('');
  const save = (patch: Partial<typeof mcp>) => set({ mcp: tidy({ ...mcp, ...patch }) });
  const ordered = [...accounts].filter((a) => a.kind !== 'demo').sort((a, b) => a.order - b.order);
  const readCaps = CAPABILITIES.filter((c) => c.group === 'read' && TOOLS.some((t) => READY.has(t.name) && t.capability === c.id));
  const chosen = APPS.find((a) => a.id === app)!;

  const copy = async () => {
    const t = await setupText(app);
    setText(t);
    try { await navigator.clipboard.writeText(t); toast({ text: `Copied the setup for ${chosen.label}`, ttl: 2500 }); } catch { toast({ text: 'Select the text below and copy it', ttl: 4000 }); }
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
          <select aria-label="Which AI app" value={app} onChange={(e) => { setApp(e.target.value as typeof app); setText(''); }}>
            {APPS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <button className="btn" onClick={copy}>Copy the setup</button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>{chosen.how}</p>
        {text && <pre className="ai-setup">{text}</pre>}
      </section>

      <section className="set-section">
        <h2>Accounts</h2>
        <p className="hint">Off: the AI can't see the account. Read only: it can search and read for context, and changes nothing. Read and write: it follows the switches below; anything that reaches other people always asks you first. New accounts start Off.</p>
        {ordered.length === 0 && <p className="hint">Add an account first.</p>}
        {ordered.map((a) => (
          <div key={a.id} className="ai-row">
            <span className="dot" style={{ background: a.colour, width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flex: 'none' }} />
            <div className="grow"><span>{a.label || a.email}</span><small>{a.email}</small></div>
            <Segmented<AccountLevel> label={`AI access for ${a.email}`} value={mcp.accounts[a.id] ?? 'off'} onChange={(v) => save({ accounts: { ...mcp.accounts, [a.id]: v } })}
              options={(['off', 'read', 'write'] as AccountLevel[]).map((v) => ({ value: v, label: LEVEL_WORDS[v] }))} />
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
