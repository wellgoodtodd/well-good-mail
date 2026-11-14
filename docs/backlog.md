# Backlog

Things noted but not built yet. Newest first. Nothing here is promised for a date.

Finished work is in docs/history.md (newest first). This file keeps what is still open, plus the latest beta.

## 0.7.4 beta 2 (built 14 Nov 2026)

Test list: `testing-0.7.4-beta2.md`.


- Brought in from the web app branch (desktop files only): settings shared with the phone every 5 minutes and when the window comes to the front, with an `accounts` list (nicknames, colours); smarter quick add; task alerts kept in an "Alert:" line in Google Tasks notes; a bracketed time at the end of a dated task's title read as its time.
- Task editor (New task and opening a task): Alert and Second alert for a task with a time (`TASK_ALERTS`), not for Microsoft To Do lists. NewEvent uses the shared lists in `alertChoices.ts`.
- Notifications at each of a task's alerts (`taskAlertsDue` in tasks.ts), under the same Calendar and tasks setting as events.
- AI `add_task`: a time goes in `due`, never the title; optional `alerts`; a "(3pm)" left in the title becomes the time.

## 0.7.4 beta 1 (built 13 Nov 2026)

0.7.3 plus opening calendar files (.ics) from Windows. Test list: `testing-0.7.4-beta1.md`. First build to compile the Rust side of it (`src-tauri/src/icsfile.rs`).

- Windows file association for .ics (`fileAssociations` in tauri.conf.json). Open with › Well Good Mail, or a double-click once Always is ticked, opens New event filled in from the file (`eventFromIcs` in invites.ts, `newEventFrom` in NewEvent.tsx). Works when the app is closed (the start file is remembered) or already running (single instance sends `open-ics`).
- A file with no event gives a short message. Help topic "Open a calendar file (.ics)".
- Still to see from 0.7.3: task alerts, the EA draft signature, the SocialPilot Send To rule.

## After 0.7.3 (Todd, 13 Nov 2026)

- [x] **Open .ics files in Well Good Mail.** (Done, for the next beta.) Windows offers Outlook and eM Client for a downloaded .ics but not Well Good Mail. Register the app for .ics (Tauri `fileAssociations`), and when one is opened show the event card with Add to calendar and a calendar picker. Invitations that arrive by email already work in the app.

## 0.7.3 (live, built 13 Nov 2026)

Beta 13 with the version changed. Test list: `testing-0.7.3.md`.

## 0.7.3 beta 13 (built 13 Nov 2026)

Beta 12 plus the attachments setting, the shorter saved message and Send To forwards without a signature. Test list: docs/testing-0.7.3-beta13.md. Todd: if these hold up, the live 0.7.3 is next.

- Settings › Appearance › Attachments: Show them above or below the email, Size small, medium or large (settings attachmentPlace, attachmentSize; default above, medium). A small preview email under the choices, greeting the person by their first name. MessageView renders the files block above or below.

## 0.7.3 beta 12 (built 13 Nov 2026)

Beta 11 plus Todd's beta 11 feedback. Test list: docs/testing-0.7.3-beta12.md. Next: a mock-up of attachments above or below the email, in three sizes, as a setting (done: docs/mockups/attachments-placement.html, Todd agreed).
- Attachment right-click: Save as... beside Save to downloads folder.

- Send To renaming: SendPlace.rename.how custom | start | end | ask (old 'smart' read as custom), pattern with {sender} {amount} {description} {name} and YYYY/YY/MM/DD (fillName, renamedFile, nameFacts, invoiceAmount in sendTo.ts, tested); placeholder buttons in the place editor.
- Menus (ui.tsx Menu): flyouts measured and placed against their row (up or left when needed), with a 350ms grace on leaving. Toasts: text clamps to two lines, buttons never wrap; saved toast names only the folder (saves.ts). reveal_saved (files.rs) uses explorer /select so the right folder opens on Windows 11.
- Every test list from now on: keep "Alerts for tasks" until Todd has seen one work.
- Find my invoices: drop-downs keep their own width; PAYMENT_DOMAINS (Stripe, PayPal, Paddle...) key senders by address; quotes trimmed from sender names.

## 0.7.3 beta 11 (built 13 Nov 2026)

Beta 10 plus Todd's beta 10 feedback. Test list: docs/testing-0.7.3-beta11.md. Checked in the browser demo only.
- ☰ menu: grey counts (MenuItem kbd) beside Scheduled, Calendar, Tasks and Invitations, from useReminderCount, useTaskCount (exported from Sidebar.tsx) and useInvitations.

- New place: boxes fit the dialog; Forward to uses RecipientField (anyAddress) so contacts are suggested as you type.
- Send To places can rename saved files (SendPlace.rename: start, end or ask; fillDate and renamedFile in sendTo.ts, tested). Todd's own convention: YYMMDD_ then the invoice's name.

## 0.7.3 beta 10 (built 13 Nov 2026)

Beta 9 with the footer from docs/mockups/sidebar-footer-3.html (Todd: beta 9 hid the card icons, not what was agreed). Cards: icon and name always, a dot in the card's corner (red: late task, blue: new invitations), counts only when the footer is 290px or wider, counts in the tooltip; very narrow: icons with the dot on the icon. Test list: docs/testing-0.7.3-beta10.md.

## 0.7.3 beta 9 (built 13 Nov 2026)

Beta 8 plus the beta 8 feedback. Test list: docs/testing-0.7.3-beta9.md. Checked in the browser demo only; the installer hook, secret_list and save_into_subfolder were never compiled locally (no cargo).

- Installer (src-tauri/windows/hooks.nsh, English.nsh, installerHooks and customLanguageFiles in tauri.conf.json): the data box reads "Move the app's data to the Recycle Bin"; the hook clears Tauri's own delete and moves %APPDATA% and %LOCALAPPDATA% media.wellgood.mail to the Recycle Bin with PowerShell after the uninstall. Only uninstallers from beta 9 on do this. Never compiled locally.
- Welcome page: WelcomeBack in App.tsx lists sign-ins Windows kept (secret_list in src-tauri/src/recovery.rs, CredEnumerateW; signInsFromKeys in mail/accounts.ts, tested) and adds them back (restoreEverything in src/lib/recovery.ts), then offers the settings file from Google Drive (findSettingsBackup, restoreSettingsFrom in settingsSync.ts). Help and "Lost your accounts after reinstalling?" links; new Help answer with the Recycle Bin steps.
- Setup guide waits for the saved Google key to load before opening (useGoogleKeys.loaded).
- Sidebar: a favourite shows in Favourites only (Item in Sidebar.tsx); footer cards on --bg-elev with brighter names and icons.
- Send To, built (Todd agreed the mock-up docs/mockups/send-to.html): settings sendPlaces and sendRules; src/lib/sendTo.ts (sendToPlace, forwardAttachment, rules in runSendRules called from applyRulesToNew in mail/sync.ts, findInvoiceSenders, log and done ids in kv); src/components/SendTo.tsx (Send to › menu, place and rule editors, Find my invoices, What's been sent, Settings › Send To); save_into_subfolder in files.rs. Menus: attachment right-click (Forward..., Send to) and email right-click (Send to, several at once). Rules only take mail dated after they were made. Todd: Find my invoices is handy but maybe not for everyone; preloaded templates and "find missing invoices" (needs something to check against) left for later.
- Sidebar footer round two (docs/mockups/sidebar-footer-2.html): Todd chose a mix: four slim one-line cards (a bit taller than C), then Settings with a cog and its name across most of the row and the ? beside it. New invitations count in blue (no New badge); between 191 and 236px the card icons step aside. The ☰ menu lists Scheduled, Calendar, Tasks, Invitations in the footer order, everything else kept. Send To got a New rule button (Todd couldn't see how to add one by hand).
- Later: an AI tool to set up Send To rules (Todd: "or I can get you to set one up"); preloaded rule templates; finding missing invoices.

## Beta 8 feedback, for the live 0.7.3 (Todd, 13 Nov 2026)

Full notes in docs/testing-0.7.3-beta8.md, "Found in beta 8". No beta 9 for these unless something else needs one.
- Attachment right-click (MessageView.tsx, the menu.open beside 'Save to downloads folder'): add Forward (a forward carrying only that file, through startCompose in composeActions.ts) and "Forward to" with saved addresses such as Hubdoc, for bills and invoices. Todd's refinement (13 Nov): plain Forward opens the normal writing window as a forward with just that file attached (sender picked as usual). Forward to › saved list. Sending somewhere new offers "Do this every time?", which makes a rule. It's a whole list of subscriptions, not just Canva and Zoom, so an audit is wanted: find which invoices and receipts come in, from whom, and choose where each goes. And he does two things with an invoice: forward to Hubdoc AND save the file into a set folder (preset, or choose each time). Proposed shape: saved "Send to" places, each one an address, a folder (optionally a year or month subfolder), or both, e.g. Bookkeeping = Hubdoc + Invoices folder. Audit: "Find my invoices" looks back a year for emails with PDFs and words like invoice or receipt, groups them by sender with counts, and you tick which go to Bookkeeping (makes the rules, and can send the past ones too). Earlier notes: Todd likes it as a "mini automation". Proposed: Forward to › saved addresses on an attachment, on an email, and on several selected emails at once (search "invoice", select all, Forward to Hubdoc: each goes as its own forward). Then rules (later, with a beta): after a manual Forward to, offer "Do this every time for Canva?"; rules use the Smart Mailbox conditions, run on new mail in applyRulesToNew (mail/sync.ts) while the app is open and catch up when it opens, remember what was already forwarded so nothing goes twice, and show a log in Settings. Gmail's own filters could forward with the app closed, but need the address verified in Gmail and are Gmail only. Later still: AI apps asking to forward, with an approval card. To agree later: whether a saved address sends straight away (with Undo send) or opens the writing window filled in; where the addresses are kept (right-click › Add an address, and a Settings card to rename, reorder and remove).
- Installing beta 8 wiped the app's data (both media.wellgood.mail folders were new at 15:35, just after the installer). Same installer as beta 7 and no app code deletes them, so most likely the uninstaller's "Delete the application data" box. Ideas to stop it hurting again: keep an automatic copy of settings and local-only data (groups, Smart Mailboxes, templates, snoozes) outside those folders, e.g. Documents\Well Good Mail, and have the welcome page offer "Found your settings from <date>: restore?"; untick or remove the delete box in the installer (NSIS template); point people to Settings › Updates rather than the installer. All of Todd's sign-ins survived in Credential Manager (google:<email>.WellGoodMail and the rest), so the welcome page could find them and offer "Add these 7 accounts back?" with no sign-in (needs CredEnumerate in Rust, or the app keeping its account list in Credential Manager too). Settings come back if "Keep my settings the same on every computer" was on (Drive file well-good-mail-settings.json): add a Google account, then switch it on.
- Fixed (not built yet): the first-run guide opened before the saved Google key had been read, so a reinstall showed "Let's get Well Good Mail talking to Gmail" with the key still there (App.tsx waits for useGoogleKeys.loaded).

## 0.7.3 beta 8 (built 13 Nov 2026)

Beta 7 plus the beta 7 feedback below. Test list: docs/testing-0.7.3-beta8.md. Checked in the browser demo only. If it holds up, next is the live release.
- Delete from several calendars: copiesOf (eventFlows.ts) searches the store and the calendar copy and matches like dedupeEvents; a Diagnostics warning if the second copy still isn't found.
- Event pop-up (EventPopup.tsx): video call as a quiet line under Location (.ev-call-line); big Join only on the day; map pin icon (Icon mapPin) for locations there and on invitation cards.
- makeTaskFromEmail starts today at the next round hour when no date is found.
- Sidebar footer option C (SideFooter in Sidebar.tsx): four cards (drag to reorder, kept in localStorage wgm.footerOrder.v1), Help and Settings as icons, version in Settings; a container query turns the cards into an icon row below 190px. Invitations card always shows now.
- Alerts & Notifications (NotificationsTab.tsx): Calendar and tasks, Video meetings and Alerts from hidden calendars are separate cards; New mail per account moved up beside the other mail settings.
- Still parked: Settings › Updates and Diagnostics moving up with the other tabs; "Make tasks from this email"; the "Make a task?" suggestion; a standalone tasks and calendar app.

## Beta 7 feedback, for beta 8 (Todd, 13 Nov 2026)

Aim: beta 8, then the live release. Full notes in docs/testing-0.7.3-beta7.md, "Found in beta 7".
- Done: delete from several calendars finds the other copy (copiesOf looks in the calendar copy too and matches like dedupeEvents; logs a warning if not); location shows a map pin (Icon mapPin); Make a task from an email starts today at the next hour when the email has no date.
- Done (agreed with Todd): the video call is a quiet line under Location in the quick edit card: "+ Add Google Meet" (Teams on Microsoft), or "Google Meet · Join · Settings ↗"; the big Join button shows only on the day of the event.
- Dropped: the punctuation note (Todd thinks it was the transcript).
- Yes for beta 8 (Todd): Alerts & Notifications in clearer cards (video calls, hidden calendars on their own).
- Sidebar footer: Todd picked option C (docs/mockups/sidebar-footer.html); built for beta 8. If it wears thin, rethink or go back.

## 0.7.3 beta 7 (built 13 Nov 2026)

Beta 6 plus everything under "To fix" and the mock-up decisions below, and the compose polish. Test list: docs/testing-0.7.3-beta7.md. Checked in the browser demo only.
- Calendar: Coming up in blocks (ComingUpBlocks in ComingUp.tsx, task rows in TaskBlocks.tsx); picked day toggles off (click again, ✕, Esc, Today); Month Tasks panel removed; Alerts button and card (AlertsButton.tsx, alertsPausedUntil setting read by isQuietNow); quick edit location, Add Google Meet, direct moves across accounts with a confirm; delete from several calendars (askPick in dialogs.ts, removeFromSeveral in eventFlows.ts) with an organiser check.
- Tasks: sidebar with draggable smart lists and account rows; list and account right-click menus; list rename and delete (Google tasklists, Graph todo/lists); ListPicker with account dots; refresh about every minute while on screen and on focus, with back-off; New task on today, typed dates; Tasks in the sidebar footer; email tasks tag and list mark. Smart-list order and Hide completed are kept on this computer (wgm.taskPrefs.v1).
- Settings: Alerts & Notifications (calendar and task alerts moved in); AI Connection switches open per account with an amber "set differently" flag, Customise removed from Accounts there; AI app logos; Add tasks "Into"; settingsNav.ts (openAlertSettings, openTaskDefaults); accounts in Settings order on more pages; Out of Office spacing.
- Compose: boxed font and size with arrows, soft-blue on state and dividers, Attach and Emoji by Send, Emoji through a new Rust command (src-tauri/src/emoji.rs, SendInput Win + .; never compiled locally, no cargo), attachment cards, SendSplit (Send later beside every Send, Composer and AI Drafts).
- Not built: the sidebar footer rethink (later), "Make tasks from this email", the "Make a task?" suggestion. Still relying on stored order (not sorted): TaskDefaults list drop-downs, Composer From picker, AiDrafts, GroupsTab, OfflineTab, DiagnosticsTab, SmartMailboxEditor.

## Beta 6 feedback, for beta 7 (Todd, 13 Nov 2026)

Working: Tasks sign-in on all Google accounts (the Tasks API was already on), groups kept; the Microsoft sign-in went through despite the outage. Tasks view with Today, Scheduled and All Tasks; the group filter; quick add and its chip; tick off and Undo (a 2011 overdue task came through and ticked off fine); changing a task shows on the phone almost at once; ticking off and adding on the phone come through after Refresh; New list; default lists in Settings. Todd likes having every account's tasks in one place (Google Tasks on the phone has no combined view).

Principle (Todd, 13 Nov): when building something new, think ahead to everything the same kind of thing does elsewhere in the app (right-click menus, rename, set as default, drag to reorder) and build it in from the start, so it's consistent.

To fix:
- **Tasks sidebar is too busy** (the same "My Tasks" again and again under every account). Make it work like the mail sidebar's accounts: All Tasks, Today and Scheduled at the top, in an order you can drag (Todd wants All Tasks first); then one row per account with its colour dot, clicking it shows all that account's tasks, and a fold arrow shows its lists underneath. The Calendar Groups filter at the top already does the bundling, so no extra folders for now. Mock up first.
- **List actions:** right-click a list for Rename (saved back to Google Tasks or To Do), Set as default (for the group you're looking at), Change defaults… (opens Settings › Calendar & Reminders › Tasks), Delete list. Slow click on the name renames too, and clicking the ★ spot sets the default. Same right-click for an account row where it makes sense.
- **List picker can't tell lists apart:** in the quick add chip and the task pop-up every account's list says "My Tasks". Show the account's colour dot and name with each list.
- **Changes from the phone need Refresh:** Google Tasks has no push. Check tasks more often while the Tasks view, calendar or Coming up is on screen (about every minute), and straight away when the window comes back into focus; less often in the background.
- **New task pop-up starts blank:** start it on today at the next round hour (the user can clear it). Rename "No date" to something clearer, like "Clear date".
- **Make a task from an email works** (whole email, highlighted words, list picker, the email link from the task, ticking off leaves the email alone). The list drop-down there needs the account colour dot on each account heading (not on each list).
- **A Tasks button in the bottom-left sidebar**, beside Calendar, opening Calendar & Reminders on the Tasks view.
- **Emails show their tasks:** an email that has tasks made from it shows a small "✓ 2 tasks" tag in the email view (and perhaps a quiet mark in the list); clicking it opens those tasks. Kept in the app only, not sent to Gmail. The other half of the link a task already has to its email.
- **The right-hand side of Calendar is busy:** in Month, the Tasks panel squeezes the calendar and competes with Coming up and the day card, which also show tasks. Rethink the right column as one place: Today (events, then tasks), then Later this week (events, then tasks); clicking a day shows that day's events then tasks in the same column; "See everything" opens List view and "Open Tasks" opens the Tasks view. Month's full Tasks panel either goes, or folds out from the edge and back in (the calendar takes the full width when it's in). Mock up a couple of options.
- **AI Connection page:** the Add tasks switch is there, but "Tasks from AI apps go into" is in Settings › Calendar & Reminders › Tasks, so Todd couldn't find it; put it (or a link) under the switch. Bigger: the per-account AI page lists everything well, but setting the same thing for every account is fiddly. Give the AI Connection page the same full list, with each row set for All accounts or per account. Mock up.
- **Icons for AI apps:** in Connected AI apps, show each app's icon (Claude Desktop, Claude Code and so on) beside the green dot.
- Not tested: an AI app adding a task. The Claude Code session used for testing was connected before the Add tasks switch went on and wasn't offered add_task; try again from a new Claude chat.
- **"How you get alerted" box under the calendar** feels surplus now. Replace it with a bell button in the calendar header (beside the invitations button) that opens a small card: the current alert settings in one line each, and Change alerts (opens Settings).
- Working: deleting one of a repeating series (the whole series) with the thin progress line; the invitation showed in the calendar after Fetch new mail, with a notification and Accept / Maybe / Decline. A new repeating event took a little while to appear (watch it).
- **Out of Office:** a little more space between the Message heading and "Different message for each account", and the account tabs and Template row. The rest of the layout is good for now.
- **Join buttons:** Coming up shows Join only for today, which is right; but the day card (a day you've clicked on) should show Join for that day's calls.
- **Deleting an event that's on more than one of your calendars** deleted it from the wrong one, and there's no way to say which. When the same event is on several of your calendars, show which one the delete is for and let you pick (this one, or all of mine).
- **Quick edit card:** everything should be editable right there (title, time, location, calendar, notes; not the video call). Changing the calendar there opened the full edit window instead; it should just move the event.
**Mock-up round one, decided (Todd, 13 Nov; docs/mockups/beta7-tasks-and-calendar.html):**
- New things must fit the page they're on: outline icons in the app's own greys, at most lightly shaded, never a bold coloured tile.
- Right-hand column: Option A (one column in blocks). The clicked day's block only shows while a day is selected, and clicking the day again, ✕ or Esc deselects it so Today and Later this week have the room. "See everything" needs a clearer name (it opens List view). No folding Tasks panel.
- Alerts: the bell card is liked, but it's only settings, so it shouldn't sit with the action buttons (it suggests something to deal with). Make it a quiet button by List / Calendar / Tasks. Settings says Notifications and the calendar says alerts: use one name, and gather the calendar and task alert options with the notification settings.
- Tasks sidebar, list right-click menus, list picker, New task on today: yes. "Clear date" should be "Clear date and time"; clicking Today lets you type a date. The Tasks button goes in the bottom-left list (Scheduled, Calendar, Tasks, Help & Feedback, Settings).
- One account order everywhere: Settings › Accounts can already be dragged; make sure the mail sidebar, Out of Office tabs, AI Connection, the calendar list and Tasks all follow it.
- Email tasks tag: yes.
- AI Connection: keep the real page's style (Off / Ask / Allow buttons, not drop-downs). Connected AI apps keep Test and the ⋯ menu, with a small outline icon per app. Each "What it can do" row sets all accounts and opens out to each account's own buttons; when some differ, a small amber flag says so and the differing accounts are highlighted.
- Quick edit: no notes needed. Video: "Add Google Meet" when there's none, Join (and a link to the Meet settings) when there is. Delete on several calendars: tick which calendars, with Select all; the button says "Delete from WGM", "Delete from WGM and TBWELLER", or "Delete everywhere" when all are ticked.

**Round two, decided (Todd, 13 Nov; docs/mockups/beta7-round-two.html):** right-hand column, Alerts button and card (summary, Pause for 1 hour, Change alerts) and Alerts & Notifications: yes.
- Sidebar footer: counts always sit at the right edge, lined up; any "new" label or other badge goes to the left of the number (Invitations too).
- Connected AI apps: the apps' own coloured logos are fine here (they're other apps, not our icons).
- AI Connection: the amber "2 accounts set differently" line sits under the Off / Ask / Allow buttons on the right, not under the name.
- Quick edit: "Add Google Meet" replaces Join when there's no call (not an extra line).
- Delete from several calendars: one line per calendar, with the part in brackets after the name ("WGM (organiser)", "TBWELLER (guest)"). If the organiser's calendar is ticked, a last check: "You're the organiser, so guests will be told it's cancelled", with Delete and Go back.
- Compose polish (docs/mockups/beta7-compose.html): approved for beta 7, plus: every Send button (the top one too, and anywhere else there's a Send) has the Send later drop-down beside it. Emoji opens the Windows emoji panel.
- Later, not beta 7: rethink the sidebar footer. Scheduled, Calendar, Tasks and Invitations as small cards above the line, Help & Feedback and Settings below it; in Settings, Updates and Diagnostics move up with the other tabs. Mock up first.

- Not a bug: no "Make a task?" suggestion on the test email ("by Wednesday"); that suggestion isn't built yet (it would have been a good example).
- **Coming up layout (ComingUp.tsx):** the headings don't match ("Later" is smaller than "Tasks today"), "Open Tasks ›" is too big and bold, and the sections run together. Same heading style for Today, Tasks today and Later; more space (or a thin rule) before each section, mostly before Later; Open Tasks as a small quiet link, perhaps beside the "2 to do" count.

## 0.7.3 beta 6 (built 13 Nov 2026)

Beta 5 plus everything under "To fix" in the beta 5 feedback below, and Tasks as decided in docs/mockups/tasks-view.html. Test list: docs/testing-0.7.3-beta6.md. Checked in the browser demo only, not on real accounts.
- Tasks: Google Tasks (scope tasks; the Google Tasks API must be enabled in the Cloud project) and Microsoft To Do (Tasks.ReadWrite, asked at sign in, extra token like Out of Office). src/lib/tasks.ts (store, per-account refresh, optimistic changes with rollback, groups and default lists, alerts on the minute tick), src/lib/taskWords.ts (quick add), src/lib/taskNotes.ts (Google keeps no due time: "Due 14:00" first line of the notes; "From email:" line plus a Gmail link at the end). The email link is kept on this computer (localStorage) by task id. Microsoft: a due time is the task's reminder on that day.
- UI: src/components/Tasks.tsx (Tasks view, quick add, task pop-up, Make a task from an email or highlighted text, Tasks today in Coming up, calendar strip and markers, Month panel); Settings › Calendar & Reminders › Tasks (src/components/settings/TaskDefaults.tsx); T shortcut and the right-click menus.
- AI Connection: list_tasks (read.calendar) and add_task (new organise.task switch, asks first; goes to the list or group default in settings, or the AI names a list).
- Calendar refresh shows each account as it answers; failing accounts rest 2, 4, 8 then 15 minutes (the Refresh button tries everyone). A thin bar under the calendar header while a change saves (useCalendarBusy). Deleting closes the window once the questions are answered.
- From the subagent: Template picker on the account tabs row; place suggestions only once typing; placeFromTitle ("at Five Guys") in New event and events from emails; invitee lookup worked out once per contact list and after a 120ms pause; Join in Coming up only for today; an invitation email (calendar attachment or the usual subjects) refreshes the calendar 4 seconds later.
- Not built: "Make tasks from this email" (each line of a list a task), left for later; the quiet "Make a task?" suggestion on emails that clearly ask for something by a date.

## Beta 5 feedback, for beta 6 (Todd, 13 Nov 2026)

Working well: drags, group moves and deletes are quick; calendar header; Move to calendar flyout; repeating-event question; the weekly event now drags; Add a note; Accept on an invitation's pop-up; Cancel and tell guests now emails the guest; Out of Office wording; plain-words Microsoft errors (Microsoft had a global outage that day, so the retry couldn't really be tested).

To fix:
- **A calendar refresh waits for the slowest account.** refreshEvents uses Promise.all, so one slow Outlook holds every account's events. Show each account's events as soon as it answers. An account that keeps failing is tried less often (back off) without being switched off, and the account page still says it's having trouble.
- **Deleting a series:** the full edit window stayed open for a couple of seconds and then closed by itself. Close it at once, and show a thin moving bar under the calendar header while a change is on its way (with a note if it's refused).
- **Typing invitee names is a little slow:** look contacts up after a short pause, not on every key.
- **Invites showed late in the calendar** (needed a manual refresh). When a new invitation email arrives, refresh that account's calendar. Mail fetches stay separate from the calendar otherwise.
- **Out of Office Template picker:** the Message card is busy. Account tabs first, then subject; move Template to the far right of the account tabs row (alone on the right of that row when "Different message for each account" is off).
- **Place suggestions:** only show once you start typing (an empty list on click isn't much help).
- **Location from the title:** "Lunch with Sam at Five Guys" fills Location with "Five Guys" (the words after "at" or "@"), shown highlighted like dates so it can be undone; the same for events made from an email. A rough place name is fine; picking the exact branch needs map search later.
- Alerts: two (+ Add alert) is enough.
- **Join buttons in Coming up only for today's events** (ComingUp.tsx shows them for every day now). The event pop-up keeps its Join button.
- **Coming up layout with tasks:** Today first (events, then today's and overdue tasks, Open Tasks), then later in the week and next week below, as now.

**Tasks, decided 13 Nov 2026** (mock-up docs/mockups/tasks-view.html updated): Day and Week show tasks in the calendar itself (strip and markers, tick off from the circle); Month shows them in a panel beside it with a "2 tasks" line per day; ticking off works both ways with the phone; ticked tasks stay crossed out for the rest of the day, then go under Completed before today; overdue turns red; task lists follow Calendar Groups, each group with a default list; quick add goes to the current group's default, a task from an email to the default of that email's group; tasks with a time alert like reminders; AI apps' add_task goes to a list or group chosen in AI Connection, asking first; ticking off never archives the email. "Make tasks from this email" (each line a task): later (Todd, 13 Nov: highlight and Make a task covers it for now). Also: a "Make a task?" suggestion on an email that asks for something by a date, like the Add to calendar suggestion (kept quiet, only when it's clear). The AI apps approval card works like the other AI Connection approvals. Google Tasks permission is not in Well Good Mail yet (google.ts asks for no tasks scope; last night's Google Tasks connector was for Claude), so each Google account signs in once more when Tasks is built, and Microsoft accounts once Outlook is working again.

## 0.7.3 beta 5 (built 13 Nov 2026)

Beta 4 plus everything under "To fix" in Todd's beta 4 calendar and Out of Office feedback (now in docs/history.md), and place suggestions in Location. Test list: docs/testing-0.7.3-beta5.md. Checked in the browser demo only, not on real accounts.
- Changes show at once (drag, group move, delete, series delete, move across accounts) and go back with a note if Google or Outlook refuses; refreshes that set off before a change are not used while it is on its way. Another refresh 4 and 15 seconds after a change or an answer.
- Calendar header back in order (the `.grow` spacer had lost its style); Day / Week / Month at the normal size; the zoom a thin line with a dot.
- Menu submenus draw headings, dividers and colour dots. Choice dialogs widen for long buttons; the repeating question reads Only this event, This and all future events, The whole series.
- Empty-space click lets go of picked events (the click landed on the grid body, which holds the pointer for the drag box). All-day events drag between days in Day and Week. A merged event (on several of your calendars) now shows the copy you can change, the likely reason one weekly event wouldn't drag.
- Invitations: Accept / Maybe / Decline on an unanswered invitation's pop-up, Add a note in the accent colour with more room, Change your answer with a note.
- Cancel the meeting and tell guests: the app deleted whichever copy it showed, often a guest's copy (another of Todd's calendars the organiser's account can also write to), which tells nobody. It now deletes the organiser's own copy with sendUpdates=all.
- Microsoft: one quiet retry on 502/503/504 and Graph UnknownError, Retry-After on 429; plain words (src/lib/plainErrors.ts) with Try again, and Sign in for permission problems, in the calendar refresh note and on the Out of Office page. Out of Office on WGM Microsoft was the same 502, not a missing permission.
- Out of Office: While I'm away is one general line with the count; the Template picker sits in the Message card and follows each account's tab.
- Location suggestions from places in Todd's own events and contacts' addresses (Google People `addresses`, Outlook home or business address), local only. "+ Add alert" in words.
- Mock-up for Tasks: docs/mockups/tasks-view.html (not built).

## 0.7.3 beta 4 (built 12 Nov 2026)

Beta 3 plus under the hood: email bodies out of memory (loaded on open, last 50 cached), search index about half the size (first 4,000 characters of each email, indexed once), iCloud calendar addresses remembered, mail.ts split into src/lib/mail/ (mail.ts re-exports everything), and Tiptap 3.33.1. Test list: docs/testing-0.7.3-beta4.md. Behaviour changes to watch: words beyond the first 4,000 characters aren't found in search, and Smart Mailboxes "Any text" matches whole words or word starts in the body.

## Tasks and place suggestions (mock-ups shown 12 Nov 2026; place suggestions built in beta 5, Tasks next)

Mock-ups: docs/mockups/tasks-and-places.html, then docs/mockups/tasks-view.html (13 Nov 2026, Tasks as a third view, with open questions at the end). To decide: Tasks as a third view in Calendar & Reminders (my pick) or its own sidebar place; kept in step with Google Tasks and Microsoft To Do (my pick; Google Tasks has due dates but no due time over its API) or app-only; tasks with a due time shown in Day and Week view; make a task from an email (right-click or T, linked back to it); AI apps can add tasks, asking first. Places: suggestions from places used before and contacts' addresses (private, my pick), map search (Google Places or Azure Maps, needs a key and has costs) only as an opt-in switch; Directions in the event pop-up.

**Todd's answers (12 Nov 2026):**
- Tasks kept in step with Google Tasks (and Microsoft To Do), so they're on his phone. He's installing the Google Tasks app.
- Where: torn between a Tasks view in Calendar & Reminders and its own sidebar place. Recommended: start as a view in Calendar & Reminders, with tasks due today also in Coming up; promote to its own place later if it gets used a lot.
- Places: start with places used before and contacts' addresses. Map search (Google Places, needs billing turned on in the Cloud project; about 10,000 free autocomplete requests a month, then a charge) as an off-by-default switch, later.
- Ideas from the conversation: "Make tasks from this email" turning each line of a pasted or shared list (e.g. an Apple Note sent by email) into tasks; tasks tied to projects in the future business hub.
- **Places, decided 12 Nov 2026:** build suggestions from places used before and contacts' addresses first. Then Google Places as an optional extra: a "Place search (Google)" switch in Settings, off by default, using a key Todd makes himself in the Cloud project (Places API turned on, billing account added, key restricted to the Places API). The key is typed into the app and kept in Windows Credential Manager like the Google client secret. Add it to the setup guide (SETUP.md and the first-run guide) as an optional step, with the free allowance explained.
- **Tasks from the phone (worked out 12 Nov 2026):** Claude's directory has no Google Tasks connector (Todoist, TickTick and others exist). Claude's iPhone app can read and make Apple Reminders natively. Routes that work: (1) Google Tasks app on the phone, shown in Well Good Mail once tasks are built; (2) an "add_task" AI Connection tool, so any Claude session on the PC (including from the phone through Remote Control) adds tasks that sync to Google Tasks; (3) "Make tasks from this email": ask Claude on the phone to email a reminders list or note, then turn its lines into tasks here. A direct phone-to-Google-Tasks route would need a custom Google Tasks connector (a small hosted server); a possible business hub project.
- His phone: Siri can't add to Google Tasks directly (Microsoft To Do has Siri support; Google Tasks needs a Shortcut or IFTTT). Claude's iPhone app has an "Ask Claude" Shortcut for the Action Button, but Claude on the phone can't add Google Tasks without a Tasks connector.

## Future idea: a Well Good tasks and calendar app (Todd, 13 Nov 2026)

Once Tasks here feels right: a separate tasks and calendar app that combines every account (Google Tasks on the phone makes you switch accounts, with no combined view). Could start as a web app; a native iOS app once the Apple developer account is sorted for the teleprompter app.

Later the same day (beta 12): Todd would like it as a web app saved to the phone's home screen, Calendar & Reminders and Tasks with this app's look, kept in step through Google Tasks and Calendar (so the desktop app and Google's own apps see the same things), and maybe for Claude on the phone to add tasks there. What it would take:
- The React views already run in a browser (the demo). A phone layout for Calendar, Tasks and Coming up; no mail.
- Hosting (Cloudflare Pages, per Todd's setup) and a Google sign-in for the web: a separate "Web application" OAuth client and redirect address; tokens kept in that browser only. Google Tasks and Calendar APIs can be called straight from the browser.
- Microsoft and iCloud accounts would need more work (iCloud CalDAV can't be called from a browser without a server in between).
- Alerts are the hard part: a home-screen web app can't wake itself at 10:00; reliable task alerts need a small push server. Google Calendar's own notifications keep working meanwhile.
- Claude on the phone can't reach the desktop app's AI Connection. It would need a hosted connector (a remote MCP server, e.g. a Cloudflare Worker) that writes to Google Tasks, which then shows everywhere.
Not a tonight job: several sessions. Best started as its own project with a spec and a phone mock-up first.
Todd's decisions (13 Nov): no alerts in the web app (Google Tasks and Calendar already notify); it's a place to see, add and tick things off, kept in step with the desktop app through Google. Google accounts only to start. A connector for Claude on the phone can come later. A personal project first; bundle it with Well Good Mail if it works out.

## Future idea: tasks (12 Nov 2026)

Todd keeps reminders as tasks in Apple Reminders. Idea: a task list here instead, alongside Calendar & Reminders. Overlaps with the business hub and project management plans, so park it until those are clearer. Google Tasks and Microsoft To Do both have APIs, so tasks could sync rather than live only in the app.

## Still open from earlier betas

- **Noticed while testing 0.7.1 beta 1 (10 Nov):** the "ALL (Others)" folder in the sidebar wouldn't fold closed (or took a long time) while Drafts held a lot of drafts. Check folding speed with a big Drafts folder, and check nothing is pulling in more drafts than it should.
- **Security, still to do:** the remaining low items are in the private review on Todd's computer (not in this repository).
- **Design, still to do:** one height and corner for buttons, inputs and selects (30px, 7px; toolbars 26px); one page width and margin for full-page screens (AI Drafts, Scheduled, Settings).
- **Speed, still to look at** (from testing beta 14, 9 Nov): archive and delete are now instant; flag and read marks got the same treatment in 0.7.0 (check it). Clicks just after opening the app can still lag while older mail and the search index load and photos arrive; consider loading those even more gently. Check again with real use.

## Before 1.0

- **Follow-up suggestions** (built; check it matches this): sent emails with no reply after a few days come back to the top of the Inbox with a slightly different look and a "Follow up?" label (Reply, Snooze, Dismiss), like Gmail's nudges. Off by default, days chosen in Settings. Builds on the follow-up reminders that already exist in the editor. Later, an AI app could draft the follow-up into AI Drafts.

- **Smart Mailboxes (saved searches)**: built in 0.7 beta 7. Apple Mail style: a saved set of rules (from, to, words, account, unread, flagged, has attachments, date, drafted by AI) shown in the sidebar. AI draft groups could become Smart Mailboxes.
- **Add to contacts** from the person card: built in 0.7.2.
- **Settings, Updates is getting busy** (noted 8 Nov 2026). Split Updates from Startup and window.
- **AI connection, tidying.** Mark read, archive, snooze, reminders, bin, then invitations and send (always ask). See `docs/mcp-and-agents.md`.

## Later

- **Installer:** decided 8 Nov 2026 to keep Tauri's standard installer, so it never needs keeping in step with Tauri updates. No custom template.

- AI connection: consider renaming the "Read and write" level to "Full access" when writing actions arrive.
- Hover preview: a "Loading..." line for slower files.
- Microsoft and iCloud guest lists tried against real accounts.
- Microsoft answers to invitations through the calendar (Graph), not only by email.
- A Support and ideas card in Settings.
- Faster New email.
