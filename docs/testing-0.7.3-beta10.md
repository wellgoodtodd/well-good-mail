# 0.7.3 beta 10: what to test

Beta 10 is beta 9 with the sidebar footer as agreed in round three (docs/mockups/sidebar-footer-3.html). Everything else is as in beta 9, so its list follows. If something goes badly wrong, beta 9 is on the GitHub releases page.

## New in beta 10

- [ ] **Usual width:** each card has its icon and name, no numbers. A red dot in the corner of Tasks when one is late, a blue one on Invitations when new ones are waiting.
- [ ] **Hover a card** for the numbers ("Tasks: 5 due today, 2 late").
- [ ] **Drag the sidebar wider:** the numbers appear at the end of the cards (late tasks in red, new invitations in blue) in place of the dots.
- [ ] **Drag it very narrow:** a row of icons, with the dot on the icon; Settings is just the cog, Help on the right.
- [ ] Settings (cog and name) with its coral dot, and the ? for Help, underneath.

## From beta 9 (not ticked yet)


### Send To
- [ ] **Make a place:** Settings › Send To › New place. Bookkeeping: forward to your Hubdoc address, and save the files in your invoices folder by Year › Month.
- [ ] **Right-click an attachment:** Forward... opens the writing window with just that file. Send to › Bookkeeping forwards it (with Undo) and saves the file; check it arrives in Hubdoc and lands in the right month folder.
- [ ] **"Always send ... there?"** after sending: Make a rule. The rule shows in Settings › Send To.
- [ ] **New rule** in Settings › Send To, made by hand.
- [ ] **A rule at work:** the next invoice from that sender goes by itself (the app needs to be open, or opened later), once only. What's been sent lists it.
- [ ] **Several at once:** search "invoice", select a few, right-click › Send to: it asks first, then each goes on its own.
- [ ] **Find my invoices:** lists your subscription senders; tick one, Make 1 rule, and try "Also send the ones already here" on a short range.
- [ ] Right-click a place or rule to edit, rename or delete; drag to reorder; the switch pauses a rule.

### Reinstalling, safely
- [ ] **Uninstall test** (when you're ready, with time to set up again): uninstall with the box ticked, which now reads "Move the app's data to the Recycle Bin". The two media.wellgood.mail folders should be in the Recycle Bin.
- [ ] Install again: the welcome page says **Welcome back** and lists your accounts. **Add all back** adds them with no signing in, then offers your settings from Google Drive if settings sync was on.
- [ ] Or put the old data back: Help › "Lost your accounts after reinstalling?" has the steps (quit, rename the new folders, Restore from the Recycle Bin).
- [ ] The welcome page has Help and "Lost your accounts after reinstalling?" links.
- [ ] The Gmail setup guide no longer opens by itself when your Google key is still saved.

### Sidebar and menus
- [ ] Drag the footer cards to reorder; the order stays after a restart.
- [ ] **☰ menu:** Scheduled, Calendar, Tasks, Invitations in the same order, then Out of Office, Settings (now with Send To) and Help & Feedback.
- [ ] **Favourites show once:** Important and Flagged only in Favourites. Remove from Favourites puts one back in its place.
- [ ] **Right-click an account** in the sidebar: Leave out of All Inboxes / Show in All Inboxes.

### Fixes
- [ ] **AI drafts:** no squashed second signature; "On ... wrote:" sits with the earlier emails. Send one and check the signature is there once.
- [ ] **Drop a file on an AI draft:** it opens in the full editor with the file attached.
- [ ] **AI Connection › All switches** shows Allow when everything is as high as it goes (Out of Office stays at Ask on purpose).

## From beta 8 (not ticked yet)

- [ ] **Delete an event that's on two of your calendars** (an invitation from WGM accepted on TBWELLER): Delete event now asks which calendars, with tick boxes, and "Cancel ... for everyone?" if the organiser's copy is ticked. Check on your phone that the right copies went. If it still only asks about telling guests, send me Settings › Diagnostics.
- [ ] **Video call line** in the event pop-up, under Location: "+ Add Google Meet" in grey when there's no call; "Google Meet · Join · Settings ↗" when there is. The big Join button only shows on the day of the event.
- [ ] **Location** has a map pin instead of the folder (pop-up and invitation cards).
- [ ] **Make a task from an email** with no date in it starts on today at the next hour, like New task.
- [ ] **Alerts & Notifications** in cards: New mail, How alerts appear, New mail per account, Calendar and tasks, Video meetings, Alerts from hidden calendars, Quiet hours. Change alerts (from the Alerts button) still lands on Calendar and tasks.

## From beta 7 (not ticked yet)

- [ ] **Pause for 1 hour** really quietens alerts (new mail, events, tasks) for the hour.
- [ ] **Month view** has no Tasks panel, and days still say "✓ 2 tasks".
- [ ] **Move from the quick edit card** to a calendar in another account. With guests, a call or a repeat it says what happens first.
- [ ] **Right-click a list:** Rename (check it's renamed on your phone), Set as default, Change defaults…, Hide completed, Delete list… A slow second click renames; ☆ sets the default.
- [ ] **Right-click an account** in Tasks: New list, Show lists / Hide lists, Account settings….
- [ ] **List picker** reads "My Tasks · WGM" with account dots.
- [ ] **Phone changes come through by themselves:** tick one off on your phone; within about a minute it's done here.
- [ ] **Connected AI apps** show their logos; Test and ⋯ still work. **Add tasks** says "Into: ..." and can be changed there.
- [ ] **Font and size** boxes with arrows; bold, italic and lists show a soft blue box when on.
- [ ] **Attachments as cards**, two to a row, with thumbnails and a total. Forwarded attachments show too.
- [ ] **Send later** beside the Send in the pop-out writing window.


### From beta 6 (not ticked yet)

- [ ] **A time on a Google task** shows as "Due 14:00" at the top of its notes on your phone, and at 14:00 in the app.
- [ ] **Alerts for tasks:** a task with a time gives a notification at that time.
- [ ] **Make a task from an email** with "by Friday" in its opening words gets that due date.
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

## Found in beta 10

(Your feedback goes here.)

## If something goes wrong

Note what you did and roughly when, then send me Settings › Diagnostics. You can roll back to beta 9 from the GitHub releases page.
