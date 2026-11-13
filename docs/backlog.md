# Backlog

Things noted but not built yet. Newest first. Nothing here is promised for a date.

Finished work is in docs/history.md (newest first). This file keeps what is still open, plus the latest beta.

## Ideas (not scheduled)

- 13 Nov 2026: compose window polish, inspired by Apple Mail's compose window. Todd likes the current one, so this is optional, small and mock-up first. Ideas worth trying: font and size as neat boxed dropdowns (with the up/down arrows) instead of plain selects; clearer "on" state for bold, italic, underline and alignment (a filled blue box like Apple's); an emoji button (opens the Windows emoji panel, Win + .); attach and emoji as labelled buttons near the top (icon with the word under it); a roomier attachments area (bigger cards with thumbnails rather than small chips). Not wanted: Mac window buttons, Writing Tools.

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

**Tasks, decided 13 Nov 2026** (mock-up docs/mockups/tasks-view.html updated): Day and Week show tasks in the calendar itself (strip and markers, tick off from the circle); Month shows them in a panel beside it with a "2 tasks" line per day; ticking off works both ways with the phone; ticked tasks stay crossed out for the rest of the day, then go under Completed before today; overdue turns red; task lists follow Calendar Groups, each group with a default list; quick add goes to the current group's default, a task from an email to the default of that email's group; tasks with a time alert like reminders; AI apps' add_task goes to a list or group chosen in AI Connection, asking first; ticking off never archives the email. Still open: "Make tasks from this email" now or later.

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
