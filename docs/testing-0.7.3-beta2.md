# 0.7.3 beta 2: what to test

Beta 2 adds three new features on top of beta 1's clean-up. The beta 1 list ([testing-0.7.3-beta1.md](testing-0.7.3-beta1.md)) still applies.

## Creating events (try these on a real Google account first)

- [ ] **+ New event** (the blue button in Calendar & Reminders): type a title, press Enter. It shows straight away, then in Google Calendar on your phone.
- [ ] **Words in the title:** type "Lunch with Sam tomorrow at 1pm". The time moves to tomorrow at 13:00, and the event is saved as "Lunch with Sam".
- [ ] **Double-click** a time in Day or Week view: the pop-up starts at that half hour, and a blue placeholder shows where it will go. **Double-click** a day in Month view: it starts as an all-day event.
- [ ] **Right-click** the calendar: New event, New all-day event, Open day, Go to today.
- [ ] **Ctrl+Alt+N** from anywhere opens New event. Ctrl+N is still New email.
- [ ] **New event on [day]** in the picked-day panel starts on that day.
- [ ] **More options** grows the same card. Try each of these, then check them in Google Calendar:
  - [ ] Repeat every week, and Custom (every 2 weeks on Monday and Thursday)
  - [ ] End repeat on a date, and after 5 times
  - [ ] Alert 15 minutes before, plus a second alert
  - [ ] Location and notes
  - [ ] Add Google Meet: the link arrives after the next refresh
- [ ] **Invitees:** invite yourself on another address. The invitation email arrives from Google, and the button reads "Add and send invitations".
- [ ] **Undo** in the "added" message takes the event out again (events with invitees have no Undo, because the invitations have already gone).
- [ ] **Outlook:** one event in the Outlook calendar. Outlook keeps only one alert, and Teams links work on work accounts only.
- [ ] **Calendar list:** calendars you've hidden aren't offered, and the last calendar you used comes first next time.

## Out of Office templates

- [ ] Set up a Friday afternoon away (Friday 13:00 to Monday 09:00), then Templates › **Save as new template**. Tick whole groups, then single parts inside them.
- [ ] Change the page, then pick your template: only the ticked parts change, the dates move to the next Friday, and Undo puts everything back.
- [ ] **Manage templates:**
  - [ ] Copy Friday afternoons and rename the copy to Wednesday away.
  - [ ] Update a template from what's on the page.
  - [ ] Change what it includes.
  - [ ] Delete a template, then Undo.
- [ ] With an account on **Own message**, a template's message goes into that account's message.
- [ ] **AI apps:** ask Claude to "turn on my Holiday Out of Office template from 21 Dec to 4 Jan". The approval card shows the whole reply and the dates.

## Calendar Groups

- [ ] Calendars › **Make a Calendar Group**, for example Work with a couple of calendars from different accounts.
- [ ] Pick it: the calendar, List view, Coming up and the sidebar count all show only that group. Pick **All calendars** to see everything again.
- [ ] **Choose calendars…** goes back to All calendars and shows the usual switches.
- [ ] **Edit groups…**: rename a group, change its ticks, and delete one.
- [ ] Settings › Calendar & Reminders › **Calendar Groups**: the same list. **Only alert me from the group I'm looking at** is off; switch it on, pick Personal, and alerts from work calendars stay quiet.
- [ ] New event while Work is picked goes into a Work calendar.
- [ ] **AI apps:** switch on "Set up Calendar Groups" in AI Connection, then ask Claude to make a Personal group. It asks first.
