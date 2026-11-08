# Backlog

Things noted but not built yet. Newest first. Nothing here is promised for a date.

## For the next 0.7 beta

- **Settings, Updates is getting busy** (noted 8 Nov 2026). Split it in two: "Updates" (version, status, Check now, test version card, download in the background, tell me about test versions) and "Startup and window" (start with Windows, the close button quits, and anything else about how the app runs). The last two are not about updates.
- **AI connection, writing.** Drafts (never sent), the approval card, then tidying. See `docs/mcp-and-agents.md`.

## Later

- **Smoother installer** (noted 8 Nov 2026). Move on by itself when a step finishes (no Next or Close after the progress bar, including the step that removes the old copy), and show the licence with two choices, I accept and I do not accept, then Next. Needs our own copy of Tauri's installer template (`bundle.windows.nsis.template`), kept in step with Tauri updates. Keep Back buttons. The quiet update path skips these pages, so test both a fresh install and an update.

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
