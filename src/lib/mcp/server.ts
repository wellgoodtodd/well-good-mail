// Turning the AI connection on and off, and answering what comes through it. The Rust side only passes messages;
// everything is decided here, with the person's settings.
import { invoke, isTauri, notify } from '../platform';
import { settings, useSettings } from '../settings';
import { useMail, loadBody, savedCopy, toast, openScreen } from '../mail';
import { store } from '../db';
import { createDraft } from '../compose';
import { composeContext, openDraft } from '../composeActions';
import { showBanner } from '../banners';
import { refreshAiDrafts, saveDraftEverywhere, startDraftSync, fileServerDrafts } from './aiDrafts';
import type { Draft } from '../types';
import { searchMessages } from '../search';
import { useUpdates } from '../updater';
import { tidy, type Mode } from './permissions';
import { handleRpc, toolsSignature, type AskRequest, type JsonRpc } from './handlers';
import { logActivity, noteStatus, useActivity } from './activity';
import { addAsk, askResume } from './approvals';
import { appName } from './appNames';
import { aiDraftsNow } from './aiDrafts';

/** The self-test in Settings starts the connection the way Claude does. It isn't a real AI app, so it isn't logged as one. */
export const SELF_TEST = 'well-good-mail-self-test';

let listening = false;
let running = false;
/** Which app is on each connection, from its hello. */
const apps = new Map<number, string>();
/** What each connection was last shown by tools/list, to tell it when that changes. */
const listed = new Map<number, string>();
/** "Allow for an hour": capability|account -> until when. */
const grants = new Map<string, number>();
let lastRequestAt = Date.now();

/**
 * Tells the person there is a question, with a Windows notification. If they are already using a Well Good Mail
 * window (perhaps typing a draft), nothing is moved in front of them: the taskbar flashes and the card waits.
 * Only when they are in another app is the main window brought forward.
 */
async function callPerson(title: string, body: string) {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow, UserAttentionType } = await import('@tauri-apps/api/window');
    const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
    const me = getCurrentWindow();
    const all = await getAllWebviewWindows();
    const usingUs = (await Promise.all(all.map((w) => w.isFocused().catch(() => false)))).some(Boolean);
    if (usingUs) {
      if (!(await me.isFocused())) await me.requestUserAttention(UserAttentionType.Informational);
    } else {
      await me.unminimize();
      await me.show();
      await me.setFocus();
    }
  } catch { /* the card still shows inside the app */ }
  void notify(title, body);
}

/** Puts a question on the approval card, and applies "for an hour" or "always" if chosen. */
async function askPerson(app: string, req: AskRequest) {
  void callPerson(`${app} is asking`, `It wants to ${req.what}. Answer in Well Good Mail.`);
  const { allowed, remember, edit } = await addAsk(app, req);
  if (allowed.length && remember === 'hour') {
    const until = Date.now() + 3600000;
    for (const id of req.accounts.length ? allowed : ['*']) grants.set(`${req.capability}|${id}`, until);
  }
  if (allowed.length && remember === 'always') {
    // "Always" allows this for just the accounts ticked on the card (their own setting moves to Allow), so one click can't
    // widen access for accounts the card didn't show. Something with no account (like reminders) moves the main switch.
    const mcp = tidy(settings().mcp);
    if (req.accounts.length) {
      const overrides = { ...mcp.overrides };
      for (const id of allowed) overrides[id] = { ...(overrides[id] || {}), [req.capability]: 'allow' as Mode };
      useSettings.getState().set({ mcp: tidy({ ...mcp, overrides }) });
    } else {
      useSettings.getState().set({ mcp: tidy({ ...mcp, modes: { ...mcp.modes, [req.capability]: 'allow' } }) });
    }
    toast({ text: req.accounts.length ? 'Done. It won\'t ask about that again for the accounts you ticked. Change it any time in Settings › AI Connection.' : 'Done. It won\'t ask about that again. You can change it back any time in Settings › AI Connection.', ttl: 12000, action: { label: 'Open settings', run: () => openScreen('settings', 'ai') } });
  }
  return { allowed, edit };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain text from the AI as email paragraphs. */
const toHtml = (text: string) => text.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');

/** Saves a draft the AI wrote: in the app, and in the account's own Drafts folder. Never sends it. */
async function makeDraft(app: string, input: import('./handlers').DraftInput): Promise<{ id: string; savedToServer: boolean }> {
  const mail = useMail.getState();
  const account = mail.accounts.find((a) => a.id === input.accountId);
  if (!account) throw new Error('That account is not in Well Good Mail.');
  // With its saved body (the store holds list details only), so the reply quotes it as before.
  const source = input.replyToId ? await savedCopy(input.replyToId) : undefined;
  const ctx = composeContext();
  const earlier = input.replaceId ? await store.getDraft(input.replaceId) : undefined;
  const fromEmail = account.aliases.find((a) => a.isDefault)?.email || account.email;
  let draft: Draft = createDraft(source ? 'reply' : 'new', source, ctx, {
    ...(earlier ? { id: earlier.id, serverDraftId: earlier.serverDraftId, serverAccountId: earlier.serverAccountId } : {}),
    fromEmail: source ? undefined as unknown as string : fromEmail,
    fromAccountId: account.id,
    ...(input.to.length ? { to: input.to } : {}),
    ...(input.cc.length ? { cc: input.cc } : {}),
    ...(input.subject ? { subject: input.subject } : {}),
    html: toHtml(input.text),
    byAi: app,
    ...(input.group ? { group: input.group } : earlier?.group ? { group: earlier.group } : {}),
    updatedAt: Date.now(),
  });
  if (!draft.fromEmail) draft = { ...draft, fromEmail };
  draft = await saveDraftEverywhere(draft);
  const savedToServer = Boolean(draft.serverDraftId);
  void refreshAiDrafts();
  showBanner({ title: `${app} wrote a draft`, body: draft.subject || '(no subject)', actionLabel: 'Open', run: () => void openDraft(draft.id) });
  return { id: draft.id, savedToServer };
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
    // The self-test only says hello and lists the tools. Anything using its name to call a tool is treated as any other app.
    if (raw === SELF_TEST) apps.set(conn, SELF_TEST);
    else {
      apps.set(conn, appName(raw));
      noteStatus({ client: appName(raw), lastHello: Date.now() });
      logActivity(`${appName(raw)} connected`, 'done', appName(raw));
    }
  }
  if (msg.method === 'tools/call' && apps.get(conn) === SELF_TEST) apps.set(conn, 'An AI app');
  const app = apps.get(conn) === SELF_TEST ? 'The self-test' : apps.get(conn) || 'An AI app';
  // The tools changed since this app last looked (an update, a setting, or a connection that came back after
  // Well Good Mail restarted): send the standard notice ahead of the answer, so it fetches the list again by itself.
  let notice = '';
  if (msg.method === 'tools/call') {
    const now = toolsSignature(tidy(settings().mcp));
    if (listed.get(conn) !== now) { notice = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }) + '\n'; listed.set(conn, now); }
  }
  if (msg.method === 'tools/list') listed.set(conn, toolsSignature(tidy(settings().mcp)));
  const send = async (out: object | undefined) => { if (rid && out) await invoke('mcp_respond', { rid, body: notice + JSON.stringify(out) }); };

  if (msg.method === 'tools/call') {
    // Paused: ask before going on. Saying hello and listing tools never needs this.
    if (useActivity.getState().paused) {
      void callPerson(`${app} wants to use Well Good Mail again`, 'The AI Connection is paused. Answer in Well Good Mail.');
      const choice = await askResume(app);
      if (choice === 'no') {
        logActivity('Asked to use the paused connection', 'refused', app);
        return send({ jsonrpc: '2.0', id: msg.id ?? null, result: { isError: true, content: [{ type: 'text', text: 'The AI Connection is paused in Well Good Mail, and the person chose not to resume it now.' }] } });
      }
      if (choice === 'today') {
        const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
        const mcp = tidy(settings().mcp);
        useSettings.getState().set({ mcp: { ...mcp, noPauseUntil: midnight.getTime() } }, { quiet: true });
      }
      resumeMcp();
    }
    lastRequestAt = Date.now();
    noteStatus({ lastCall: Date.now() });
  }

  const mail = useMail.getState();
  const out = await handleRpc({
    settings: tidy(settings().mcp),
    signOff: settings().draftSignOff || '',
    accounts: mail.accounts,
    folders: mail.folders,
    draftGroups: settings().draftGroups || [],
    messages: mail.messages,
    events: mail.events,
    followups: mail.followups,
    search: (q) => searchMessages(q, useMail.getState().messages),
    loadBody,
    ask: (req) => askPerson(app, req),
    granted: (capability, accountId) => (grants.get(`${capability}|${accountId ?? '*'}`) || 0) > Date.now(),
    makeDraft: (input) => makeDraft(input.writer || app, input),
    fileDrafts: (accountId, ids, group, writer) => fileServerDrafts(accountId, ids, group, writer || app),
    openDraft: (id) => void openDraft(id),
    ooo: {
      plan: settings().ooo,
      templates: settings().oooTemplates,
      status: async (ids) => {
        const m = await import('../oooStore');
        await m.refreshOoo(ids);
        const by = m.useOoo.getState().byAccount;
        return Object.fromEntries(ids.map((id) => [id, by[id]?.reply || { error: by[id]?.needsPermission ? 'This account needs to sign in once more in Well Good Mail to allow Out of Office.' : by[id]?.error || 'Not known' }]));
      },
      turnOn: async (plan) => (await import('../oooStore')).turnOnOoo(plan),
      turnOff: async (ids) => (await import('../oooStore')).turnOffOoo(ids),
    },
    calendarGroups: {
      list: settings().calendarGroups,
      current: settings().calendarGroup,
      calendars: calendarsByAccount(mail.events, mail.calendarNames),
      save: (list) => useSettings.getState().set({ calendarGroups: list, ...(list.some((g) => g.id === settings().calendarGroup) ? {} : { calendarGroup: '' }) }),
    },
    aiDraft: (id) => { const d = aiDraftsNow().find((x) => x.id === id); return d && d.fromAccountId ? { accountId: d.fromAccountId } : undefined; },
    log: (text, outcome) => logActivity(text, outcome, app),
    version: useUpdates.getState().currentVersion || '',
    now: Date.now(),
  }, msg);
  await send(out);
}

/** Each account's calendars: from its events, and the calendars it listed. */
function calendarsByAccount(events: { accountId: string; calendarName: string }[], known: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const e of events) (out[e.accountId] ||= new Set()).add(e.calendarName);
  for (const [id, list] of Object.entries(known)) for (const n of list) (out[id] ||= new Set()).add(n);
  return Object.fromEntries(Object.entries(out).map(([id, s]) => [id, [...s].sort()]));
}

async function listen() {
  if (listening || !isTauri()) return;
  listening = true;
  const { listen: on } = await import('@tauri-apps/api/event');
  await on<{ rid: number; conn?: number; body: string }>('mcp-request', (e) => { void answer(e.payload.rid, e.payload.conn ?? 0, e.payload.body); });
  await on('mcp-connected', () => useActivity.setState({ connected: useActivity.getState().connected + 1 }));
  await on<{ conn?: number }>('mcp-disconnected', (e) => {
    if (e.payload?.conn !== undefined) { apps.delete(e.payload.conn); listed.delete(e.payload.conn); }
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
  if (before && before !== version && settings().mcp?.enabled) logActivity(`Updated to ${version}. Connected AI apps are told about any new tools when they next ask.`);
}

/** Starts watching the setting. Called once when the app opens. */
export function startMcpWatch() {
  void syncMcp();
  useSettings.subscribe((s, prev) => { if (Boolean(s.mcp?.enabled) !== Boolean(prev.mcp?.enabled)) void syncMcp(); });
  setInterval(checkIdle, 30000);
  setTimeout(noteUpdate, 10000);
  setTimeout(() => void moveToHelper(), 15000);
  void refreshAiDrafts();
  // Drafts you send or delete leave the AI drafts list.
  window.addEventListener('focus', () => void refreshAiDrafts());
  setInterval(() => void refreshAiDrafts(), 30000);
  // Drafts made or changed outside Well Good Mail (the EA, Gmail on the web, a phone) show up here too.
  startDraftSync();
  // Writing drafts is new: start it on Ask once, so the first drafts show on the card before you choose Always.
  try {
    if (localStorage.getItem('wgm-mcp-drafts-ask') !== '1') {
      const mcp = tidy(settings().mcp);
      useSettings.getState().set({ mcp: tidy({ ...mcp, modes: { ...mcp.modes, 'organise.draft': 'ask' } }) }, { quiet: true });
      localStorage.setItem('wgm-mcp-drafts-ask', '1');
    }
  } catch { /* fine */ }
  void openScreen;
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
