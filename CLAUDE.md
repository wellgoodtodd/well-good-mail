# Well Good Mail: notes for working on the code

A Windows mail app in the style of Apple Mail: combined inboxes, calm reminders, simple. UK English in all interface text, and no em dashes.

## Stack

- Tauri 2 shell (`src-tauri/`): OAuth loopback listener, Windows Credential Manager (keyring), tray, autostart, notifications, updater, single instance.
- React 18, TypeScript and Vite (`src/`). State in zustand (`src/lib/mail.ts`, `src/lib/settings.ts`).
- Gmail, Calendar, People and Drive REST APIs through `@tauri-apps/plugin-http`. A Microsoft Graph provider exists but is untested.
- Local cache in IndexedDB (`src/lib/db.ts`), full text search with MiniSearch (`src/lib/search.ts`).
- Rich text editor: TipTap 2 (`src/components/Composer.tsx`, `editorExtensions.ts`).
- Incoming email is sanitised with DOMPurify and shown in a sandboxed iframe with no scripts (`src/lib/render.ts`, `EmailFrame.tsx`). Never render email HTML outside that path.

## Layout

- `src/lib/providers/`: the interface every account type implements (`provider.ts`), with `gmail.ts`, `microsoft.ts` and `demo.ts`.
- `src/lib/mail.ts`: sync loop and every mail action, outbox for undo send and send later.
- `src/lib/compose.ts`: drafts, reply, reply all and forward switching, building the outgoing message.
- `src/lib/mime.ts`: MIME building and parsing. Tests are in `src/lib/__tests__`.
- `src/lib/auth/google.ts`: Google sign in. The client ID and secret come from the first-run guide (`src/components/SetupGuide.tsx`) and are stored in Windows Credential Manager.
- `src/components/Sidebar.tsx`: sidebar, including user made folders.
- Pop out windows load `index.html#/popout/compose/<draftId>` or `#/popout/thread/<key>`. They share IndexedDB with the main window and talk over a BroadcastChannel named `wgm`; the main window does the actual sending.

## Commands

- `npm run dev`: browser preview at http://localhost:1420 (demo mode).
- `npm test`, `npm run typecheck`.
- `npm run tauri dev`: the desktop app.
- Releases: `node scripts/bump-version.cjs x.y.z`, push, then run the "Build Windows app" workflow. See SETUP.md.

## Known gaps

- IMAP is not implemented. Microsoft 365 is untested.
- Pictures in some forwarded Apple Mail emails still show as <IMG_1234.jpeg> notes in the text instead of the picture (they are available as attachments). A fix is in `src/lib/render.ts` and `MessageView.tsx` but did not work on a real example yet.
- Calendar is reminders only. Snooze, follow ups and mute are local to the app (Gmail has no snooze API).

## Roadmap

Microsoft 365 testing, IMAP (iCloud, Yahoo and others), a split inbox you can switch on or off, attachment search, calendar invites, saved searches, dictation.
