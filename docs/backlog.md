# Backlog

Things noted but not built yet. Newest first. Nothing here is promised for a date.

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

## 0.7.3 beta 3 (built 12 Nov 2026)

Aim: the last 0.7.3 beta before live, so one round of testing, not several. Test list: docs/testing-0.7.3-beta3.md.

- **Calendar events** (event-drag-and-select.html, calendar-header.html): the quick edit in the pop-up; Edit opens the full form (remove a video call, Meeting settings link); resize with the handle and drag to move (white hand pointers, 15-minute snap keeping an off-grid offset); Month chips dragged between days; the repeating-event question after a drag, edit or delete (only this / this and all future); Ctrl-click and the drag box to pick several, then Move to calendar or Delete with the guests warning; the same in List view with ticks; arrows either side of the month name; zoom with Ctrl + wheel and a slider.
- **Guests:** ask before changing or deleting an event with guests (send an update / don't send / cancel).
- **Invitations** (invitations.html): the envelope button with a count, New and Replied, clash notes, cancelled ones, the sidebar line only while there are new ones, "Not answered" in Coming up, Accept / Maybe / Decline everywhere, Add a note.
- **Calendar refresh:** only fetch what changed (Google syncToken, Outlook delta), every minute while Calendar & Reminders is open and when the window comes back into focus; an open event pop-up updates too.
- **Out of Office page** (ooo-page.html): layout A with While I'm away folded, small capitals card titles, accounts as switches, "Different message for each account", Changed template with Update / Save as new and the question on Schedule ("Leave the template as it was"), template names only, shorter Manage wording, the outside-organisation wording. Refresh the mock-up first for a quick look.
- **Fixes:** "Resource has been deleted"; Undo then Ctrl+Z on a new event; second alert on all-day events; "today" in titles, and deleting the date words puts the old time back.
- **Mark as unread** on a conversation marks one email.
- **Proposed extras (Todd to say yes):** Help and What's new for everything in 0.7.3, so beta 3 can go live as it is; Gmail's first sync fetching each email once (audit round 3, small); a look at why some emails take a moment to open (invitations looking up guests).
- **Left for later:** the rest of audit round 3 (bodies loaded on open, a smaller search index, iCloud calendar addresses), splitting mail.ts, Tiptap 3, tasks, place suggestions in Location.

## Tasks and place suggestions (mock-ups shown 12 Nov 2026, for beta 5 or 6)

Mock-up: docs/mockups/tasks-and-places.html. To decide: Tasks as a third view in Calendar & Reminders (my pick) or its own sidebar place; kept in step with Google Tasks and Microsoft To Do (my pick; Google Tasks has due dates but no due time over its API) or app-only; tasks with a due time shown in Day and Week view; make a task from an email (right-click or T, linked back to it); AI apps can add tasks, asking first. Places: suggestions from places used before and contacts' addresses (private, my pick), map search (Google Places or Azure Maps, needs a key and has costs) only as an opt-in switch; Directions in the event pop-up.

## Future idea: tasks (12 Nov 2026)

Todd keeps reminders as tasks in Apple Reminders. Idea: a task list here instead, alongside Calendar & Reminders. Overlaps with the business hub and project management plans, so park it until those are clearer. Google Tasks and Microsoft To Do both have APIs, so tasks could sync rather than live only in the app.

## Mark as unread in conversations (12 Nov 2026)

Todd: marking a conversation unread shouldn't make every email in it unread, so 10 unread suddenly appear when there's really one conversation to come back to. Mark unread should mark only one email: the one you're reading if you're inside the conversation, otherwise the latest. The conversation then shows as unread with a count of 1. Check what Gmail and Apple Mail do, and how the conversation's dot and the sidebar count follow it.

## Calendar testing notes, beta 2 (12 Nov 2026)

- **Video call settings open in the browser.** Host controls, waiting room, recording and the rest stay in Google (or Outlook). The app only adds or removes the call. After Add Google Meet, and in the event pop-up for events you organise, a "Meeting settings" button opens the event in Google Calendar (htmlLink is already stored; webLink for Outlook).
- **Remove the video call** from an event in the full edit form (comes with Edit getting the full form).
- **Guests get asked about.** Changing or deleting an event with guests asks first: "Send an update to 3 guests" / "Don't send" / "Cancel", and for delete "Cancel the meeting and tell guests". Google sends the emails when asked to (sendUpdates=all); today the app doesn't ask.
- **Changes made in Google show up slowly.** The app reads calendars every 3 minutes, plus Refresh. Better: also read them when the window comes back into focus and when you open Calendar & Reminders, and every minute while it's open. (Google can push changes, but only to a web server, not to an app on your computer.)
- **Repeating events: delete asks which ones.** "Only this event" or "This and all future events" (and All events). Today Delete only removes the one you clicked. Todd has left some test series in his calendar to try this on in beta 3.
- **Bug: deleting an event already deleted elsewhere** shows "Resource has been deleted" (Google answers 410 Gone). It should just take it out of the app quietly. gmail.ts deleteEvent only lets permission errors through; treat 404 and 410 as done, as removeAwayEvent already does.
- **Bug to check: Undo then Ctrl+Z.** Todd added an event, pressed Undo in the message (gone), then Ctrl+Z brought it back on screen, but deleting it then said it wasn't there. Check whether the redo really made it again in Google or only on screen.
- **Bug to check: second alert on all-day events.** Todd couldn't add one on an all-day event; it worked once he set a time.
- **Answers don't update on an open event.** Guest replies (Yes, Maybe, No) changed on the phone only show after closing and reopening the event, even after Refresh. The open pop-up should update when the calendar does.
- **Month arrows.** The back and forward arrows are at opposite edges of the calendar. Put them either side of the month name, or together next to Day / Week / Month. Mock-up.
- **Faster calendar refresh, only fetching what changed.** Google (syncToken) and Outlook (delta) can both return just the events that changed since last time, like mail does. With that, checking every minute or so costs almost nothing, and only changed events are redrawn.
- **Words in the title:** "Lunch with Helen at 2pm" and "tomorrow" work. "Today" isn't read. Deleting the date words doesn't put the day and time back to what they were before; it should go back to where the event started (the day you double-clicked, or now).
- Maybe later: place suggestions while typing Location (Google Maps style). Not needed now.
- Works: repeat every 2 weeks until a date, Custom (Monday and Friday every other week, 5 times), alert 15 minutes plus 2 days before, location and notes, Meet on a repeating event, invitations (the email arrives, answering in the app updates Google, Change answer works), Undo after adding. Deleting an event with guests already tells them (the app asks Google to send updates); asking first is the part still to add.
- Works: deleting from the app reaches Google at once; Month double-click, right-click menu, Ctrl+Alt+N, Ctrl+Shift+N and Ctrl+N; Join on a new Meet.

## Invitations in one place (mock-ups first)

**Todd, 12 Nov 2026.** Like Apple Calendar's Invitations: an icon (maybe in the calendar header or the sidebar) that glows or has a dot when new invitations are waiting. Clicking it opens a small pop-up listing them, each with Yes, No and Maybe. Below the new ones, invitations you've already answered, so you can change your answer quickly. Today, answering only happens on the invitation email itself (InviteCard.tsx, answerInvite in mail.ts, respondToInvite on the providers). Todd sent the iPhone version (New / Replied tabs, Accept / Maybe / Decline, cancelled ones crossed out). Mock-up in docs/mockups/invitations.html.
- **Agreed 12 Nov 2026:** the envelope button in the Calendar & Reminders header with a count and glow; New and Replied; clash notes. Proposed (Todd asked for a view): a sidebar line "Invitations" that only appears while there are new ones and goes once they're answered; unanswered invitations in Coming up get a small "Not answered" tag that opens the pop-up; Accept / Maybe / Decline everywhere, including the invitation card on emails (Apple and Outlook wording, more professional than No); one click to answer, with a small "Add a note" link that opens a box for a message to the organiser (Google and Outlook both carry it). Think about: invitations come from the calendar (events where you're a guest with no reply yet), not only from emails, so ones you never got by email still show; Outlook and Google both list these; iCloud invitations may need CalDAV inbox work.

## Out of Office page rethink (mock-ups first)

**Todd's feedback on 0.7.3 beta 2 (12 Nov 2026).** Everything it does is right, but the page is hard to find your way round: cards of different sizes and lots of switches. Mock-ups in docs/mockups/ooo-page.html (A: Settings-style cards, B: sections down the side, C: laid out like an email).
- Accounts as switches, one row each, like other Settings pages, instead of tick boxes and chips.
- "Own message" is unclear. It means one account gets a different message (professional for Well Good Media, casual for personal). Proposed: one "Different message for each account" switch on the Message card, with a tab per account.
- The Templates drop-down shows names only, no "(message, when, who…)" after them.
- When you change something after picking a template, offer Update template or Save as new right there (a Changed label), and maybe ask once when you press Schedule.
- Manage templates wording shorter: Duplicate, Save current settings to it, Choose parts….
- **Decided 12 Nov 2026 (Todd, from ooo-page.html):**
  - Layout A (Settings-style cards, accounts as switches, the read-back sentence, Preview / Send me a test / Schedule), with C's idea of folding "While I'm away" away, since accounts, message, when and who are the essentials and the rest is extra.
  - Card titles as small capitals labels (ACCOUNTS, MESSAGE, WHEN, WHO GETS IT, WHILE I'M AWAY), like the other Settings pages, so each card's title stands out.
  - "Different message for each account" switch with a tab per account: approved.
  - "A different message for them" is unclear: name who "them" is, e.g. "Separate message for people outside my organisation".
  - Changed template: the Changed label with Update template / Save as new, and the question when you press Schedule. "Just this time" is unclear; reword so it plainly means "don't change the template", e.g. "Leave the template as it was".
  - Before building: refresh mock-up A with these changes for a quick look.
- AI: Set Out of Office can only be Ask, never Allow, because people get the reply. Todd checked that in AI Connection and is fine with it.

## Next for calendar events (mock-ups first)

Mock-ups in docs/mockups/event-drag-and-select.html.

**Decided 12 Nov 2026 (Todd):**
- Handle and dragging as mocked up. The pointer is the normal white Windows hand (CSS cursor grab, then grabbing while held), never a coloured one. Hovering the middle of an event shows the open hand too, so it's clear you can pick it up.
- Month view: a picked-up chip lifts and is highlighted while dragged, and the day under it is outlined.
- Repeating events ask Cancel / Only this event / This and all future events.
- One click (no movement) opens the quick edit, as now. Any drag moves or resizes and never opens it.
- Ctrl-click picks an event without opening it, and Ctrl-click again lets it go, so a selection can be built up a piece at a time. Dragging across empty space draws a box round events (with Ctrl held, it adds to what's already picked). Escape or a click on empty space clears it.
- Several picked: Move to calendar and Delete, in a bar and on right-click; the guests warning as mocked up.
- List view: the same, with ticks to pick rows, and both Move to calendar and Delete.
- Snap to 15 minutes. An event that starts off the grid (10:05) keeps its offset while dragged (10:20, 10:35).
- New idea: zoom in Day and Week view (Ctrl + wheel, pinch, or a small slider), from the whole day down to 5-minute lines; snapping goes to 5 minutes at the closest zoom. Mock-up in docs/mockups/calendar-header.html.
- Decided: arrows either side of the month name with Today next to them (A), Day / Week / Month on the right; zoom with Ctrl + wheel and the small slider.

**Todd's feedback on 0.7.3 beta 2 (12 Nov 2026).** Working well: + New event, double-click, More options, Google Meet, New event on [day], Calendar Groups (make, edit, pick, Choose calendars), the Refresh icon. Asked for:
- **Edit gets the full form.** Edit on an existing event still opens the old small editor (title, when, all day, calendar, where, notes). It should be the same card as New event with More options: repeat, alerts, invitees, video call.
- **Quick edit in the event pop-up.** Day and time editable straight in the single-click pop-up, so Edit is only for the extra options.
- **Resize by dragging (Day and Week view).** On hover, an event gets an outline and a handle on its bottom edge. Over the handle the pointer becomes a grab hand (closed hand while dragging); dragging changes the end time. Grabbing the handle doesn't open the event. Not in Month view.
- **Move by dragging.** Month view: drag a chip to another day, keeping its time and details. Week view: another day and/or time. Day view: another time.
- **Repeating events:** after a drag, ask "Only this event" or "This and all future events".
- **Right-click an event:** a quick edit card (name, date, time, calendar), separate from the right-click menu for the empty day (New event, New all-day event, Open day, Go to today).
- **Selecting events:** a single click might select (outline) rather than open, with double-click opening; or keep click-to-open. To decide in the mock-up.
- **Bulk change calendar:** Shift-click (and maybe drag a lasso) to select several events, then a toolbar button and right-click to move them all to another calendar. Only the calendar can change for a selection, not name or time. Also in List view: tick several rows and change their calendar.
- Small: Choose calendars… switches to All calendars and stays there. Fine as it is.

**Things to think about for the mock-up:** moving within one Google account uses Google's own move (the event keeps its id and replies); between accounts it is copy-and-delete, as editing already does, so invitees get a new invitation and replies are lost. Bulk moves should warn when any event has invitees. Outlook can't move between calendars either, so it is copy-and-delete there too. Dragging needs Undo, like other edits. Events you were invited to (not the organiser) can't be moved or resized; their handles shouldn't show.

## Ideas for 0.7.3 (mock-ups first)

**Built for 0.7.3 beta 2 (12 Nov 2026):** all three below. Test list in docs/testing-0.7.3-beta2.md. Small changes from the mock-ups: Refresh in the calendar header is now an icon button, so + New event fits on the same line; all-day alerts are "the day before at 09:00" and earlier, because calendars cannot alert on the day itself; double-clicking a day in Month view now makes an all-day event (Open day is in the right-click menu and on the day panel); a Calendar Group shows its own calendars even if they are hidden under All calendars.

**Decided 12 Nov 2026 (Todd, from docs/mockups/new-event.html, ooo-templates.html, calendar-groups.html):**
- Creating events:
  - The blue + New event button goes in the header, plus "+ New event on [day]" in the picked-day panel.
  - Double-click a day or time, or right-click it, to start an event.
  - A quick pop-up comes first. More options expands the same card into the full form; it doesn't open a new window.
  - Repeat and End repeat work as in the mock-up.
  - iCloud calendars, and any you've hidden, stay out of the Calendar list for now.
  - Shortcuts: Ctrl+Alt+N is New event, from anywhere in the app. The Apple Mail defaults stay as they are: Ctrl+N is New email, and Ctrl+Shift+N is Check for new mail. New event doesn't work while you're writing an email, because on some keyboard layouts (Polish, for example) Ctrl+Alt+N types a letter. It can be changed in Keyboard Shortcuts like the others.
- Out of Office templates:
  - Save as new template has ticks for each group, and each group's sub-options can also be ticked one by one. For example, While I'm away can be ticked whole, or just the Away event and the decline option on their own.
  - Templates are picked from the Templates drop-down.
  - Editing is in a Manage templates window: rename, copy, update from the page, change what's included, and delete.
  - AI apps can turn on a template by name with dates ("turn on Holiday from 20 Dec to 3 Jan"). They always ask first, with the full preview.
- Calendar Groups:
  - Groups are a view filter only. Events and calendars don't change.
  - They sit inside the Calendars menu as a small drop-down: All calendars, then each group, Choose calendars… (the full list), and Edit groups….
  - "Only alert me from the group I'm looking at" is a switch, off by default.
  - Groups apply everywhere calendars show: the calendar views, List view and Coming up in the sidebar.
  - Claude can make and edit groups through a new AI tool, which only changes the view.

- Create events in the calendar, like Apple Calendar: double-click a day or time to start one, right-click for New event; the same options Apple Calendar has (title, all day, start and end, repeat with its choices and an end, calendar from any account, alerts, invitees, location, notes, video link), matched to what Google and Outlook support. Also a visible + New event button in the calendar toolbar (and in the picked-day panel, starting on that day), so it is findable without knowing to double-click. Repeats use src/lib/recurrence.ts, already converting between the two.
- Save as new template for Out of Office: a pop-up with a name and ticks for what to include (message, subject, when and dates, part days and times, who gets it, the While I'm away options, accounts), like Lightroom's presets; templates editable and deletable, e.g. a Friday afternoons template copied to make Wednesday away.
- Calendar groups such as Work and Personal, each gathering calendars from any account, picked from the Calendar screen; groups could also be set up by asking Claude.

## After 0.7.0

**For 0.7.2 beta 11, the last before live (11 Nov 2026):** Accounts header with Resync and a ... menu (Sign in again, Change colour, Remove account); removing asks Keep its mail on this computer (back at once when added again, listed in Storage) or Delete it; Out of Office per account turns on in place (until, who, message, Turn on for X) and shows what is going out when on; AI panel as buttons; Out of Office page in the order you decide (accounts, message, When and Who side by side, switches); edit events (title, time, all day, calendar within the account, place, notes, delete); every calendar event fetched (Google and Outlook stopped at 250); Google event notes no longer lose the letter s; Help tidied into the right topics; one 0.7.2 release note. Later: choosing the calendar (and account) when adding from an email, and moving events between accounts.

**Beta 11 feedback (11 Nov 2026).** Fixed for live: Turn off now shows off at once (and a slower check started earlier no longer turns it back on); Back to Settings, Accounts returns to the same account and open panel. **Live as 0.7.2 (11 Nov 2026), after beta 12 feedback:** click a day in the calendar to pick it (ringed in Month, tinted in Week, listed under Coming up with Open day; Day and Week open on it, moving keeps it in step); +N more opens that day; repeating events show how they repeat on the event and in Edit. Moving an event to another account is confirmed on real accounts. Not yet tried on real accounts: moving an event that has guests, and copying a series. Check those first if anything is reported.

**Built for 0.7.2 beta 12 (11 Nov 2026), the last before live:** move an event to another account (Calendar list with every account, note about guests and video links, Move to X, Undo, a click on the calendar line for a quick move); a repeating event copies its whole series to the other account from that one on and can stop the old one (src/lib/recurrence.ts turns Google and Outlook repeat rules into each other); a new account asks whether AI apps may see it (Keep it off, Read only, Read and write, Decide later, with Not decided on the row); Settings paths written with › everywhere.

**For 0.7.2 beta 2 (done, not built yet):** with the Unread filter on, emails you read stay in the list (so you can go back to one) until you leave that mailbox or switch Unread off and on, like Apple Mail. The list no longer shifts under each click. Forward and new emails start with the cursor in To (Reply still starts in the message), also when switching a reply to Forward. When "Tell me about test versions" is ticked (always, on a test version), a newer test version lights the Settings dot, and the app looks for one hourly instead of daily. Settings and Help now open from the welcome page before any account is added (the sidebar button is greyed until there is mail). "Moving from another computer?" on the welcome page opens a checklist: restore the Google key from the backup file (or "I don't have one", which opens the guide at Paste your key with where to find the ID and a new secret), sign in, then import the mail export. Out of Office: accounts that need one more sign in get a pop-up (Sign in to each, or Later) when you open Out of Office or click Turn on, and an amber bar above the accounts; after signing in, Turn on carries on for them. Microsoft offers Sign in instead of "Couldn't check", and other failures show the reason. The status and "Default message" sit on their own lines (no stray dot). Turn off now is also in the bottom bar, which now sits flush with the window edge. The text size slider is in Accessibility as well as Appearance: one setting, so moving either moves both. Todd, 10 Nov.

**In 0.7.2 beta 5 and 6 (11 Nov 2026):** crash reports at the next start, default mail app (mailto), Add to contacts, taskbar unread badge, Tab from Subject to the message, right-click paste menu, Settings as cards of rows with switches, Accounts tidier (calendars only inside each account, alerts from hidden calendars in Calendar & Reminders), resizable Settings sidebar, Look as colour bars, What's new as rows, Calendar in the sidebar with a saved copy (3 months back, 12 ahead), Reminders header tidied, notes at the top folding into a stack with a Recent list, no white flash opening an email.

**For 0.7.2 beta 4 (11 Nov 2026):** Accounts round two (health line, suggestion, summary rows with the editor below or to the right, Saved and Undo, no signature on replies or forwards); Settings grouped with icons, General page, Notifications and Calendar & Reminders split, Storage, search in Settings, search tips in Help with a ? in the search box; one sidebar footer on every screen (version in Settings); Signatures & Addresses like Accounts; Day, Week and Month calendar with week numbers, hide weekends, working hours, week start; replied and forwarded marks; draft files open; preview buttons on the right; saving with Open and Show in folder, Save as in the saved folder, a Downloads list; reminders with Join under the name; emails loaded ahead; Help & Feedback (suggest, support, report a problem with the activity log). Still to do: Add to contacts, default mail app (mailto), taskbar unread count switch.

**In 0.7.2 beta 1 (10 Nov 2026):** Out of Office (set inside Gmail and Microsoft; dates, audience, default and own messages, templates, back date, Preview, Send me a test; Away event, Workspace declines, reminder, amber bar, sidebar plane, While you were away, holiday suggestion, pause alerts; AI tools get_out_of_office and set_out_of_office, always asking with the whole reply); attachments open in their own app from a private Previews folder (programs and scripts refused), a downloads folder, Clear previews; suggested events (chrono-node, people only, Change details, Don't suggest from this sender); What's new grouped by series; Accessibility tab (bold focus ring, motion, Windows high contrast, every control named); one control height (reminder minute boxes, template menu) and one page width (scroll bar room on full-page screens). The sidebar fold lag couldn't be reproduced in the demo with 1,500 drafts (folds in 6 to 19 ms): watch for it on the real app. Still to do from this list: Accounts round two (mock-ups first), Add to contacts.

**In 0.7.1 beta 1 (10 Nov 2026):** design review fixes (contrast on the selected row and Allow buttons, editor fitting its pane, headings that match their tabs, softer greys made readable, even editor edges, empty group chips hidden, sign-off trimmed from previews); Settings, Accounts as a list with a calm detail column; Appearance with one Colours card; hardening: what an AI is shown, remote picture blocking, links opening in the browser, Always allow only for ticked accounts, safe attachment names, tighter content rules.

**Attachments, asked for 10 Nov 2026 (next beta):**
- Click an attachment that can't preview inside the app (Word, Excel, Pages and so on) and it opens straight away in its own app: Well Good Mail saves a copy in a private Previews folder (in the app's cache) and opens that. Changes made there aren't saved back to the email.
- Settings: a default downloads folder (or "Ask each time"), used by Save and Save all.
- Settings, Search & Storage: the Previews folder's size, Open folder and Clear previews, and previews older than 30 days cleared by themselves.
- Needs a small Windows-side addition (write to the cache folder and open a file with its own app), kept to that folder only.

**Out of Office, designed 10 Nov 2026 (0.7.2, mock-up shown):**
- Set in each account itself (Gmail vacation responder via gmail.settings.basic; Microsoft automatic replies via MailboxSettings.ReadWrite), so it works with the PC off and shows on the phone. iCloud and IMAP: a link to their web settings. Google scopes added by Todd in the WellGood - MAIL project; each account asks to sign in again only the first time it's used.
- Where: Settings, Out of Office (Title Case place name), the top-left menu, the tray menu, and each account's card.
- Accounts as chips with their current state (Off, On until..., Scheduled from...). Read back from Gmail and Microsoft whenever it opens, so changes made elsewhere show.
- When: "From now until I turn it off" or "Between dates". Dates are whole days and inclusive: First day away (from 00:00) and Back on (replies stop at the end of the day before). Optional times for part days. A plain sentence repeats exactly when replies start and stop. It switches itself off on the back-on date.
- Who: Everyone, My contacts only, or (Workspace/Microsoft 365) people in the organisation only; Microsoft can have a separate message for outside the organisation.
- Message: subject (Gmail), rich text with the basic formatting bar, the signature menu, "Insert back date" (kept in step if dates change), and templates (Away, Holiday, Conference, Off sick). Preview the reply before turning on.
- Extras: add an "Away" all-day event to the calendar (on by default), remind me the day before it ends, decline new invitations while away (Workspace and Microsoft 365 only).
- While on: a quiet amber bar at the top of the mail with Change and Turn off now, and a small badge on the account in the sidebar. Turning off early is one click. Gmail itself only replies to each sender once every 4 days; Help says so.
- Added 10 Nov (Todd): one default away message plus "Own message" per account (each chip says which); one main Turn on / Schedule for all ticked accounts, with an "All accounts" tick. Every native option: Gmail contacts only / organisation only (Workspace), Microsoft inside and outside messages with outside audience everyone / contacts / nobody. Decline new invitations is a user option, on by default, where the account supports it (Workspace, Microsoft 365), greyed with a note otherwise. Plane icon on away accounts.
- Bonus: "While you were away" summary on return (VIPs, questions, Cc'd); suggest out of office from all-day Holiday or Annual leave events (with suggested events); pause new-mail notifications while away (option); "Send me a test" of the auto-reply.
- AI apps CAN set it (changed 10 Nov, Todd): new tools to read and set out of office (accounts, dates, message, who). It reaches other people, so it always asks with a full preview card and can't be set to Allow. Works from Claude on this PC; from a phone only through a Claude session running on the PC (no Well Good Mail server).

**Settings, Accounts, round two (10 Nov 2026, mock-ups first, next beta):**
- One bigger card per account: an easy-to-read summary at the top (every setting on one line each, no "Mail" / "Calendar and AI" breaks), and a panel underneath that shows whichever row you click.
- Signature: a drop-down (like "WGM signature") that shows the whole signature, where you change the default. Also separate defaults for replies and forwards (for example a short one or none on forwards).
- Calendars: clicking shows that account's calendars with their switches right there, plus the "alerts from hidden calendars" choice (that setting should live here too, not only on the old Calendars section).
- AI Connection: that account's switches (Off, Ask, Allow for each thing) right there, with a link to the full AI Connection tab for everything else.
- The separate Calendars section and the account card then become one place.

**What's new log, grouped by series (10 Nov 2026, next beta):** in Settings, Updates (the update log), the current series shows each live release on its own (0.7.1, 0.7.0, and later 0.7.2), newest first. Every older series folds into one row ("0.6.x") that opens to list its releases newest to oldest, each with what changed. When 0.8 comes, the 0.7s fold up the same way. Betas never appear, only live releases.

**Noticed while testing 0.7.1 beta 1 (10 Nov):** the "ALL (Others)" folder in the sidebar wouldn't fold closed (or took a long time) while Drafts held a lot of drafts. Check folding speed with a big Drafts folder, and check nothing is pulling in more drafts than it should.

**Suggested events, asked for 10 Nov 2026 (next beta, not built yet):** a card at the top of an open email when it mentions a future date and time (like "Monday 16th November at 7.30pm, online"): the title from the subject, date and time, Online with the link if there's a Zoom, Meet or Teams link, Add to calendar (same route as invitations), Not now, and a menu with Change details and Don't suggest from this sender. Read on this computer with a date-reading library, no AI or server. Only from people (not newsletters or receipts) and only when fairly sure; the phrase it found is lightly highlighted. A switch in Settings to turn it off. Mock-up shown 10 Nov.

**Security, still to do:** the remaining low items are in the private review on Todd's computer (not in this repository).

**Design, still to do:** one height and corner for buttons, inputs and selects (30px, 7px; toolbars 26px); one page width and margin for full-page screens (AI Drafts, Scheduled, Settings).

**Next batch, agreed 9 Nov 2026 (Todd: "have a go at all the next things"):**
- Accessibility pass: keyboard only on every screen with visible focus, Windows Narrator check, contrast measured in both themes, follow Windows "show animations", Windows high contrast mode, and an Accessibility section in Settings.
- Start-up click lag: load older mail, the search index and photos even more gently.
- Out of office per account, and Add to contacts from the person card. Both need one more Google sign-in (vacation settings and contacts permission), and Microsoft too; add both to the Google project first, so it's one sign-in, not two.
- Microsoft 365 and iCloud: real testing, including an AI draft on each.
- Follow-up suggestions (see Before 1.0).
- Settings, Accounts reimagined (mock-up: list and detail like Apple Mail, or one folding card per account), with calendars, Keep mail from, AI access and out of office per account in one place.
- Appearance calmer: one Colours card (accent, account palette, unread colour as compact rows) instead of four rows of dots.
- Worth running once: a security audit (gstack cso) given the AI Connection and email rendering, and a design review pass (gstack design-review) on Settings.

- **Speed, still to look at** (from testing beta 14, 9 Nov): archive and delete are now instant; flag and read marks got the same treatment in 0.7.0 (check it). Clicks just after opening the app can still lag while older mail and the search index load and photos arrive; consider loading those even more gently. Check again with real use.

## For the next 0.7 beta

- **Out of office per account** (see below). Needs each Google and Microsoft account to sign in once more, so not started until Todd says.
- **Appearance layout pass** (9 Nov): a lot of colour dots (theme, account colours, display, unread counts). Not a problem; tidy when there's time.
- **Before live 0.7.0:** help, What's new and support pages for everything since beta 5; one tidy 0.7.0 release note; decide whether to test a Microsoft draft or say drafting is tested on Gmail.

## Released as 0.7.0 (9 Nov 2026)

Everything below from beta 1 to beta 14, plus flag and read marks showing at once (like archive and delete) and fresh demo screenshots in the README. Beta 14 checks done: archive and delete fast, dark mode B, pop-outs follow light and dark.

## Done in 0.7 beta 14

Archive and delete take the email off the list (and close it) straight away, then update the counts and the rest. Pop-out windows follow light and dark (and every other setting) when the main window changes them. Dark mode, Todd's choice: darker inset boxes for everything you type in, the formatting bar as its own lighter band, the signature matching the message. "Reset to defaults". What's new, Help and the README written for 0.7.0.

Beta 13 checks done: scheduled editing, Reset to default and per-section resets, light mode.

## Done in 0.7 beta 13

Archive, read marks, stars, junk and moving to a folder no longer wait for Gmail before the screen moves on (the pause and the spinning refresh icon); the mail list is worked out once per change instead of twice. Dark mode: the parts you type in (fields, formatting bar, message) are a lighter, raised shade on a darker card, and the signature shares that shade; the full editor's writing area is raised a little too. Appearance: a small Reset beside each section, as well as Reset to default at the top.

Beta 12 checks done: fast start, old-mail search soon after opening, no flash on a tray start, editing a scheduled email (Keep scheduled, its menu, Save and close), signature blends in, Reset to default.

## Done in 0.7 beta 12

Faster start: the last month's mail shows first, the rest of the cache loads straight after, and the search index builds in small pieces in the background instead of before anything shows. Archive, delete and read marks answer sooner: the list updates first and the sidebar counts follow, and the taskbar number counts once after a burst of changes. The window starts hidden and only shows when you open the app, so starts in the tray (sign in, a scheduled send) no longer flash it. Editing a scheduled email keeps it scheduled: a "Scheduled for ..." line on top, Keep scheduled (top and bottom, and Ctrl+Enter), with Send now, Change time and Back to drafts in its menu; throwing away changes leaves it scheduled as it was. Signature in dark mode blends in (no dark box). Settings, Appearance: Reset to default (one Undo step; account colours unchanged).

Beta 11 checks done: signature menu, Gmail drafts with signatures, Send later picker, Back to drafts, closed-app scheduled send.

## Done in 0.7 beta 11

Signature choice in every editor, at the right end of the formatting bar as in Apple Mail (the From address's own, any other address's, or None); drafts brought in from Gmail get the signature as normal (the old "already ends with your name" guess is gone). AI Drafts cards: a basic formatting bar (bold, italic, underline, lists, link, clear) with the signature at its end and a preview of it under the message; replies are editable, with the earlier emails folded away and kept as they were; long lines wrap. The lag: the draft sync now builds one index instead of searching all mail for each draft (it ran every two minutes and on every return to the window), and names are remembered instead of rereading all mail. Send later picker: the warning takes the date line's place, typed times count straight away, about a minute ahead is fine, and the time wheel carries over midnight and the hour. "Back to drafts" instead of "Don't send".

Beta 10 checks done: the open card, Cc, autosave, Open in editor, tick target, Don't ask again, Scheduled screen and viewer, scheduled sends while open, Ctrl+Z on sliders, account names.

## Done in 0.7 beta 10

AI Drafts: an open card shrinks to one line on top and becomes a small editor (From drop-down, To chips with person cards, Cc/Bcc, Subject, the message in its own box) that saves by itself a moment after you stop typing or when it closes, with a "Saved" note; the list keeps its order while a card is open; the tick box's target is the whole left strip; Delete asks at once; names worked out once per mail change (the lag); labels on Gmail no longer hold up saving (Edit first opens sooner). Questions before something undoable say "You can still undo this." with "Don't ask again" (deleting drafts, groups, Smart Mailboxes). Ctrl+Z after a slider, switch or button undoes it, and still undoes typing in a text box. Account names save after a pause. Names on approval cards open the person card. Scheduled: a sidebar item with a count, a screen listing every scheduled email, and a pop-up to read one with Change time, Open in editor and Don't send (also from AI Drafts). New Send later picker (filled in with an hour from now, typed or picked date and time, calendar, a time that scrolls past a fixed highlight, Schedule button), used everywhere. Scheduled email when the app is closed: Windows starts Well Good Mail at the send time and wakes the PC from sleep (a scheduled task, removed once sent or cancelled), switchable in Settings, Writing ("Wait until Well Good Mail is open").

Beta 9 checks done: cards, tick and selection bar, Edit first, sign-off swap, Send later and Cancel, card waits while typing, paused request and Not now.

## Done in 0.7 beta 9

AI Drafts as separate cards (who and date / subject and actions / preview and group tag on the right); the selection bar takes the search bar's place so nothing moves; names instead of addresses; opening a draft in the editor folds its card away. Undo for everything: every settings change (quick changes to the same thing are one step; changes the app makes itself stay out), deleting AI drafts (saved again, here and in Gmail), moving drafts between groups, deleting a group, and account names, colours, alerts and Show in All Inboxes. Ctrl+Z in a text box undoes the typing. Still not undoable: removing an account (it asks first) and Keep mail from (it restarts the sync).

Beta 8 checks done: Test 7 came in from Gmail, Test 6 left AI Drafts after it was deleted in Gmail.

## Done in 0.7 beta 8

AI Drafts follows Gmail: any new draft made outside Well Good Mail comes in (No Group, "Made in Gmail", no AI Writer label), drafts sent or deleted elsewhere leave, drafts changed elsewhere show the new version, checked every two minutes, when the window comes forward and when AI Drafts opens. Two-line rows (group pill, who and subject, date; preview, then Send, Open in editor and Delete icons), date and time when open, Send with a Send later arrow (right-click the row's send icon too), sort menu, tick boxes with Change group, Send later and Delete, a "new" dot, keyboard (up, down, Enter, E, X, Delete) and a Scheduled list with Cancel. Fixes: writer names keep their capitals, a draft's account is found again (no grey bar), previews show apostrophes, the old "AI drafts/EA" label counts as the writer. Sent AI drafts keep their group and writer labels. file_drafts says which drafts it couldn't file. Sign-off setting and Draft groups (colour, order, rename, delete) in Settings, AI Connection. AI apps are told when the tools change, so no restart after an update. The resume question waits while you type. Forward button (Alt+Right, mouse forward). Reply in blue under the latest email. Sidebar sections can be dropped after the last one. Smart Mailboxes can be hidden. Account rows lined up on a grid.

- **AI draft groups on other devices** (noted 9 Nov 2026). Groups and the "written by AI" mark live on this PC only. Mirror them as Gmail labels (like "AI drafts/Clients"), which never travel with a sent email. A hidden header was ruled out: it would go out with the email when sent.
- **Reorder sidebar sections** (noted 9 Nov 2026): Favourites, Mailboxes, Accounts, Groups, AI drafts in any order. Drag a section heading (a grip shows on hover), plus right-click a heading for Move up, Move down and Reset order, so it also works without dragging. Order saved in settings.
- **Out of office per account** (noted 9 Nov 2026). Sets the account's own auto-reply so it works with the PC off: Gmail vacation responder (needs the gmail.settings.basic scope, so each Google account signs in once more), Microsoft automatic replies (MailboxSettings.ReadWrite, same), iCloud and IMAP have no way in, so a button opens their web settings. Dates, message, contacts only or everyone. One "all accounts" switch too, and a quiet banner while it's on.
- **Pick up AI drafts made through the Gmail connector** (noted 9 Nov 2026). Todd's Cowork EA falls back to Gmail when Well Good Mail is closed and labels drafts "AI drafts/<group>". Show those under AI drafts in the right group, and add the account's signature if the draft has none.
- **Smart Mailboxes** built (not yet in a beta): sidebar section, rule-row editor with live count, Save as Smart Mailbox from a search, Make a Smart Mailbox for a person. Later: B-style quick pills, drag to reorder, counts option (unread or all).
- **"AI Connection"** with a capital C, like the other Settings tabs (noted 9 Nov 2026).
- **"What it can do": one row to set them all** (Off, Ask, Allow), like All accounts. Allow only goes as far as each switch's ceiling, so sending still asks.
- **Closing the person card shouldn't also fold the email** (noted 9 Nov 2026). A click away that lands on the message header folds it. The click that closes the card should only close it.
- **Reply, Reply all and Forward under the latest message** in a conversation, as Gmail and Outlook do, as well as at the top.
- **Settings, Accounts rows are busy again** (9 Nov). Todd prefers today's columns over both mock-ups. Keep them, put the "Show in All Inboxes" tick box under the name (a tick box, not a switch), and make Keep mail from a proper, readable drop-down rather than the small grey one.
- **AI drafts: preview, quick edit and send in place** (9 Nov). Click a draft to fold it open and see the whole email. Quick text-only changes there, then Send. "Open in editor" (renamed from Open) for attachments or bigger changes.
- **Opening a draft is slow** (9 Nov): blank for a few seconds before it loads. Check whether it waits on the server or on the sync.
- **A Back button** (9 Nov). After jumping to another screen (the sparkle to Settings, a group, a search), one click takes you back to where you were. A back arrow in the top bar, plus Alt+Left and the mouse back button.
- **Capitals for names of places** (9 Nov): "AI Drafts" in the sidebar and on its screen, "All AI Drafts", "No Group", "AI Connection". Rule written in CLAUDE.md; sweep every screen for it.
- **A gentle colour for each AI Drafts group** (9 Nov): a small coloured dot on the group's pill, its chip and its sidebar tag, chosen from a soft palette and changeable from the group's menu. Nothing louder than the account colours.
- **Smart Mailboxes: drag to reorder in the sidebar, and hide or show** like other sidebar items (9 Nov). Todd doesn't use rules much; the standard editor is enough for now.
- **AI Drafts quick send** (9 Nov), defaults unless Todd says otherwise: Send from the folded-open card goes through the usual undo-send delay; quick edit is text only; it's on AI Drafts only, not the main Drafts folder; a sent draft leaves AI Drafts (it's in Sent).
- **Test Edit first** on the approval card (not tried yet in beta 5).
- **Always allow note when an update resets a switch** to Ask: say so once, rather than quietly.

## Before 1.0

- **Follow-up suggestions** (9 Nov 2026, idea): sent emails with no reply after a few days come back to the top of the Inbox with a slightly different look and a "Follow up?" label (Reply, Snooze, Dismiss), like Gmail's nudges. Off by default, days chosen in Settings. Builds on the follow-up reminders that already exist in the editor. Later, an AI app could draft the follow-up into AI Drafts.

- **Smart Mailboxes (saved searches)**, agreed earlier as a pre-1.0 item, not started. Apple Mail style: a saved set of rules (from, to, words, account, unread, flagged, has attachments, date, drafted by AI) shown in the sidebar. AI draft groups could become Smart Mailboxes.
- **Add to contacts** from the person card, once contacts can be written.
- **Settings, Updates is getting busy** (noted 8 Nov 2026). Split Updates from Startup and window.
- **AI connection, tidying.** Mark read, archive, snooze, reminders, bin, then invitations and send (always ask). See `docs/mcp-and-agents.md`.

## Done in 0.7 beta 7

Smart Mailboxes (sidebar section, rule-row editor with live count, save a search, one for a person, drag to reorder); sidebar sections reorder by dragging a heading or right-click Move up/down; capitals for place names; AI Connection set-all row; person card click-away no longer folds the email; Reply, Reply All and Forward under the latest email; account rows tidied (tick box under the name, proper Keep mail from drop-down); a Back button (top bar, Alt+Left, mouse back button); AI Drafts fold open with quick text edit, Save changes, Send (undo delay) and Open in editor; gentle group colours; Gmail labels on AI drafts ("AI Drafts", "AI Drafts/<group>", "AI Writer/<writer>"), re-applied when a draft is saved again; labelled Gmail drafts from elsewhere (the EA, other computers) brought into AI Drafts every 5 minutes, keeping their conversation and skipping a second signature; a writer name on create_draft and a new file_drafts tool; drafting rules sent to every AI app when it connects; pop-out windows load only their own conversation, so replies and drafts open faster.

Still to do from the list: hiding a Smart Mailbox; out of office (needs another Google and Microsoft sign-in); label the 17 EA drafts since 1 September (with file_drafts once beta 7 is in).

## Done in 0.7 beta 6

AI draft groups in the sidebar and on the AI drafts screen (search, chips, move, new, rename, delete), the sparkle status line (click for settings, right-click to pause), question cards that wait while you type and ignore stray clicks, the Always allow note, the draft tool always listed with a clear refusal for Read only accounts, no AI sign-offs, sidebar folder names for the AI, the person card and right-click menu, Cc and Bcc toggles, Keep mail from per account, range changes that restart the sync (it used to be ignored while a sync ran), big syncs easing off while you use the app, and the dash on partly-on calendar switches.

## Later

- **Installer:** decided 8 Nov 2026 to keep Tauri's standard installer, so it never needs keeping in step with Tauri updates. No custom template.

- AI connection: consider renaming the "Read and write" level to "Full access" when writing actions arrive.
- Hover preview: a "Loading..." line for slower files.
- Microsoft and iCloud guest lists tried against real accounts.
- Microsoft answers to invitations through the calendar (Graph), not only by email.
- A Support and ideas card in Settings.
- Faster New email.

## Done in 0.7 beta 1

- Calendars pop-up: shown calendars on top, hidden ones folded away (only re-sorted when reopened), long names end with dots, the button just says Calendars.
- Calendars in Settings, Accounts as folding cards, with "2 of 6 shown" and a half-lit switch when only some are on.
- AI connection, read only: local bridge, per-account levels, the switches, activity log.
