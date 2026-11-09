# Design review, November 2026 (0.7.0)

Report only. Nothing in the app was changed. Everything below was measured in the browser demo (demo mailbox, three AI drafts and two scheduled emails added in memory for the check), in dark and light themes, at 1024 wide (the preview's normal size) and 900 wide (the smallest the real window can be, set in `tauri.conf.json`).

How the numbers were got: positions are read from the page itself (left edge, right edge, height of every control), and contrast is calculated for every piece of text against the colour actually behind it, using the WCAG AA rule (4.5 to 1 for normal text, 3 to 1 for large text). Where I say "px", it is a screen pixel at normal zoom.

Screenshots are in `docs/design-review-2026-11/`.

## Short version

- Dark mode muted grey text is fine. The grey used for small headings and hints measures 5.6 to 1, which passes. The contrast problems are elsewhere (below).
- The biggest real problem is the new email editor when it opens inside the mail window: it spills 330px off the right edge at 900 wide, and Cc and Bcc cannot be reached.
- The second biggest is Settings, Accounts at 900 wide: email addresses and the word "Connected" are cut off.
- Controls come in too many sizes and corner shapes. That is the cause of most of the "slightly off" feeling you have been spotting.

Design score: C+. Contrast and layout in the main mail view are solid. Consistency between screens is where it loses marks.

---

## Must fix

### 1. Selected email row fails contrast (All Inboxes)
Screen: All Inboxes with an email selected, dark theme. Screenshot 01.
- What: the selected row is bright blue (#3B82F6) with white text. Sender and subject (13.5px bold) measure **3.68 to 1**. The target is 4.5. In the light theme the selected row's time and preview measure 4.27 to 1.
- Why it matters: it is the row you are looking at most of the time, and white on that blue is hard to read in daylight.
- Fix: use the darker blue already used on buttons (#3473D9, 4.56 to 1) or deepen it a little (#2563EB gives about 5.2 to 1) for the selected row.

### 2. Editor opens too wide for its pane (New email in the mail window)
Screen: New email, opened inside the reading pane. Screenshots 10 and 11.
- What: at 900 wide the page scrolls sideways by **330px** (page width 1230 against a window of 900). The "From" box runs from 716 to 1128, and the Cc and Bcc buttons sit at 1136 to 1230, wholly off the screen. At 1024 wide the overflow is 206px, so it happens at the preview's normal size too. The bin (Discard draft) button at the bottom is also cut off at 900.
- Why it matters: you cannot add Cc or Bcc. Anyone with a smaller laptop window will hit this.
- Fix: let the From box shrink (it has a fixed width of about 410px), and let the Cc and Bcc buttons wrap under it or sit inside the To row on narrow panes.
- Note: when the editor opens in its own window (full editor), there is no overflow at 900. This is only the in-pane version. If the desktop app never shows the in-pane version, this drops to Should fix.

### 3. Settings, Accounts is cramped at 900 wide
Screen: Settings, Accounts, 900 wide, either theme. Screenshot 03.
- What: each account row is a 170px name box, then an information column squeezed to **114px**, then 223px of buttons. Result: "alex@studio.ex…", "alex.personal@…" and "Connecte…". The row looks fine at 1280 (info column 380px wide), so it is easy to miss.
- Why it matters: this is the page you are about to redesign, and the email address is the one thing that must not be cut off.
- Fix for the redesign: with the Apple Mail style list on the left and detail on the right, the address gets its own line in the detail pane at full width. In the list, show name and a short status only.

### 4. White text on the selected "Allow" button (AI Connection)
Screen: Settings, AI Connection, both themes. Screenshot 06.
- What: the selected option (Allow) in the Off, Ask, Allow switches is white 11.9px text on blue, **3.68 to 1**, repeated five times.
- Fix: same darker blue as item 1.

### 5. Signature link in the dark editor (corrected: not a real failure)
My first measurement said 2.82 to 1. That ignored the colour flip the app applies to signatures in dark mode, so the figure was wrong. By eye the link is readable but a little dim. Moved to nice to have.

---

## Should fix

### 6. Too many control heights and corner radii
Measured across Settings, AI Drafts and the editor:
- Buttons: 30px high with 7px corners (most), 34px with 8px corners (colour palette tiles), 25px (the Off / Ask / Allow switches), 26px (editor toolbar and the Composing template toolbar), 28px (inputs and select boxes), 24px (AI Drafts icon buttons).
- Cards: 10px corners. Inputs: 0, 5, 6 or 7px depending on where.
- Why it matters: when a button and a text box sit side by side at different heights, your eye reads it as a mistake. This is the most likely source of "alignment" itches.
- Fix: pick one control height (30px) and one corner (7px) for buttons, inputs and selects. Keep a single smaller size (26px) only for toolbars. This is also a good moment to do it, because the Settings redesign will touch all of them.

### 7. Left and right edges inside the editor do not line up
Screen: New email (own window, 900 wide) and the AI Drafts open card. Screenshots 08 and 11.
- Left edges in the editor window: toolbar at 8px, From, To and Subject labels at 12px, message text at 16px. Three different left edges within 8px.
- Right edges in an open AI Drafts card: Subject box and editor at 933, Cc and Bcc at 941, "Delete draft" and "Add to group" at 946. Three different right edges within 13px.
- From box starts 16px further right than the To and Subject boxes (From at 94px, To at 78px, because of the colour dot) and stops at 554px while To runs to 888px.
- Fix: one inner margin for the whole editor (say 12px), and give the From box the full width with the colour dot inside it.

### 8. The Composing tab is called "Fonts & writing" inside
Screen: Settings, Composing. Screenshot 05.
- What: the list says "Composing" but the page heading is "Fonts & writing". Same oddity does not happen on other tabs.
- Fix: make the heading match, or rename the tab. Since this holds fonts, sending, signatures and templates, a better name for both may be "Writing".

### 9. Page headings jump between Settings tabs
- Appearance puts its heading at 117px from the top; every other tab is at 114px. A 3px jump when you click between tabs.
- Fix: same top spacing on every tab (probably a leftover margin on the Appearance page).

### 10. Content width and left margin differ between screens
- Settings cards run 248 to 1008 and text inside starts at 267. AI Drafts and Scheduled start at 289 and end at 976 to 981. At 1280 wide the AI Drafts and Scheduled lists are centred in a narrower column than Settings.
- Why it matters: moving from Scheduled to Settings makes the page edge shift by about 40px.
- Fix: one page width and margin for all full-page screens.

### 11. Other low contrast text
| Where | What | Measured | Fix |
|---|---|---|---|
| AI Drafts card | "Add to group" 11.5px | 3.47 to 1 (4.09 on some rows) | lighten the grey |
| AI Drafts open card | "Delete draft" red 13.5px | 4.09 to 1 | lighter red in dark mode |
| Settings, Composing | "Show all hidden items" link | 4.38 to 1 dark, **3.27 to 1** light | use the main link colour |
| Sidebar, light theme | "Favourites" and other 11px headings | 4.42 to 1 | a shade darker |
| Sidebar, light theme | "New Smart Mailbox" | 3.68 to 1 | it is dimmed to 55 per cent; dim less |
| Message list, light theme | time and preview on selected row | 4.27 to 1 | covered by item 1 |
- The white-on-blue button text (New email, Send, Add account, banner) measures 4.56 to 1. That passes, but only just. Deepening the blue a touch would give more room.

### 12. Send and Save & close shown twice in the editor
- In the in-pane editor the Send and "Save & close" buttons appear both at the top and at the bottom. At 900 wide the top pair wraps onto two rows and takes space. Keep one set (the bottom one, next to the follow-up choice).

---

## Nice to have

- **Updates label.** In the Settings list, "UPDATES" is in capitals and bold while every other item is normal weight with a capital first letter. It looks like a different kind of control. Make it a normal item with the attention dot.
- **Three dots.** Several places use three full stops ("Set up with a different key...", "Syncing...", "Version ...") where the single ellipsis character is neater and cannot split across lines.
- **Title Case and sentence case.** I found no clear breaks of your rule. Place names (Accounts, AI Drafts, No Group, Inbox Groups) are Title Case and buttons (Add account, Open in editor, Resync, New group) are sentence case. "New group" and "No Group" next to each other in AI Drafts look inconsistent but follow the rule (one is a button, one a name).
- **Empty group chips.** AI Drafts shows Clients 0, Prospects 0, Personal 0, Admin 0 along with the real ones. With three drafts the row is mostly zeros and wraps at 1024. Hide groups that are empty unless you are filtering.
- **Preview text.** AI Drafts previews read "...Bringing the bibs. All the best," because the sign-off is part of the body. Trim a trailing sign-off from the preview line.
- **Sidebar repeats.** All Inboxes, Important and Flagged appear twice (under Favourites and under Mailboxes), and both "All Inboxes" rows are highlighted when one is selected. That is normal Apple Mail behaviour, but it is the noisiest part of the sidebar.
- **AI Connection empty state.** The Accounts box says "Add an account first" although five demo accounts exist. Probably demo mode only, but worth checking with a real account.
- **Small tap targets.** Icon buttons are 24 to 32px. Fine with a mouse; they will matter if a touch screen is ever supported.
- **Colour dot button** is 2px left of the text column above it (265 against 267). Trivial; fix while redesigning Accounts.
- **Appearance page scroll.** Appearance is 2064px tall in a 708px window (three screens of scrolling). The theme, account colours, fonts and layout could be tabs or sections to jump to.

---

## Fixed afterwards (not committed)

Checked in the browser at 900 wide, dark and light, and the type check passes.
- Selected email row and the Allow switch now use the button blue (item 1 and 4). Light theme selected row text darkened.
- New email editor no longer overflows: Cc and Bcc show at 900 wide, page width 900 (item 2).
- Settings page headings now match the tab names in Title Case: Signatures & Addresses, Inbox Groups, Composing, Search & Storage, Keyboard Shortcuts (item 8).
- Appearance heading no longer 3px lower than the others (item 9).
- Small greys: "Add to group", "Delete draft", the dimmed New Smart Mailbox, and light-theme sidebar headings now pass or are closer (item 11).

Left for later: control heights and corners (item 6), editor edge alignment (7), page widths (10), duplicate Send buttons (12), and Accounts at 900 wide (3), which belongs with the Settings redesign.

## What is good

- Dark mode greys pass AA everywhere I measured, with margin (5.6 to 1 for small headings).
- No horizontal overflow at 900 wide on Mail, Settings (all tabs), Scheduled or the separate editor window.
- Spacing in mail list rows is consistent, and the account stripe on the left is a good quiet signal.
- Settings tab list, cards and hints share one rhythm; this is a solid base for the redesign.
- Button wording is specific and in the right case.

## For the Settings redesign (Accounts, Appearance)

1. Decide the control height and corner radius first (item 6); the redesign then comes out aligned without effort.
2. Accounts: list left, detail right. The address, status, sync and Remove go in the detail. Test it at 900 wide with a long address.
3. Appearance: break up the 2064px page. Theme and account colours matter most; fonts and layout can sit under their own headings.
4. Use one blue for selected states and primary buttons that passes 4.5 to 1 with white text.

## What I did not cover

- Real accounts (the preview is demo mode only), the desktop window chrome, and the setup guide.
- Pop-out message windows, dialogs and menus.
- The AI Drafts empty-group wrap was seen at 1024 only.
- Screenshots in this folder are cropped to the preview window and some are dark theme only; light theme was checked by measurement for every Settings tab, Mail and Scheduled, and by screenshot for Accounts at 900.
