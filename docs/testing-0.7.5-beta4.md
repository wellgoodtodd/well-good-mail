# 0.7.5 beta 4: what to test

Beta 4 is beta 3 plus fixes from your testing: search no longer leaves rows behind, web addresses in drafts become links, selecting text to the edge works, and closing a draft without saving keeps it in Drafts. Everything still to try from earlier betas is below. Before 0.7.5 goes live, we'll round up with the laptop setup test. If something goes badly wrong, 0.7.4 is on the GitHub releases page.

## New in beta 4

### Search
- [ ] **No leftover rows after a search:** search for someone with several emails in one conversation (like Elena), then clear it. The mailbox comes back clean, with no search rows stuck at the top, and clicking an email highlights only that one.

### Writing
- [ ] **Web addresses become links:** an AI draft (or a reply, forward or saved draft) with a web address in it shows it as a link straight away, without retyping it.
- [ ] **Selecting to the edge:** drag to select some text and let go past the left edge of the writing space (or the window). The text stays selected, ready to copy.

### Drafts
- [ ] **Closing keeps the draft:** open a draft (an AI draft, or one you saved) in its own window and close it with Close without saving. It's still in Drafts, as it was before you opened it. A new email closed the same way is still thrown away.

## Since beta 4 (in the next beta)

### Contact Groups
- [ ] **Groups from Google Contacts:** any labels you already have in Google Contacts show in Settings › Contact Groups. If changing one asks you to sign in once more, do that.
- [ ] **New group from an email:** right-click an email's heading › New group from everyone on this email, name it (like Trustees). It shows in Settings, and as a label in Google Contacts on the web and phone.
- [ ] **Type the group's name** in To, Cc or Bcc: the group comes first in the suggestions, and choosing it adds everyone as their own name.
- [ ] **Change who's on one email:** right-click a name › Move to Cc, Move to Bcc or Move to To, or Remove. The group itself doesn't change.
- [ ] **Change the group:** right-click anyone's name (in an email or a draft) › Contact groups. A tick shows the groups they're in: click to take them out, or click another to add them (Undo in the note). Also New group with them.
- [ ] **Settings › Contact Groups:** rename a group, add or take out people (someone not in contacts yet is added to contacts too), and Delete (people stay in contacts).
- [ ] **Ask the AI:** in Claude, "add Sam to Trustees" or "take Bob out of Trustees". It asks first, then the change shows in Settings. The first time, the AI app may need reconnecting to see the new tools.

### Menus
- [ ] **One menu at a time:** right-click a name, then right-click the email's heading. Only the email's menu shows; the first one closes.

### Sidebar
- [ ] **Scheduled dot:** schedule an email, then make the sidebar narrow. The Scheduled card shows an amber dot (the number shows instead when the sidebar is wide).

### Unsubscribe
- [ ] **Unsubscribe without a blank page:** on a newsletter, press Unsubscribe. Most now just say "Unsubscribed from …" with nothing opening. If the sender needs you to confirm, their proper page opens (the link from the email itself when there is one), not a blank one.

## Still to try (carried forward)

### From 0.7.5 beta 3

#### Links while writing
- [ ] **Ctrl+K everywhere you write:** the AI Drafts card, signatures and Out of Office, as well as the full editor. Tab and Shift+Tab indent there too.
- [ ] **Select some words, Ctrl+K:** the box has Text to show (your words) and Link. Type or paste the link, Enter: the words become the link.
- [ ] **Select an address** (like example.com or sam@example.com), Ctrl+K: Link is filled in already.
- [ ] **Nothing selected, a link on the clipboard:** Ctrl+K fills Link with it, and Text to show follows it tidily (example.com/page) until you type your own words.
- [ ] **In a link, Ctrl+K:** Edit link, with its words and address. Change either; empty Link takes the link off and keeps the words.
- [ ] Double-clicking a word and linking it keeps the space after it.

#### Calendar in its own window
- [ ] **Calendar in its own window:** on Calendar & Reminders, the pop out button (beside Refresh) opens it in a window of its own, with List, Calendar and Tasks, ready for another screen. Pressing it again brings that window to the front instead of opening a second.
- [ ] **Both windows stay in step:** add, move or delete an event (or tick a task) in one window and it shows in the other within a second.
- [ ] **From the Calendar window:** opening an email opens it in a pop out, writing to guests opens the writing window, and Settings links open in the main window and bring it to the front.
- [ ] The Calendar window opens at the size and on the screen you last left it.


### From 0.7.5 beta 2

#### Opening emails
- [ ] **Faster again:** opening emails and moving up and down the list feels quick, including big newsletters.
- [ ] **The cards still come:** an email with a day and time still shows Add to calendar, and one asking for something by a day still shows Make a task, just after the email appears.

#### Search
- [ ] **Clearing a search** always goes back to the mailbox you were in.
- [ ] **Back after a search** (Alt+Left or the mouse's back button): the box shows the search's words, and clearing it goes back to normal.

#### Links while writing
- [ ] **Click a link** in an email you're writing: a card shows where it goes, with Open, Edit, Copy and Remove.
- [ ] **Ctrl+click a link** opens it in your browser straight away.
- [ ] **Right-click a link:** Open link in your browser, Copy link address and Remove link are at the top.
- [ ] **Edit link** changes that link instead of adding a second one next to it.
- [ ] The same in AI Drafts, signatures and Out of Office.

### From 0.7.5 beta 1

#### Backup & Sync (Settings › General)
- [ ] **Backup & Sync card:** the settings sync switch, Back up automatically (Off, every day, week or month), Keep (5 to 50 backups for each computer), This computer's name, Back up now, Restore..., and the folder in Google Drive with Open and Rename....
- [ ] **Back up now:** a note says Backed up, and the file shows in Google Drive under Well Good Mail › Backups › (this computer's name). Last backup shows the time.
- [ ] **Turning sync on for the first time** also turns on weekly backups, with a note saying so.
- [ ] **Automatic backups:** with Every day on, a new backup appears the next day by itself. Once there are more than Keep, the oldest from this computer goes.
- [ ] **Restore...** lists the latest backups with their computer and time. Pick one: settings, rules, signatures and templates go back. Ctrl+Z puts them as they were.
- [ ] **The folder:** Well Good Mail in My Drive holds the settings file (moved in from My Drive, and the phone still finds it), Backups and Event files. Rename it or move it in Drive: the app still uses it.
- [ ] **Rename this computer:** the next backup goes into a folder with the new name.

- [ ] **Everything in one folder:** about 90 seconds after the first start of beta 1, a new "Well Good Mail" folder appears in Drive with the settings file in it, and files you added to events earlier move into Event files. Your old folder is now "wellgoodmail-old"; the settings file leaves it, and your key doc stays there.
- [ ] **Back up now** also does that tidy-up and says how many older files it moved.

#### A new computer
- [ ] **Set up from a backup:** on a fresh install, add your first Google account. A note offers the newest backup in Drive ("from Desk PC"). Set up from backup brings back settings, rules and signatures, and lists any other accounts to add in Settings › Accounts.

- [ ] **Backup & Sync card** says which Google account's Drive holds everything, to sign in to first on a new computer.
- [ ] **Accounts to add (laptop test):** set up from a backup, then Settings › Accounts lists your other accounts, each with Sign in (Google and Microsoft open their sign-in page with the address filled in; iCloud opens the guide with the address and server filled, asking only for the app password). Each comes off the list once added, with its nickname and colour.
- [ ] **The other way:** add an account on the laptop. Next time the desktop opens (settings sync on), it says it was added on another computer, with Add. Not on this computer takes it off the list for good.
- [ ] Removing an account on one computer doesn't make the other computer offer it back.

#### Add to event
- [ ] **Right-click an attachment › Add to event...:** events with the same people or subject come first under Suggested, then the next two weeks. Type to search for any event.
- [ ] **Pick a Google event:** a note says "Added Agenda.pdf to Board meeting". In Google Calendar the file is on the event, it sits in Well Good Mail › Event files in Drive, and the notes have the From email link.
- [ ] **Add all to event...** shows when the email has more than one file, and puts them all on.
- [ ] **A Microsoft or iCloud event** says Link only in the list, and gets the link without the file.

#### Send To rule fix
- [ ] **A rule made from a mail.com or email.com sender** matches only that address, not everyone. Existing rules still work as before.

#### Updates and the crash report
- [ ] When the app updates itself, the next start doesn't say it closed unexpectedly.
- [ ] "Checking for updates" gives up after 30 seconds instead of staying stuck.
- [ ] The "closed unexpectedly" and Report a problem forms fit their card (the text box no longer pokes out).

### From 0.7.4 beta 6

#### Calendar
- [ ] **Undo after any delete:** one of a series, this one and all after it, the whole series, an event with guests, one on several of your calendars, and several at once in List view. The note has Undo, and it's in Recent (and Ctrl+Z). On Google the same event comes back, in its series.
- [ ] **With guests:** the note says guests were told it's cancelled and that Undo invites them again.

#### Tasks
- [ ] **Tick off a task by mistake:** the "Done" note has Undo, and it's in Recent and Ctrl+Z too (in Tasks, on the calendar and in Coming Up).
- [ ] **Make a task from an email**, then look at it in Google Tasks: the notes end with "From email: …", the Gmail link and "Message-ID: <…>". On the phone, tap From email on that task and pick Open in Mail. In Well Good Mail the Message-ID line stays hidden. Same for a Microsoft To Do task.

#### Events from emails
- [ ] **Add to calendar** on an email with files (an agenda, minutes): the card says "With Agenda.pdf". The event's notes say "From email: (subject)" with a link that opens the email in Gmail (on your phone too), and the files are attached to the event in Google Calendar.
- [ ] **Already in your calendar** (like Gordon's board meeting): the card says "The email has Agenda.pdf". Update event adds the files and the link. With nothing else to change, ⋯ › Link the event to this email adds the link.

### Keep an eye on (kept until seen)
- [ ] **A Send To rule on its own:** the next SocialPilot invoice saves and forwards by itself, once, and shows in What's been sent.
- [ ] **Find my invoices** reads properly, with Stripe and PayPal receipts listed by the company you paid.

### From 0.7.4 beta 5

#### Mail
- [ ] **Already in your calendar:** open an email about something you already have in your calendar (like Gordon's board meeting email). The card says which calendar it's in, and what the email has that the event doesn't: "The email has a Google Meet link", or "The email says 19:15 to 21:15".
- [ ] **Update event** adds the link (Join then works) or changes the time. Nothing changes until you press it.
- [ ] **Update and move to WGM** (when the event is in another account) moves it into the email's account, with the changes. ⋯ › Add a copy keeps the original too.
- [ ] **Running late:** the card is still there up to 15 minutes after the start.
- [ ] **Something else at the same time** (a different event) no longer hides an Add to calendar suggestion.

#### AI Drafts
- [ ] **Drop or paste a file** on an AI Drafts card: it's attached and listed under the draft, and the card stays open. × removes it, and Undo puts it back. Send: the file goes with it.

#### Phone and settings
- [ ] **Nickname changed on your phone** shows here within about a minute, or straight away when you press refresh (F5). It stays after you change something on the desktop.
- [ ] **Refresh (F5)** also checks calendars straight away.

### From 0.7.4 beta 4

- [ ] **Suggested task on your phone:** it shows there, with "From email:" and the subject in its notes.

### From 0.7.4 beta 3

#### Calendar
- [ ] **Add to calendar** on the ticket email's .ics card adds it (as your own event).
- [ ] **+ Add Google Meet** in the quick edit card says "Setting it up…", then shows Join by itself.
- [ ] **Week view:** click the picked day again to put it away.
- [ ] **List view:** pick events, press Delete: it asks, deletes them, and no emails go to the Bin. Undo (or Ctrl+Z) brings them back.

#### Tasks
- [ ] **New task:** type "Call Sam tomorrow at 2pm": When fills in as you type, and the title saves as "Call Sam".

#### Mail
- [ ] **Forward** opens in its own window (tick "Open replies and forwards in their own window" in Settings › Writing first).
- [ ] **Unread in a conversation:** opened out in the list, the dots sit on the unread emails. In the reading pane a folded unread email has a dot.
- [ ] **Right-click a folded email** in the reading pane: Reply, Forward, Mark as unread (just that one), then Archive and the rest.

#### Out of Office
- [ ] Microsoft WGM shows "Scheduled" with **Show settings**: it brings in the dates and message, ready to change and Update.
- [ ] **AI apps** can use Holiday: ask Claude to "set my Holiday Out of Office on WGM from 21 Dec to 4 Jan".

### From 0.7.4 beta 2

#### Task alerts
- [ ] **New task with a time:** Alert shows "At the time (usual)". Pick 1 hour before, then "+ Add alert" and a Second alert. Save.
- [ ] **The notifications come:** one at each alert, saying "Task due at 15:00" (or "Task due now") with the list name.
- [ ] **Alert: None** gives no notification. A ticked-off task gives none either.
- [ ] **On your phone,** the task's notes say "Due 15:00" and an "Alert:" line. Change the alert there and the app follows.
- [ ] **No time, no alerts:** a task with only a date has no Alert row. Microsoft To Do lists have none.
- [ ] **Never pop up** in Alerts & Notifications › Calendar and tasks keeps task alerts quiet too, as do quiet hours and Pause for 1 hour.

#### Tasks from AI apps
- [ ] Ask Claude to "add a task to call Stevie tomorrow at 3pm, remind me an hour before". It's due at 15:00, the title is just "Call Stevie", and the alert is 1 hour before. The approval card shows the alert.

#### Quick add and task titles
- [ ] **New event titles** understand 930, tonight, Friday morning, half 9, quarter to 6, and "at 2" as 2pm.
- [ ] **A task called "Call Stevie (3pm)"** with a date becomes "Call Stevie" at 15:00.

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

## Noted, not fixed yet

- [ ] **Moved an event with a guest to another account, then renamed it:** it showed as two events on two calendars, and Invitations said one clashed with the other. To look into: was one of your own addresses a guest on it?
- [ ] **Phone app:** an event on two of your calendars shows only once there. For the Well Good Calendar chat.
- [ ] **iCloud calendars can't take new events yet:** the app only reads them. On the backlog.
- [ ] **For the Well Good Calendar chat:** a quick way to change an event's calendar, and calendars from non-Google accounts (iCloud, Microsoft).
- [ ] Later: tidy up Alerts & Notifications. The card titles help for now.
- [ ] **Demo:** opening a one-email conversation sometimes shows it folded until clicked.

- [ ] **Phone:** opening an email from a task's From email link (Open in Mail) can show the raw email in Apple Mail, though the email itself is fine. With the Well Good Calendar chat.
- [ ] **Not built yet:** Undo for Add to event; saving logins in the backup, locked with a password or passkey; Add all signing in to each account in turn on a new computer.

## If something goes wrong

Note what you did and roughly when, then send me Settings › Diagnostics. You can go back to 0.7.4 from the GitHub releases page.
