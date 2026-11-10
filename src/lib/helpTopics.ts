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
      { q: 'Send an email later', a: 'Click the arrow beside Send and pick a time, or Pick a date and time for the calendar. It starts an hour from now; type a date and time or pick them, then Schedule. Scheduled emails wait under Scheduled at the bottom of the sidebar. Click one to read it, change its time, open it in the editor (it stays scheduled; Keep scheduled saves your changes) or put it back in your drafts.', keywords: 'schedule later delay timed tomorrow morning' },
      { q: 'Scheduled email when the app is closed', a: 'Windows starts Well Good Mail in the tray at the send time, waking the PC from sleep if needed, and it sends. It can\'t send while the PC is switched off; it sends as soon as you next open it. Settings, then Composing, can change this to wait until Well Good Mail is open.', keywords: 'wake sleep closed tray scheduled task' },
      { q: 'Choose a signature', a: 'The Signature menu at the right end of the formatting bar starts on the From address\'s own signature. Pick another address\'s, or None, for just this email. Set up signatures in Settings, then Signatures & Addresses.', keywords: 'signature none different sign off' },
      { q: 'Spelling and dictation', a: 'Misspelt words are underlined while you write. Settings, then Composing, can switch that off. The microphone button in the writing toolbar tells you how to start Windows voice typing, which is the Windows key and H.', keywords: 'spell check spelling voice typing speech dictate' },
    ],
  },
  {
    id: 'organise', title: 'Organise', icon: 'folder', blurb: 'Folders, favourites, undo and blocking.',
    items: [
      { q: 'Undo and redo', a: 'The two small buttons beside New email undo and redo almost anything: archive, delete, move, snooze, star and read marks, settings changes, AI Drafts (deleting, moving between groups) and account names, colours and alerts. They are dim until there is something to undo. Click the small arrow, or press and hold a button, to see the last steps and go back several at once. Ctrl+Z and Ctrl+Y work too; in a text box they undo your typing instead. Removing an account and changing Keep mail from can\'t be undone.', keywords: 'undo redo oops mistake accidentally deleted restore settings' },
      { q: 'Back and Forward', a: 'The arrows beside the sidebar button take you back to where you were (a mailbox, a search, a Settings page) and forward again. Alt+Left and Alt+Right, or your mouse\'s side buttons, do the same.', keywords: 'back forward previous history navigate' },
      { q: 'Smart Mailboxes', a: 'A Smart Mailbox is a saved set of rules, like everything from a client or unread with attachments, kept up to date in the sidebar. Click New Smart Mailbox, or Save as Smart Mailbox after a search, or Make a Smart Mailbox for them on a person\'s card. Right-click one to edit, rename, duplicate, hide or delete it. Drag them to change the order.', keywords: 'saved search rules filter smart folder' },
      { q: 'Change the order of the sidebar', a: 'Drag a section heading (Favourites, Mailboxes, Smart Mailboxes, Accounts, AI Drafts) up or down, or right-click it for Move up, Move down and Reset section order.', keywords: 'reorder sections move sidebar order' },
      { q: 'Make your own folders', a: 'Right click empty space in the sidebar and choose New folder. Drag mailboxes onto it, or right click any mailbox and choose Put in. Drag a row out of a folder to take it out again. Nothing in your mail moves.' },
      { q: 'Rename things', a: 'Right click a mailbox, account or folder and choose Rename, or click a selected one again after a short pause.' },
      { q: 'Pin favourites', a: 'Right click anything and choose Add to Favourites, or drag it into the Favourites section.' },
      { q: 'Leave an account out of All Inboxes', a: 'Settings, then Accounts: pick the account in the list and switch off Show in All Inboxes. Its mail then stays out of All Inboxes, the unread counts and the taskbar number. It still has its own place under Accounts in the sidebar.', keywords: 'hide combine group exclude test account' },
      { q: 'Change an account\'s name, colour or order', a: 'Settings, then Accounts. Pick the account in the list on the left: click its name at the top to rename it, and its coloured square to change the colour. Drag accounts in the list to change their order, which is also their order in the sidebar.', keywords: 'rename colour order reorder move account' },
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
      { q: 'Set Out of Office', a: 'Settings, then Out of Office (also in the top left menu and the tray menu). Tick the accounts, choose From now until I turn it off or Between dates, who gets a reply, and the message, then Turn on or Schedule. Dates are whole days: First day away starts at midnight, and replies stop at the end of the day before Back on. Set times as well for part days. It is set inside Gmail and Outlook, so replies go out with your computer off, and an amber bar shows while it is on. Gmail replies to each person once every 4 days. iCloud and other email accounts set it in their own web mail.', keywords: 'ooo vacation holiday auto reply away responder' },
      { q: 'Out of Office asks me to sign in', a: 'Each Google or Microsoft account signs in once more the first time it uses Out of Office, to allow it. Click Sign in on the account in Settings, Out of Office. Your mail stays where it is.', keywords: 'permission sign in ooo' },
      { q: 'Add a date from an email to my calendar', a: 'When an email from a person mentions a day and a time, a card at the top offers Add to calendar. Change details lets you fix the title or time first. The menu has Don\'t suggest from this sender. It is read on this computer, with no AI. Switch it off in Settings, Notifications & Reminders.', keywords: 'suggested event calendar date time' },
      { q: 'A calendar is missing', a: 'Settings, then Accounts, shows each account with its calendars. If an account has no calendar yet, it says why, with a Look again button. Plain email accounts (IMAP) have no calendar. iCloud needs your Apple Account to be set up for calendars.', keywords: 'microsoft icloud outlook not showing' },
    ],
  },
  {
    id: 'ai', title: 'AI Connection', icon: 'sparkle', blurb: 'Let Claude and other AI apps use your mail.',
    items: [
      { q: 'Connect an AI app', a: 'Settings, then AI Connection. Switch it on, set an account to Read only, then click Set up and pick the app: Claude Desktop, Claude Code, ChatGPT desktop or Gemini CLI. A checklist ticks itself as each step happens, and suggests questions to try. Only apps on this computer can connect.', keywords: 'claude chatgpt gemini mcp assistant' },
      { q: 'What the AI can see and do', a: 'Each account is Off, Read only or Read and write, and new accounts start Off. It can search, read emails and see the calendar, and for accounts set to Read and write it can write drafts. It never sends anything. Under What it can do, each thing is Off, Ask or Allow. Customise beside an account gives that account its own settings. Deleting for good, changing accounts and seeing passwords are never possible.', keywords: 'permissions access read only' },
      { q: 'When the AI asks first', a: 'For anything set to Ask, Well Good Mail comes to the front with a card. Allow once, Allow for 1 hour, Always allow (which changes the setting to Allow), or Refuse. Untick an account to leave just that one out. Anything that reaches other people always asks.', keywords: 'approve allow refuse prompt' },
      { q: 'Pausing and stopping it', a: 'The sparkle in the top bar shows the connection: lit when an AI app is connected, dimmed when paused. Click it, or use the tray menu, to pause. It also pauses itself when nothing has asked for a while (1 hour unless you change it). The next request then asks you to resume, so an unexpected one is easy to spot. The main switch in Settings cuts every connection at once.', keywords: 'pause idle off stop' },
      { q: 'After updating Well Good Mail', a: 'There\'s nothing to do. The AI app stays connected and is told about any new tools by itself. If one ever stops answering, quit it fully (from the tray too) and open it again.', keywords: 'restart reconnect stopped running update' },
      { q: 'Drafts written by the AI', a: 'When an AI app writes a draft, the card shows the whole draft first: Save draft, Edit first (opens it for you to change), Allow for 1 hour, Always allow or Refuse. Drafts go in that account\'s Drafts folder and are listed together under AI Drafts in the sidebar. Nothing is ever sent for you.', keywords: 'draft write reply compose assistant' },
      { q: 'Working through AI Drafts', a: 'Each draft is a card. Send, Open in editor and Delete sit on the right; right-click Send for Send later. Click a card to open it right there: change who it\'s to (with Cc and Bcc), the subject and the message, with basic formatting and the signature menu. Changes save by themselves. Replies keep the earlier emails folded away underneath. Tick several drafts to change their group, send them later or delete them together. Sort and search are at the top, and a dot marks drafts that came in since you last looked. Keys: up and down, Enter to open, E for the editor, X to tick, Delete.', keywords: 'quick edit card send later tick select sort keyboard' },
      { q: 'Groups for AI Drafts', a: 'AI Drafts in the sidebar has groups, starting with Clients, Prospects, Personal and Admin. The AI picks one as it writes. Click a group to see only those drafts, use the tag on a draft to move it, and right-click a group to change its colour, rename or delete it. Deleting a group keeps its drafts. Settings, then AI Connection, has the groups too, and a Sign-off the AI ends every draft with (like All the best,). On Gmail, groups show as labels (AI Drafts, then the group), so they follow you to other devices, and sent emails keep them.', keywords: 'group label tag folder clients prospects personal admin colour sign off' },
      { q: 'Drafts made in Gmail', a: 'A draft you start in Gmail on the web or your phone (or an assistant makes there) shows under AI Drafts too, in No Group, marked Made in Gmail, with your signature added when it\'s sent. Drafts sent or deleted in Gmail leave AI Drafts within a couple of minutes.', keywords: 'gmail phone web outside draft' },
      { q: 'The sparkle in the top bar', a: 'It shows while the AI Connection is on. Point at it to see where things stand: not set up yet, not connected, in use, quiet, waiting for your answer or paused. Click it for the AI Connection settings. Right-click it to pause or resume.', keywords: 'sparkle status pause resume icon' },
      { q: 'See what the AI did', a: 'Activity, at the bottom of Settings, AI Connection, lists everything, newest first: which app, what it did, and anything refused.', keywords: 'log history' },
    ],
  },
  {
    id: 'reading', title: 'Reading and printing', icon: 'filePdf', blurb: 'Attachments, print and PDF.',
    items: [
      { q: 'Print an email or save it as a PDF', a: 'Use the printer or PDF buttons above the open email, Print in the top left menu, right click, or Ctrl+P. Both open the Windows print window, with the whole conversation laid out on a clean page. For a PDF, choose Save as PDF as the printer.', keywords: 'print pdf export save' },
      { q: 'Preview or save attachments', a: 'Click an attachment to preview it, hover for a peek, or right click to save one or all of them to a folder. Files that can\'t be previewed here, like Word, Excel or Pages, open straight away in their own app. Changes made there aren\'t saved back to the email, so use Save to keep a copy. Programs and scripts are never opened straight from an email.', keywords: 'download save all open word excel' },
      { q: 'Save attachments to one folder', a: 'Settings, then Search & Storage, has Save attachments to: choose a folder and Save puts files there without asking. Nothing is ever overwritten. Choose Ask each time to go back. The same page shows the Previews folder, with Open folder and Clear previews.', keywords: 'downloads folder previews clear' },
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
      { q: 'Light and dark', a: 'The sun and moon button at the top switches between them. Settings, then Appearance, has eight colour themes, each with its own account colours, plus fonts, density and the layout of the panes. Reset beside each part sets just that back to how it started, and Reset to defaults at the top does the lot (account colours stay as you set them). Both can be undone.', keywords: 'theme colours dark mode reset default' },
      { q: 'Account colours', a: 'Click an account\'s dot in the sidebar to choose its colour, or pick a whole palette in Settings, then Appearance.' },
      { q: 'New mail alerts', a: 'Settings, then Notifications, chooses what is announced (all new mail, only important senders, or nothing). While the app is open you get a small banner inside it, otherwise a Windows notification. The sound and Do not disturb are controlled by Windows, and there are buttons to test both kinds and to open the Windows settings.', keywords: 'notifications sound banner' },
      { q: 'Keyboard shortcuts', a: 'Settings, then Keyboard shortcuts, lists them all and lets you change any of them.', keywords: 'keys hotkeys' },
      { q: 'Accessibility', a: 'Settings, then Accessibility. Choose a bold focus ring to see where the keyboard is, and Keep things still to stop all motion. The app follows Windows Animation effects and contrast themes, works fully from the keyboard, and every button has a name that Narrator reads. Text size is in Appearance.', keywords: 'narrator keyboard contrast motion animation focus screen reader' },
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
