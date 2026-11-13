# Well Good on the phone: Calendar & Tasks web app (spec, 13 Nov 2026)

A web app saved to the phone's home screen that shows Well Good Mail's Calendar & Reminders and Tasks, in the same look, for seeing, adding and ticking things off. It talks straight to Google Calendar and Google Tasks, so the desktop app, this web app and Google's own apps always show the same things. Mock-up: `docs/mockups/web-app-phone.html`.

Status: plan only. Nothing is built yet.

## Decisions so far (Todd, 13 Nov)

- Google accounts only to start (several at once, combined, which is the point: Google's own Tasks app makes you switch accounts).
- No alerts in the web app. Google Calendar and Google Tasks already notify on the phone.
- A connector so Claude on the phone can add tasks comes later, not in v1.
- A personal project first. Bundle it with Well Good Mail if it works out.

## v1 scope

Three places, switched from a bar at the bottom (thumb reach): **Coming Up**, **Calendar** and **Tasks**, with **Calendars** as a fourth button (it was Accounts in the first mock-up). Calendars holds your groups, your accounts and their calendars, and Invitations. No mail.

**Groups work as on the desktop.** You add all your accounts once, then pick All Calendars or a group, and Coming Up, Calendar and Tasks all show only that group (tasks follow groups on the desktop too).

### Coming Up (opens here)
- Today: events, then tasks due today and late tasks, the same as the desktop Coming Up panel.
- Later: the next 7 days, grouped by day.
- A Join button on events with a meeting link (opens Meet, Zoom or Teams).
- Tap an event for its details; tap a task's circle to tick it off.

### Calendar (revised after Todd's notes, 13 Nov: works like the iPhone's own calendar, in Well Good Mail's look)

Todd uses the iPhone's built-in calendar and wants the same way of moving around, joined up with tasks, groups and invitations.

**Moving between levels**, with smooth zoom-style animations: Year, then pinch or tap a month for Month, then tap a day for that day (Single Day or Multi-Day, swipe left and right to move a day, or a week strip to scrub through weeks). The top left always has a back button with the month or year and a chevron to go up a level.

**Four ways to show a month**, from a button along the top:
- **Compact:** the month grid only. Tap a day to open it.
- **Stacked:** each day's items stacked as small coloured bars in its square. Tap a day to open it.
- **Details:** the grid with a little text for each item in each square.
- **List (Todd's usual):** the month grid at the top, with small coloured dots under each day showing how busy it is, and the picked day's events and tasks underneath. All-day items and undated-time tasks at the top, then events and timed tasks mixed in time order. Tick a task's circle to cross it off. A small handle at the top of the day's list: drag it up and the list covers the calendar full screen, drag it down and it goes back.

**Always there, whatever the view:** the view button, search and + at the top right. Search covers events and tasks in every account, with a mic button (the iPhone's dictation). + opens one sheet with Event and Task at the top, like Apple's Event and Reminder; the title box understands "Lunch with Sam Friday 1pm" and "#home" the same way as the desktop's quick add. Tasks have no repeat or alert: Google Tasks doesn't let other apps set repeats, and the web app sends no alerts.

**Layout, from Todd's screenshots (13 Nov):** the iPhone calendar is the guide for layout; Well Good Mail's look, colours and extras win where they differ. The bottom bar stays Coming Up, Calendar, Tasks, Calendars. Today is a floating button at the bottom left of the calendar screens, as on the iPhone. Calendars (groups, accounts and Invitations) is the fourth tab, with a red count of new invitations. Today is the accent blue, not red.

**Today** snaps back to today. **Calendars** opens a sheet: All Calendars or one of your groups, New group, Edit group (pick which calendars and accounts are in it), and each account's calendars to switch on and off. **Invitations** (New and Replied) sits in the same sheet and mirrors the desktop's Invitations, so answering Yes, No or Maybe moves into v1.

Light and dark, and the desktop's themes (accent colours).

**Event details:** time, calendar, place, meeting link, guests, notes.
- New event: title, day, all day or a time, which calendar (any Google account). Simple repeats (every day, week, month, year) using the same rules as `src/lib/recurrence.ts`.
- Change and delete events you made. For a repeating event, "This event" or "This and following" as on the desktop.
- Answering invitations (Yes, No, Maybe) from Invitations in the Calendars sheet.

### Tasks
- Smart lists down the side on desktop become a row of chips: **Today**, **Scheduled**, **All Tasks**, then each account's lists.
- The quick add box with the same words as the desktop: "Ring the dentist Friday 3pm #studio" makes a title, a due day and time, and picks the list (`src/lib/taskWords.ts`).
- Tick off, untick, change title, notes, day and time, move to another list, delete. Swipe left to delete, with Undo.
- Done today stays crossed out; older ones go under "Completed before today", like the desktop.
- Tasks made from an email show "From email: subject". Tapping it opens the email in the Gmail app (the link is already in the task's notes). No mail reading in this app.

### Also in v1
- Accounts screen: add a Google account, remove one, choose which calendars show.
- Pull down to refresh. Looks again every minute while open, and as soon as the app comes back to the front (the same timing as `src/lib/tasks.ts`).
- Shows the last lists, tasks and the next few weeks of events at once on opening (saved on the phone), then refreshes.
- Light and dark, following the phone.

### Not in v1
Mail, alerts, Microsoft and iCloud accounts, Calendar Groups (see open questions), the AI Connection, offline changes (a change made with no signal gets a "Not saved" note and a Try again button rather than a queue).

## Staying in step with the desktop app

Everything lives in Google; the web app keeps only a copy for showing things quickly. The parts that need care:

- **Task times.** Google Tasks keeps only a date. The desktop app writes the time as a first line "Due 14:00" in the task's notes and reads it back (`src/lib/taskNotes.ts`). The web app must use the same file so times survive both ways.
- **Email links.** The desktop app writes "From email: subject" and a link at the end of the notes. Same file again.
- **List and account colours.** The desktop app's account colours are local settings. The web app gives each account a colour from the same palette, in sign-in order, and lets you change it. (Syncing the colours is an open question.)
- **Default list for new tasks** is a desktop setting per Calendar Group. The web app has its own default (set in Accounts), "My Tasks" of the first account until you choose.

## Sign in and where the keys live

The desktop app signs in with a "Desktop app" Google key and a loopback address (`src/lib/auth/google.ts`). A website needs its own key:

1. In the same Google Cloud project as the desktop app, add an OAuth client of type **Web application**, with the web app's address as an authorised origin and `https://<address>/auth/callback` as the redirect address. Same project means the same consent screen, the same switched-on APIs (Calendar and Tasks) and the same publishing state.
2. Scopes, smaller than the desktop: `openid email profile`, `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/calendar.readonly` (for the calendar list), `https://www.googleapis.com/auth/tasks` and `https://www.googleapis.com/auth/drive.appdata` (the shared settings file, below). No Gmail.

**Keeping you signed in.** Google only lets a "Web application" key swap a sign-in code for a long-lasting refresh token if the key's secret goes with it, and a secret can't live in a public web page. The choices:

- **A. A tiny server step (recommended).** Two small Cloudflare Pages Functions on the same site: `/auth/callback` swaps the code for tokens using the secret (kept in the Pages settings, never in the code), and `/auth/token` hands the page a fresh access token when the old one runs out. The refresh token is kept encrypted in a secure, httpOnly cookie on the phone, so there is still no database and nothing about you stored on the server. One cookie per Google account. Sign out deletes the cookie and tells Google to forget the token.
- **B. No server at all.** Google's browser sign-in (Google Identity Services) gives an access token for an hour and no refresh token. Getting a new one needs a pop-up, which home-screen apps on iPhone handle badly. You would see "Sign in again" most days. Not worth it.

Access tokens stay in memory only. The page keeps the lists, tasks and events it last saw in IndexedDB on the phone so it opens instantly.

**Weekly sign-outs.** While the Google project is in testing mode Google signs everyone out after 7 days, on the web as on the desktop. The setup guide's "stop signing in every week" steps (publishing the project) fix both at once, and those steps want a public home page and privacy page, which this site can provide.

## Bringing your set-up across from Well Good Mail

Todd asked whether the phone can pick up everything from Well Good Mail rather than being set up again. Two halves:

- **Settings can come across completely.** Groups, which calendars are on, account colours, theme and default task lists go into a small settings file in each Google account's hidden app folder in Google Drive (the `drive.appdata` permission: the app can only see its own file, not your Drive). The desktop app writes it whenever those settings change; the phone reads it. After the first sign-in the phone says something like "Found your Well Good Mail set-up: 5 accounts, 3 groups" and lists the other accounts to add. Changes made on the phone (a new group) go back the same way.
- **Each Google account still needs one tap of Google's "Allow" on the phone.** The desktop's sign-ins can't safely be handed over: they belong to the desktop key, and they include full Gmail access, which the phone has no need for. So it's one sign-in per account, once, with the email already filled in. After that it stays signed in.
- **Easiest start:** a "Set up on your phone" button in the desktop app's Settings that shows a QR code. Scan it with the phone's camera, it opens the web app with your first account ready to sign in, then the settings file does the rest.
- A Well Good login of its own (one account that holds all your others) would need a proper server and database. Worth it only if this becomes a product; not for v1.

## Sharing code with the desktop app

The views can't be lifted across as they are: `Tasks.tsx`, `ComingUp.tsx` and `CalendarViews.tsx` lean on the mail store (`useMail`), desktop settings, menus, drag and drop, dialogs and the right-hand panel. What shares well is underneath:

| Shared as it is | Shared after a small split | Written fresh for the phone |
| --- | --- | --- |
| `types.ts` (Task, TaskList, CalendarEvent), `taskNotes.ts`, `taskWords.ts`, `recurrence.ts`, `meetings.ts` (meeting links, joining up the same event from two accounts), date and time words in `calendarBits.tsx`, `Icon.tsx`, the colour and type tokens in `app.css` | The Google Tasks and Calendar calls in `providers/gmail.ts`, moved into `src/lib/google/tasksApi.ts` and `calendarApi.ts` that take "get me a token" as an argument. The desktop provider then calls those too, so both apps use one copy. The task list sorting (Today, Scheduled, late) in `tasks.ts` moved into a plain helper. | The three screens, the bottom bar, the sheets for a task and an event, the week strip, sign in, and a small store for the web app |

Roughly a third of the work is shared code, and the riskiest part (reading and writing Google's formats the same way) is all in the shared third.

**Where it lives: a second Vite entry in this repo (recommended).** A `web/` folder with its own `index.html`, `main.tsx` and `vite.web.config.ts`, importing from `src/lib`. One `npm test` covers both; a change to task notes can't drift between the apps. Built with `npm run build:web` into `dist-web/`. The repo is public, which is fine: the web key's ID is public anyway and its secret lives only in Cloudflare.

Not a branch: a branch would drift away from the desktop app. The web app lives on `main` next to the desktop app, so a design or behaviour change to shared code reaches both at once, and the desktop's design rules (`CLAUDE.md`, colour and type tokens, icons) apply to both. The iPhone calendar is the guide for layout; where Well Good Mail already does something better (the drag handle on List view, groups, quick add words, tasks among events), the web app follows Well Good Mail.

A new repo would be cleaner to bundle or sell on its own later, but it would mean copying the shared files and keeping them in step by hand. Easy to split out later if it takes off; hard to merge back.

## Hosting

- Cloudflare Pages (Todd's setup), deployed with the `cf` CLI from `dist-web/`, plus the two Functions in `web/functions/auth/`.
- At `mail.wellgood.media/app`, unlisted, with a `noindex` header.
- Home-screen bits: a web manifest (name, icons, standalone, theme colour) and a service worker that caches the app's files so it opens with no signal. No push.
- Security headers: a tight Content Security Policy allowing only `googleapis.com` and `accounts.google.com`.
- Free tier covers this easily.

## Rough effort

The calendar Todd described (four month views, year, multi-day, the drag handle, smooth zooms between levels, invitations, settings brought across) is more than the first plan. About ten sessions, each one finishing in something Todd can try on the phone:

1. Groundwork: split the Google Tasks and Calendar calls out of the desktop provider (desktop tests still pass), add the `web/` entry, sign in with Functions, deployed to a test address. Sign in on the phone and see your task lists' names.
2. Tasks: lists, chips, quick add, tick off, task sheet. Usable from here on.
3. Coming Up, and the Calendars sheet with groups.
4. Calendar, List view: month grid with dots, the day underneath, the drag handle.
5. Single Day and Multi-Day, swiping between days.
6. Compact, Stacked and Details, Year view, and the zoom animations between levels.
7. New, change and delete events, repeats, search.
8. Invitations (New and Replied, answering).
9. Settings brought across from the desktop (the Drive settings file, both apps) and the QR code.
10. Polish and the home-screen bits: offline opening, icons, themes, pull to refresh, publishing the Google project if not done.

Sessions 1 to 4 make a usable app; the rest can come in any order.

## Later: Claude on the phone adds tasks

In outline only:

- A remote MCP server on a Cloudflare Worker (the same Cloudflare account), with tools like `add_task`, `list_tasks` and `list_events`, written to Google through the same `tasksApi.ts`.
- It needs its own sign-in: the Worker does the Google sign-in once and keeps the refresh token encrypted in Workers KV, and Claude connects to the Worker with OAuth (Cloudflare's `workers-oauth-provider` handles that side).
- Added to Claude as a custom connector; then "remind me to ring the dentist Friday" on the phone lands in Google Tasks and shows in the desktop app and the web app.
- The desktop AI Connection's rule carries over: writing tasks only, and it asks before anything else.
- About two sessions once the web app exists.

## Open questions for Todd

1. ~~Phone~~ Answered: iPhone only for now. No Android work.
2. ~~Address~~ Answered: `mail.wellgood.media/app`, public but unlisted (no links to it except from inside Well Good Mail). It gets a "don't index" header so search engines leave it out. Being unlisted is a nicety, not the lock: nothing shows without a Google sign-in, and while the Google project is in testing mode only its listed test users can sign in at all. If `mail.wellgood.media` is already a site on Cloudflare, `/app` is a folder or route in it; the home-screen app, its cookies and its offline files are all kept to `/app`.
3. ~~Google project~~ Answered: no separate project. The web key goes into the same Google Cloud project Well Good Mail already uses (same consent screen, test users and switched-on APIs), as a second OAuth client of type Web application.
4. ~~Calendar Groups~~ Answered: yes, groups on the phone, brought across from the desktop through the Drive settings file.
5. ~~Calendar view~~ Answered: like the iPhone calendar (Compact, Stacked, Details, List, plus Year, Single Day and Multi-Day).
6. **Name and home-screen icon:** still to think about. Next mock-up will show a few options side by side.
7. ~~Invitations~~ Answered: in v1, inside the Calendars sheet.
8. **Today button:** the round two mock-up has it floating at the bottom left of the calendar screens, above the bottom bar (tapping Calendar again also jumps to today). Right?
9. ~~Screenshots~~ Received, 13 Nov; the round two mock-up follows them.
