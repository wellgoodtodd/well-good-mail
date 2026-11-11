// What changed in each main version. The newest goes first. Written by hand at each release, in plain words,
// for the What's new pop-up and the update log in Settings. Test builds are folded into the version they lead to.

export interface Release {
  version: string;
  date: string;
  /** Three or four lines for the pop-up. */
  highlights: string[];
  /** Everything else, for the log. */
  more: string[];
}

export const RELEASES: Release[] = [
  {
    version: '0.7.2',
    date: 'November 2026',
    highlights: [
      'Out of Office: set auto-replies in Gmail and Outlook from here, for one account or all of them',
      'Attachments like Word and Excel open straight away in their own app',
      'A suggestion to add dates and times from emails to your calendar',
      'An Accessibility page, and Windows high contrast and animation settings followed',
    ],
    more: [
      'Out of Office lives in Settings, the top-left menu and the tray menu. It is set inside each Google and Microsoft account, so replies go out with this computer off. Choose dates (whole days, or times for part days), who gets a reply (everyone, your contacts, or your organisation), a default message with templates and the back date filled in, and an own message for any account.',
      'While you are away: an amber bar at the top of your mail with Turn off now, a plane by each away account in the sidebar, an Away event in your calendar, a reminder the day before it ends, and "While you were away" when you are back. New-mail alerts can pause too. Google Workspace accounts can decline new invitations.',
      'Holiday or Annual leave in your calendar? Well Good Mail offers to set Out of Office for those dates.',
      'AI apps can read and set Out of Office for accounts set to Read and write. You always see the accounts, dates and whole message first, and nothing changes until you say yes.',
      'Google accounts sign in once more the first time they use Out of Office. Microsoft accounts do the same.',
      'Attachments that can\'t be previewed open in their own app from a private Previews folder. Programs and scripts never open straight from an email. Settings, Search & Storage can save attachments to one folder without asking, and shows the Previews folder with Clear previews (old ones clear by themselves after 30 days).',
      'An email that mentions a day and time ("Thursday, 7pm kick off") shows Add to calendar at the top. Only from people, never newsletters, and it is read on this computer with no AI. Turn it off in Settings, Notifications & Reminders.',
      'Settings, Accessibility: a bold focus ring, and Keep things still for motion. The app follows Windows Animation effects and contrast themes, and every button has a name Narrator reads.',
      'Settings, Updates groups older versions by series (0.6.x), and buttons, boxes and full-page screens share one height and width.',
      'Setting up a second computer? The welcome page has Moving from another computer: restore your Google key from a backup file, sign in, then bring your mail across.',
      'Word documents preview inside the app, on hover and when clicked, with Open in Word. Other files show what they are and what opens them when you hover. Accessibility adds row spacing, an easy-read font, underlined links, stronger borders and buttons for the Windows settings it follows.',
      'iCloud and other email accounts stay connected instead of signing in for every job, so the service no longer pauses sign ins and asks for a new password. New mail in the Inbox arrives within seconds. A refused sign in on a password that worked waits and tries again by itself.',
      'Settings, Accounts is rebuilt: a line on how each account is doing (with the fix when something is wrong), a suggestion when there is one, and a summary of every setting. Click one to change it below, or to the right on a wide window. Changes save straight away with Undo. Replies and forwards can have no signature. Search settings at the top of the Settings list.',
      'The calendar has Day, Week and Month views, with working hours shaded and a line for now. Week numbers and hiding weekends are options in Notifications & Reminders. The mail list marks emails you have replied to or forwarded, and files on a draft open or preview when clicked.',
      'Choose whether weeks start on Monday or Sunday (Notifications & Reminders). The month view now shows the whole month, not just the next week.',
      'Text size is in Accessibility as well as Appearance. Drafts made in Gmail keep their attachments in AI Drafts, and bounce and no-reply addresses no longer come up as suggestions.',
    ],
  },
  {
    version: '0.7.1',
    date: 'November 2026',
    highlights: [
      'A tidier Settings, Accounts: your accounts on the left, everything about the one you pick on the right',
      'A calmer Appearance page, with all the colour choices in one place',
      'Easier to read, and safer with emails from strangers',
    ],
    more: [
      'Settings, Accounts: an account that needs attention shows a small coral dot. Pick one to see its status, Show in All Inboxes, Keep mail from, signature, calendars and AI Connection access, each on one line. Rename it by clicking the name, change its colour by clicking the coloured square, and drag accounts in the list to change their order.',
      'Settings, Appearance: one Colours section holds the accent, account colours and unread dot.',
      'Better contrast on the selected email and the selected Allow buttons, clearer grey text in a few places, readable signature links in dark mode, and Settings headings that match their names in the list.',
      'The editor fits its pane in narrow windows, and its edges line up.',
      'AI Drafts hides groups with no drafts, and previews no longer end with your sign-off.',
      'AI apps see even less of anything a sender has hidden in an email, and search results and calendar entries are marked as written by other people.',
      'Remote pictures stay blocked however an email tries to load them, including in the quoted part of a reply.',
      'Links in the app window, like those in a quoted reply, open in your browser.',
      '"Always allow" on an AI question now covers only the accounts you ticked.',
      'Attachment names are cleaned when saving several at once.',
    ],
  },
  {
    version: '0.7.0',
    date: 'November 2026',
    highlights: [
      'Let Claude and other AI apps help with your mail, only as far as you allow. They can read and write drafts, never send',
      'AI Drafts: drafts from AI apps and from Gmail in one place, in groups, to check, change and send from the card',
      'Smart Mailboxes, Send later (even with the app closed) and Undo for almost everything',
      'Opens and responds faster',
    ],
    more: [
      'Settings, AI Connection: switch it on, choose each account (Off, Read only or Read and write), and set up Claude Desktop, Claude Code, ChatGPT desktop or Gemini CLI with a checklist that ticks itself. Activity lists everything it did.',
      'Each thing it can do is Off, Ask or Allow, with one row to set them all, and any account can have its own settings. Hidden text in emails is removed before an AI sees them, and it is told never to follow instructions inside an email.',
      'When it asks, a card shows the whole request (and the whole draft): Allow once, Allow for 1 hour, Always allow, Edit first or Refuse. Cards wait as a small notice while you are typing, and a stray click cannot answer one.',
      'The sparkle in the top bar shows where the connection stands. Click it for the settings, right-click to pause. It pauses itself after a quiet spell, and the next request asks you to resume.',
      'After an update, AI apps stay connected and pick up new tools by themselves.',
      'AI Drafts in the sidebar: each draft is a card with Send, Open in editor and Delete. Open a card to change who it goes to, the subject and the message, with basic formatting and the signature menu. Changes save as you go, and replies keep the earlier emails folded away.',
      'AI Drafts groups (Clients, Prospects, Personal, Admin, or your own) with gentle colours, sorting, search, tick boxes to move, schedule or delete several at once, and keyboard keys. On Gmail they become labels, so they follow you to other devices and stay on the email once sent.',
      'Drafts you start in Gmail on the web or your phone show under AI Drafts too, and drafts sent or deleted in Gmail leave by themselves.',
      'A sign-off for drafts in Settings, AI Connection (like All the best,), which AI apps end every draft with.',
      'A Signature menu at the end of the formatting bar: the From address\'s own, another one, or None.',
      'Send later has a new picker (type or pick the date and time) and a Scheduled place in the sidebar to read, change the time of, edit or unschedule what is waiting. Scheduled email goes even if Well Good Mail is closed: Windows starts it at the right time. You can turn that off in Settings, Composing.',
      'Smart Mailboxes: saved rules in the sidebar, with live counts. Make one from New Smart Mailbox, after a search, or from a person\'s card.',
      'Undo now covers settings changes, AI Drafts and account names and colours, as well as mail. Ctrl+Z in a text box undoes your typing.',
      'Back and Forward buttons in the top bar (Alt+Left and Alt+Right, or your mouse\'s side buttons).',
      'Drag sidebar sections into any order, or right-click a heading to move it.',
      'Click a name in an email or a draft for a small card to copy the address, email them, find their emails or make a Smart Mailbox for them. Right-click for more.',
      'Reply, Reply All and Forward under the latest email in a conversation too, with Reply in blue.',
      'Each account in Settings, Accounts has its own Keep mail from choice, and changing it starts the sync again with the new range.',
      'Opening the app shows your recent mail straight away while the rest loads in the background, and archive, delete and read marks respond at once.',
      'Big syncs ease off while you are using the app.',
      'Settings, Appearance has Reset to defaults, and a Reset for each part.',
      'In dark mode, the parts of an email you type in are a lighter shade, so they stand out.',
      'Cc and Bcc fold away again with the same buttons. A calendar switch shows a dash when only some of its calendars are on. Calendars fold away in Settings, Accounts.',
      'Starting in the tray no longer flashes the window on screen.',
    ],
  },
  {
    version: '0.6.5',
    date: 'November 2026',
    highlights: [
      'Guest lists for iCloud and Microsoft calendars too',
      'Switch calendars on or off with a tidier list, and choose what hidden calendars may alert you about',
      'The pop-up that says what is new stays until you close it',
    ],
    more: [
      'Guest lists and answers now show for iCloud and Microsoft 365 events, the same as Google.',
      'The calendars list in the pop-up is a flat list with a switch for each calendar. The same calendar on several accounts, like Holidays in the UK, shows as one row. Calendars follow the order of your accounts.',
      'Settings, Accounts shows a card for each account, with a switch for the whole account and one for each calendar.',
      'Hidden calendars have a three way choice for alerts: keep all, mute ordinary reminders but keep video meeting alerts (the default), or mute everything.',
      'Accounts you rarely use still list their calendars, and an account with no calendar yet says why and has a Look again button.',
      'The pop-up that says what is new appears almost at once and stays until you close it.',
      'On a test version, Settings, Updates says whether it is the latest test version.',
      'Help has a new Calendar and meetings section.',
    ],
  },
  {
    version: '0.6.4',
    date: 'November 2026',
    highlights: ['Settings, Updates can tell you when a newer test version is out'],
    more: [
      'Switch on Tell me about test versions in Settings, Updates, and a card shows when a newer test version exists, with links to what changed and to the installer. Nothing installs by itself.',
      'Settings, Updates shows when the update check last ran.',
      'The copyright and licence are shown at the bottom of Settings, Updates.',
    ],
  },
  {
    version: '0.6.3',
    date: 'November 2026',
    highlights: [
      'Video meeting alerts, with a Join button and a banner over your mail',
      'Answer calendar invitations with Yes, No or Maybe, and see who is coming',
      'A calendar view and a Coming up panel',
      'Print and save as PDF in their own window',
    ],
    more: [
      'Google accounts ask you to sign in once more, so Well Good Mail can answer invitations for you. Your mail stays where it is.',
      'Notifications before a video meeting (Teams, Zoom, Google Meet, Webex), and a banner across the top with a Join button. You choose the times, from 1 minute to 3 hours.',
      'The banner turns amber as the meeting starts and coral after, counts how long ago it started, and goes by itself 10 minutes later. Meetings you have said No to stay quiet.',
      'Invitation emails get a card at the top with the time, a Join button, Add to calendar, and Yes, No or Maybe. Your answer shows as a green, red or amber tag, and you can change it later.',
      'Guests are listed with a colour for each answer and a tally, in the invitation and in the event card.',
      'Reminders shows a month calendar as well as the list, with each account in its own colour.',
      'Coming up is a panel you can open from the calendar button at the top, on any screen. Click an event to see its details, who is coming, and to email the guests or copy the invite.',
      'An event on several of your calendars shows once, with a dot for each account.',
      'Tick calendars on or off in Settings, Accounts, or from the Calendars button. Hidden calendars can also keep their ordinary alerts quiet. Video meeting alerts always stay on.',
      'Test notification and Test banner buttons for video meetings, in Settings.',
      'One attachment shows as a card with Preview and Save. Several show as compact chips. Hover to preview, or click for large files.',
      'Right-click a link in an email to open it, copy it or email the address.',
      'Settings tabs have capital letters, and times can be picked from a list or typed.',
      'Emails that have their own dark mode no longer turn unreadable in dark mode.',
      'The installer shows a short plain-English note and the licence.',
    ],
  },
  {
    version: '0.6.2',
    date: 'November 2026',
    highlights: ['iCloud contacts and calendar', 'Accounts can be left out of All Inboxes'],
    more: ['iCloud contacts and calendar come in through your Apple Account.', 'Choose which accounts appear under All Inboxes.'],
  },
  {
    version: '0.6.1',
    date: 'November 2026',
    highlights: ['Microsoft mail remembers its Inbox and Sent after a restart', 'Updates keep looking after one is downloaded'],
    more: ['Fixes for Microsoft mail not showing after a restart, and for newer versions replacing a downloaded one.'],
  },
  {
    version: '0.6.0',
    date: 'November 2026',
    highlights: ['Early iCloud and other IMAP accounts'],
    more: ['Connect iCloud, Yahoo, Fastmail and your own mail server with an app password.'],
  },
];

/** "0.6.3-beta.6" is part of 0.6.3. */
export const baseVersion = (v: string) => v.replace(/-.*$/, '');

export const releaseFor = (version: string): Release | undefined => RELEASES.find((r) => r.version === baseVersion(version));
