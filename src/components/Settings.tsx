// Settings: accounts, signatures, groups, look and feel, reminders, privacy, updates.
import { useState } from 'react';
import { Icon } from './Icon';
import { useMail } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { useSettingsAlerts } from '../lib/alerts';
import { Splitter } from './ui';
import { SideFooter } from './Sidebar';
import type { IconName } from './Icon';
import { AiConnectionTab } from './AiConnection';
import { OutOfOfficeTab } from './OutOfOffice';
import { GeneralTab } from './settings/GeneralTab';
import { AccountsTab } from './settings/AccountsTab';
import { SignaturesTab } from './settings/SignaturesTab';
import { GroupsTab } from './settings/GroupsTab';
import { AppearanceTab } from './settings/AppearanceTab';
import { WritingTab, TemplatesTab } from './settings/WritingTab';
import { NotificationsTab } from './settings/NotificationsTab';
import { RemindersTab } from './settings/CalendarTab';
import { PrivacyTab, PeopleTab } from './settings/PrivacyTab';
import { OfflineTab } from './settings/OfflineTab';
import { ShortcutsTab } from './settings/ShortcutsTab';
import { AccessibilityTab } from './settings/AccessibilityTab';
import { UpdatesTab } from './settings/UpdatesTab';
import { DiagnosticsTab } from './settings/DiagnosticsTab';
import { SendToTab } from './SendTo';

const TABS = [
  ['general', 'General'],
  ['accounts', 'Accounts'],
  ['signatures', 'Signatures & Addresses'],
  ['ooo', 'Out of Office'],
  ['groups', 'Inbox Groups'],
  ['appearance', 'Appearance'],
  ['writing', 'Composing'],
  ['sendto', 'Send To'],
  ['notifications', 'Alerts & Notifications'],
  ['calendar', 'Calendar & Reminders'],
  ['access', 'Accessibility'],
  ['privacy', 'Privacy'],
  ['offline', 'Storage'],
  ['ai', 'AI Connection'],
  ['shortcuts', 'Keyboard Shortcuts'],
  ['updates', 'Updates'],
  ['diagnostics', 'Diagnostics'],
] as const;

/** The groups in the Settings list, by what you're doing (not A to Z), with a gap between each. */
const TAB_GROUPS: string[][] = [['general'], ['accounts', 'signatures', 'ooo', 'groups'], ['appearance', 'writing', 'sendto', 'notifications', 'calendar', 'access'], ['privacy', 'offline', 'ai', 'shortcuts'], ['updates', 'diagnostics']];

/** Each tab's icon and colour: a solid, slightly softened tile with a white line icon. */
const TAB_ICONS: Record<string, [IconName, string]> = {
  general: ['settings', '#7c7c86'], accounts: ['user', '#3b82f6'], signatures: ['pen', '#8b5cf6'], ooo: ['plane', '#f59e0b'], groups: ['layers', '#14b8a6'],
  appearance: ['contrast', '#ec4899'], writing: ['compose', '#0ea5e9'], sendto: ['send', '#06b6d4'], notifications: ['bell', '#ef4444'], calendar: ['calendar', '#e11d48'], access: ['accessibility', '#3b82f6'],
  privacy: ['shield', '#64748b'], offline: ['database', '#22c55e'], ai: ['sparkle', '#a855f7'], shortcuts: ['keyboard', '#a8a29e'], updates: ['refresh', '#f97316'], diagnostics: ['activity', '#84cc16'],
};
const TabIcon = ({ id }: { id: string }) => { const [name, colour] = TAB_ICONS[id] || ['settings', '#888']; return <span className="set-tile" style={{ background: colour }}><Icon name={name} size={13} /></span>; };

/** Things people look for, and where they live. The search box in the Settings sidebar uses this. */
const SETTINGS_INDEX: [string, string, string?][] = [
  ['Add account', 'accounts', 'new gmail outlook icloud yahoo'], ['Account name and colour', 'accounts', 'rename label'], ['Remove account', 'accounts', 'delete sign out'],
  ['Signatures on replies and forwards', 'accounts', 'signature reply forward none'], ['Sending as (addresses)', 'accounts', 'alias send as from'],
  ['Calendars to show', 'accounts', 'hide calendar'], ['Alerts for an account', 'accounts', 'notifications mute'], ['Keep mail from', 'accounts', 'how much mail offline retention storage'],
  ['Show in All Inboxes', 'accounts', 'combined unified'], ['Resync an account', 'accounts', 'refresh sync'],
  ['Signatures', 'signatures', 'signature sign off'], ['Addresses and default From', 'signatures', 'alias from default'],
  ['Inbox Groups', 'groups', 'groups'], ['Theme, light and dark', 'appearance', 'dark mode light colours skin'], ['Accent colour', 'appearance', 'colour'],
  ['Text size', 'access', 'bigger font zoom'], ['Interface font', 'appearance', 'font typeface'], ['Row spacing', 'access', 'density compact roomy'],
  ['Unread colour', 'appearance', 'unread'], ['Composing and writing font', 'writing', 'font compose'], ['Templates', 'writing', 'template canned'],
  ['Undo send', 'writing', 'undo send delay'], ['Spelling: UK, US, Canadian or Australian English', 'writing', 'spelling dictionary language american british us uk'], ['Out of Office', 'ooo', 'vacation holiday auto reply away'],
  ['New mail alerts', 'notifications', 'notifications sound alerts'], ['Quiet hours', 'notifications', 'do not disturb night'], ['Calendar and task alerts', 'notifications', 'reminders calendar summary pop up meeting video call tasks'], ['Video meeting notifications', 'notifications', 'meet zoom teams join banner'], ['Daily summary', 'notifications', 'reminders morning'], ['Alerts from hidden calendars', 'notifications', 'mute hidden calendar'], ['Task lists for new tasks', 'calendar', 'tasks default list ai'],
  ['Week starts on', 'calendar', 'sunday monday calendar first day'], ['Week numbers, weekends and working hours', 'calendar', 'calendar week number weekend work'], ['Suggested events', 'calendar', 'add to calendar dates'],
  ['Open when Windows starts', 'general', 'startup start boot autostart'], ['Close button and the tray', 'general', 'quit tray close'], ['Check for new mail', 'general', 'poll refresh sync how often'], ['Same settings on every computer', 'general', 'sync drive'], ['Sidebar Favourites and hidden items', 'appearance', 'sidebar favourites hidden'],
  ['Blocked senders', 'privacy', 'block spam'], ['Pictures in emails', 'privacy', 'remote images trackers'],
  ['Back up my keys', 'offline', 'google key backup'], ['Export and import mail', 'offline', 'move computer cache'], ['Attachments folder and previews', 'offline', 'downloads save'],
  ['Keyboard Shortcuts', 'shortcuts', 'keys hotkeys'], ['Accessibility', 'access', 'contrast focus motion narrator easy read underline borders'],
  ['Send To places and rules', 'sendto', 'forward hubdoc invoices receipts bookkeeping rules folder save automatic'], ['Find my invoices', 'sendto', 'invoices subscriptions receipts'],
  ['AI Connection', 'ai', 'claude mcp assistant'], ['Updates and test versions', 'updates', 'beta version'], ['Diagnostics', 'diagnostics', 'logs problem'],
];

function SettingsSearch() {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const hits = term ? SETTINGS_INDEX.filter(([label, , words]) => `${label} ${words || ''}`.toLowerCase().includes(term)).slice(0, 8) : [];
  const go = (tab: string) => { useMail.setState({ settingsTab: tab }); setQ(''); };
  return (
    <div className="set-search">
      <input type="search" placeholder="Search settings" aria-label="Search settings" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0][1]); if (e.key === 'Escape') setQ(''); }} />
      {term && (
        <div className="set-search-hits" role="listbox" aria-label="Matching settings">
          {hits.length ? hits.map(([label, tab]) => (
            <button key={label} role="option" aria-selected={false} className="set-search-hit" onClick={() => go(tab)}>
              <span>{label}</span><small>{TABS.find(([t]) => t === tab)?.[1]}</small>
            </button>
          )) : <div className="set-search-none">Nothing matches</div>}
        </div>
      )}
    </div>
  );
}

// Older links to tabs that were folded into others.
const TAB_ALIAS: Record<string, string> = { reminders: 'calendar', templates: 'writing', people: 'privacy', storage: 'offline' };

/** The same width as the mail sidebar, saved when you let go. */
function SettingsSplitter() {
  const width = useSettings((x) => x.sidebarWidth);
  return <Splitter size={{ value: width, min: 170, max: 420, commit: (v) => useSettings.getState().set({ sidebarWidth: v }) }} />;
}

export function SettingsScreen() {
  const sidebarWidth = useSettings((s) => s.sidebarWidth);
  const rawTab = useMail((s) => s.settingsTab);
  const tab = TAB_ALIAS[rawTab] || rawTab;
  const alerts = useSettingsAlerts();
  return (
    <div className="settings" role="main">
      <nav className="settings-nav" aria-label="Settings sections" style={{ width: sidebarWidth }}>
        <div className="side-scroll">
          <button className="side-item" onClick={() => useMail.setState({ screen: 'mail' })}><Icon name="chevronLeft" /> <span className="name">Back to mail</span></button>
          <SettingsSearch />
          {TAB_GROUPS.map((group, gi) => (
            <div key={gi} className="set-group">
              {group.map((id) => (
                <button key={id} className={`side-item ${tab === id ? 'selected' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => useMail.setState({ settingsTab: id })}>
                  <TabIcon id={id} /><span className="name">{TABS.find(([t]) => t === id)![1]}</span>{alerts.tabs[id] ? <span className="attn-dot" title={alerts.tabs[id]} aria-label={alerts.tabs[id]} /> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
        <SideFooter inSettings />
      </nav>
      {/* The same width as the mail sidebar, and dragging either changes both. */}
      <SettingsSplitter />
      <div className="settings-body">
        {tab === 'general' && <GeneralTab />}
        {tab === 'accounts' && <AccountsTab />}
        {tab === 'signatures' && <SignaturesTab />}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'writing' && <><WritingTab /><TemplatesTab /></>}
        {tab === 'sendto' && <SendToTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'calendar' && <RemindersTab />}
        {tab === 'privacy' && <><PrivacyTab /><PeopleTab /></>}
        {tab === 'offline' && <OfflineTab />}
        {tab === 'shortcuts' && <ShortcutsTab />}
        {tab === 'access' && <AccessibilityTab />}
        {tab === 'ai' && <AiConnectionTab />}
        {tab === 'ooo' && <OutOfOfficeTab />}
        {tab === 'updates' && <UpdatesTab />}
        {tab === 'diagnostics' && <DiagnosticsTab />}
      </div>
    </div>
  );
}
