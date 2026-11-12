# Backlog

Things noted but not built yet. Newest first. Nothing here is promised for a date.

Finished work is in docs/history.md (newest first). This file keeps what is still open, plus the latest beta.

## Beta 4 calendar feedback, for beta 5 (Todd, 12 Nov 2026)

Working well: right-click Move to calendar for a group, Meeting settings, the quick edit (type or use the pickers), dragging and resizing ("really smooth", likes the grab animation), Ctrl + wheel and slider zoom, Ctrl-click and the drag box, Invitations (Accept, Decline with a note reached the organiser with the note), "Send an update to your guest", the repeating-event question after a drag (and Cancel puts it back).

To fix:
- **Changes should show at once.** Moving a group, dragging, and "this and all future events" wait for Google (about a second per event; a series delete showed the old form for 3 to 4 seconds). Show the change straight away, and put it back with a note if Google refuses. For a series, take the old events off screen at once.
- **Calendar header layout broke:** the slider and Day / Week / Month ended up on the left and Day / Week / Month look smaller. Put the views on the right at their old size. The slider should be a thin line with a dot (no filled oval), with − and + either side.
- **Move to calendar submenu lost its look:** no account names as headings and no colour dots in the flyout (the right-click menu's submenu doesn't draw headings or dots the way the main menu does).
- **Repeating-event question:** buttons in reading order, left to right: Only this event, This and all future events, The whole series (not "All events"). Text to match: "Delete just this one, this one and every one after it, or the whole series?" The question box spills outside the event pop-up behind it (also the guests question); keep it inside or above it cleanly.
- **Clicking empty space should let go of picked events** in Day and Week view (Month view already does, because it picks the day).
- **All-day events can't be dragged in Day or Week view** (they can in Month). Let all-day chips drag between days in the all-day row.
- **Repeating events can't be dragged in some cases** (one weekly event wouldn't move). Check why; they should drag and then ask which ones.
- **Invitations: Add a note** is easy to miss. Give the row more room at the bottom and make the link stand out a little (subtle colour or underline). Also offer Accept / Maybe / Decline (with Add a note) on the event pop-up of an invitation you haven't answered. Changing an answer from Replied should also allow a note.
- **Cancel the meeting and tell guests sent no emails** (Todd tried it on 3 of 4 copies, guests were his own accounts). Check whether Google's cancellation email goes out (sendUpdates=all on the organiser's copy) and whether deleting a guest's copy only removes it from that calendar. Also, the same event on four of his calendars needed deleting four times; fine for now.
- **Microsoft 502 "UnknownError"** toast ("Couldn't reach the calendar for WGM Microsoft") came up twice during refreshes. Probably Outlook having a moment; retry once quietly before showing it, and word it more plainly.
- **Guest answers and new invitations still take a refresh to show** (5 to 6 seconds after Refresh). Look again at refreshing sooner after an answer or a change.
- Later: typing a contact's name in the New event title could offer to invite them.
- **Second alert:** worked; Todd missed the small + button. Make it "+ Add alert" with words, not just a +.
- **Events on several of your calendars** show once with "On 4 of your calendars", but the Calendar line only highlights one of them, and there's no easy way to take it off just one calendar. Idea for later: list each calendar it's on with a "Remove from this calendar" (for copies you were invited to, that's declining or deleting that copy). Not urgent.

**Out of Office on beta 4 (Todd, 12 Nov 2026).** The page works: switches, templates, different message per account, Schedule for several accounts.
- **WGM Microsoft can't be checked or switched on:** "Couldn't check: {"error":{"code":"UnknownError"...". The same Microsoft 502 as the calendar, or the account lacks the MailboxSettings permission. Find out which; show plain words ("Outlook didn't answer. Try again") instead of the raw error, with a Try again button, and Sign in if it's a permission.
- **While I'm away row:** don't list every option that's on. A general line like "Choose what happens while you're away" with the "4 of 5 on" count, opening to the switches.
- **Move the Template picker next to the message:** inside the MESSAGE card (or just below Accounts), since that's where it's used; at the top it's far from the text.
- **Template picker and per-account tabs:** with "Different message for each account" on, picking a template on one tab and then switching tabs doesn't show which template that tab has. Show each tab's own template in the picker.
- Day view at 5-minute lines is a lot, but leave it.

## 0.7.3 beta 4 (built 12 Nov 2026)

Beta 3 plus under the hood: email bodies out of memory (loaded on open, last 50 cached), search index about half the size (first 4,000 characters of each email, indexed once), iCloud calendar addresses remembered, mail.ts split into src/lib/mail/ (mail.ts re-exports everything), and Tiptap 3.33.1. Test list: docs/testing-0.7.3-beta4.md. Behaviour changes to watch: words beyond the first 4,000 characters aren't found in search, and Smart Mailboxes "Any text" matches whole words or word starts in the body.

## Tasks and place suggestions (mock-ups shown 12 Nov 2026, for beta 5 or 6)

Mock-up: docs/mockups/tasks-and-places.html. To decide: Tasks as a third view in Calendar & Reminders (my pick) or its own sidebar place; kept in step with Google Tasks and Microsoft To Do (my pick; Google Tasks has due dates but no due time over its API) or app-only; tasks with a due time shown in Day and Week view; make a task from an email (right-click or T, linked back to it); AI apps can add tasks, asking first. Places: suggestions from places used before and contacts' addresses (private, my pick), map search (Google Places or Azure Maps, needs a key and has costs) only as an opt-in switch; Directions in the event pop-up.

**Todd's answers (12 Nov 2026):**
- Tasks kept in step with Google Tasks (and Microsoft To Do), so they're on his phone. He's installing the Google Tasks app.
- Where: torn between a Tasks view in Calendar & Reminders and its own sidebar place. Recommended: start as a view in Calendar & Reminders, with tasks due today also in Coming up; promote to its own place later if it gets used a lot.
- Places: start with places used before and contacts' addresses. Map search (Google Places, needs billing turned on in the Cloud project; about 10,000 free autocomplete requests a month, then a charge) as an off-by-default switch, later.
- Ideas from the conversation: "Make tasks from this email" turning each line of a pasted or shared list (e.g. an Apple Note sent by email) into tasks; tasks tied to projects in the future business hub.
- **Places, decided 12 Nov 2026:** build suggestions from places used before and contacts' addresses first. Then Google Places as an optional extra: a "Place search (Google)" switch in Settings, off by default, using a key Todd makes himself in the Cloud project (Places API turned on, billing account added, key restricted to the Places API). The key is typed into the app and kept in Windows Credential Manager like the Google client secret. Add it to the setup guide (SETUP.md and the first-run guide) as an optional step, with the free allowance explained.
- **Tasks from the phone (worked out 12 Nov 2026):** Claude's directory has no Google Tasks connector (Todoist, TickTick and others exist). Claude's iPhone app can read and make Apple Reminders natively. Routes that work: (1) Google Tasks app on the phone, shown in Well Good Mail once tasks are built; (2) an "add_task" AI Connection tool, so any Claude session on the PC (including from the phone through Remote Control) adds tasks that sync to Google Tasks; (3) "Make tasks from this email": ask Claude on the phone to email a reminders list or note, then turn its lines into tasks here. A direct phone-to-Google-Tasks route would need a custom Google Tasks connector (a small hosted server); a possible business hub project.
- His phone: Siri can't add to Google Tasks directly (Microsoft To Do has Siri support; Google Tasks needs a Shortcut or IFTTT). Claude's iPhone app has an "Ask Claude" Shortcut for the Action Button, but Claude on the phone can't add Google Tasks without a Tasks connector.

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
