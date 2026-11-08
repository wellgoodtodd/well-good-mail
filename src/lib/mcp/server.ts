// Turning the AI connection on and off, and answering what comes through it. The Rust side only passes messages;
// everything is decided here, with the person's settings.
import { invoke, isTauri, notify } from '../platform';
import { settings, useSettings } from '../settings';
import { useMail, loadBody } from '../mail';
import { searchMessages } from '../search';
import { askConfirm } from '../dialogs';
import { useUpdates } from '../updater';
import { tidy } from './permissions';
import { handleRpc, type JsonRpc } from './handlers';
import { logActivity, noteStatus, useActivity } from './activity';

/** The self-test in Settings starts the connection the way Claude does. It isn't a real AI app, so it isn't logged as one. */
export const SELF_TEST = 'well-good-mail-self-test';

/** An Ask needs the person, so bring Well Good Mail forward and say so in a Windows notification, then show the question. */
async function askPerson(what: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      await w.unminimize();
      await w.show();
      await w.setFocus();
    } catch { /* the question still shows inside the app */ }
    void notify('Your AI app is asking', `It wants to ${what}. Answer in Well Good Mail.`);
  }
  return askConfirm('Your AI app is asking', `It wants to ${what}. Allow it this once?`, 'Allow', { cancelLabel: 'Refuse' });
}

let listening = false;
let running = false;

async function answer(rid: number, body: string) {
  let msg: JsonRpc;
  try { msg = JSON.parse(body); } catch { return; }
  if (msg.method === 'initialize') {
    const info = msg.params?.clientInfo as { name?: string } | undefined;
    if (info?.name !== SELF_TEST) {
      noteStatus({ client: info?.name, lastHello: Date.now() });
      logActivity(`${info?.name || 'An AI app'} connected`);
    }
  }
  if (msg.method === 'tools/call') noteStatus({ lastCall: Date.now() });
  const mail = useMail.getState();
  const out = await handleRpc({
    settings: tidy(settings().mcp),
    accounts: mail.accounts,
    folders: mail.folders,
    messages: mail.messages,
    events: mail.events,
    followups: mail.followups,
    search: (q) => searchMessages(q, useMail.getState().messages),
    loadBody,
    ask: askPerson,
    log: logActivity,
    version: useUpdates.getState().currentVersion || '',
    now: Date.now(),
  }, msg);
  if (rid && out) await invoke('mcp_respond', { rid, body: JSON.stringify(out) });
}

async function listen() {
  if (listening || !isTauri()) return;
  listening = true;
  const { listen: on } = await import('@tauri-apps/api/event');
  await on<{ rid: number; body: string }>('mcp-request', (e) => { void answer(e.payload.rid, e.payload.body); });
  await on('mcp-connected', () => useActivity.setState({ connected: useActivity.getState().connected + 1 }));
  await on('mcp-disconnected', () => useActivity.setState({ connected: Math.max(0, useActivity.getState().connected - 1) }));
}

/** Matches the connection to the setting: on when switched on, off (and every open connection closed) when not. */
export async function syncMcp() {
  if (!isTauri()) return;
  const want = Boolean(settings().mcp?.enabled);
  if (want && !running) {
    await listen();
    await invoke('mcp_start');
    running = true;
  } else if (!want && running) {
    await invoke('mcp_stop');
    running = false;
    useActivity.setState({ connected: 0 });
    logActivity('The connection was switched off');
  }
}

/** Starts watching the setting. Called once when the app opens. */
export function startMcpWatch() {
  void syncMcp();
  useSettings.subscribe((s, prev) => { if (Boolean(s.mcp?.enabled) !== Boolean(prev.mcp?.enabled)) void syncMcp(); });
}

/** The setup text each AI app needs, pointing at this copy of Well Good Mail. */
export async function setupText(kind: 'claude-desktop' | 'claude-code' | 'codex' | 'gemini' | 'other'): Promise<string> {
  const exe = isTauri() ? await invoke<string>('mcp_exe_path') : 'C:\\Program Files\\Well Good Mail\\Well Good Mail.exe';
  const json = JSON.stringify({ mcpServers: { 'well-good-mail': { command: exe, args: ['--mcp'] } } }, null, 2);
  switch (kind) {
    case 'claude-code': return `claude mcp add well-good-mail -- "${exe}" --mcp`;
    case 'codex': return `[mcp_servers.well-good-mail]\ncommand = ${JSON.stringify(exe)}\nargs = ["--mcp"]`;
    case 'gemini':
    case 'claude-desktop': return json;
    default: return `"${exe}" --mcp`;
  }
}
