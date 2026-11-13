# 0.7.3 beta 2: what to test

> Kept as a record. Everything not ticked here has moved into [testing-0.7.3-beta6.md](testing-0.7.3-beta6.md).

One list for everything in 0.7.3 so far: beta 1's clean-up and beta 2's new calendar features. Ticked items are ones you've already said work (12 Nov). Anything that feels slower, looks off or behaves differently from 0.7.2 counts as a problem.

## Known, not fixed yet

- **Edit on an existing event** opens the old small editor, not the full form with repeat, alerts and invitees. Noted for the next round, with dragging, quick edit and bulk calendar changes (mock-ups first).
- **Repeating events:** Delete only removes the one you clicked. Leave a test series in the calendar to try "this and all future events" in beta 3.
- **Deleting an event already deleted in Google** shows "Resource has been deleted" until you press Refresh.

## Creating events

- [x] **+ New event** (the blue button): type a title and press Enter. Add stays greyed out until there's a title.
- [x] The new event shows in Google Calendar on your phone. (The iPhone Calendar app can take a while: it fetches Google calendars on a timer.)
- [x] **Words in the title:** type "Lunch with Sam tomorrow at 1pm". The time moves to tomorrow at 13:00, and the event is saved as "Lunch with Sam". ("today" isn't read yet, and deleting the words doesn't put the old time back.)
- [x] **Double-click** a time in Day or Week view.
- [x] **Double-click** a day in Month view: it starts as an all-day event.
- [x] **Right-click** an empty part of the calendar: New event, New all-day event, Open day, Go to today.
- [x] **Ctrl+Alt+N** from anywhere opens New event. Ctrl+N is still New email.
- [x] **New event on [day]** in the picked-day panel, and closing the panel goes back to today.
- [x] **More options** grows the same card.
- [ ] Make a **new** event with each of these (Edit can't set them yet), then check it in Google Calendar:
  - [x] Repeat every week, and Custom (every 2 weeks on Monday and Thursday)
  - [x] End repeat on a date, and after 5 times
  - [x] Alert 15 minutes before, plus a second alert (not yet on an all-day event)
  - [x] Location and notes
  - [x] Add Google Meet: the call is added
  - [x] The Meet link opens a real call (from the event's Join button)
- [x] **Invitees:** invite yourself on another address. The invitation email arrives from Google, and the button reads "Add and send invitations".
- [x] **Undo** in the "added" message takes the event out again (events with invitees have no Undo, because the invitations have already gone).
- [ ] **Outlook:** one event in the Outlook calendar. Outlook keeps only one alert, and Teams links work on work accounts only.
- [ ] **Calendar list:** calendars you've hidden aren't offered, and the last calendar you used comes first next time.

## Calendar Groups

- [x] Calendars › **Make a Calendar Group** with calendars from different accounts.
- [x] Pick it: the calendar, List view and Coming up show only that group. **All calendars** shows everything again.
- [x] **Choose calendars…** goes back to All calendars and shows the usual switches.
- [x] **Edit groups…**: edit a group's ticks and make a new one.
- [ ] **Edit groups…**: rename a group and delete one.
- [ ] The **sidebar count** for Calendar & Reminders follows the group.
- [ ] Settings › Calendar & Reminders › **Calendar Groups** shows the same list. **Only alert me from the group I'm looking at** is off; switch it on, pick Personal, and alerts from work calendars stay quiet.
- [ ] New event while Work is picked goes into a Work calendar.
- [ ] **AI apps:** switch on "Set up Calendar Groups" in AI Connection, then ask Claude to make a Personal group. It asks first.

## Out of Office templates (partly tried; finish after the beta 3 page changes)

- [ ] Set up a Friday afternoon away (Friday 13:00 to Monday 09:00), then Templates › **Save as new template**. Tick whole groups, then single parts inside them.
- [ ] Change the page, then pick your template: only the ticked parts change, the dates move to the next Friday, and Undo puts everything back.
- [ ] **Manage templates:**
  - [ ] Copy Friday afternoons and rename the copy to Wednesday away.
  - [ ] Update a template from what's on the page.
  - [ ] Change what it includes.
  - [ ] Delete a template, then Undo.
- [ ] With an account on **Own message**, a template's message goes into that account's message.
- [ ] **AI apps:** ask Claude to "turn on my Holiday Out of Office template from 21 Dec to 4 Jan". The approval card shows the whole reply and the dates.

## Other calendar checks

- [x] Refresh is now an icon, and the header fits on one line.
- [ ] **Calendar edit, then refresh.** Edit an event's time, then press Refresh. The new time stays. Do the same with deleting an event.
- [ ] Moving an event to another account still works.
- [x] Join buttons on video meetings.
- [x] **Narrow window:** the header buttons move to the next line together and don't sit over the intro text.

## From beta 1: the clean-up

### Most important (could lose or double mail)

- [ ] **Send a normal email.** It arrives once, and shows once in Sent.
- [ ] **Send with a follow-up reminder.** It arrives once, and the follow-up shows up when it's due.
- [ ] **Send later.** Schedule one a few minutes ahead and leave the app open. It goes once, at the right time.
- [ ] **Undo send.** Press Undo straight away. Nothing goes out, and the draft comes back.
- [ ] **Archive, then sync.** Archive a few emails and press Refresh straight away. They stay archived and don't pop back.
- [ ] **Read and flag, then sync.** Same again with mark as read and flag. They stay as you left them.
- [ ] **Outlook draft.** Write a draft, leave it a minute, edit it, and close it. Only one copy is in Drafts, with the latest text.

### Sign-in and connections

- [ ] **Leave it running for a day.** No account asks you to sign in again, unless you really changed a password.
- [ ] **Wi-Fi off and on** for a minute while the app is open. Every account catches up on its own within a few minutes, with no restart.
- [ ] **iCloud or other IMAP accounts** keep syncing after the laptop wakes from sleep.

### Out of Office

- [ ] Just after opening the app, go straight to Out of Office and turn it off. The message you'd written is still there afterwards.
- [ ] Every switch on that screen still flips and saves.

### Attachments and pictures

- [ ] **Open a Word or Excel attachment.** It opens in Protected View with the yellow bar. That's new and expected.
- [ ] **Save an attachment** and open it from the folder. Windows treats it as downloaded.
- [ ] **A newsletter with pictures held back.** No pictures load until you click Load images, and then they all load.
- [ ] **An email from someone you've allowed pictures for** still shows them straight away.

### Speed and counts

- [x] **Sidebar counts** (each inbox, All Inboxes, Flagged, labels) and the **taskbar number** stay right as you read, archive, undo and as new mail arrives.
- [x] **Big inbox.** Scrolling, selecting and reading feel the same speed or quicker. No flicker or rows jumping.
- [x] **Conversations** open with all their messages, and expand and collapse in the list.
- [x] **Selecting** with click, Ctrl-click and Shift-click, the right-click menu, and acting on a selection all work.
- [x] **Dragging a panel edge** is smooth, and the width is kept after a restart.
- [ ] **Removing an account** (a test one, if you have one) doesn't freeze the window.

### Search

- [ ] `after:` and `before:` with a date pick up mail from that whole local day, including late evening.

### Screens moved into new files (should look identical)

- [ ] **Every Settings tab** opens and saves: General, Accounts, Signatures & Addresses, Out of Office, Inbox Groups, Appearance, Composing, Notifications, Calendar & Reminders, Accessibility, Privacy, Storage, AI Connection, Keyboard Shortcuts, Updates, Diagnostics.
- [ ] **Light and dark mode** both look the same as before. The coral, amber and green accents are unchanged.

### Keyboard

- [ ] Open any pop-up (a dialog, an event, What's New): focus goes into it, and Tab stays inside it.
- [ ] Close it with Escape: focus goes back to where you were. Try a Smart Mailbox's edit dialog too.

### AI Connection (if you use it)

- [ ] Approve a request: it goes through.
- [ ] Refuse a request: nothing happens.
- [ ] Leave a request unanswered for about 3 minutes: the card disappears on its own, and the AI app is told no.
- [ ] Connecting a new AI app still shows the pause prompt.

## If something goes wrong

Note what you did and roughly when, then send me Settings › Diagnostics. You can roll back to 0.7.2 from the GitHub releases page.
