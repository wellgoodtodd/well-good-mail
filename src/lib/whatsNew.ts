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
    version: '0.6.4',
    date: 'November 2026',
    highlights: ['Settings, Updates can tell you when a newer test version is out'],
    more: [
      'Switch on Tell me about test versions in Settings, Updates, and a card shows when a newer test version exists, with links to what changed and to the installer. Nothing installs by itself.',
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
