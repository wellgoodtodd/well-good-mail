// User settings, saved locally. Defaults match the spec.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccountGroup, Template } from './types';

export type ThemeSetting = 'dark' | 'light' | 'system';
export type ReminderMode = 'never' | 'daily' | 'important' | 'all';
export type ImagePolicy = 'block' | 'known' | 'always';
export type PanePosition = 'right' | 'bottom' | 'off';

export interface Settings {
  theme: ThemeSetting;
  accent: string;
  density: 'compact' | 'comfortable';
  textScale: number;
  panePosition: PanePosition;
  previewLines: 0 | 1 | 2 | 3;
  sidebarVisible: boolean;
  sidebarWidth: number;
  listWidth: number;
  listHeight: number;
  threaded: boolean;
  /** Show the newest message at the top of an open conversation. */
  newestFirstInThread: boolean;
  /** Order of the icon buttons above an open email. Drag them to change it. */
  toolbarOrder: string[];
  /** Order of the tabs down the left of Settings (drag to change). */
  settingsOrder: string[];
  /** Names you gave sidebar items, by item ref. Only changes how they look here, never the mail account. */
  sidebarNames: Record<string, string>;
  /** Folders made in the sidebar. Each holds refs (see Sidebar.tsx), so a folder only points at things. */
  customFolders: { id: string; name: string; items: string[] }[];
  /** The Google project has been published, so Google no longer signs you out every 7 days. Hides the reminder card. */
  googlePublished: boolean;
  /** Colour themes (see skins.ts): one for dark mode and one for light mode. */
  darkSkin: string;
  lightSkin: string;
  /** Use the colour blind friendly account colours, whatever the theme. */
  colourBlindAccounts: boolean;

  interfaceFont: string;
  writingFont: string;
  writingSize: number;
  writingColour: string;
  readingFont: string;

  defaultFromEmail: string;
  /** Signature overrides by alias email (HTML). Empty string = no signature. */
  signatures: Record<string, string>;
  signaturePlacement: 'above' | 'below';
  undoSendSeconds: 0 | 10 | 20 | 30 | 60;
  /** What closing a pop out window does when its email is not sent: ask, keep it as a draft, or throw it away. */
  closeUnsent: 'ask' | 'save' | 'discard';
  defaultReply: 'reply' | 'replyAll';
  popOutCompose: boolean;

  pollSeconds: number;
  reminderMode: ReminderMode;
  summaryTime: string;
  flashTaskbar: boolean;
  importantEvents: string[];
  /** Two notifications before a meeting that has a video link, each on its own switch and time (whole minutes). */
  meetingAlert1On: boolean;
  meetingAlert1Mins: number;
  meetingAlert2On: boolean;
  meetingAlert2Mins: number;
  /** The bar over your mail before a meeting with a video link. */
  meetingBanner: boolean;
  meetingBannerMins: number;
  /** The Coming up column beside your mail. */
  comingUpOpen: boolean;
  remindersView: 'list' | 'calendar';
  /** Calendars switched off in the calendar and Coming up, as "accountId|calendar name". Alerts still use them. */
  hiddenCalendars: string[];

  newMailAlerts: 'all' | 'important' | 'off';
  alertSound: boolean;
  /** What a new mail alert does while the app is open and in front of you. */
  appOpenAlerts: 'banner' | 'windows' | 'off';
  quietHours: { enabled: boolean; from: string; to: string };

  imagePolicy: ImagePolicy;
  trustedSenders: string[];
  blockTrackers: boolean;
  darkEmails: boolean;

  /** Red underlines under misspelt words while writing. */
  spellCheck: boolean;
  /** When the app keys were last backed up to a file (0 = never). */
  keysBackedUpAt: number;
  /** The last main version whose What's new pop-up was shown on this computer. */
  whatsNewSeen: string;
  vips: string[];
  /** Senders whose emails go straight to Junk. */
  blockedSenders: string[];
  mutedThreads: string[];
  templates: Template[];
  groups: AccountGroup[];
  collapsed: Record<string, boolean>;
  hiddenFolders: string[];
  /** Sidebar items pinned to Favourites, in order (refs like "acc|<id>|junk"). */
  favourites: string[];
  /** Sidebar items tucked away in the Hidden section. */
  hiddenItems: string[];
  /** Pre send checks, each of which can be switched off. */
  warnings: { noSubject: boolean; missingAttachment: boolean; manyRecipients: boolean; fromMismatch: boolean };

  shortcuts: 'gmail' | 'none';
  /** Custom key combos by action id; missing = default. */
  keybindings: Record<string, string[]>;
  /** Thin account colour stripe on each email in combined views. */
  showAccountStripe: boolean;
  palette: string;
  /** Unread counts in the sidebar. */
  badges: { enabled: boolean; style: 'pill' | 'plain' | 'dot'; colour: string; inbox: boolean; junk: boolean; drafts: boolean; labels: boolean; flagged: boolean };
  /** Sidebar items whose count is switched off. */
  badgeHidden: string[];
  /** Colour of the unread dot in the email list ('' = accent colour). */
  unreadColour: string;
  autoUpdate: boolean;
  startWithWindows: boolean;
  /** The window's close button quits the app instead of tucking it into the tray. */
  closeQuits: boolean;
  /** Keep settings the same on every computer through a small file in Google Drive. */
  syncSettings: boolean;
  /** Show each Google account's profile picture instead of its coloured dot. */
  accountIcons: boolean;
  /** Show a small photo (or initials) beside each message in the list. */
  senderPhotos: boolean;
  /** Days to keep offline for new accounts. null = everything. */
  defaultRetentionDays: number | null;
  demoMode: boolean;
}

/** The folder that holds Drafts, Sent, Junk, Bin and Archive. It is a normal folder, so it can be renamed, changed or deleted. */
export const MORE_FOLDER = { id: 'more', name: 'Drafts, Sent, Bin and more', items: ['all|drafts', 'all|sent', 'all|junk', 'all|bin', 'all|archive'] };

export const defaultSettings: Settings = {
  theme: 'dark',
  accent: '#3B82F6',
  density: 'comfortable',
  textScale: 1,
  panePosition: 'right',
  previewLines: 2,
  sidebarVisible: true,
  sidebarWidth: 240,
  listWidth: 380,
  listHeight: 320,
  threaded: true,
  newestFirstInThread: false,
  settingsOrder: [],
  sidebarNames: {},
  customFolders: [MORE_FOLDER],
  googlePublished: false,
  darkSkin: 'graphite',
  lightSkin: 'paper',
  colourBlindAccounts: false,
  toolbarOrder: ['archive', 'bin', 'junk', 'read', 'flag', 'snooze', 'popout', 'more'],

  interfaceFont: 'Inter',
  writingFont: 'Rubik',
  writingSize: 11,
  writingColour: '',
  readingFont: 'Rubik',

  defaultFromEmail: '',
  signatures: {},
  signaturePlacement: 'above',
  undoSendSeconds: 20,
  closeUnsent: 'ask',
  defaultReply: 'reply',
  popOutCompose: false,

  pollSeconds: 30,
  reminderMode: 'important',
  summaryTime: '08:30',
  flashTaskbar: false,
  importantEvents: [],
  meetingAlert1On: true,
  meetingAlert1Mins: 15,
  meetingAlert2On: true,
  meetingAlert2Mins: 5,
  meetingBanner: true,
  meetingBannerMins: 5,
  comingUpOpen: false,
  remindersView: 'list',
  hiddenCalendars: [],

  newMailAlerts: 'important',
  alertSound: false,
  appOpenAlerts: 'banner',
  quietHours: { enabled: false, from: '22:00', to: '07:00' },

  imagePolicy: 'block',
  trustedSenders: [],
  blockTrackers: true,
  darkEmails: true,

  spellCheck: true,
  keysBackedUpAt: 0,
  whatsNewSeen: '',
  vips: [],
  blockedSenders: [],
  mutedThreads: [],
  templates: [
    {
      id: 'tpl-quote',
      name: 'Quote follow up',
      html: '<p>Hi [Name],</p><p>Just checking in on the quote I sent over for [Project]. Happy to talk it through or adjust anything.</p>',
    },
  ],
  groups: [],
  collapsed: { 'sec:hidden': true },
  hiddenFolders: [],
  favourites: ['all|inbox', 'all|vip', 'all|flagged'],
  hiddenItems: [],
  warnings: { noSubject: true, missingAttachment: true, manyRecipients: true, fromMismatch: true },

  shortcuts: 'gmail',
  keybindings: {},
  showAccountStripe: true,
  palette: 'classic',
  badges: { enabled: true, style: 'pill', colour: '#F28C76', inbox: true, junk: false, drafts: true, labels: true, flagged: false },
  badgeHidden: [],
  unreadColour: '',
  autoUpdate: true,
  startWithWindows: true,
  closeQuits: false,
  syncSettings: false,
  accountIcons: false,
  senderPhotos: false,
  defaultRetentionDays: 365,
  demoMode: false,
};

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  toggleIn: (key: 'vips' | 'blockedSenders' | 'mutedThreads' | 'trustedSenders' | 'importantEvents' | 'hiddenFolders', value: string) => void;
  reset: () => void;
  pin: (ref: string, index?: number) => void;
  unpin: (ref: string) => void;
  hide: (ref: string) => void;
  unhide: (ref: string) => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      set: (patch) => set(patch),
      toggleIn: (key, value) => {
        const list = get()[key] as string[];
        const v = value.toLowerCase();
        set({ [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] } as Partial<Settings>);
      },
      reset: () => set(defaultSettings),
      pin: (ref, index) => {
        const list = get().favourites.filter((r) => r !== ref);
        list.splice(index ?? list.length, 0, ref);
        set({ favourites: list, hiddenItems: get().hiddenItems.filter((r) => r !== ref) });
      },
      unpin: (ref) => set({ favourites: get().favourites.filter((r) => r !== ref) }),
      hide: (ref) => set({ hiddenItems: [...new Set([...get().hiddenItems, ref])], favourites: get().favourites.filter((r) => r !== ref), customFolders: get().customFolders.map((f) => ({ ...f, items: f.items.filter((r) => r !== ref) })) }),
      unhide: (ref) => set({ hiddenItems: get().hiddenItems.filter((r) => r !== ref) }),
    }),
    {
      name: 'wgm-settings',
      version: 4,
      // Version 4: the video meeting notifications and the bar over the mail are on for everyone (they can still be switched off after this).
      // Version 2: emails follow the app's dark mode by default (it used to be off).
      // Version 3: "Drafts, Sent, Bin and more" is an ordinary folder you can change (it keeps a name you gave it).
      migrate: (persisted, from) => {
        let p = persisted as Partial<Settings>;
        if (from < 2) p = { ...p, darkEmails: true };
        if (from < 3) {
          const names = { ...(p.sidebarNames || {}) };
          const custom = names['all-folders'];
          delete names['all-folders'];
          const folders = p.customFolders || [];
          p = { ...p, sidebarNames: names, customFolders: folders.some((f) => f.id === MORE_FOLDER.id) ? folders : [{ ...MORE_FOLDER, name: custom || MORE_FOLDER.name }, ...folders] };
        }
        if (from < 4) p = { ...p, meetingAlert1On: true, meetingAlert2On: true, meetingBanner: true };
        return p as SettingsStore;
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<Settings>;
        return { ...current, ...p, warnings: { ...current.warnings, ...(p?.warnings || {}) }, badges: { ...current.badges, ...(p?.badges || {}) } };
      },
    },
  ),
);

/** Read settings outside React. */
export const settings = () => useSettings.getState();

export function isQuietNow(s: Settings, now = new Date()): boolean {
  if (!s.quietHours.enabled) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = s.quietHours.from.split(':').map(Number);
  const [th, tm] = s.quietHours.to.split(':').map(Number);
  const from = fh * 60 + fm;
  const to = th * 60 + tm;
  return from <= to ? mins >= from && mins < to : mins >= from || mins < to;
}
