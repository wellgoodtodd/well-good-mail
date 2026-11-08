// Turning the AI connection on and off, and answering what comes through it. The Rust side only passes messages;
// everything is decided here, with the person's settings.
import { invoke, isTauri, notify } from '../platform';
import { settings, useSettings } from '../settings';
import { useMail, loadBody, toast } from '../mail';
import { searchMessages } from '../search';
import { useUpdates } from '../updater';
import { tidy, type Mode } from './permissions';
import { handleRpc, type AskRequest, type JsonRpc } from './handlers';
import { logActivity, noteStatus, useActivity } from './activity';
import { addAsk, askResume } from './approvals';
import { appName } from './appNames';

/** The self-test in Settings starts the connection the way Claude does. It isn't a real AI app, so it isn't logged as one. */
export const SELF_TEST = 'well-good-mail-self-test';

let listening = false;
let running = false;
/** Which app is on each connection, from its hello. */
const apps = new Map<number, string>();
/** "Allow for an hour": capability|account -> until when. */
const grants = new Map<string, number>();
let lastRequestAt = Date.now();

/** Brings Well Good Mail forward and says so in a Windows notification, because the person needs to answer. */
async function callPerson(title: string, body: string) {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const w = getCurrentWindow();
    await w.unminimize();
    await w.show();
    await w.setFocus();
  } catch { /* the card still shows inside the app */ }
  void notify(title, body);
}

/** Puts a question on the approval card, and applies "for an hour" or "always" if chosen. */
async function askPerson(app: string, req: AskRequest) {
  void callPerson(`${app} is asking`, `It wants to ${req.what}. Answer in Well Good Mail.`);
  const { allowed, remember } = await addAsk(app, req);
  if (allowed.length && remember === 'hour') {
    const until = Date.now() + 3600000;
    for (const id of req.accounts.length ? allowed : ['*']) grants.set(`${req.capability}|${id}`, until);
  }
  if (allowed.length && remember === 'always') {
    // "Always" moves the switch from Ask to Allow. An account with its own setting has that setting moved too.
    const mcp = tidy(settings().mcp);
    const overrides = { ...mcp.overrides };
    for (const id of allowed) if (overrides[id]?.[req.capability]) overrides[id] = { ...overrides[id], [req.capability]: 'allow' as Mode };
    useSettings.getState().set({ mcp: tidy({ ...mcp, modes: { ...mcp.modes, [req.capability]: 'allow' }, overrides }) });
    toast({ text: 'Done. It won\'t ask about that again. Change it in Settings, AI connection.', ttl: 6000 });
  }
  return { allowed };
}

/** Pauses: the connection stays on, but the next request asks you to resume first. */
export function pauseMcp(reason = 'You paused the connection') {
  if (useActivity.getState().paused) return;
  useActivity.setState({ paused: true });
  logActivity(reason);
}

export function resumeMcp() {
  lastRequestAt = Date.now();
  if (!useActivity.getState().paused) return;
  useActivity.setState({ paused: false });
  logActivity('The connection was resumed');
}

async function answer(rid: number, conn: number, body: string) {
  let msg: JsonRpc;
  try { msg = JSON.parse(body); } catch { return; }
  if (msg.method === 'initialize') {
    const raw = (msg.params?.clientInfo as { name?: string } | undefined)?.name;
    if (raw === SELF_TEST) apps.set(conn, SELF_TEST);
    else {
      apps.set(conn, appName(raw));
      noteStatus({ client: appName(raw), lastHello: Date.now() });
      logActivity(`${appName(raw)} connected`, 'done', appName(raw));
    }
  }
  const app = apps.get(conn) === SELF_TEST ? 'The self-test' : apps.get(conn) || 'An AI app';
  const send = async (out: object | undefined) => { if (rid && out) await invoke('mcp_respond', { rid, body: JSON.stringify(out) }); };

  if (msg.method === 'tools/call' && apps.get(conn) !== SELF_TEST) {
    // Paused: ask before going on. Saying hello and listing tools never needs this.
    if (useActivity.getState().paused) {
      void callPerson(`${app} wants to use Well Good Mail again`, 'The AI connection is paused. Answer in Well Good Mail.');
      const choice = await askResume(app);
      if (choice === 'no') {
        logActivity('Asked to use the paused connection', 'refused', app);
        return send({ jsonrpc: '2.0', id: msg.id ?? null, result: { isError: true, content: [{ type: 'text', text: 'The AI connection is paused in Well Good Mail, and the person chose not to resume it now.' }] } });
      }
      if (choice === 'today') {
        const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
        const mcp = tidy(settings().mcp);
        useSettings.getState().set({ mcp: { ...mcp, noPauseUntil: midnight.getTime() } });
      }
      resumeMcp();
    }
    lastRequestAt = Date.now();
    noteStatus({ lastCall: Date.now() });
  }

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
    ask: (req) => askPerson(app, req),
    granted: (capability, accountId) => (grants.get(`${capability}|${accountId ?? '*'}`) || 0) > Date.now(),
    log: (text, outcome) => logActivity(text, outcome, app),
    version: useUpdates.getState().currentVersion || '',
    now: Date.now(),
  }, msg);
  await send(out);
}

async function listen() {
  if (listening || !isTauri()) return;
  listening = true;
  const { listen: on } = await import('@tauri-apps/api/event');
  await on<{ rid: number; conn?: number; body: string }>('mcp-request', (e) => { void answer(e.payload.rid, e.payload.conn ?? 0, e.payload.body); });
  await on('mcp-connected', () => useActivity.setState({ connected: useActivity.getState().connected + 1 }));
  await on<{ conn?: number }>('mcp-disconnected', (e) => {
    if (e.payload?.conn !== undefined) apps.delete(e.payload.conn);
    useActivity.setState({ connected: Math.max(0, useActivity.getState().connected - 1) });
  });
  await on('tray-mcp-pause', () => { if (useActivity.getState().paused) resumeMcp(); else pauseMcp(); });
}

/** Matches the connection to the setting: on when switched on, off (and every open connection closed) when not. */
export async function syncMcp() {
  if (!isTauri()) return;
  const want = Boolean(settings().mcp?.enabled);
  if (want && !running) {
    await listen();
    await invoke('mcp_start');
    running = true;
    lastRequestAt = Date.now();
    useActivity.setState({ paused: false });
  } else if (!want && running) {
    await invoke('mcp_stop');
    running = false;
    apps.clear();
    grants.clear();
    useActivity.setState({ connected: 0, paused: false });
    logActivity('The connection was switched off');
  }
}

/** Pauses after the quiet spell you chose, unless you said not to today. */
function checkIdle() {
  const mcp = tidy(settings().mcp);
  if (!mcp.enabled || !mcp.idleMinutes || useActivity.getState().paused) return;
  if (mcp.noPauseUntil && Date.now() < mcp.noPauseUntil) return;
  if (Date.now() - lastRequestAt > mcp.idleMinutes * 60000) pauseMcp(`Paused after ${mcp.idleMinutes >= 60 ? `${mcp.idleMinutes / 60} ${mcp.idleMinutes === 60 ? 'hour' : 'hours'}` : `${mcp.idleMinutes} minutes`} with no requests`);
}

/** After an update the AI app's side of the connection has gone, and it doesn't restart it by itself. */
function noteUpdate() {
  const version = useUpdates.getState().currentVersion;
  if (!version) return;
  let before: string | null = null;
  try { before = localStorage.getItem('wgm-mcp-version'); localStorage.setItem('wgm-mcp-version', version); } catch { return; }
  if (before && before !== version && settings().mcp?.enabled && useActivity.getState().lastHello) {
    toast({ text: `Well Good Mail was updated. Restart ${useActivity.getState().client || 'your AI app'} so it can connect again.`, ttl: 20000 });
  }
}

/** Starts watching the setting. Called once when the app opens. */
export function startMcpWatch() {
  void syncMcp();
  useSettings.subscribe((s, prev) => { if (Boolean(s.mcp?.enabled) !== Boolean(prev.mcp?.enabled)) void syncMcp(); });
  setInterval(checkIdle, 30000);
  setTimeout(noteUpdate, 10000);
  setTimeout(() => void moveToHelper(), 15000);
}

/** Once: AI apps set up before the helper copy existed are pointed at it, so they survive updates. */
async function moveToHelper() {
  if (!isTauri()) return;
  try { if (localStorage.getItem('wgm-mcp-helper') === '1') return; } catch { return; }
  for (const kind of ['claude-desktop', 'claude-code', 'codex', 'gemini']) {
    try { if (await invoke<boolean>('mcp_installed', { kind })) await invoke('mcp_install', { kind, remove: false }); } catch { /* left as it was */ }
  }
  try { localStorage.setItem('wgm-mcp-helper', '1'); } catch { /* try again next time */ }
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
