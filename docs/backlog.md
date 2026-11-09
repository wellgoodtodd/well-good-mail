# Backlog

Things noted but not built yet. Newest first. Nothing here is promised for a date.

## For the next 0.7 beta

- **AI draft groups on other devices** (noted 9 Nov 2026). Groups and the "written by AI" mark live on this PC only. Mirror them as Gmail labels (like "AI drafts/Clients"), which never travel with a sent email. A hidden header was ruled out: it would go out with the email when sent.
- **Test Edit first** on the approval card (not tried yet in beta 5).
- **Always allow note when an update resets a switch** to Ask: say so once, rather than quietly.

## Before 1.0

- **Smart Mailboxes (saved searches)**, agreed earlier as a pre-1.0 item, not started. Apple Mail style: a saved set of rules (from, to, words, account, unread, flagged, has attachments, date, drafted by AI) shown in the sidebar. AI draft groups could become Smart Mailboxes.
- **Add to contacts** from the person card, once contacts can be written.
- **Settings, Updates is getting busy** (noted 8 Nov 2026). Split Updates from Startup and window.
- **AI connection, tidying.** Mark read, archive, snooze, reminders, bin, then invitations and send (always ask). See `docs/mcp-and-agents.md`.

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
