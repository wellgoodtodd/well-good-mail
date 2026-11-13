# 0.7.3 beta 6: what to test

Beta 6 is beta 5 plus your beta 5 feedback and Tasks. The first section is what's new; after that comes everything not ticked yet. Everything here was checked in the browser demo only, not on your real Google and Outlook accounts, so the real accounts are the real test. If something goes badly wrong, beta 5 is on the GitHub releases page to go back to.

## Before you start: Tasks needs two things

1. **Turn on the Google Tasks API** in your Google Cloud project (the same project as the Calendar API): console.cloud.google.com › APIs & Services › Library › Google Tasks API › Enable. Until then the Tasks view says so for each Google account.
2. **Sign in once more** to each Google account (Settings › Accounts, or the Sign in button the Tasks view shows). Google will ask to let Well Good Mail see and change your tasks. Microsoft accounts do the same when Outlook is working again.

## New in beta 6: Tasks

- [ ] **Tasks view:** Calendar & Reminders › Tasks. Today, Scheduled and All Tasks at the top, then each account's lists under its name, with the same tasks as the Google Tasks app on your phone.
- [ ] **Calendar Groups:** pick Work or Personal (the Calendars button): only that group's accounts' lists and tasks show, in the Tasks view, the calendar and Coming up.
- [ ] **Default list:** the ★ list is where new tasks go for the group you're looking at. Change it in Settings › Calendar & Reminders › Tasks, one row per group.
- [ ] **Quick add:** type "Ring the dentist Friday 3pm" in the box at the top: "Friday 3pm" is highlighted and a chip says Fri 20 Nov, 15:00. Enter adds a task called "Ring the dentist". × on the chip keeps the words as typed. #studio (or any list name) picks that list.
- [ ] **Tick off:** click the circle. The task stays, crossed out with the time you did it, for the rest of the day. Tomorrow it's under **Completed before today** in its list. Undo in the note brings it back.
- [ ] **Both ways:** tick one off on your phone; it shows done here within a few minutes (or straight away with the refresh button). Tick one off here; it shows done on your phone.
- [ ] **Overdue** tasks are red, at the top of Today.
- [ ] **Change a task:** click it. Change the title, day, time, list (also to another account) or notes, then Save. Delete is in the same pop-up, with Undo.
- [ ] **A time on a Google task:** Google Tasks keeps the day only, so the time is written as "Due 14:00" at the top of the notes on your phone. In the app it shows at 14:00.
- [ ] **Alerts:** a task with a time gives a notification at that time (unless reminders are set to never, or it's quiet hours).
- [ ] **New list:** + New list at the bottom of the lists.

### Make a task from an email

- [ ] **Right-click an email › Make a task**, or select it and press **T**. The pop-up has the subject (without Re: and Fwd:), "From: <subject>" with Open email, and a due date if the email's opening words say one ("by Friday").
- [ ] **The list** is the default list of the group the email's account is in (a work email lands in Work's list).
- [ ] **Highlight a few words** in an email, right-click › **Make a task from this**: the title is just those words.
- [ ] **Open the email from the task:** the ✉ subject under a task, or Open email in its pop-up, opens the email, also after you've archived it.
- [ ] Ticking off a task made from an email leaves the email alone.

### Tasks in the calendar and Coming up

- [ ] **Day and Week view:** a "tasks" row under the all-day events with that day's tasks (overdue ones on today), and tasks with a time as a slim outlined marker at their time. Click the circle to tick one off, or the name to open it.
- [ ] **Month view:** each day with tasks says "✓ 2 tasks", and a Tasks panel on the right lists the tasks for the weeks on screen. Clicking a day moves the panel to it.
- [ ] **Coming up:** Today first (today's events, then Tasks today with the circles and Open Tasks), then Later for the rest of the week.

### AI apps

- [ ] **Settings › AI Connection:** a new "Add tasks" switch (asks first by default).
- [ ] **Settings › Calendar & Reminders › Tasks › Tasks from AI apps go into:** a group's default, one list, or Ask each time.
- [ ] Ask Claude to "add a task to ring the dentist on Friday at 3pm". The approval card says the task, the list and the day. Ask it to "list my tasks" too.

## New in beta 6: from your beta 5 feedback

- [ ] **A slow account doesn't hold up the rest:** with Outlook having a bad day, Refresh shows your Google calendars as soon as they answer. An account that keeps failing is tried less often by itself (after 2, 4, 8, then 15 minutes), and its last events stay on screen. The Refresh button always tries every account.
- [ ] **Deleting a series:** after you answer the questions, the edit window closes straight away and a thin moving line shows under the calendar's header until Google is done. If Google refuses, the events come back with a note.
- [ ] **Invitee names:** typing in Invitees keeps up with you.
- [ ] **Invitations show in the calendar by themselves:** a few seconds after an invitation email arrives, the calendar refreshes (Google invitations; Outlook ones may still need the refresh button).
- [ ] **Join** in Coming up shows only for today's calls (the event pop-up and the meeting banner keep theirs).
- [ ] **Out of Office:** the account tabs are on the left of one row with the Template picker on the far right, then Subject. With "Different message for each account" off, the Template picker sits alone on the right above Subject.
- [ ] **Location:** clicking into an empty Location shows nothing until you type; then places you've used and contacts' addresses show.
- [ ] **Location from the title:** "Lunch with Sam at Five Guys tomorrow 1pm" fills Location with "Five Guys" (in the short form a "Location: Five Guys" line shows). Typing your own location stops it. "Call at 3pm" doesn't count as a place.

## Carried forward (not ticked yet)

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

## Found in beta 6

- Before you start: done. The Google Tasks API was already on, and every Google account asked to sign in again (the fifth when All Calendars was picked) and kept its group. The Microsoft sign-in worked too, just slowly.
- **Coming up is hard to scan:** "Later" is a smaller heading than "Tasks today", "Open Tasks ›" is big and bold, and the sections run into each other. Needs more space before Later, a smaller Open Tasks link, and clearer separation between Today, Tasks today and Later.
- Tasks view, group filter, quick add, tick off and Undo, changing a task (on the phone almost at once), New list and default lists in Settings: all working. Phone changes come through after Refresh.
- **Tasks sidebar too busy:** "My Tasks" over and over. Wanted: All Tasks, Today, Scheduled at the top in an order you can drag (All Tasks first), then one row per account with its colour dot that folds open to its lists, like the mail sidebar.
- **No way to rename a list or set the default from the list:** right-click for Rename (back to Google), Set as default, Change defaults…; slow click to rename.
- **List picker:** every list says "My Tasks", so show the account's dot and name.
- **Phone changes need Refresh:** check more often while tasks are on screen and when the window comes back.
- **New task starts blank:** start on today with a time, and "No date" is unclear (maybe "Clear date").
- Future idea: a separate Well Good tasks and calendar app (in the backlog).
- Make a task from an email, highlighted words, Open email from a task, Day and Week tasks rows and editing from them: working.
- **List drop-down in Make a task:** a colour dot for each account.
- **A Tasks button** in the bottom-left sidebar, opening the Tasks view.
- **Emails should show their tasks:** a tag on the email that opens them (in the app only).
- **Calendar's right side is busy:** Month's Tasks panel squeezes the calendar and competes with Coming up and the day card. Rethink as one column, or a panel that folds out and back in.
- **AI Connection:** couldn't find "Tasks from AI apps go into" (it's in Calendar & Reminders › Tasks). The page should list everything like the account AI page, set for all accounts or each one. Icons for connected AI apps.
- An AI app adding a task: not tested yet (the Claude session wasn't offered the tool).
- Deleting a series with the progress line, and the invitation showing after Fetch new mail: working.
- **"How you get alerted" box:** surplus now; a bell button in the calendar header instead.
- **Out of Office:** a little more space above the account tabs row.
- **Join:** the day card should show Join for that day's calls too.
- **Delete from which calendar:** an event on several of your calendars was deleted from the wrong one.
- **Quick edit card:** make every field editable there; changing the calendar opened the full edit window instead of just moving it.

## If something goes wrong

Note what you did and roughly when, then send me Settings › Diagnostics. You can roll back to beta 5 from the GitHub releases page.
