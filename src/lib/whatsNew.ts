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
    version: '0.6.3',
    date: 'November 2026',
    highlights: [
      'Video meeting alerts, a Join button and a bar over your mail',
      'Say Yes, No or Maybe to calendar invitations',
      'A calendar view and a Coming up panel',
      'Print and save as PDF in their own window',
    ],
    more: [
      'Reminders shows a month calendar as well as the list, with each account in its own colour.',
      'Coming up is a panel you can open from the calendar button at the top, on any screen.',
      'An event on several of your calendars shows once, with a dot for each account.',
      'Notifications 15 and 5 minutes before a video meeting (Teams, Zoom, Google Meet, Webex), and a bar that stays until you dismiss it. You choose the times.',
      'Invitation emails get a card at the top with the time, a Join button, Add to calendar and Yes, No, Maybe.',
      'Right-click a link in an email to open it, copy it or email the address.',
      'Settings tabs have capital letters, and the number of minutes can be picked from a list or typed.',
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
