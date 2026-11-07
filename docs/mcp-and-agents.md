# AI connection (MCP) and helper agents: plan

Status: planning and groundwork only. Nothing here is switched on, shipped or released. Branch `mcp-prep`.

## Part 1. Letting your own AI use Well Good Mail

The idea: Well Good Mail offers a small local connection (MCP). You add it once to Claude Desktop or Claude Code (or another AI app that supports MCP). The AI then sees Well Good Mail's tools across every account in the app, including iCloud, Microsoft and other IMAP accounts. Your existing AI subscription does the thinking. The app has no AI inside it and no AI bill.

### How it would be built

1. **Bridge inside the app (Rust).** A listener that accepts connections only from this computer (127.0.0.1), only with a secret token made when you switch the connection on. No token, no answer. Port and token are shown in Settings.
2. **Handlers in the app (TypeScript).** The mail logic already lives in the app's JavaScript, so each tool is a small function that calls the same code the buttons use. Every call first asks `decide()` in `src/lib/mcp/permissions.ts`.
3. **A tiny launcher.** What Claude Desktop starts: a short script that passes MCP messages to the bridge. Settings gets a "Copy the setup line" button so adding it is one paste.
4. **An approval card inside the app** for anything set to Ask. It shows what will happen and to whom, with Allow and Refuse. If the app is closed or you are away, an Ask is refused after a short wait.
5. **An activity log** in Settings: plain words, newest first ("Searched mail for 'invoice'", "Wrote a draft 'Re: Quote'").

Done so far (this branch): the rulebook (`permissions.ts`), the tool list (`tools.ts`), and tests. Not yet: the bridge, handlers, launcher, Settings screen, approval card, log.

Rust note: there is no Rust toolchain on the build computer, so the bridge can only be checked by the GitHub build. Keep it small.

### Permission options

Each has three settings: **Off**, **Ask** (the app shows you first) and **Allow** (goes ahead, and is logged). Each account is shared or not, separately.

| Group | Switch | Starts as | Highest it can go |
| --- | --- | --- | --- |
| Looking | See accounts and folders | Allow | Allow |
| | Search mail (sender, subject, preview) | Allow | Allow |
| | Read emails | Ask | Allow |
| | Read attachments | Off | Allow |
| | See calendar and reminders | Allow | Allow |
| | See contacts | Ask | Allow |
| Tidying (stays on your computer, can be undone) | Write drafts (never sent) | Allow | Allow |
| | Mark read, unread, flagged | Ask | Allow |
| | Archive, move, label | Ask | Allow |
| | Snooze and follow up | Ask | Allow |
| | Make reminders | Ask | Allow |
| | Move to Bin (recoverable) | Off | Allow |
| Calendar | Answer invitations (Yes, No, Maybe) | Ask | **Ask** |
| | Add an invitation to your calendar | Ask | Allow |
| Reaches other people | Send email | Off | **Ask** |
| | Forward to someone else | Off | **Ask** |

Extra controls: connection off by default; a time limit ("allow for 2 hours"); a limit on actions per minute; an Off button that cuts the connection at once; read-only mode in one click.

**Never available, whatever the switches say:** delete for good or empty the Bin; add, remove or change accounts, sign ins or how an account connects; see passwords, keys or tokens; change these permissions or turn the connection wider; install updates or change how the app updates; switch off the picture and tracker protections; export or back up the whole mailbox.

### Guard rails that stay in the code

- Anything that leaves the computer (send, forward, answer an invitation) can never be set above Ask. This is enforced in code and in tests, so a hand-edited settings file cannot get round it.
- Text from emails is untrusted. Tool descriptions tell the AI so, and no instruction found inside an email can raise a permission or skip an approval.
- The approval card shows the real recipients and the whole message, from the app, not from the AI's wording.
- Connection settings can only be changed by a person using the app, never through the connection.

## Part 2. Helper agents that look after the app

Principle: agents prepare work, a person approves and releases it.

### Lanes

**Runs on its own, as a pull request on a branch** (checks first: typecheck, tests, the GitHub build):
- weekly dependency updates;
- small bug fixes that come with a test;
- a weekly list of suggestions: from GitHub issues, anything emailed to support, and what is new in the AI and mail world.

**Needs Todd's yes before it starts:**
- any new feature;
- anything touching sign in, sending, deleting, or what the app asks Google or Microsoft for;
- every release, beta or stable.

**Never touched by an agent:** the update signing key, the Google and Microsoft app keys, publishing a stable version, merging to `main`.

### Beta releases

- An agent may build and publish a beta from a branch it has prepared, but only **one beta at a time**.
- It stops after publishing and waits for Todd's approval before it starts the next one.
- Betas never reach people automatically (the update feed ignores pre-releases).

### Setting it up (not done yet; needs Todd's yes to switch on)

1. A weekly scheduled task: reads the repo's issues and recent changes and writes the suggestions list to `docs/suggestions.md` on a branch, then opens a pull request. Nothing else.
2. GitHub Dependabot for weekly dependency pull requests.
3. A rule on GitHub that `main` can only change through a reviewed pull request that has passed the checks.
4. A written list of what the agents may and may not do, kept in this repo.

## Open decisions

- Should the app ship the launcher itself, or should people run it with `npx`?
- Where the activity log is kept, and for how long.
- Whether read-only mode is the default for a first connection.
