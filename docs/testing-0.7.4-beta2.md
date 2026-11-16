# 0.7.4 beta 2: what to test

Beta 2 adds alerts on tasks, smarter quick add, and settings shared with the phone app. If something goes badly wrong, 0.7.3 is on the GitHub releases page.

## New in beta 2

### Task alerts
- [ ] **New task with a time:** Alert shows "At the time (usual)". Pick 1 hour before, then "+ Add alert" and a Second alert. Save.
- [ ] **The notifications come:** one at each alert, saying "Task due at 15:00" (or "Task due now") with the list name.
- [ ] **Alert: None** gives no notification. A ticked-off task gives none either.
- [ ] **On your phone,** the task's notes say "Due 15:00" and an "Alert:" line. Change the alert there and the app follows.
- [ ] **No time, no alerts:** a task with only a date has no Alert row. Microsoft To Do lists have none.
- [ ] **Never pop up** in Alerts & Notifications › Calendar and tasks keeps task alerts quiet too, as do quiet hours and Pause for 1 hour.

### Tasks from AI apps
- [ ] Ask Claude to "add a task to call Stevie tomorrow at 3pm, remind me an hour before". It's due at 15:00, the title is just "Call Stevie", and the alert is 1 hour before. The approval card shows the alert.

### Quick add and task titles
- [ ] **New event titles** understand 930, tonight, Friday morning, half 9, quarter to 6, and "at 2" as 2pm.
- [ ] **A task called "Call Stevie (3pm)"** with a date becomes "Call Stevie" at 15:00.

### Shared with the phone app
- [ ] Account nicknames and colours set here show in Well Good Calendar on your phone within a few minutes.

## Keep an eye on (kept until seen)

- [ ] **A Send To rule on its own:** the next SocialPilot invoice saves and forwards by itself, once, and shows in What's been sent.
- [ ] **Find my invoices** reads properly, with Stripe and PayPal receipts listed by the company you paid.

## Still to try (carried forward)

### From 0.7.4 beta 1

- [ ] **Always:** tick "Always use this app" once; after that a double-click on any .ics opens it here.
- [ ] **A file with no event in it** gives a short message, nothing else.
- [ ] **App closed or in the tray:** opening an .ics starts or brings up the app and shows the event.

### From 0.7.3 beta 11

- [ ] **New place** fits its dialog; nothing runs past the edge.

### From 0.7.3 beta 10

- [ ] **Hover a card** for the numbers ("Tasks: 5 due today, 2 late").
- [ ] Settings (cog and name) with its coral dot, and the ? for Help, underneath.

### From 0.7.3 beta 9

#### Reinstalling, safely
- [ ] **Uninstall test** (when you're ready, with time to set up again): uninstall with the box ticked, which now reads "Move the app's data to the Recycle Bin". The two media.wellgood.mail folders should be in the Recycle Bin.
- [ ] Install again: the welcome page says **Welcome back** and lists your accounts. **Add all back** adds them with no signing in, then offers your settings from Google Drive if settings sync was on.
- [ ] Or put the old data back: Help › "Lost your accounts after reinstalling?" has the steps (quit, rename the new folders, Restore from the Recycle Bin).
- [ ] The welcome page has Help and "Lost your accounts after reinstalling?" links.
- [ ] The Gmail setup guide no longer opens by itself when your Google key is still saved.

### From 0.7.3 beta 7

- [ ] **Pause for 1 hour** really quietens alerts (new mail, events, tasks) for the hour.
- [ ] **Right-click a list:** Rename (check it's renamed on your phone), Set as default, Change defaults…, Hide completed, Delete list… A slow second click renames; ☆ sets the default.

### From 0.7.3 beta 6


### From 0.7.3 beta 5

- [ ] **Microsoft retry:** once Outlook is working again, a refresh with a passing Outlook hiccup shows no error.
- [ ] **Contacts' addresses** show in Location suggestions with the contact's name in grey.

### From 0.7.3 beta 4 and earlier

#### Under the hood (beta 4)

- [ ] **iCloud calendars** keep updating, and a calendar added on your phone appears.

#### Calendar

- [ ] Events someone else organised show no handle and can't be dragged.
- [ ] **List view:** tick several rows, then Move to calendar and Delete.
- [ ] An **open event** updates by itself when a guest's answer changes.

#### Out of Office page

- [ ] Pick one of **your own** templates (save one first: Templates › Save as new template), then change something: **Changed** appears with Update template and Save as new. Pressing Schedule asks once, with "Leave the template as it was".
- [ ] The Templates drop-down shows names only. Once you've saved a template, Manage templates appears and says Duplicate, Save current settings to it, Choose parts….
- [ ] Set up a Friday afternoon away (Friday 13:00 to Monday 09:00), then Templates › **Save as new template**. Tick whole groups, then single parts inside them.
- [ ] Change the page, then pick your template: only the ticked parts change, the dates move to the next Friday, and Undo puts everything back.
- [ ] Duplicate Friday afternoons and rename the copy to Wednesday away. Delete a template, then Undo.
- [ ] Just after opening the app, go straight to Out of Office and turn it off. The message you'd written is still there afterwards.

#### Smaller fixes

- [ ] Delete an event you've already deleted on your phone: no "Resource has been deleted" error, it just goes.
- [ ] Add an event, press Undo, then Ctrl+Z: whatever shows on screen is really in Google, and can be deleted.
- [ ] **"Today"** in a title (e.g. "Call Mum today at 6pm"), and deleting the date words puts the day and time back to how they started.
- [ ] **Mark as unread** on a conversation: only one email turns unread (the one you're reading, or the latest), and the count goes up by one.

#### From beta 2

- [ ] **Outlook:** one event in the Outlook calendar. Outlook keeps only one alert, and Teams links work on work accounts only.
- [ ] **AI apps:** switch on "Set up Calendar Groups" in AI Connection, then ask Claude to make a Personal group. It asks first.

#### From beta 1: the clean-up

- [ ] **Send with a follow-up reminder.** It arrives once, and the follow-up shows up when it's due.
- [ ] **Undo send.** Press Undo straight away. Nothing goes out, and the draft comes back.
- [ ] **Wi-Fi off and on** for a minute while the app is open. Every account catches up on its own within a few minutes, with no restart.
- [ ] **iCloud or other IMAP accounts** keep syncing after the laptop wakes from sleep.
- [ ] **Save an attachment** and open it from the folder. Windows treats it as downloaded.
- [ ] **A newsletter with pictures held back.** No pictures load until you click Load images, and then they all load.
- [ ] **An email from someone you've allowed pictures for** still shows them straight away.
- [ ] **Removing an account** (a test one) doesn't freeze the window.

## Found in beta 2

- [ ] **Add to calendar on an email's .ics card** failed with a Google error (participantIsNeitherOrganizerNorAttendee) on a ticket where you aren't listed as a guest. Fixed for beta 3: it's added as an ordinary event instead, and the error words are plain now.
- [ ] **Date words in the New task title** ("tomorrow at 2 pm") weren't read. Fixed for beta 3: When fills in as you type, and the words come out of the title.
- [ ] **Forward opened inline.** Replies and forwards follow one setting, now called "Open replies and forwards in their own window" (Settings › Writing). It's on for new installs; tick it on yours.
- [ ] **+ Add Google Meet** in the quick edit card still said "+ Add Google Meet" until a refresh. For beta 3: it says "Google Meet · Setting it up…" and checks every few seconds until the Join link is there.
- [ ] **Week view:** clicking the picked day again didn't put it away, as it does in Month. Fixed for beta 3.
- [ ] **Moved an event with a guest to another account, then renamed it:** it showed as two events on two calendars, and Invitations said one clashed with the other. To look into: was one of your own addresses a guest on it?
- [ ] **Nicknames and colours on the phone:** still not coming through on beta 2. The fix (sent once at start) is in beta 3.
- [ ] **Unread in a conversation:** the dot stayed on the whole conversation. For beta 3: opened out in the list, the dots sit on the emails that are unread; in the reading pane, a folded email that's unread has a dot; right-click a folded email for its own menu (Reply, Forward, Mark as unread for just that one, then the conversation's Archive, Move and so on). Mark as unread from an email's ⋯ menu now marks that email, not the newest.
- [ ] **Phone app:** an event on two of your calendars shows only once there. For the Well Good Calendar chat.
- [ ] **Share an invoice to Hubdoc:** the Windows Share panel only lists Store apps. For beta 3: right-click a file (or several), Show more options › Send to › Well Good Mail opens a new email with them attached. The shortcut is made when beta 3 installs.
- [ ] **Delete in the calendar's List view** binned two emails: the Delete key acted on the email picked in Mail. For beta 3, away from Mail the email keys do nothing, and on the calendar Delete takes the picked events (it asks first).
- [ ] **No Undo after deleting events.** For beta 3: Undo (and Ctrl+Z) puts them back, apart from ones with guests or repeats.
- [ ] **AI apps couldn't see the built-in Out of Office templates** (Holiday and so on). For beta 3 they can.
- [ ] **Out of Office set from elsewhere couldn't be checked.** For beta 3: an account that's on or scheduled has Show settings, which brings its dates and message into the page, ready to change and Update.
- [ ] **iCloud calendars can't take new events yet:** the app only reads them. On the backlog.
- [ ] **For the Well Good Calendar chat:** a quick way to change an event's calendar, and calendars from non-Google accounts (iCloud, Microsoft).
- [ ] **No suggested task** for "Could you send me the venue list by Friday?". There's no such feature yet: suggestions are for events with a day and a time. Make a task from it does get Friday.
- [ ] Later: tidy up Alerts & Notifications. The card titles help for now.

## If something goes wrong

Note what you did and roughly when, then send me Settings › Diagnostics. You can go back to 0.7.3 from the GitHub releases page.
