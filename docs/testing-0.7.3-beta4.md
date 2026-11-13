# 0.7.3 beta 4: what to test

Everything here not yet ticked has moved into [testing-0.7.3-beta5.md](testing-0.7.3-beta5.md). This list is kept as a record of what was ticked in beta 4.

Beta 4 is beta 3 plus work under the hood. You're going straight from beta 2 to beta 4, so everything below is new to you. The first section is beta 4's own changes: nothing should look different, so anything slower, missing or odd counts as a problem. Then come beta 3's new features, then everything from betas 1 and 2 not ticked yet. If something goes badly wrong, beta 3 is on the GitHub releases page to go back to.

## Found in beta 4 (fixing in beta 5)

- Changes (moving several, dragging, deleting a series) wait for Google before they show.
- The calendar header: views and the slider sit on the left; the slider should be a thin line.
- Move to calendar in the right-click menu has lost its account names and colour dots.
- The repeating-event question's buttons are in the wrong order and spill outside the pop-up.
- Clicking empty space doesn't let go of picked events in Day and Week view.
- All-day events can't be dragged in Day or Week view; one weekly event wouldn't drag.
- Add a note is easy to miss; no Accept / Decline on an unanswered invitation's pop-up.
- "Cancel the meeting and tell guests" sent no emails.
- A Microsoft 502 error shows during refreshes, and Out of Office can't check or switch on WGM Microsoft.
- Out of Office: the Template picker belongs next to the message, and doesn't follow the account tabs; While I'm away should say something general, not list every option.

## Under the hood (beta 4)

- [ ] **Opening emails:** old and new emails open with their full text, in every account. An email not opened lately may take a blink longer.
- [ ] **After a restart:** close the app fully, open it again, and open a few emails. Their text is all there.
- [ ] **Reply and Forward** include the quoted email, also after a restart, also in a pop-out window, and when switching between Reply and Forward.
- [ ] **Print** an email: the full text prints.
- [ ] **Writing (new editor version):** bold, italic, underline, lists, links (Ctrl+K), font and size, Undo and Redo, spelling suggestions on right-click, Paste without formatting, Paste as quote, pasting a picture, changing the signature. Drafts reopen with the same text.
- [ ] **Out of Office and AI Drafts** editors work the same.
- [ ] **Search:** words from inside emails, `from:`, `after:` and `before:`. One change: a word only found very far down a long email (after about the first 4,000 characters) is no longer found.
- [ ] **Smart Mailboxes** with "Any text" still show what you'd expect. They now match whole words or the start of words in the email's text ("pay" finds "payment" but not "repayment").
- [ ] **iCloud calendars** keep updating, and a calendar added on your phone appears.
- [ ] **Memory:** after a day of use, Task Manager shows Well Good Mail using less memory than beta 2 did.
- [ ] **Everything else as normal:** sidebar counts, archive and Undo, sending, Send later, Calendar. The main mail file was split into twelve smaller ones; nothing should behave differently.


## Calendar: changing events

- [x] **Quick edit:** click an event. The name, day, times and calendar can be changed right there. Save only appears once something has changed.
- [x] **More options** on an existing event opens the full form (repeat, alerts, invitees, video call, notes), the same as New event.
- [ ] **Remove a video call** from an event, then check Google Calendar.
- [x] **Meeting settings** (after Add Google Meet, and on your own events with a call) opens the event in Google Calendar in your browser.
- [ ] **Right-click an event:** the same quick edit card. Right-clicking empty space still gives New event, New all-day event, Open day, Go to today.

## Calendar: dragging

- [x] **Hover** an event in Day or Week view: an outline and a handle on its bottom edge. The pointer is the white open hand, and a closed hand while you hold it.
- [x] **Drag the handle** to make an event longer or shorter. It snaps to 15 minutes and shows the new end time. Undo puts it back.
- [x] **Drag an event** to another time, and in Week view to another day. A plain click still opens it; a drag never does.
- [ ] An event starting at 10:05 keeps its 5 minutes past as you drag it (10:20, 10:35).
- [ ] **Month view:** drag a chip to another day. It lifts while held, the day under it is outlined, and only the day changes.
- [ ] Events someone else organised show no handle and can't be dragged.
- [ ] Check every change above in Google Calendar on your phone.

## Calendar: repeating events

- [x] **Delete** one of the series left over from beta 2: it asks Only this event / This and all future events. Try both.
- [x] **Drag or edit** one event in a series: the same question. Cancel puts it back.

## Calendar: several events at once

- [x] **Ctrl-click** picks events without opening them; Ctrl-click again lets one go.
- [x] **Drag across empty space** to draw a box round events; hold Ctrl to add to what's already picked. Escape or a click on empty space clears it.
- [x] With several picked, the bar shows **Move to calendar** and **Delete**, and right-click does too.
- [x] Move a few to a calendar in the same Google account: they move cleanly.
- [ ] Move one with guests to another account: the warning about new invitations comes first.
- [ ] **List view:** tick several rows, then Move to calendar and Delete.

## Calendar: header, zoom and refresh

- [ ] The **arrows** sit either side of the month name, with Today next to them, and Day / Week / Month on the right.
- [x] **Zoom** in Day and Week view with Ctrl + mouse wheel and with the slider, down to 5-minute lines. Dragging snaps to 5 minutes at the closest zoom. The zoom is remembered.
- [ ] **Changes made on your phone** show in the app within about a minute while Calendar & Reminders is open, and soon after you come back to the window.
- [ ] An **open event** updates by itself when a guest's answer changes.

## Guests

- [x] Change the time of an event with guests: it asks Send an update / Don't send / Cancel. Check the guest gets (or doesn't get) an email.
- [ ] Delete an event with guests: it offers to cancel the meeting and tell them.

## Invitations

- [x] Invite yourself from another account. The **envelope button** in the calendar header shows a count and glows.
- [x] The **Invitations** line appears in the sidebar while there are new ones, and goes once they're answered.
- [x] **New:** Accept, Maybe and Decline each answer it in one click and move it to Replied, with Undo. Check the organiser's side.
- [x] **Add a note** sends a message with your answer.
- [ ] A **clash** with something already in your calendar is noted.
- [ ] A **cancelled** meeting shows crossed out with Remove from my calendar.
- [x] **Replied:** your answer is coloured, and changing it is one click.
- [ ] An unanswered meeting in **Coming up** says Not answered and opens the pop-up.
- [ ] The card on an invitation email now says Accept / Maybe / Decline too.

## Out of Office page

- [x] The new layout: cards with small capitals titles (ACCOUNTS, MESSAGE, WHEN, WHO GETS IT), accounts as switches, and While I'm away folded away.
- [x] **Different message for each account:** switch it on; a tab appears for each account that's on, and each one keeps its own message.
- [x] The sentence at the bottom reads back exactly what will happen.
- [ ] Pick a template, then change something: **Changed** appears with Update template and Save as new. Pressing Schedule asks once, with "Leave the template as it was".
- [ ] The Templates drop-down shows names only. Manage templates says Duplicate, Save current settings to it, Choose parts….
- [ ] Set up a Friday afternoon away (Friday 13:00 to Monday 09:00), then Templates › **Save as new template**. Tick whole groups, then single parts inside them.
- [ ] Change the page, then pick your template: only the ticked parts change, the dates move to the next Friday, and Undo puts everything back.
- [ ] Duplicate Friday afternoons and rename the copy to Wednesday away. Delete a template, then Undo.
- [ ] **AI apps:** ask Claude to "turn on my Holiday Out of Office template from 21 Dec to 4 Jan". The approval card shows the whole reply and the dates.
- [ ] Just after opening the app, go straight to Out of Office and turn it off. The message you'd written is still there afterwards.

## Smaller fixes

- [ ] Delete an event you've already deleted on your phone: no "Resource has been deleted" error, it just goes.
- [ ] Add an event, press Undo, then Ctrl+Z: whatever shows on screen is really in Google, and can be deleted.
- [x] A **second alert** on an all-day event.
- [ ] **"Today"** in a title (e.g. "Call Mum today at 6pm"), and deleting the date words puts the day and time back to how they started.
- [ ] **Mark as unread** on a conversation: only one email turns unread (the one you're reading, or the latest), and the count goes up by one.

## Carried forward from beta 2 (not tried yet)

- [ ] **Outlook:** one event in the Outlook calendar. Outlook keeps only one alert, and Teams links work on work accounts only.
- [ ] **Calendar list:** calendars you've hidden aren't offered, and the last calendar you used comes first next time.
- [ ] **Calendar Groups:** rename a group and delete one.
- [ ] The **sidebar count** for Calendar & Reminders follows the group.
- [ ] **Only alert me from the group I'm looking at:** switch it on, pick Personal, and alerts from work calendars stay quiet.
- [ ] New event while Work is picked goes into a Work calendar.
- [ ] **AI apps:** switch on "Set up Calendar Groups" in AI Connection, then ask Claude to make a Personal group. It asks first.
- [ ] Moving an event to another account still works.

## Carried forward from beta 1: the clean-up

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

### Attachments and pictures

- [ ] **Open a Word or Excel attachment.** It opens in Protected View with the yellow bar. That's expected.
- [ ] **Save an attachment** and open it from the folder. Windows treats it as downloaded.
- [ ] **A newsletter with pictures held back.** No pictures load until you click Load images, and then they all load.
- [ ] **An email from someone you've allowed pictures for** still shows them straight away.

### Other

- [ ] **Removing an account** (a test one) doesn't freeze the window.
- [ ] `after:` and `before:` in search pick up mail from that whole local day, including late evening.
- [ ] **Every Settings tab** opens and saves: General, Accounts, Signatures & Addresses, Out of Office, Inbox Groups, Appearance, Composing, Notifications, Calendar & Reminders, Accessibility, Privacy, Storage, AI Connection, Keyboard Shortcuts, Updates, Diagnostics.
- [ ] **Light and dark mode** both look right. The coral, amber and green accents are unchanged.
- [ ] Open any pop-up (a dialog, an event, What's New): focus goes into it, and Tab stays inside it. Escape takes focus back to where you were.
- [ ] **AI Connection:** approving goes through, refusing does nothing, a request left for about 3 minutes disappears and the AI app is told no, and a new AI app still shows the pause prompt.

## If something goes wrong

Note what you did and roughly when, then send me Settings › Diagnostics. You can roll back to 0.7.2 from the GitHub releases page.
