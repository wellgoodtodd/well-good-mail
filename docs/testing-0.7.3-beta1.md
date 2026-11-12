# 0.7.3 beta 1: what to test

This beta is the overnight clean-up only. Nothing should look different. Go through the list over a couple of days of normal use. Anything that feels slower, looks off or behaves differently from 0.7.2 counts as a problem.

## Most important (could lose or double mail)

- [ ] **Send a normal email.** It arrives once, and shows once in Sent.
- [ ] **Send with a follow-up reminder.** It arrives once, and the follow-up shows up when it's due.
- [ ] **Send later.** Schedule one a few minutes ahead and leave the app open. It goes once, at the right time.
- [ ] **Undo send.** Press Undo straight away. Nothing goes out, and the draft comes back.
- [ ] **Archive, then sync.** Archive a few emails and press Refresh straight away (or wait for the next sync). They stay archived and don't pop back.
- [ ] **Read and flag, then sync.** Same again with mark as read and flag. They stay as you left them.
- [ ] **Outlook draft.** On the Outlook account, write a draft, leave it a minute, edit it, and close it. Only one copy should be in Drafts, with the latest text.
- [ ] **Calendar edit, then refresh.** Edit an event's time, then press Refresh in Calendar. The new time stays. Do the same with deleting an event.

## Sign-in and connections

- [ ] **Leave it running for a day.** No account asks you to sign in again, unless you really changed a password.
- [ ] **Wi-Fi off and on.** Turn Wi-Fi off for a minute while the app is open, then back on. Every account catches up on its own within a few minutes, with no restart. (Requests used to be able to hang for ever.)
- [ ] **iCloud or other IMAP accounts** keep syncing after the laptop wakes from sleep.

## Out of Office

- [ ] Just after opening the app, go straight to Out of Office and turn it off. The message you'd written is still there afterwards.
- [ ] Every switch line on that screen still flips and saves.

## Attachments and pictures

- [ ] **Open a Word or Excel attachment.** It opens in Protected View with the yellow bar. That's new and expected.
- [ ] **Save an attachment** and open it from the folder. Windows treats it as downloaded.
- [ ] **A newsletter with pictures held back.** No pictures load until you click Load images, and then they all load.
- [ ] **An email from someone you've allowed pictures for** still shows them straight away.

## Speed and counts (the main point of this beta)

- [ ] **Sidebar counts** (each inbox, All Inboxes, Flagged, labels) and the **taskbar number** stay right as you read, archive, undo and as new mail arrives.
- [ ] **Big inbox.** Scrolling, selecting and reading feel the same speed or quicker. No flicker or rows jumping.
- [ ] **Conversations** open with all their messages, and expand and collapse in the list.
- [ ] **Selecting** with click, Ctrl-click and Shift-click, the right-click menu, and acting on a selection all work.
- [ ] **Dragging a panel edge** is smooth, and the width is kept after a restart.
- [ ] **Removing an account** (a test one, if you have one) doesn't freeze the window.

## Search

- [ ] `after:` and `before:` with a date pick up mail from that whole local day, including late evening.

## Screens moved into new files (should look identical)

- [ ] **Every Settings tab** opens and saves: General, Accounts, Signatures & Addresses, Out of Office, Inbox Groups, Appearance, Composing, Notifications, Calendar & Reminders, Accessibility, Privacy, Storage, AI Connection, Keyboard Shortcuts, Updates, Diagnostics.
- [ ] **Calendar:** the event pop-up, editing, moving an event to another account, the month view, and Join buttons.
- [ ] **Narrow window:** in Calendar & Reminders, Refresh no longer sits over the intro text.
- [ ] **Light and dark mode** both look the same as before. The coral, amber and green accents are unchanged.

## Keyboard (new)

- [ ] Open any pop-up (a dialog, an event, What's New): focus goes into it, and Tab stays inside it.
- [ ] Close it with Escape: focus goes back to where you were. Try a Smart Mailbox's edit dialog too. I couldn't check that one in the test preview.

## AI Connection (if you use it)

- [ ] Approve a request: it goes through.
- [ ] Refuse a request: nothing happens.
- [ ] Leave a request unanswered for about 3 minutes: the card disappears on its own, and the AI app is told no.
- [ ] Connecting a new AI app still shows the pause prompt.

## If something goes wrong

Note what you did and roughly when, then send me Settings › Diagnostics. You can roll back to 0.7.2 from the GitHub releases page.
