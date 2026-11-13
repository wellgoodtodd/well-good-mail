# 0.7.3 beta 5: what to test

Beta 5 is beta 4 plus the fixes from your beta 4 calendar and Out of Office feedback, and place suggestions in Location. The first section is what's new; after that comes everything from the beta 4 list not ticked yet. Everything here was checked in the browser demo only, not on your real Google and Outlook accounts, so the real accounts are the real test. If something goes badly wrong, beta 4 is on the GitHub releases page to go back to.

## New in beta 5

### Changes show at once

- [ ] **Drag an event** in Day or Week view: it stays where you dropped it straight away (no second's wait), and Google Calendar on your phone has it a moment later.
- [ ] **Move several to another calendar** (pick a few, then Move to calendar): they all change colour at once, not one per second.
- [ ] **Delete a series "This and all future events"**: the old events go from the screen at once, with no 3 to 4 seconds of the old form showing.
- [ ] **If Google refuses** (hard to cause on purpose; one way is turning Wi-Fi off, then dragging): the event goes back where it was and a note says it couldn't be saved and why.
- [ ] **After answering an invitation or changing an event with guests**, the answers and changes appear by themselves within about 15 seconds, without pressing Refresh.

### Calendar header and menus

- [ ] **Header:** arrows either side of the month or week, Today beside them, and on the right the zoom then Day / Week / Month at their old size.
- [ ] **The zoom** is a thin line with a dot, with − and + either side. Dragging the dot, − and +, and Ctrl + mouse wheel all still zoom.
- [ ] **Move to calendar in the right-click menu** (with several picked): the flyout has each account's name as a heading and a colour dot by each calendar.

### Repeating events and the questions

- [ ] **Delete one of a series:** the buttons read, left to right, Only this event, This and all future events, The whole series. The text reads "Delete just this one, this one and every one after it, or the whole series?"
- [ ] The question box sits neatly over the event pop-up, with all its buttons inside it (also the "Cancel the meeting and tell guests" question).
- [ ] **The weekly event that wouldn't drag:** try it again. My best guess at the cause: it was on more than one of your calendars and the app showed a guest's copy, which can't be moved. It now shows the copy you can change. If it still won't move, hover it and tell me what the tooltip says.

### Picking and dragging

- [ ] **Click empty space** in Day or Week view: picked events are let go (in Week view it also picks that day).
- [ ] **Drag an all-day event** to another day along the all-day row at the top of Day and Week view. The day under it gets a dashed outline, and Undo puts it back.

### Invitations

- [ ] **Add a note** is now blue and underlined, with more room under it.
- [ ] **Open an unanswered invitation** from the calendar or Coming up: Accept, Maybe and Decline (with Add a note) are on its pop-up.
- [ ] **Replied:** "Change your answer with a note" opens a note box; pick an answer to send it. Picking the same answer again sends just the note.
- [ ] **Cancel the meeting and tell guests:** make a test meeting from one account, invite another of your accounts, then delete it from the calendar and choose Cancel the meeting and tell guests. The guest should get Google's cancellation email, and the meeting should go from all your calendars at once. What I found: the meeting showed once for all four of your calendars, and the app deleted whichever copy it happened to show. Deleting a guest's copy only takes it off that calendar and tells nobody, which explains the missing emails and having to delete it four times. It now deletes the organiser's own copy with "tell guests" switched on.

### Outlook (WGM Microsoft)

- [ ] **During refreshes**, a Microsoft 502 "UnknownError" no longer shows: the app tries once more quietly. If Outlook is really down, the note reads in plain words ("Outlook didn't answer for WGM Microsoft. Try again in a moment.") with Try again.
- [ ] **Out of Office for WGM Microsoft:** it can be checked and switched on. If it still can't, the account shows a plain note with Try again (and Sign in if it's a permission problem), not the raw error. What I found: it wasn't a missing permission (that already shows "Needs one more sign in"), so it was the same Outlook 502 as the calendar.

### Out of Office page

- [ ] **While I'm away** reads "Choose what happens while you're away" with the "N of 5 on" count, and opens to the switches.
- [ ] **The Template picker** is inside the MESSAGE card, next to the message.
- [ ] **Different message for each account:** pick a template on one tab, switch tabs: the picker shows that tab's own template (or none), and switching back shows the first one again.

### New event and full edit form

- [ ] **Place suggestions:** click into Location. A few places you've used recently show; typing narrows them. Arrow keys and Enter pick one, Escape closes the list but not the form.
- [ ] **Contacts' addresses:** type part of a contact's name or address; contacts with an address in Google Contacts or Outlook show with their name in grey. (Addresses are fetched on the next contacts refresh, so give it a few minutes after updating.)
- [ ] **+ Add alert** now has words, next to the first alert.

## Carried forward from beta 4 (not ticked yet)

### Under the hood (beta 4)

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

### Calendar

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

### Invitations

- [ ] A **clash** with something already in your calendar is noted.
- [ ] A **cancelled** meeting shows crossed out with Remove from my calendar.
- [ ] An unanswered meeting in **Coming up** says Not answered and opens the pop-up.
- [ ] The card on an invitation email says Accept / Maybe / Decline too.

### Out of Office page

- [ ] Pick a template, then change something: **Changed** appears with Update template and Save as new. Pressing Schedule asks once, with "Leave the template as it was".
- [ ] The Templates drop-down shows names only. Manage templates says Duplicate, Save current settings to it, Choose parts….
- [ ] Set up a Friday afternoon away (Friday 13:00 to Monday 09:00), then Templates › **Save as new template**. Tick whole groups, then single parts inside them.
- [ ] Change the page, then pick your template: only the ticked parts change, the dates move to the next Friday, and Undo puts everything back.
- [ ] Duplicate Friday afternoons and rename the copy to Wednesday away. Delete a template, then Undo.
- [ ] **AI apps:** ask Claude to "turn on my Holiday Out of Office template from 21 Dec to 4 Jan". The approval card shows the whole reply and the dates.
- [ ] Just after opening the app, go straight to Out of Office and turn it off. The message you'd written is still there afterwards.

### Smaller fixes

- [ ] Delete an event you've already deleted on your phone: no "Resource has been deleted" error, it just goes.
- [ ] Add an event, press Undo, then Ctrl+Z: whatever shows on screen is really in Google, and can be deleted.
- [ ] **"Today"** in a title (e.g. "Call Mum today at 6pm"), and deleting the date words puts the day and time back to how they started.
- [ ] **Mark as unread** on a conversation: only one email turns unread (the one you're reading, or the latest), and the count goes up by one.

### From beta 2

- [ ] **Outlook:** one event in the Outlook calendar. Outlook keeps only one alert, and Teams links work on work accounts only.
- [ ] **Calendar list:** calendars you've hidden aren't offered, and the last calendar you used comes first next time.
- [ ] **Calendar Groups:** rename a group and delete one.
- [ ] The **sidebar count** for Calendar & Reminders follows the group.
- [ ] **Only alert me from the group I'm looking at:** switch it on, pick Personal, and alerts from work calendars stay quiet.
- [ ] New event while Work is picked goes into a Work calendar.
- [ ] **AI apps:** switch on "Set up Calendar Groups" in AI Connection, then ask Claude to make a Personal group. It asks first.
- [ ] Moving an event to another account still works.

### From beta 1: the clean-up

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

## Found in beta 5

(Your feedback goes here.)

## If something goes wrong

Note what you did and roughly when, then send me Settings › Diagnostics. You can roll back to beta 4 from the GitHub releases page.
