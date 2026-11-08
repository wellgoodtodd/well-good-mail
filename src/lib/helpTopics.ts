// The words in Help. Plain text, so it is easy to keep in step with the app. Searching Help looks at every question,
// answer and keyword here.
import type { IconName } from '../components/Icon';

export interface HelpItem { q: string; a: string; /** Extra words people might search for. */ keywords?: string }
export interface HelpTopic { id: string; title: string; icon: IconName; blurb: string; items: HelpItem[] }

export const TOPICS: HelpTopic[] = [
  {
    id: 'start', title: 'Get started', icon: 'compose', blurb: 'Accounts, writing and sending.',
    items: [
      { q: 'Add another account', a: 'Click Add account in the sidebar, or the menu at the top left. Gmail, Microsoft 365 and Outlook, iCloud, Yahoo, Fastmail and other IMAP mailboxes are all there. Each account gets its own colour, and they all feed into All Inboxes.', keywords: 'new account connect icloud outlook hotmail yahoo imap' },
      { q: 'Connect iCloud, Yahoo or another account', a: 'These need an app password, which you make in your email service\'s own settings. The setup guide opens the right page and tells you what to click. Your normal password is never used, and the app password is kept in Windows Credential Manager on this computer.', keywords: 'icloud apple app specific password yahoo fastmail aol imap smtp' },
      { q: 'Write, reply and send', a: 'New email is top left. Replies open in the reading pane, or in their own window if you switch that on in Settings, then Composing. After Send you have a short time to undo it, set in the same place.', keywords: 'compose new message undo send' },
      { q: 'Save something for later', a: 'Save and close keeps an email as a draft. Closing a window on an unsent email asks whether to keep it, and can remember your answer.', keywords: 'draft' },
      { q: 'Spelling and dictation', a: 'Misspelt words are underlined while you write. Settings, then Composing, can switch that off. The microphone button in the writing toolbar tells you how to start Windows voice typing, which is the Windows key and H.', keywords: 'spell check spelling voice typing speech dictate' },
    ],
  },
  {
    id: 'organise', title: 'Organise', icon: 'folder', blurb: 'Folders, favourites, undo and blocking.',
    items: [
      { q: 'Undo and redo', a: 'The two small buttons beside New email undo and redo your last archive, delete, move, snooze, star and read marks. They are dim until there is something to undo. Click the small arrow, or press and hold a button, to see the last 10 steps and go back several at once. Ctrl+Z and Ctrl+Y work too, when you are not typing in a box.', keywords: 'undo redo oops mistake accidentally deleted restore' },
      { q: 'Make your own folders', a: 'Right click empty space in the sidebar and choose New folder. Drag mailboxes onto it, or right click any mailbox and choose Put in. Drag a row out of a folder to take it out again. Nothing in your mail moves.' },
      { q: 'Rename things', a: 'Right click a mailbox, account or folder and choose Rename, or click a selected one again after a short pause.' },
      { q: 'Pin favourites', a: 'Right click anything and choose Add to Favourites, or drag it into the Favourites section.' },
      { q: 'Leave an account out of All Inboxes', a: 'Settings, then Accounts, has a Show in All Inboxes tick box on each account. Untick it and that account\'s mail stays out of All Inboxes, the unread counts and the taskbar number. It still has its own place under Accounts in the sidebar.', keywords: 'hide combine group exclude test account' },
      { q: 'Block a sender', a: 'Open the More menu on any of their emails and choose Block. Their emails go to Junk, now and in future, and never alert you. Settings, then Privacy, lists everyone you have blocked and lets you unblock them.', keywords: 'spam unwanted stop emails from' },
      { q: 'Quick actions on a message', a: 'Hover over a message and move to the small dots in its bottom right corner. The coloured buttons slide out: archive, flag, snooze, read or unread, and bin. Clicking the dots opens the same menu as a right click.' },
      { q: 'The buttons above an open email', a: 'Reply, Reply All and Forward stay put. The small icons beside them (archive, bin, junk, snooze, print and more) drop into the three dots menu one by one as the window gets narrower, so nothing is lost.', keywords: 'toolbar narrow small window more menu' },
    ],
  },
  {
    id: 'calendar', title: 'Calendar and meetings', icon: 'calendar', blurb: 'Coming up, invitations and video calls.',
    items: [
      { q: 'See what is coming up', a: 'The calendar button at the top right opens Coming up on any screen. Click an event to see its details. The Reminders page has the same list, and a month calendar too, with each account in its own colour. An event that is on several of your calendars shows once, with a dot for each account.', keywords: 'calendar agenda events schedule' },
      { q: 'Join a video meeting', a: 'For events with a Teams, Zoom, Google Meet or Webex link, you get a notification before the meeting and a banner across the top with a Join button. Choose the times in Settings, then Notifications and Reminders, from 1 minute to 3 hours. The banner turns amber as the meeting starts, then coral, and goes by itself 10 minutes later. Test notification and Test banner show you how they look.', keywords: 'zoom teams meet webex banner notification late' },
      { q: 'Answer a calendar invitation', a: 'An email with an invitation gets a card at the top. Click Yes, No or Maybe, and the organiser is told. Change answer is there if you change your mind. Add to calendar puts it in your calendar without answering. Google accounts ask you to sign in once more the first time, so Well Good Mail may change your calendar replies. Your mail stays where it is.', keywords: 'rsvp invite accept decline tentative' },
      { q: 'See who is coming', a: 'Click an event in Coming up and open Guests. A tally shows how many said yes, maybe or no, and each guest has a colour. Click a name to write to them. More has Email everyone, Email those waiting and Refresh answers. Copy invite copies the details so you can paste them into Slack, WhatsApp or an email.', keywords: 'guests attendees responses' },
      { q: 'Hide a calendar', a: 'The Calendars button on the Reminders page and in Coming up switches calendars on or off, and so does Settings, then Accounts. They are the same list. Under it you choose what hidden calendars may still alert you about: everything, video meetings only, or nothing. Meetings you have said No to are always quiet.', keywords: 'holidays turn off show hide' },
      { q: 'A calendar is missing', a: 'Settings, then Accounts, shows each account with its calendars. If an account has no calendar yet, it says why, with a Look again button. Plain email accounts (IMAP) have no calendar. iCloud needs your Apple Account to be set up for calendars.', keywords: 'microsoft icloud outlook not showing' },
    ],
  },
  {
    id: 'ai', title: 'AI connection', icon: 'sparkle', blurb: 'Let Claude and other AI apps use your mail.',
    items: [
      { q: 'Connect an AI app', a: 'Settings, then AI connection. Switch it on, set an account to Read only, then click Set up and pick the app: Claude Desktop, Claude Code, ChatGPT desktop or Gemini CLI. A checklist ticks itself as each step happens, and suggests questions to try. Only apps on this computer can connect.', keywords: 'claude chatgpt gemini mcp assistant' },
      { q: 'What the AI can see and do', a: 'Each account is Off, Read only or Read and write, and new accounts start Off. This version can only look: search, read emails and see the calendar. Under What it can do, each thing is Off, Ask or Allow. Customise beside an account gives that account its own settings. Deleting for good, changing accounts and seeing passwords are never possible.', keywords: 'permissions access read only' },
      { q: 'When the AI asks first', a: 'For anything set to Ask, Well Good Mail comes to the front with a card. Allow once, Allow for 1 hour, Always allow (which changes the setting to Allow), or Refuse. Untick an account to leave just that one out. Anything that reaches other people always asks.', keywords: 'approve allow refuse prompt' },
      { q: 'Pausing and stopping it', a: 'The sparkle in the top bar shows the connection: lit when an AI app is connected, dimmed when paused. Click it, or use the tray menu, to pause. It also pauses itself when nothing has asked for a while (1 hour unless you change it). The next request then asks you to resume, so an unexpected one is easy to spot. The main switch in Settings cuts every connection at once.', keywords: 'pause idle off stop' },
      { q: 'After updating Well Good Mail', a: 'Restart your AI app (quit Claude fully, from the tray too) so it connects again. Well Good Mail reminds you after an update.', keywords: 'restart reconnect stopped running' },
      { q: 'See what the AI did', a: 'Activity, at the bottom of Settings, AI connection, lists everything, newest first: which app, what it did, and anything refused.', keywords: 'log history' },
    ],
  },
  {
    id: 'reading', title: 'Reading and printing', icon: 'filePdf', blurb: 'Attachments, print and PDF.',
    items: [
      { q: 'Print an email or save it as a PDF', a: 'Use the printer or PDF buttons above the open email, Print in the top left menu, right click, or Ctrl+P. Both open the Windows print window, with the whole conversation laid out on a clean page. For a PDF, choose Save as PDF as the printer.', keywords: 'print pdf export save' },
      { q: 'Preview or save attachments', a: 'Click an attachment to preview it, hover for a peek, or right click to save one or all of them to a folder.', keywords: 'download save all' },
    ],
  },
  {
    id: 'search', title: 'Search and filters', icon: 'search', blurb: 'Finding what you need.',
    items: [
      { q: 'Search where you are', a: 'The search box looks in the mailbox you are in. Use All mail beside the results to search everywhere.', keywords: 'find' },
      { q: 'Show only unread', a: 'The unread button above the list filters to unread mail. The button beside it groups replies into conversations or lists every message.', keywords: 'filter' },
    ],
  },
  {
    id: 'yours', title: 'Make it yours', icon: 'settings', blurb: 'Themes, alerts and shortcuts.',
    items: [
      { q: 'Light and dark', a: 'The sun and moon button at the top switches between them. Settings, then Appearance, has eight colour themes, each with its own account colours, plus fonts, density and the layout of the panes.', keywords: 'theme colours dark mode' },
      { q: 'Account colours', a: 'Click an account\'s dot in the sidebar to choose its colour, or pick a whole palette in Settings, then Appearance.' },
      { q: 'New mail alerts', a: 'Settings, then Notifications, chooses what is announced (all new mail, only important senders, or nothing). While the app is open you get a small banner inside it, otherwise a Windows notification. The sound and Do not disturb are controlled by Windows, and there are buttons to test both kinds and to open the Windows settings.', keywords: 'notifications sound banner' },
      { q: 'Keyboard shortcuts', a: 'Settings, then Keyboard shortcuts, lists them all and lets you change any of them.', keywords: 'keys hotkeys' },
    ],
  },
  {
    id: 'accounts', title: 'Accounts and your mail', icon: 'user', blurb: 'Signing in, backups and moving.',
    items: [
      { q: 'An account needs signing in again', a: 'A coral dot appears on Settings and on the account. Click Sign in beside it. For iCloud and other app password accounts, you enter a new app password. Your saved mail stays where it is meanwhile.', keywords: 'password sign in error unauthorised' },
      { q: 'Back up your app keys', a: 'Settings, then Search & Storage, has Back up my keys. It saves the Google key from the setup guide to a file you choose, so a reinstall or a new computer doesn\'t mean another ten minute setup. The file holds your Google secret, so keep it somewhere private.', keywords: 'google key backup restore reinstall client secret' },
      { q: 'Move your mail to another computer', a: 'Settings, then Search & Storage, has Export and Import under Moving to another computer. The file holds your emails, so keep it somewhere private. You sign in to your accounts again on the new computer.', keywords: 'transfer new pc export import' },
    ],
  },
  {
    id: 'questions', title: 'Common questions', icon: 'help', blurb: 'The things people ask most.',
    items: [
      { q: 'Try a test version', a: 'In Settings, then Updates, switch on Tell me about test versions. When a newer test version exists, a card shows with What\'s new in it and Download. Nothing installs by itself, and you stay on the full release until you download it. A test version always looks for newer ones. Full releases update by themselves.', keywords: 'beta update new version download' },
      { q: 'Why does Google keep signing me out?', a: 'Until your Google project is published, Google signs you out about once a week. Settings, then Accounts, has a short guide to stop that.', keywords: 'weekly seven days testing' },
      { q: 'Is my email stored anywhere but this computer?', a: 'No. Mail is kept on this computer and the app talks straight to your email service. There is no Well Good Mail server. Your keys and passwords are in Windows Credential Manager.', keywords: 'privacy security private' },
      { q: 'Why does an email show odd symbols?', a: 'Usually the sender labelled the text wrongly. The app corrects the common case. If you still see one, tell us using the link below.', keywords: 'garbled characters encoding' },
    ],
  },
];

/** Words in a search, lower case. */
const words = (q: string) => q.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 1);

/** True when every word typed appears somewhere in the question, answer or keywords. */
export function matches(item: HelpItem, query: string): boolean {
  const ws = words(query);
  if (!ws.length) return true;
  const hay = `${item.q} ${item.a} ${item.keywords || ''}`.toLowerCase();
  return ws.every((w) => hay.includes(w));
}

/** The topics left once a search is applied. With no search, everything. */
export function searchHelp(query: string, topics: HelpTopic[] = TOPICS): HelpTopic[] {
  if (!words(query).length) return topics;
  return topics.map((t) => ({ ...t, items: t.items.filter((i) => matches(i, query)) })).filter((t) => t.items.length);
}

export const countItems = (topics: HelpTopic[]) => topics.reduce((n, t) => n + t.items.length, 0);
