# 0.7.3 beta 7: what to test

Beta 7 is beta 6 plus your beta 6 feedback and the compose window polish, as agreed in the mock-ups (docs/mockups/beta7-tasks-and-calendar.html, beta7-round-two.html and beta7-compose.html). The first section is what's new; after that comes everything not ticked yet. Everything here was checked in the browser demo only, not on your real accounts. If something goes badly wrong, beta 6 is on the GitHub releases page to go back to.

## New in beta 7: Calendar & Reminders

- [ ] **Right-hand column in blocks:** Today (events, then tasks, with overdue ones first), then Later (the next 7 days, events then tasks), with All events › (List view) and All Tasks › underneath. Same blocks in Coming up in the mail window.
- [ ] **A picked day:** click a day in Month view: its block goes on top with its events, Join for its calls and its tasks, + New event and Open day. Click the same day again, the ✕, Esc or Today to put it away.
- [ ] **Month view has no Tasks panel** any more: the calendar keeps its full width, and days still say "✓ 2 tasks".
- [ ] **Alerts button** beside List / Calendar / Tasks (no dot): a summary of how alerts reach you, Pause for 1 hour (then Resume), and Change alerts, which opens Settings › Alerts & Notifications at the calendar part. The "How you get alerted" box under the calendar has gone.
- [ ] **Pause for 1 hour** really quietens alerts (new mail, events, tasks) for the hour.
- [ ] **Quick edit card:** type a location straight in, then Save. With no call, **Add Google Meet** (Teams on Microsoft) sits where Join would be; with a call, Join and "Google Meet settings ↗".
- [ ] **Move from the quick edit card:** pick a calendar in another account. With guests, a call or a repeat it says what happens first (new invitation, new link, series copied), then moves. No full edit window.
- [ ] **Delete an event that's on several of your calendars:** tick boxes, one line per calendar ("WGM (organiser)", "TBWELLER (guest)"), the one you clicked ticked, Select all. The button says "Delete from WGM", "Delete from WGM and TBWELLER" or "Delete everywhere".
- [ ] With the organiser's calendar ticked: one more question, "Cancel ... for everyone?", with Go back, Delete without telling them, and Cancel the meeting and tell guests. Check in Google Calendar on your phone that the right copies went.

## New in beta 7: Tasks

- [ ] **Tasks sidebar:** All Tasks, Today, Scheduled at the top; drag them into the order you like (All Tasks first to start with).
- [ ] **One row per account** with its colour dot and count ("1 late" in red). Click it for all that account's tasks; the arrow folds its lists open and remembers. Only the accounts in the group you're looking at show.
- [ ] **Drag an account row** to reorder: the order changes everywhere (mail sidebar, Settings › Accounts and so on).
- [ ] **Right-click a list:** Rename (check it's renamed on your phone), Set as default for Work, Change defaults…, Hide completed, Delete list… (with a confirm). A slow second click on a list's name renames it; clicking the ☆ makes it the default.
- [ ] **Right-click an account:** New list in that account, Show lists / Hide lists, Account settings….
- [ ] **List picker** (quick add, Make a task, the task pop-up): lists under each account's colour dot and name; the choice reads "My Tasks · WGM".
- [ ] In All Tasks, Today and Scheduled, each task shows its account's dot and name.
- [ ] **Phone changes come through by themselves:** tick one off on your phone; within about a minute it's done here while tasks are on screen (the Tasks view, the calendar or Coming up), and straight away when you come back to the window.
- [ ] **New task** starts on today at the next hour. Type a date in When ("18 Nov", "Wednesday", "next Friday"). "Clear date and time", and "Clear time" when there's a time.
- [ ] **Tasks in the bottom-left list** under Calendar, with today's count (and overdue). Counts there all line up on the right; Invitations has a small "New" to the left of its number.
- [ ] **An email with tasks** shows "✓ 2 tasks" (or "All done") by its date: click it to tick them off, + Make another, or Open in Tasks. A small ✓ by the date in the email list.

## New in beta 7: Settings

- [ ] **Alerts & Notifications** (was Notifications): New mail, How alerts appear, Calendar and tasks (event pop-ups, summary, video calls, alerts from hidden calendars), Per account, Quiet hours. Calendar & Reminders has a line pointing there. While paused, Quiet hours says "Alerts paused until 15:00 · Resume".
- [ ] **AI Connection, What it can do:** each switch has a fold arrow; open it to set each account's own Off / Ask / Allow (Same as all, or Reset). When some differ, an amber "▲ 2 accounts set differently" sits under the buttons and those accounts are tinted. The account's own AI page shows the same.
- [ ] **Add tasks** row says "Into: ..." and you can change where AI tasks go right there.
- [ ] **Connected AI apps** show their logos (Claude Desktop, Claude Code) by the green dot; Test and ⋯ still work.
- [ ] **One account order:** after dragging accounts in Settings › Accounts, Out of Office tabs, AI Connection, Alerts' Per account and Tasks follow it.
- [ ] **Out of Office:** a little more room above and below the account tabs and Template row.

## New in beta 7: writing

- [ ] **Font and size** boxes with small up and down arrows (the arrows step to the next font or size).
- [ ] **Bold, italic, underline, lists and quote** show a soft blue box when on; thin dividers group the toolbar.
- [ ] **Attach and Emoji** beside Send at the top (Attach is gone from the toolbar and bottom row). Dragging files on still works.
- [ ] **Emoji** opens the Windows emoji panel and the emoji goes in at the cursor. (New, never tried in the desktop app: if it only says "Press Win + . for emoji", tell me.)
- [ ] **Attachments as cards**, two to a row, with picture thumbnails or a coloured file-type tile, and a total above. × on hover. Forwarded attachments show too.
- [ ] **Send later beside every Send:** the top Send and bottom Send in the writing window, the pop-out window, and AI Drafts (the open draft and each row's send icon).

## Carried forward (not ticked yet)

### From beta 6 (not ticked yet)

- [ ] **A time on a Google task** shows as "Due 14:00" at the top of its notes on your phone, and at 14:00 in the app.
- [ ] **Alerts for tasks:** a task with a time gives a notification at that time.
- [ ] **Make a task from an email** with "by Friday" in its opening words gets that due date.
- [ ] **AI apps:** "Add tasks" switch, then from a new Claude chat ask to "add a task to ring the dentist on Friday at 3pm" (the approval card says the task, list and day) and to "list my tasks".
- [ ] **A slow account doesn't hold up the rest** (once Outlook is back): Google calendars show as soon as they answer.
- [ ] **Location:** clicking an empty Location shows nothing until you type; then places you've used and contacts' addresses.
- [ ] **Location from the title:** "Lunch with Sam at Five Guys tomorrow 1pm" fills Location with "Five Guys".

### From beta 5 (not ticked yet)

- [ ] **Microsoft retry:** once Outlook is working again, a refresh with a passing Outlook hiccup shows no error.
- [ ] **Out of Office for WGM Microsoft** can be checked and switched on once Outlook is working again.
- [ ] **Contacts' addresses** show in Location suggestions with the contact's name in grey.
- [ ] **Different message for each account:** pick a template on one tab, switch tabs: the picker shows that tab's own template.

### From beta 4 and earlier (not ticked yet)

#### Under the hood (beta 4)

- [ ] **Opening emails:** old and new emails open with their full text, in every account. An email not opened lately may take a blink longer.
- [ ] **After a restart:** close the app fully, open it again, and open a few emails. Their text is all there.
- [ ] **Reply and Forward** include the quoted email, also after a restart, also in a pop-out window, and when switching between Reply and Forward.
- [ ] **Print** an email: the full text prints.
- [ ] **Writing (new editor version):** bold, italic, underline, lists, links (Ctrl+K), font and size, Undo and Redo, spelling suggestions on right-click, Paste without formatting, Paste as quote, pasting a picture, changing the signature. Drafts reopen with the same text.
- [ ] **Out of Office and AI Drafts** editors work the same.
- [ ] **Search:** words from inside emails, `from:`, `after:` and `before:`. A word only found very far down a long email (after about the first 4,000 characters) is no longer found.
- [ ] **Smart Mailboxes** with "Any text" match whole words or the start of words in the email's text ("pay" finds "payment" but not "repayment").
- [ ] **iCloud calendars** keep updating, and a calendar added on your phone appears.
- [ ] **Memory:** after a day of use, Task Manager shows Well Good Mail using less memory than beta 2 did.
- [ ] **Everything else as normal:** sidebar counts, archive and Undo, sending, Send later, Calendar.

#### Calendar

- [ ] **Remove a video call** from an event, then check Google Calendar.
- [ ] **Right-click an event:** the same quick edit card. Right-clicking empty space still gives New event, New all-day event, Open day, Go to today.
- [ ] An event starting at 10:05 keeps its 5 minutes past as you drag it (10:20, 10:35).
- [ ] **Month view:** drag a chip to another day. It lifts while held, the day under it is outlined, and only the day changes.
- [ ] Events someone else organised show no handle and can't be dragged.
- [ ] Check every change above in Google Calendar on your phone.
- [ ] Move one with guests to another account: the warning about new invitations comes first.
- [ ] **List view:** tick several rows, then Move to calendar and Delete.
- [ ] **Changes made on your phone** show in the app within about a minute while Calendar & Reminders is open, and soon after you come back to the window.
- [ ] An **open event** updates by itself when a guest's answer changes.
- [ ] Delete an event with guests: it offers to cancel the meeting and tell them.

#### Invitations

- [ ] A **clash** with something already in your calendar is noted.
- [ ] A **cancelled** meeting shows crossed out with Remove from my calendar.
- [ ] An unanswered meeting in **Coming up** says Not answered and opens the pop-up.
- [ ] The card on an invitation email says Accept / Maybe / Decline too.

#### Out of Office page

- [ ] Pick a template, then change something: **Changed** appears with Update template and Save as new. Pressing Schedule asks once, with "Leave the template as it was".
- [ ] The Templates drop-down shows names only. Manage templates says Duplicate, Save current settings to it, Choose parts….
- [ ] Set up a Friday afternoon away (Friday 13:00 to Monday 09:00), then Templates › **Save as new template**. Tick whole groups, then single parts inside them.
- [ ] Change the page, then pick your template: only the ticked parts change, the dates move to the next Friday, and Undo puts everything back.
- [ ] Duplicate Friday afternoons and rename the copy to Wednesday away. Delete a template, then Undo.
- [ ] **AI apps:** ask Claude to "turn on my Holiday Out of Office template from 21 Dec to 4 Jan". The approval card shows the whole reply and the dates.
- [ ] Just after opening the app, go straight to Out of Office and turn it off. The message you'd written is still there afterwards.

#### Smaller fixes

- [ ] Delete an event you've already deleted on your phone: no "Resource has been deleted" error, it just goes.
- [ ] Add an event, press Undo, then Ctrl+Z: whatever shows on screen is really in Google, and can be deleted.
- [ ] **"Today"** in a title (e.g. "Call Mum today at 6pm"), and deleting the date words puts the day and time back to how they started.
- [ ] **Mark as unread** on a conversation: only one email turns unread (the one you're reading, or the latest), and the count goes up by one.

#### From beta 2

- [ ] **Outlook:** one event in the Outlook calendar. Outlook keeps only one alert, and Teams links work on work accounts only.
- [ ] **Calendar list:** calendars you've hidden aren't offered, and the last calendar you used comes first next time.
- [ ] **Calendar Groups:** rename a group and delete one.
- [ ] The **sidebar count** for Calendar & Reminders follows the group.
- [ ] **Only alert me from the group I'm looking at:** switch it on, pick Personal, and alerts from work calendars stay quiet.
- [ ] New event while Work is picked goes into a Work calendar.
- [ ] **AI apps:** switch on "Set up Calendar Groups" in AI Connection, then ask Claude to make a Personal group. It asks first.
- [ ] Moving an event to another account still works.

#### From beta 1: the clean-up

- [ ] **Send a normal email.** It arrives once, and shows once in Sent.
- [ ] **Send with a follow-up reminder.** It arrives once, and the follow-up shows up when it's due.
- [ ] **Send later.** Schedule one a few minutes ahead and leave the app open. It goes once, at the right time.
- [ ] **Undo send.** Press Undo straight away. Nothing goes out, and the draft comes back.
- [ ] **Archive, then sync.** Archive a few emails and press Refresh straight away. They stay archived and don't pop back.
- [ ] **Read and flag, then sync.** Same again with mark as read and flag. They stay as you left them.
- [ ] **Outlook draft.** Write a draft, leave it a minute, edit it, and close it. Only one copy is in Drafts, with the latest text.
- [ ] **Leave it running for a day.** No account asks you to sign in again, unless you really changed a password.
- [ ] **Wi-Fi off and on** for a minute while the app is open. Every account catches up on its own within a few minutes, with no restart.
- [ ] **iCloud or other IMAP accounts** keep syncing after the laptop wakes from sleep.
- [ ] **Open a Word or Excel attachment.** It opens in Protected View with the yellow bar. That's expected.
- [ ] **Save an attachment** and open it from the folder. Windows treats it as downloaded.
- [ ] **A newsletter with pictures held back.** No pictures load until you click Load images, and then they all load.
- [ ] **An email from someone you've allowed pictures for** still shows them straight away.
- [ ] **Removing an account** (a test one) doesn't freeze the window.
- [ ] `after:` and `before:` in search pick up mail from that whole local day, including late evening.
- [ ] **Every Settings tab** opens and saves.
- [ ] **Light and dark mode** both look right. The coral, amber and green accents are unchanged.
- [ ] Open any pop-up (a dialog, an event, What's New): focus goes into it, and Tab stays inside it. Escape takes focus back to where you were.
- [ ] **AI Connection:** approving goes through, refusing does nothing, a request left for about 3 minutes disappears and the AI app is told no, and a new AI app still shows the pause prompt.

## Found in beta 7

Todd, 13 Nov 2026. Working: Emoji in the writing window; right-hand column blocks, picked day and ✕; Alerts button, Pause and Change alerts; Tasks sidebar and dragging account rows; New task on today; AI Connection per-account switches and the amber flag; Out of Office; Alerts & Notifications; the email tasks tag, + Make another and Open in Tasks; reply and template look clean; Send later beside Send in replies and AI Drafts.

- **Delete from several calendars didn't show:** an invitation from WGM, accepted on TBWELLER. The quick edit card said "On 2 of your calendars", but Delete event only gave the old "tell your guest" question, also after a refresh. Likely cause: the delete looked for the other copy only in the near-term events and matched titles more strictly than the "On 2" line. Fixed for beta 8 (and a note goes to Diagnostics if it still can't find the other copy).
- **Location icon** was a folder: now a map pin.
- **Add Google Meet** as a button on every event feels heavy. Agreed: a quiet line under Location ("+ Add Google Meet", or "Google Meet · Join · Settings ↗"), with the big Join button only on the day. Done for beta 8.
- **Make a task from an email** should start on today at the next hour, like New task. Done for beta 8.
- **Alerts & Notifications** could be tidier later: video call alerts and alerts from hidden calendars on their own cards.
- Clicking a picked day too quickly adds an event (fine, double-click).

## If something goes wrong

Note what you did and roughly when, then send me Settings › Diagnostics. You can roll back to beta 6 from the GitHub releases page.
