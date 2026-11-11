// The main window and pop out windows.
import { parseMailto, mailtoBodyHtml } from './lib/mailtoLink';
import { CrashPrompt } from './components/Feedback';
import { openHelp } from './components/Help';
import { useSaves, openSaved, showSaved, clearSaves, markSavesSeen } from './lib/saves';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { ReadingPane } from './components/ReadingPane';
import { Composer } from './components/Composer';
import { Reminders } from './components/Reminders';
import { ComingUpPanel, MeetingBanner } from './components/ComingUp';
import { PrintPreview } from './components/PrintPreview';
import { WhatsNew } from './components/WhatsNew';
import { Help } from './components/Help';
import { SetupGuide, useGuide, openGuide } from './components/SetupGuide';
import { UndoRedo } from './components/UndoRedo';
import { printThread, savePdfThread } from './lib/print';
import { redoSteps, undoSteps, useHistory } from './lib/history';
import { SettingsScreen } from './components/Settings';
import { Splitter, useMenu, type MenuItem } from './components/ui';
import { addAccountItems } from './lib/accountMenu';
import { useSettings } from './lib/settings';
import { skinById, SKIN_VARS, buttonFill, accentOn } from './lib/skins';
import { useBanners, dismissBanner, showBanner } from './lib/banners';
import { backupDue, haveOwnKeys, importKeys } from './lib/backup';
import {
  useMail, initMail, refreshAll, runSearch, dismissToast, archive, trash, toggleFlag, markRead, selectedMessageIds, selectThread, startDemo,
  markSpam, snooze, markViewRead, openScreen,
  adoptOutboxItem, messagesInThread, reloadMessagesFromDb, toast, reconnectAccount, goBack, goForward,
} from './lib/mail';
import { startCompose, popoutMessage } from './lib/composeActions';
import { useViewList } from './lib/useList';
import { threadKey, viewTitle } from './lib/mailbox';
import type { View } from './lib/types';
import { checkReminderAlerts } from './lib/reminders';
import { startSettingsSync } from './lib/settingsSync';
import { restoreOpenDrafts } from './lib/openDrafts';
import { CommandPalette } from './components/CommandPalette';
import { isPopout, isTauri, invoke, onTauriEvent, rememberPopoutSize, setAutostart, setCloseQuits } from './lib/platform';
import { loadGoogleKeys, useGoogleConfigured, calendarEditAllowed } from './lib/auth/google';
import { loadMicrosoftKeys } from './lib/auth/microsoft';
import { startUpdateChecks, useUpdates, restartToUpdate, isBetaVersion } from './lib/updater';
import { startMcpWatch } from './lib/mcp/server';
import { AiApprovalCard, AiStatusButton } from './components/AiApproval';
import { OooBanner, AwaySummary } from './components/OutOfOffice';
import { AiDrafts } from './components/AiDrafts';
import { ScheduledScreen } from './components/Scheduled';
import './lib/sender';
import { DialogHost } from './components/DialogHost';
import { SmartMailboxEditor } from './components/SmartMailboxEditor';
import { useDialogs, askConfirm } from './lib/dialogs';
import { matchAction, type ShortcutAction } from './lib/shortcuts';

function useNarrow() {
  const q = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const fn = () => setNarrow(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return narrow;
}

function useTheme() {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const scale = useSettings((s) => s.textScale);
  const font = useSettings((s) => s.interfaceFont);
  const unreadColour = useSettings((s) => s.unreadColour);
  const darkSkin = useSettings((s) => s.darkSkin);
  const lightSkin = useSettings((s) => s.lightSkin);
  const motion = useSettings((s) => s.motion);
  const focusRing = useSettings((s) => s.focusRing);
  const underlineLinks = useSettings((s) => s.underlineLinks);
  const strongBorders = useSettings((s) => s.strongBorders);
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
    document.documentElement.dataset.focus = focusRing;
    document.documentElement.dataset.links = underlineLinks ? 'underline' : 'plain';
    document.documentElement.dataset.borders = strongBorders ? 'strong' : 'standard';
  }, [motion, focusRing, underlineLinks, strongBorders]);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setSystemDark(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const mode = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    root.dataset.theme = mode;
    // The colour theme for this mode: clear the last one's overrides, then apply the new one.
    const skin = skinById(mode === 'dark' ? darkSkin : lightSkin);
    root.dataset.skin = skin.id;
    SKIN_VARS.forEach((v) => root.style.removeProperty(v));
    Object.entries(skin.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.style.setProperty('--on-accent', skin.onAccent);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-fill', buttonFill(accent, skin.onAccent));
    root.style.setProperty('--accent-text', accentOn(accent, skin.vars['--bg'] || (mode === 'dark' ? '#1c1c1e' : '#ffffff')));
    root.style.setProperty('--scale', String(scale));
    root.style.setProperty('--ui-font', `'${font}'`);
    if (unreadColour) root.style.setProperty('--unread', unreadColour);
    else root.style.removeProperty('--unread');
  }, [theme, accent, scale, font, systemDark, unreadColour, darkSkin, lightSkin]);
}

function Banners() {
  const list = useBanners((s) => s.list);
  if (!list.length) return null;
  return (
    <div className="alert-banners" role="status" aria-live="polite">
      {list.map((b) => (
        <div className="alert-card" key={b.id}>
          <div className="bt"><strong>{b.title}</strong><span>{b.body}</span></div>
          {b.run && <button className="btn" onClick={() => { b.run!(); dismissBanner(b.id); }}>{b.actionLabel || 'Open'}</button>}
          <button className="icon-btn" aria-label="Dismiss" onClick={() => dismissBanner(b.id)}><Icon name="close" size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function Toasts() {
  const toasts = useMail((s) => s.toasts);
  // Newest first; only the three newest show, the older two folded behind it.
  const shown = toasts.slice(-3).reverse();
  return (
    <div className={`toasts ${shown.length > 1 ? 'stacked' : ''}`} role="status" aria-live="polite" style={{ ['--n' as string]: shown.length }}>
      {shown.map((t, i) => (
        <div className="toast" key={t.id} style={{ ['--i' as string]: i, zIndex: 10 - i }}>
          <span className="t">{t.text}</span>
          {t.undo && <button onClick={() => { t.undo!(); dismissToast(t.id); }}>Undo</button>}
          {t.action && <button onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>}
          {t.actions?.map((a) => <button key={a.label} onClick={() => { a.run(); dismissToast(t.id); }}>{a.label}</button>)}
          <button className="x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><Icon name="close" size={13} /></button>
        </div>
      ))}
    </div>
  );
}

/** Email links (mailto:) clicked in a browser or another app open a new email here. */
function useMailtoLinks() {
  const ready = useMail((s) => s.accounts.length > 0);
  useEffect(() => {
    if (!isTauri() || isPopout() || !ready) return;
    const open = (link: string) => {
      const p = parseMailto(link);
      void startCompose('new', undefined, { extra: { to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, html: mailtoBodyHtml(p.body) } });
    };
    void invoke<string | null>('take_start_mailto').then((l) => { if (l) open(l); }).catch(() => undefined);
    let stop: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(({ listen }) => listen<string>('open-mailto', (e) => open(e.payload))).then((u) => { stop = u; });
    return () => stop?.();
  }, [ready]);
}

/** Appears once something has been saved from the app: recent saves with Open and Show in folder, like a browser. */
/** A see-through layer under a small list: clicking it just closes the list, and never clicks what's underneath. */
function ClickAway({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return <div className="click-away" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />;
}

/** The last 20 notes, with their buttons still working, for when one went by too quickly. */
function RecentButton() {
  const notes = useMail((s) => s.notes);
  const unseen = useMail((s) => s.notesUnseen);
  const [open, setOpen] = useState(false);
  // The dot catches your eye after something happens, then goes by itself if you carry on working.
  useEffect(() => {
    if (!unseen) return;
    const t = setTimeout(() => useMail.setState({ notesUnseen: false }), 45000);
    return () => clearTimeout(t);
  }, [unseen, notes.length]);
  if (!notes.length) return null;
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  const use = (id: string, run: () => void) => { run(); useMail.setState({ notes: useMail.getState().notes.map((n) => (n.id === id ? { ...n, used: true } : n)) }); };
  return (
    <div className="dl-wrap">
      <button className={`icon-btn dl-btn ${unseen ? 'new' : ''}`} title="Recent notes" aria-label="Recent notes" aria-expanded={open} onClick={() => { setOpen(!open); useMail.setState({ notesUnseen: false }); }}><Icon name="list" /></button>
      {open && (
        <>
          <ClickAway onClose={() => setOpen(false)} />
          <div className="dl-pop" role="dialog" aria-label="Recent notes">
            <div className="dl-head"><strong>Recent</strong><button className="link-btn" onClick={() => { useMail.setState({ notes: [] }); setOpen(false); }}>Clear</button></div>
            {notes.map((n) => (
              <div key={n.id} className="note-item">
                <div className="note-text"><span>{n.text}</span><small>{ago(n.at)}</small></div>
                <div className="note-actions">
                  {n.undo && <button className="btn small" disabled={n.used} onClick={() => use(n.id, n.undo!)}>{n.used ? 'Undone' : 'Undo'}</button>}
                  {n.action && <button className="btn small" onClick={() => use(n.id, n.action!.run)}>{n.action.label}</button>}
                  {n.actions?.map((a) => <button key={a.label} className="btn small" onClick={() => use(n.id, a.run)}>{a.label}</button>)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DownloadsButton() {
  const list = useSaves((x) => x.list);
  const unseen = useSaves((x) => x.unseen);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  if (!list.length) return null;
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
  const folder = (p: string) => p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')));
  return (
    <div className="dl-wrap" ref={ref}>
      <button className={`icon-btn dl-btn ${unseen ? 'new' : ''}`} title="Saved files" aria-label="Saved files" aria-expanded={open} onClick={() => { setOpen(!open); markSavesSeen(); }}><Icon name="download" /></button>
      {open && <ClickAway onClose={() => setOpen(false)} />}
      {open && (
        <div className="dl-pop" role="dialog" aria-label="Saved files">
          <div className="dl-head"><strong>Saved files</strong><button className="link-btn" onClick={() => void showSaved(list[0].path)}>Open folder</button></div>
          {list.map((f) => (
            <div key={f.path + f.at} className="dl-item">
              <button className="dl-name" title={`Open ${f.name}`} onClick={() => void openSaved(f.path)}><span>{f.name}</span><small>{folder(f.path)} · {ago(f.at)}</small></button>
              <button className="icon-btn" title="Show in folder" aria-label={`Show ${f.name} in its folder`} onClick={() => void showSaved(f.path)}><Icon name="folder" size={15} /></button>
            </div>
          ))}
          <button className="link-btn dl-clear" onClick={() => { clearSaves(); setOpen(false); }}>Clear list</button>
        </div>
      )}
    </div>
  );
}

function Welcome() {
  const configured = useGoogleConfigured();
  const menu = useMenu();
  const [moving, setMoving] = useState(false);
  return (
    <div className="welcome">
      <div className="welcome-card">
        <img src="icon.svg" alt="" />
        <h1>Well Good Mail</h1>
        <p>All your inboxes in one calm place. Add your Gmail accounts to get started, or try it first with pretend emails.</p>
        <div className="actions">
          <button className="btn primary" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), addAccountItems())} style={{ height: 36, padding: '0 16px' }}><Icon name="plus" /> Add account <Icon name="chevronDown" size={14} /></button>
          <button className="btn" onClick={() => startDemo()} style={{ height: 36, padding: '0 16px' }}>Try demo mode</button>
        </div>
        {!configured && !moving && <p className="note">Gmail needs a free key from Google first. The guide takes about 10 minutes and walks you through it.</p>}
        <button className="link-btn welcome-move" aria-expanded={moving} onClick={() => setMoving(!moving)}>Moving from another computer?</button>
        {moving && <MovingChecklist configured={configured} onAdd={(el) => menu.open(el.getBoundingClientRect(), addAccountItems())} />}
        {menu.node}
      </div>
    </div>
  );
}

/** Setting up on a second computer: the Google key from a backup file, signing in, then the mail export. */
function MovingChecklist({ configured, onAdd }: { configured: boolean; onAdd: (el: HTMLElement) => void }) {
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const pick = async (f: File) => {
    try {
      await importKeys(f);
      await loadGoogleKeys();
      await loadMicrosoftKeys();
      setRestored(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <ol className="move-list" aria-label="Moving from another computer">
      <li className={configured ? 'done' : ''}>
        <span className="move-num" aria-hidden>{configured ? <Icon name="check" size={13} /> : 1}</span>
        <div className="move-body">
          <strong>Restore your Google key</strong>
          <span>{configured ? (restored ? 'Restored from your backup.' : 'Your Google key is already on this computer.') : 'On your old computer: Settings, Storage, Back up my keys. Then choose that file here. Microsoft, iCloud and other email need no key.'}</span>
          {error && <span className="status-bad" role="alert">{error}</span>}
          {!configured && (
            <div className="move-actions">
              <button className="btn" onClick={() => file.current?.click()}>Choose backup file</button>
              <button className="btn ghost" onClick={() => openGuide('setup', { step: 5 })}>I don't have one</button>
              <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
            </div>
          )}
        </div>
      </li>
      <li>
        <span className="move-num" aria-hidden>2</span>
        <div className="move-body">
          <strong>Sign in to your accounts</strong>
          <span>Sign in to each one as usual. Your mail and settings in Gmail or Outlook are all still there.</span>
          <div className="move-actions"><button className="btn" onClick={(e) => onAdd(e.currentTarget)}><Icon name="plus" /> Add account</button></div>
        </div>
      </li>
      <li>
        <span className="move-num" aria-hidden>3</span>
        <div className="move-body">
          <strong>Bring your mail across (optional)</strong>
          <span>On your old computer: Settings, Storage, Export. Once you've signed in here, Import it from the same place, so nothing has to download twice.</span>
        </div>
      </li>
    </ol>
  );
}

/** Back to where you were before jumping to another screen, mailbox or search, and Forward again. */
function BackButton() {
  const can = useMail((s) => s.backStack.length > 0);
  const canForward = useMail((s) => s.forwardStack.length > 0);
  return (
    <>
      <button className="icon-btn" title="Back (Alt+Left)" aria-label="Back" onClick={goBack} disabled={!can}><Icon name="chevronLeft" /></button>
      <button className="icon-btn" title="Forward (Alt+Right)" aria-label="Forward" onClick={goForward} disabled={!canForward}><Icon name="chevronRight" /></button>
    </>
  );
}

function SearchBox() {
  const query = useMail((s) => s.searchQuery);
  const view = useMail((s) => s.view);
  const accounts = useMail((s) => s.accounts);
  const folders = useMail((s) => s.folders);
  const groups = useSettings((s) => s.groups);
  const smartBoxes = useSettings((s) => s.smartMailboxes) || [];
  // The box says where it will look: the mailbox you are in, or all mail once a search is open.
  const here: View = view.mailbox.kind === 'search' ? { scope: view.scope, mailbox: view.mailbox.within || view.mailbox } : view;
  const where = view.mailbox.kind === 'search' && !view.mailbox.within ? 'all mail' : viewTitle(here, (id) => accounts.find((a) => a.id === id)?.label || '', (id) => groups.find((g) => g.id === id)?.name || 'Group', (acc, id) => folders[acc]?.find((f) => f.id === id)?.name || 'Label', (id) => smartBoxes.find((b) => b.id === id)?.name);
  const [text, setText] = useState(query);
  useEffect(() => setText(query), [query]);
  useEffect(() => {
    // Clearing the box goes straight back to the mailbox; typing waits a moment.
    const t = setTimeout(() => { if (text !== useMail.getState().searchQuery) runSearch(text); }, text.trim() ? 350 : 0);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <label className="search">
      <Icon name="search" />
      <span className="sr-only">Search {where}</span>
      <input
        id="search-box"
        type="search"
        placeholder={`Search ${where}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setText(''); runSearch(''); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Enter') runSearch(text);
        }}
      />
      <button type="button" className="search-help" title="Search tips" aria-label="Search tips" onClick={(e) => { e.preventDefault(); openHelp('search tips'); }}><Icon name="help" size={14} /></button>
      {view.mailbox.kind === 'search' && view.mailbox.within && (
        <button type="button" className="search-widen" title="Search all your mail instead" onClick={(e) => { e.preventDefault(); runSearch(text, { everywhere: true }); }}>Search all mail</button>
      )}
    </label>
  );
}

function useShortcuts() {
  const { items } = useViewList();
  const keys = useMemo(() => items.map((i) => threadKey(i.message)), [items]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
      if (useDialogs.getState().pending) return;
      const s = useSettings.getState();
      const st = useMail.getState();
      // While typing, only shortcuts with Ctrl or Alt (or function keys) apply.
      const hasMod = e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key);
      if (typing && !hasMod) return;
      if (typing && st.inlineDraftId && el?.closest('.composer')) return; // the composer handles its own
      const action = matchAction(e, s.keybindings, s.shortcuts === 'gmail');
      if (!action) return;
      const textBox = Boolean(el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''].includes((el as HTMLInputElement).type))));
      if (textBox && (action === 'undo' || action === 'redo')) return;
      if (typing && !textBox && (action === 'undo' || action === 'redo')) (el as HTMLElement).blur();
      const sel = st.selectedKey;
      const latest = sel ? messagesInThread(sel).slice(-1)[0] : undefined;
      const ids = selectedMessageIds();
      const moveSel = (d: number) => {
        const i = sel ? keys.indexOf(sel) : -1;
        const next = keys[Math.max(0, Math.min(keys.length - 1, i + d))];
        if (next) selectThread(next);
      };
      const thenNext = () => {
        const i = keys.indexOf(sel!);
        const next = keys[i + 1] || keys[i - 1];
        if (next) setTimeout(() => selectThread(next), 0);
      };
      const run: Partial<Record<ShortcutAction, () => void>> = {
        newEmail: () => startCompose('new'),
        reply: () => latest && startCompose(s.defaultReply, latest),
        replyAll: () => latest && startCompose('replyAll', latest),
        forward: () => latest && startCompose('forward', latest),
        refresh: () => refreshAll(),
        search: () => document.getElementById('search-box')?.focus(),
        markUnread: () => ids.length && markRead(ids, false),
        markRead: () => ids.length && markRead(ids, true),
        flag: () => ids.length && toggleFlag(ids),
        archive: () => { if (ids.length) { archive(ids); thenNext(); } },
        delete: () => { if (ids.length) { trash(ids); thenNext(); } },
        junk: () => { if (ids.length) { markSpam(ids); thenNext(); } },
        snooze: () => { if (ids.length) { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(8, 0, 0, 0); snooze(ids, t.getTime()); thenNext(); } },
        next: () => moveSel(1),
        previous: () => moveSel(-1),
        openWindow: () => sel && popoutMessage(sel),
        toggleSidebar: () => s.set({ sidebarVisible: !s.sidebarVisible }),
        markAllRead: () => markViewRead(st.view),
        reminders: () => openScreen('reminders'),
        print: () => { if (sel) printThread(sel); },
        undo: () => { undoSteps(1); },
        redo: () => { redoSteps(1); },
      };
      const fn = run[action];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys]);
  // Back and Forward, like a browser: Alt+Left and Alt+Right, or the mouse's side buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); goBack(); }
      if (e.button === 4) { e.preventDefault(); goForward(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouse); };
  }, []);
}

function MainWindow() {
  const ready = useMail((s) => s.ready);
  const accounts = useMail((s) => s.accounts);
  const screen = useMail((s) => s.screen);
  const syncing = useMail((s) => s.syncing);
  const online = useMail((s) => s.online);
  const s = useSettings();
  const themeIsDark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const update = useUpdates();
  const beta = isBetaVersion(update.currentVersion);
  // A test build says so in the window title, so it can't be mistaken for the real one.
  useEffect(() => {
    if (!update.currentVersion) return;
    const title = beta ? `Well Good Mail BETA ${update.currentVersion}` : 'Well Good Mail';
    document.title = title;
    if (isTauri()) import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title)).catch(() => {});
  }, [beta, update.currentVersion]);
  const narrow = useNarrow();
  const [mobileNav, setMobileNav] = useState(false);
  const view = useMail((st) => st.view);
  const selectedKey = useMail((st) => st.selectedKey);
  const inlineDraftId = useMail((st) => st.inlineDraftId);
  useEffect(() => setMobileNav(false), [view, screen]);
  useShortcuts();

  // Reminder alerts once a minute.
  useEffect(() => {
    const run = () => {
      const st = useMail.getState();
      checkReminderAlerts(st.events, st.followups, st.dismissed);
    };
    window.addEventListener('wgm-minute', run);
    const t = setTimeout(run, 5000);
    return () => { window.removeEventListener('wgm-minute', run); clearTimeout(t); };
  }, []);

  useEffect(() => {
    const offs: Promise<() => void>[] = [
      onTauriEvent('tray-refresh', () => refreshAll()),
      onTauriEvent('tray-compose', () => startCompose('new')),
      onTauriEvent('tray-ooo', () => openScreen('settings', 'ooo')),
    ];
    // Drafts sent from pop out windows: send from here so undo and retries work.
    const bc = new BroadcastChannel('wgm');
    bc.onmessage = (ev) => {
      if (ev.data?.type === 'outbox-changed') adoptOutboxItem(ev.data.id);
      if (ev.data?.type === 'messages-changed') reloadMessagesFromDb();
      if (ev.data?.type === 'toast' && typeof ev.data.text === 'string') toast({ text: ev.data.text });
    };
    loadGoogleKeys();
    loadMicrosoftKeys();
    setAutostart(useSettings.getState().startWithWindows).catch(() => {});
    setCloseQuits(useSettings.getState().closeQuits);
    startSettingsSync();
    startUpdateChecks();
    startMcpWatch();
    const restore = setTimeout(() => { restoreOpenDrafts().catch(() => {}); }, 3000);
    return () => { clearTimeout(restore); offs.forEach((p) => p.then((f) => f())); bc.close(); };
  }, []);

  // The menu at the top left: the basics, so nothing is lost when the sidebar is hidden.
  const appMenu = useMenu();
  const history = useHistory();
  const appMenuItems = (): MenuItem[] => {
    const hasAccounts = accounts.length > 0;
    const st0 = useMail.getState();
    const hasThread = Boolean(st0.selectedKey);
    const tab = (label: string, id: string): MenuItem => ({ label, onClick: () => openScreen('settings', id) });
    return [
      { label: 'New email', icon: 'compose', kbd: 'Ctrl+N', disabled: !hasAccounts, onClick: () => startCompose('new') },
      { label: 'Check for new mail', icon: 'refresh', kbd: 'F5', disabled: !hasAccounts, onClick: () => refreshAll() },
      { divider: true },
      { label: history.past.length ? `Undo ${history.past[history.past.length - 1].label}` : 'Undo', icon: 'undo', kbd: 'Ctrl+Z', disabled: !history.past.length, onClick: () => { undoSteps(1); } },
      { label: history.future.length ? `Redo ${history.future[history.future.length - 1].label}` : 'Redo', icon: 'redo', kbd: 'Ctrl+Y', disabled: !history.future.length, onClick: () => { redoSteps(1); } },
      { divider: true },
      { label: 'Print', icon: 'printer', kbd: 'Ctrl+P', disabled: !hasThread, onClick: () => { if (st0.selectedKey) printThread(st0.selectedKey); } },
      { label: 'Save as PDF', icon: 'filePdf', disabled: !hasThread, onClick: () => { if (st0.selectedKey) savePdfThread(st0.selectedKey); } },
      { divider: true },
      { label: 'Add account', icon: 'plus', submenu: addAccountItems() },
      { divider: true },
      { label: 'Reminders', icon: 'bell', onClick: () => openScreen('reminders') },
      { label: 'Out of Office', icon: 'plane', disabled: !hasAccounts, onClick: () => openScreen('settings', 'ooo') },
      { label: 'Settings', icon: 'settings', submenu: [tab('Accounts', 'accounts'), tab('Appearance', 'appearance'), tab('Notifications and Reminders', 'notifications'), tab('Keyboard Shortcuts', 'shortcuts'), tab('Updates', 'updates'), tab('Diagnostics', 'diagnostics')] },
      { label: 'Help', icon: 'help', onClick: () => openScreen('help') },
      { divider: true },
      { label: s.sidebarVisible ? 'Hide sidebar' : 'Show sidebar', icon: 'sidebar', kbd: 'Ctrl+Shift+S', onClick: () => s.set({ sidebarVisible: !s.sidebarVisible }) },
    ];
  };

  // Now and then, if the person made their own Google key and has never saved a copy, remind them once.
  useEffect(() => {
    if (!ready || !isTauri()) return;
    const t = setTimeout(async () => {
      const last = Number(localStorage.getItem('wgm.keysReminder') || 0);
      if (Date.now() - last < 14 * 86400000) return;
      if (!backupDue(await haveOwnKeys(), useSettings.getState().keysBackedUpAt)) return;
      try { localStorage.setItem('wgm.keysReminder', String(Date.now())); } catch { /* storage unavailable */ }
      showBanner({ title: 'Back up your app keys', body: 'A saved copy of your Google key saves a ten minute setup if you ever reinstall.', actionLabel: 'Open', run: () => openScreen('settings', 'offline') });
    }, 30000);
    return () => clearTimeout(t);
  }, [ready]);

  // First run in the desktop app: nothing is set up yet, so start the guide.
  const guide = useGuide((g) => g.mode);
  const configured = useGoogleConfigured();
  useEffect(() => {
    if (ready && isTauri() && !configured && !accounts.length && !useGuide.getState().mode) openGuide('setup');
  }, [ready, configured, accounts.length]);

  // An account that needs signing in again gets one friendly prompt per session.
  const prompted = useRef(new Set<string>());
  useEffect(() => {
    if (!ready) return;
    const due = accounts.find((a) => a.status === 'needs-signin' && !prompted.current.has(a.id));
    if (!due) return;
    let t: ReturnType<typeof setTimeout>;
    const tryAsk = () => {
      if (useDialogs.getState().pending || useGuide.getState().mode) { t = setTimeout(tryAsk, 3000); return; }
      prompted.current.add(due.id);
      askConfirm(`Sign in again to ${due.email}`, 'Google has logged this account out, so no new mail is coming in. Your saved mail is still here.', 'Sign in', { cancelLabel: 'Later' })
        .then((ok) => { if (ok) reconnectAccount(due.id); });
    };
    t = setTimeout(tryAsk, 1500);
    return () => clearTimeout(t);
  }, [ready, accounts]);

  // Google accounts that signed in before replying to invitations existed are asked once to allow it.
  const askedCalendar = useRef(new Set<string>());
  useEffect(() => {
    if (!ready || !isTauri()) return;
    const look = () => {
      const due = useMail.getState().accounts.find((a) => a.kind === 'gmail' && a.status === 'ok' && calendarEditAllowed(a.email) === false && !askedCalendar.current.has(a.id));
      if (!due || useDialogs.getState().pending || useGuide.getState().mode) return;
      askedCalendar.current.add(due.id);
      askConfirm(
        'Answer calendar invitations from your mail',
        `Well Good Mail can now say Yes, No or Maybe to invitations and add them to your calendar. For that, Google needs you to allow it to edit your calendar events. You will sign in to ${due.email} once more, and your saved mail stays where it is.`,
        'Sign in and allow',
        { cancelLabel: 'Later' },
      ).then((ok) => { if (ok) reconnectAccount(due.id); });
    };
    const t = setInterval(look, 20000);
    const first = setTimeout(look, 12000);
    return () => { clearInterval(t); clearTimeout(first); };
  }, [ready]);

  if (!ready) return <div className="pane-empty" style={{ height: '100%' }}>Loading...</div>;

  const bottom = s.panePosition === 'bottom';
  const paneOff = s.panePosition === 'off';

  return (
    <div className={`app density-${s.density}`}>
      <header className={`toolbar ${beta ? 'beta' : ''}`}>
        <button className="icon-btn" title="Menu" aria-label="Menu" onClick={(e) => appMenu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), appMenuItems())}><Icon name="menu" /></button>
        <button className={`icon-btn ${s.sidebarVisible ? '' : 'active'}`} title="Show or hide sidebar (Ctrl+Shift+S)" aria-label="Toggle sidebar" disabled={!accounts.length} onClick={() => (narrow ? setMobileNav(!mobileNav) : s.set({ sidebarVisible: !s.sidebarVisible }))}><Icon name="sidebar" /></button>
        <BackButton />
        <button className="icon-btn" title="Check for new mail (F5)" aria-label="Check for new mail" onClick={() => refreshAll()} disabled={!accounts.length}>
          <span style={{ display: 'inline-flex', animation: syncing ? 'spin 1s linear infinite' : undefined }}><Icon name="refresh" /></span>
        </button>
        <button className="btn primary" onClick={() => startCompose('new')} disabled={!accounts.length} title="New email (Ctrl+N)" aria-label="New email"><Icon name="compose" /><span className="hide-narrow">New email</span></button>
        {accounts.length > 0 && <UndoRedo />}
        <span className="spacer" />
        {beta && <span className="beta-pill" title="This is a test build. Settings, then Updates, has the version.">BETA {update.currentVersion}</span>}
        <button
          className="icon-btn"
          title={themeIsDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={themeIsDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => s.set({ theme: themeIsDark ? 'light' : 'dark' })}
        ><Icon name={themeIsDark ? 'sun' : 'moon'} /></button>
        {accounts.length > 0 && <AiStatusButton />}
        {accounts.length > 0 && <SearchBox />}
        <DownloadsButton />
        <RecentButton />
        {accounts.length > 0 && (
          <button
            className={`icon-btn ${s.comingUpOpen && screen !== 'reminders' ? 'active' : ''}`}
            title={screen === 'reminders' ? 'Coming up is already showing on this page' : 'Coming up: meetings and reminders'}
            aria-label="Coming up"
            aria-pressed={s.comingUpOpen && screen !== 'reminders'}
            aria-disabled={screen === 'reminders'}
            style={screen === 'reminders' ? { opacity: 0.45, cursor: 'default' } : undefined}
            onClick={() => { if (screen !== 'reminders') s.set({ comingUpOpen: !s.comingUpOpen }); }}
          ><Icon name="calendar" /></button>
        )}
      </header>
      {accounts.length > 0 && !guide && <MeetingBanner />}
      {accounts.length > 0 && !guide && <OooBanner />}
      {!online && <div className="offline">You're offline. Mail you've already downloaded is still here, and anything you send will go when you're back online.</div>}
      {update.status === 'ready' && <div className="update-bar">Version {update.version} is ready. <button className="btn" onClick={restartToUpdate}>Restart to update</button></div>}
      {guide ? (
        <SetupGuide />
      ) : !accounts.length && screen !== 'settings' && screen !== 'help' ? (
        <Welcome />
      ) : narrow ? (
        <div className="main narrow">
          {mobileNav && (
            <>
              <div className="nav-scrim" onClick={() => setMobileNav(false)} />
              <div className="nav-drawer"><Sidebar width={280} /></div>
            </>
          )}
          {screen === 'mail' ? (
            <div className="content">
              {selectedKey || inlineDraftId ? <ReadingPane onBack={() => useMail.setState({ selectedKey: undefined, selectedKeys: [], inlineDraftId: undefined })} /> : <MessageList style={{ flex: 1, width: '100%', borderRight: 0 }} />}
            </div>
          ) : screen === 'reminders' ? <Reminders /> : screen === 'help' ? <Help /> : screen === 'aidrafts' ? <AiDrafts /> : screen === 'scheduled' ? <ScheduledScreen /> : <SettingsScreen />}
          {s.comingUpOpen && screen !== 'reminders' && <ComingUpPanel />}
        </div>
      ) : (
        <div className={`main ${bottom ? 'bottom' : ''}`}>
          {s.sidebarVisible && screen !== 'settings' && accounts.length > 0 && (
            <>
              <Sidebar width={s.sidebarWidth} />
              <Splitter onDrag={(d) => s.set({ sidebarWidth: Math.max(170, Math.min(420, useSettings.getState().sidebarWidth + d)) })} />
            </>
          )}
          {screen === 'mail' ? (
            <div className="content">
              <MessageList style={paneOff ? { flex: 1, borderRight: 0 } : bottom ? { height: s.listHeight } : { width: s.listWidth }} />
              {!paneOff && (
                <>
                  <Splitter horizontal={bottom} onDrag={(d) => (bottom ? s.set({ listHeight: Math.max(160, Math.min(800, useSettings.getState().listHeight + d)) }) : s.set({ listWidth: Math.max(260, Math.min(760, useSettings.getState().listWidth + d)) }))} />
                  <ReadingPane />
                </>
              )}
            </div>
          ) : screen === 'reminders' ? (
            <Reminders />
          ) : screen === 'help' ? (
            <Help />
          ) : screen === 'aidrafts' ? (
            <AiDrafts />
          ) : screen === 'scheduled' ? (
            <ScheduledScreen />
          ) : (
            <SettingsScreen />
          )}
          {s.comingUpOpen && screen !== 'reminders' && <ComingUpPanel />}
        </div>
      )}
      {appMenu.node}
      <DialogHost />
      <AwaySummary />
      <AiApprovalCard />
      <SmartMailboxEditor />
      <WhatsNew />
      <CommandPalette />
      <Toasts />
      <CrashPrompt />
      <Banners />
    </div>
  );
}

function PopoutWindow() {
  const ready = useMail((s) => s.ready);
  const [route] = useState(() => location.hash.replace('#/popout/', ''));
  const [kind, ...rest] = route.split('/');
  const id = decodeURIComponent(rest.join('/'));
  useEffect(() => {
    document.title = kind === 'compose' ? 'New email' : 'Email';
    rememberPopoutSize(kind);
  }, [kind]);
  if (!ready) return null;
  return (
    <div className="app">
      {kind === 'print' ? <PrintPreview threadKey={id} /> : kind === 'compose' ? <Composer draftId={id} variant="full" /> : <ReadingPane threadKeyOverride={id} standalone />}
      <DialogHost />
      <AiApprovalCard />
      <Toasts />
    </div>
  );
}

export default function App() {
  useTheme();
  useMailtoLinks();
  const popout = isPopout();
  useEffect(() => {
    initMail({ popout, route: popout ? location.hash.replace('#/popout/', '') : undefined });
  }, [popout]);
  // The browser's own right click menu (Back, Refresh, Save as...) isn't useful here. Text boxes keep theirs for copy and paste.
  useEffect(() => {
    if (!isTauri()) return;
    const block = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) e.preventDefault();
    };
    window.addEventListener('contextmenu', block);
    return () => window.removeEventListener('contextmenu', block);
  }, []);
  return popout ? <PopoutWindow /> : <MainWindow />;
}
