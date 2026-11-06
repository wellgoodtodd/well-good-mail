// Help: short how-tos and common questions. Plain text only, so it is easy to keep in step with the app.
import { Icon } from './Icon';
import { useMail, openScreen } from '../lib/mail';

const TOPICS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: 'Get started',
    items: [
      { q: 'Add another account', a: 'Settings, then Accounts, then Add Google account. Each account gets its own colour, and all of them feed into All Inboxes.' },
      { q: 'Write, reply and send', a: 'New email is top left. Replies open in the reading pane, or in their own window if you switch that on in Settings, then Sending. After Send you have a short time to undo it, set in the same place.' },
      { q: 'Save something for later', a: 'Save & close keeps an email as a draft. Closing a window on an unsent email asks whether to keep it, and can remember your answer.' },
    ],
  },
  {
    title: 'Organise',
    items: [
      { q: 'Make your own folders', a: 'Right click empty space in the sidebar and choose New folder. Drag mailboxes onto it, or right click any mailbox and choose Put in. Drag a row out of a folder to take it out again. Nothing in your mail moves.' },
      { q: 'Rename things', a: 'Right click a mailbox, account or folder and choose Rename, or click a selected one again after a short pause.' },
      { q: 'Pin favourites', a: 'Right click anything and choose Add to Favourites, or drag it into the Favourites section.' },
      { q: 'Quick actions on a message', a: 'Hover over a message and move to the small dots in its bottom right corner. The coloured buttons slide out: archive, flag, snooze, read or unread, and bin. Clicking the dots opens the same menu as a right click.' },
    ],
  },
  {
    title: 'Search and filters',
    items: [
      { q: 'Search where you are', a: 'The search box looks in the mailbox you are in. Use All mail beside the results to search everywhere.' },
      { q: 'Show only unread', a: 'The unread button above the list filters to unread mail. The button beside it groups replies into conversations or lists every message.' },
    ],
  },
  {
    title: 'Make it yours',
    items: [
      { q: 'Light and dark', a: 'The sun and moon button at the top switches between them. Settings, then Appearance, has eight colour themes (Graphite, Chocolate, Teal and more), each with its own account colours, plus fonts, density and the layout of the panes.' },
      { q: 'Account colours', a: 'Click an account\'s dot in the sidebar to choose its colour, or pick a whole palette in Settings, then Accounts.' },
      { q: 'Keyboard shortcuts', a: 'Settings, then Keyboard shortcuts, lists them all and lets you change any of them.' },
    ],
  },
  {
    title: 'Accounts and your mail',
    items: [
      { q: 'An account needs signing in again', a: 'A coral dot appears on Settings and on the account. Click Sign in beside it. Your saved mail stays where it is meanwhile.' },
      { q: 'Move your mail to another computer', a: 'Settings, then Search & storage, has Export and Import under Moving to another computer. The file holds your emails, so keep it somewhere private. You sign in to your accounts again on the new computer.' },
      { q: 'Preview or save attachments', a: 'Click an attachment to preview it, hover for a peek, or right click to save one or all of them to a folder.' },
    ],
  },
  {
    title: 'Common questions',
    items: [
      { q: 'Why does Google keep signing me out?', a: 'Until your Google project is published, Google signs you out about once a week. Settings, then Accounts, has a short guide to stop that.' },
      { q: 'Is my email stored anywhere but this computer?', a: 'No. Mail is kept on this computer and talks only to Google. Your sign-in key is in Windows Credential Manager.' },
      { q: 'Why does an email show odd symbols?', a: 'Usually the sender labelled the text wrongly. The app corrects the common case. If you still see one, tell whoever maintains the app.' },
    ],
  },
];

export function Help() {
  const accounts = useMail((s) => s.accounts);
  return (
    <div className="help-screen">
      <div className="help-inner">
        <div className="help-top">
          <button className="btn ghost" onClick={() => useMail.setState({ screen: 'mail' })}><Icon name="chevronLeft" /> Back to mail</button>
        </div>
        <h1>Help</h1>
        <p className="hint">Short answers to the things people ask most. {accounts.length ? '' : 'Add an account to get started.'}</p>
        {TOPICS.map((t) => (
          <section key={t.title} className="help-section">
            <h2>{t.title}</h2>
            {t.items.map((i) => (
              <details key={i.q} className="help-item">
                <summary>{i.q}</summary>
                <p>{i.a}</p>
              </details>
            ))}
          </section>
        ))}
        <p className="hint" style={{ marginTop: 18 }}>
          <button className="btn" onClick={() => openScreen('settings', 'accounts')}>Open Settings</button>
        </p>
      </div>
    </div>
  );
}
