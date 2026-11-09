# Backlog

Things noted but not built yet. Newest first. Nothing here is promised for a date.

## For the next 0.7 beta

- **Out of office per account** (see below). Needs each Google and Microsoft account to sign in once more, so not started until Todd says.
- **Before live 0.7.0:** help, What's new and support pages for everything since beta 5; one tidy 0.7.0 release note; decide whether to test a Microsoft draft or say drafting is tested on Gmail.

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
