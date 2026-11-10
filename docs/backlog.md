# Backlog

Things noted but not built yet. Newest first. Nothing here is promised for a date.

## After 0.7.0

**For 0.7.2 beta 2 (done, not built yet):** with the Unread filter on, emails you read stay in the list (so you can go back to one) until you leave that mailbox or switch Unread off and on, like Apple Mail. The list no longer shifts under each click. Forward and new emails start with the cursor in To (Reply still starts in the message), also when switching a reply to Forward. When "Tell me about test versions" is ticked (always, on a test version), a newer test version lights the Settings dot, and the app looks for one hourly instead of daily. Settings and Help now open from the welcome page before any account is added (the sidebar button is greyed until there is mail). "Moving from another computer?" on the welcome page opens a checklist: restore the Google key from the backup file (or "I don't have one", which opens the guide at Paste your key with where to find the ID and a new secret), sign in, then import the mail export. Out of Office: accounts that need one more sign in get a pop-up (Sign in to each, or Later) when you open Out of Office or click Turn on, and an amber bar above the accounts; after signing in, Turn on carries on for them. Microsoft offers Sign in instead of "Couldn't check", and other failures show the reason. The status and "Default message" sit on their own lines (no stray dot). Turn off now is also in the bottom bar, which now sits flush with the window edge. The text size slider is in Accessibility as well as Appearance: one setting, so moving either moves both. Todd, 10 Nov.

**In 0.7.2 beta 1 (10 Nov 2026):** Out of Office (set inside Gmail and Microsoft; dates, audience, default and own messages, templates, back date, Preview, Send me a test; Away event, Workspace declines, reminder, amber bar, sidebar plane, While you were away, holiday suggestion, pause alerts; AI tools get_out_of_office and set_out_of_office, always asking with the whole reply); attachments open in their own app from a private Previews folder (programs and scripts refused), a downloads folder, Clear previews; suggested events (chrono-node, people only, Change details, Don't suggest from this sender); What's new grouped by series; Accessibility tab (bold focus ring, motion, Windows high contrast, every control named); one control height (reminder minute boxes, template menu) and one page width (scroll bar room on full-page screens). The sidebar fold lag couldn't be reproduced in the demo with 1,500 drafts (folds in 6 to 19 ms): watch for it on the real app. Still to do from this list: Accounts round two (mock-ups first), Add to contacts.

**In 0.7.1 beta 1 (10 Nov 2026):** design review fixes (contrast on the selected row and Allow buttons, editor fitting its pane, headings that match their tabs, softer greys made readable, even editor edges, empty group chips hidden, sign-off trimmed from previews); Settings, Accounts as a list with a calm detail column; Appearance with one Colours card; hardening: what an AI is shown, remote picture blocking, links opening in the browser, Always allow only for ticked accounts, safe attachment names, tighter content rules.

**Attachments, asked for 10 Nov 2026 (next beta):**
- Click an attachment that can't preview inside the app (Word, Excel, Pages and so on) and it opens straight away in its own app: Well Good Mail saves a copy in a private Previews folder (in the app's cache) and opens that. Changes made there aren't saved back to the email.
- Settings: a default downloads folder (or "Ask each time"), used by Save and Save all.
- Settings, Search & Storage: the Previews folder's size, Open folder and Clear previews, and previews older than 30 days cleared by themselves.
- Needs a small Windows-side addition (write to the cache folder and open a file with its own app), kept to that folder only.

**Out of Office, designed 10 Nov 2026 (0.7.2, mock-up shown):**
- Set in each account itself (Gmail vacation responder via gmail.settings.basic; Microsoft automatic replies via MailboxSettings.ReadWrite), so it works with the PC off and shows on the phone. iCloud and IMAP: a link to their web settings. Google scopes added by Todd in the WellGood - MAIL project; each account asks to sign in again only the first time it's used.
- Where: Settings, Out of Office (Title Case place name), the top-left menu, the tray menu, and each account's card.
- Accounts as chips with their current state (Off, On until..., Scheduled from...). Read back from Gmail and Microsoft whenever it opens, so changes made elsewhere show.
- When: "From now until I turn it off" or "Between dates". Dates are whole days and inclusive: First day away (from 00:00) and Back on (replies stop at the end of the day before). Optional times for part days. A plain sentence repeats exactly when replies start and stop. It switches itself off on the back-on date.
- Who: Everyone, My contacts only, or (Workspace/Microsoft 365) people in the organisation only; Microsoft can have a separate message for outside the organisation.
- Message: subject (Gmail), rich text with the basic formatting bar, the signature menu, "Insert back date" (kept in step if dates change), and templates (Away, Holiday, Conference, Off sick). Preview the reply before turning on.
- Extras: add an "Away" all-day event to the calendar (on by default), remind me the day before it ends, decline new invitations while away (Workspace and Microsoft 365 only).
- While on: a quiet amber bar at the top of the mail with Change and Turn off now, and a small badge on the account in the sidebar. Turning off early is one click. Gmail itself only replies to each sender once every 4 days; Help says so.
- Added 10 Nov (Todd): one default away message plus "Own message" per account (each chip says which); one main Turn on / Schedule for all ticked accounts, with an "All accounts" tick. Every native option: Gmail contacts only / organisation only (Workspace), Microsoft inside and outside messages with outside audience everyone / contacts / nobody. Decline new invitations is a user option, on by default, where the account supports it (Workspace, Microsoft 365), greyed with a note otherwise. Plane icon on away accounts.
- Bonus: "While you were away" summary on return (VIPs, questions, Cc'd); suggest out of office from all-day Holiday or Annual leave events (with suggested events); pause new-mail notifications while away (option); "Send me a test" of the auto-reply.
- AI apps CAN set it (changed 10 Nov, Todd): new tools to read and set out of office (accounts, dates, message, who). It reaches other people, so it always asks with a full preview card and can't be set to Allow. Works from Claude on this PC; from a phone only through a Claude session running on the PC (no Well Good Mail server).

**Settings, Accounts, round two (10 Nov 2026, mock-ups first, next beta):**
- One bigger card per account: an easy-to-read summary at the top (every setting on one line each, no "Mail" / "Calendar and AI" breaks), and a panel underneath that shows whichever row you click.
- Signature: a drop-down (like "WGM signature") that shows the whole signature, where you change the default. Also separate defaults for replies and forwards (for example a short one or none on forwards).
- Calendars: clicking shows that account's calendars with their switches right there, plus the "alerts from hidden calendars" choice (that setting should live here too, not only on the old Calendars section).
- AI Connection: that account's switches (Off, Ask, Allow for each thing) right there, with a link to the full AI Connection tab for everything else.
- The separate Calendars section and the account card then become one place.

**What's new log, grouped by series (10 Nov 2026, next beta):** in Settings, Updates (the update log), the current series shows each live release on its own (0.7.1, 0.7.0, and later 0.7.2), newest first. Every older series folds into one row ("0.6.x") that opens to list its releases newest to oldest, each with what changed. When 0.8 comes, the 0.7s fold up the same way. Betas never appear, only live releases.

**Noticed while testing 0.7.1 beta 1 (10 Nov):** the "ALL (Others)" folder in the sidebar wouldn't fold closed (or took a long time) while Drafts held a lot of drafts. Check folding speed with a big Drafts folder, and check nothing is pulling in more drafts than it should.

**Suggested events, asked for 10 Nov 2026 (next beta, not built yet):** a card at the top of an open email when it mentions a future date and time (like "Monday 16th November at 7.30pm, online"): the title from the subject, date and time, Online with the link if there's a Zoom, Meet or Teams link, Add to calendar (same route as invitations), Not now, and a menu with Change details and Don't suggest from this sender. Read on this computer with a date-reading library, no AI or server. Only from people (not newsletters or receipts) and only when fairly sure; the phrase it found is lightly highlighted. A switch in Settings to turn it off. Mock-up shown 10 Nov.

**Security, still to do:** the remaining low items are in the private review on Todd's computer (not in this repository).

**Design, still to do:** one height and corner for buttons, inputs and selects (30px, 7px; toolbars 26px); one page width and margin for full-page screens (AI Drafts, Scheduled, Settings).

**Next batch, agreed 9 Nov 2026 (Todd: "have a go at all the next things"):**
- Accessibility pass: keyboard only on every screen with visible focus, Windows Narrator check, contrast measured in both themes, follow Windows "show animations", Windows high contrast mode, and an Accessibility section in Settings.
- Start-up click lag: load older mail, the search index and photos even more gently.
- Out of office per account, and Add to contacts from the person card. Both need one more Google sign-in (vacation settings and contacts permission), and Microsoft too; add both to the Google project first, so it's one sign-in, not two.
- Microsoft 365 and iCloud: real testing, including an AI draft on each.
- Follow-up suggestions (see Before 1.0).
- Settings, Accounts reimagined (mock-up: list and detail like Apple Mail, or one folding card per account), with calendars, Keep mail from, AI access and out of office per account in one place.
- Appearance calmer: one Colours card (accent, account palette, unread colour as compact rows) instead of four rows of dots.
- Worth running once: a security audit (gstack cso) given the AI Connection and email rendering, and a design review pass (gstack design-review) on Settings.

- **Speed, still to look at** (from testing beta 14, 9 Nov): archive and delete are now instant; flag and read marks got the same treatment in 0.7.0 (check it). Clicks just after opening the app can still lag while older mail and the search index load and photos arrive; consider loading those even more gently. Check again with real use.

## For the next 0.7 beta

- **Out of office per account** (see below). Needs each Google and Microsoft account to sign in once more, so not started until Todd says.
- **Appearance layout pass** (9 Nov): a lot of colour dots (theme, account colours, display, unread counts). Not a problem; tidy when there's time.
- **Before live 0.7.0:** help, What's new and support pages for everything since beta 5; one tidy 0.7.0 release note; decide whether to test a Microsoft draft or say drafting is tested on Gmail.

## Released as 0.7.0 (9 Nov 2026)

Everything below from beta 1 to beta 14, plus flag and read marks showing at once (like archive and delete) and fresh demo screenshots in the README. Beta 14 checks done: archive and delete fast, dark mode B, pop-outs follow light and dark.

## Done in 0.7 beta 14

Archive and delete take the email off the list (and close it) straight away, then update the counts and the rest. Pop-out windows follow light and dark (and every other setting) when the main window changes them. Dark mode, Todd's choice: darker inset boxes for everything you type in, the formatting bar as its own lighter band, the signature matching the message. "Reset to defaults". What's new, Help and the README written for 0.7.0.

Beta 13 checks done: scheduled editing, Reset to default and per-section resets, light mode.

## Done in 0.7 beta 13

Archive, read marks, stars, junk and moving to a folder no longer wait for Gmail before the screen moves on (the pause and the spinning refresh icon); the mail list is worked out once per change instead of twice. Dark mode: the parts you type in (fields, formatting bar, message) are a lighter, raised shade on a darker card, and the signature shares that shade; the full editor's writing area is raised a little too. Appearance: a small Reset beside each section, as well as Reset to default at the top.

Beta 12 checks done: fast start, old-mail search soon after opening, no flash on a tray start, editing a scheduled email (Keep scheduled, its menu, Save and close), signature blends in, Reset to default.

## Done in 0.7 beta 12

Faster start: the last month's mail shows first, the rest of the cache loads straight after, and the search index builds in small pieces in the background instead of before anything shows. Archive, delete and read marks answer sooner: the list updates first and the sidebar counts follow, and the taskbar number counts once after a burst of changes. The window starts hidden and only shows when you open the app, so starts in the tray (sign in, a scheduled send) no longer flash it. Editing a scheduled email keeps it scheduled: a "Scheduled for ..." line on top, Keep scheduled (top and bottom, and Ctrl+Enter), with Send now, Change time and Back to drafts in its menu; throwing away changes leaves it scheduled as it was. Signature in dark mode blends in (no dark box). Settings, Appearance: Reset to default (one Undo step; account colours unchanged).

Beta 11 checks done: signature menu, Gmail drafts with signatures, Send later picker, Back to drafts, closed-app scheduled send.

## Done in 0.7 beta 11

Signature choice in every editor, at the right end of the formatting bar as in Apple Mail (the From address's own, any other address's, or None); drafts brought in from Gmail get the signature as normal (the old "already ends with your name" guess is gone). AI Drafts cards: a basic formatting bar (bold, italic, underline, lists, link, clear) with the signature at its end and a preview of it under the message; replies are editable, with the earlier emails folded away and kept as they were; long lines wrap. The lag: the draft sync now builds one index instead of searching all mail for each draft (it ran every two minutes and on every return to the window), and names are remembered instead of rereading all mail. Send later picker: the warning takes the date line's place, typed times count straight away, about a minute ahead is fine, and the time wheel carries over midnight and the hour. "Back to drafts" instead of "Don't send".

Beta 10 checks done: the open card, Cc, autosave, Open in editor, tick target, Don't ask again, Scheduled screen and viewer, scheduled sends while open, Ctrl+Z on sliders, account names.

## Done in 0.7 beta 10

AI Drafts: an open card shrinks to one line on top and becomes a small editor (From drop-down, To chips with person cards, Cc/Bcc, Subject, the message in its own box) that saves by itself a moment after you stop typing or when it closes, with a "Saved" note; the list keeps its order while a card is open; the tick box's target is the whole left strip; Delete asks at once; names worked out once per mail change (the lag); labels on Gmail no longer hold up saving (Edit first opens sooner). Questions before something undoable say "You can still undo this." with "Don't ask again" (deleting drafts, groups, Smart Mailboxes). Ctrl+Z after a slider, switch or button undoes it, and still undoes typing in a text box. Account names save after a pause. Names on approval cards open the person card. Scheduled: a sidebar item with a count, a screen listing every scheduled email, and a pop-up to read one with Change time, Open in editor and Don't send (also from AI Drafts). New Send later picker (filled in with an hour from now, typed or picked date and time, calendar, a time that scrolls past a fixed highlight, Schedule button), used everywhere. Scheduled email when the app is closed: Windows starts Well Good Mail at the send time and wakes the PC from sleep (a scheduled task, removed once sent or cancelled), switchable in Settings, Writing ("Wait until Well Good Mail is open").

Beta 9 checks done: cards, tick and selection bar, Edit first, sign-off swap, Send later and Cancel, card waits while typing, paused request and Not now.

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

- **Follow-up suggestions** (9 Nov 2026, idea): sent emails with no reply after a few days come back to the top of the Inbox with a slightly different look and a "Follow up?" label (Reply, Snooze, Dismiss), like Gmail's nudges. Off by default, days chosen in Settings. Builds on the follow-up reminders that already exist in the editor. Later, an AI app could draft the follow-up into AI Drafts.

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
