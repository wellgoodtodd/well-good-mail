// The main window and pop out windows.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { ReadingPane } from './components/ReadingPane';
import { Composer } from './components/Composer';
import { Reminders } from './components/Reminders';
import { Help } from './components/Help';
import { SetupGuide, useGuide, openGuide } from './components/SetupGuide';
import { UndoRedo } from './components/UndoRedo';
import { printThread } from './lib/print';
import { redoSteps, undoSteps, useHistory } from './lib/history';
import { SettingsScreen } from './components/Settings';
import { Splitter, useMenu, type MenuItem } from './components/ui';
import { addAccountItems } from './lib/accountMenu';
import { useSettings } from './lib/settings';
import { skinById, SKIN_VARS, buttonFill, accentOn } from './lib/skins';
import { useBanners, dismissBanner, showBanner } from './lib/banners';
import { backupDue, haveOwnKeys } from './lib/backup';
import {
  useMail, initMail, refreshAll, runSearch, dismissToast, archive, trash, toggleFlag, markRead, selectedMessageIds, selectThread, startDemo,
  markSpam, snooze, markViewRead, openScreen,
  adoptOutboxItem, messagesInThread, reloadMessagesFromDb, toast, reconnectAccount,
} from './lib/mail';
import { startCompose, popoutMessage } from './lib/composeActions';
import { useViewList } from './lib/useList';
import { threadKey, viewTitle } from './lib/mailbox';
import type { View } from './lib/types';
import { checkReminderAlerts } from './lib/reminders';
import { startSettingsSync } from './lib/settingsSync';
import { restoreOpenDrafts } from './lib/openDrafts';
import { CommandPalette } from './components/CommandPalette';
import { isPopout, isTauri, onTauriEvent, rememberPopoutSize, setAutostart, setCloseQuits } from './lib/platform';
import { loadGoogleKeys, useGoogleConfigured } from './lib/auth/google';
import { loadMicrosoftKeys } from './lib/auth/microsoft';
import { startUpdateChecks, useUpdates, restartToUpdate } from './lib/updater';
import './lib/sender';
import { DialogHost } from './components/DialogHost';
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
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span className="t">{t.text}</span>
          {t.undo && <button onClick={() => { t.undo!(); dismissToast(t.id); }}>Undo</button>}
          {t.action && <button onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>}
          <button className="x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><Icon name="close" size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function Welcome() {
  const configured = useGoogleConfigured();
  const menu = useMenu();
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
        {!configured && <p className="note">Gmail needs a free key from Google first. The guide takes about 10 minutes and walks you through it.</p>}
        {menu.node}
      </div>
    </div>
  );
}

function SearchBox() {
  const query = useMail((s) => s.searchQuery);
  const view = useMail((s) => s.view);
  const accounts = useMail((s) => s.accounts);
  const folders = useMail((s) => s.folders);
  const groups = useSettings((s) => s.groups);
  // The box says where it will look: the mailbox you are in, or all mail once a search is open.
  const here: View = view.mailbox.kind === 'search' ? { scope: view.scope, mailbox: view.mailbox.within || view.mailbox } : view;
  const where = view.mailbox.kind === 'search' && !view.mailbox.within ? 'all mail' : viewTitle(here, (id) => accounts.find((a) => a.id === id)?.label || '', (id) => groups.find((g) => g.id === id)?.name || 'Group', (acc, id) => folders[acc]?.find((f) => f.id === id)?.name || 'Label');
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
      { label: 'Save as PDF', icon: 'filePdf', disabled: !hasThread, onClick: () => { if (st0.selectedKey) printThread(st0.selectedKey, { pdf: true }); } },
      { divider: true },
      { label: 'Add account', icon: 'plus', submenu: addAccountItems() },
      { divider: true },
      { label: 'Reminders', icon: 'bell', onClick: () => openScreen('reminders') },
      { label: 'Settings', icon: 'settings', submenu: [tab('Accounts', 'accounts'), tab('Appearance', 'appearance'), tab('Notifications and reminders', 'notifications'), tab('Keyboard shortcuts', 'shortcuts'), tab('Updates', 'updates'), tab('Diagnostics', 'diagnostics')] },
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

  if (!ready) return <div className="pane-empty" style={{ height: '100%' }}>Loading...</div>;

  const bottom = s.panePosition === 'bottom';
  const paneOff = s.panePosition === 'off';

  return (
    <div className={`app density-${s.density}`}>
      <header className="toolbar">
        <button className="icon-btn" title="Menu" aria-label="Menu" onClick={(e) => appMenu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), appMenuItems())}><Icon name="menu" /></button>
        <button className={`icon-btn ${s.sidebarVisible ? '' : 'active'}`} title="Show or hide sidebar (Ctrl+Shift+S)" aria-label="Toggle sidebar" onClick={() => (narrow ? setMobileNav(!mobileNav) : s.set({ sidebarVisible: !s.sidebarVisible }))}><Icon name="sidebar" /></button>
        <button className="icon-btn" title="Check for new mail (F5)" aria-label="Check for new mail" onClick={() => refreshAll()} disabled={!accounts.length}>
          <span style={{ display: 'inline-flex', animation: syncing ? 'spin 1s linear infinite' : undefined }}><Icon name="refresh" /></span>
        </button>
        <button className="btn primary" onClick={() => startCompose('new')} disabled={!accounts.length} title="New email (Ctrl+N)" aria-label="New email"><Icon name="compose" /><span className="hide-narrow">New email</span></button>
        {accounts.length > 0 && <UndoRedo />}
        <span className="spacer" />
        <button
          className="icon-btn"
          title={themeIsDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={themeIsDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => s.set({ theme: themeIsDark ? 'light' : 'dark' })}
        ><Icon name={themeIsDark ? 'sun' : 'moon'} /></button>
        {accounts.length > 0 && <SearchBox />}
      </header>
      {!online && <div className="offline">You're offline. Mail you've already downloaded is still here, and anything you send will go when you're back online.</div>}
      {update.status === 'ready' && <div className="update-bar">Version {update.version} is ready. <button className="btn" onClick={restartToUpdate}>Restart to update</button></div>}
      {guide ? (
        <SetupGuide />
      ) : !accounts.length ? (
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
          ) : screen === 'reminders' ? <Reminders /> : screen === 'help' ? <Help /> : <SettingsScreen />}
        </div>
      ) : (
        <div className={`main ${bottom ? 'bottom' : ''}`}>
          {s.sidebarVisible && screen !== 'settings' && (
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
          ) : (
            <SettingsScreen />
          )}
        </div>
      )}
      {appMenu.node}
      <DialogHost />
      <CommandPalette />
      <Toasts />
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
      {kind === 'compose' ? <Composer draftId={id} variant="full" /> : <ReadingPane threadKeyOverride={id} standalone />}
      <DialogHost />
      <Toasts />
    </div>
  );
}

export default function App() {
  useTheme();
  const popout = isPopout();
  useEffect(() => {
    initMail({ popout });
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
