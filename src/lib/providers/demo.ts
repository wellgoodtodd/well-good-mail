// Demo mode: pretend accounts and emails so the whole app can be tried and
// tested without signing in to anything. Nothing leaves the computer.
import type { Task, TaskList, TaskPatch, Account, Address, Alias, CalendarEvent, EventCopy, EventPatch, Folder, GuestAnswer, Message, OutgoingMessage, SystemFolder } from '../types';
import type { Rsvp } from '../invites';
import type { MailProvider, MessageBody, SyncResult } from './provider';
import type { AutoReply } from '../ooo';
import { htmlToText } from '../mime';

const SYSTEM: Record<SystemFolder, string | null> = {
  inbox: 'INBOX', sent: 'SENT', drafts: 'DRAFT', junk: 'SPAM', bin: 'TRASH', flagged: 'STARRED', archive: null,
};

export const DEMO_ACCOUNTS: Omit<Account, 'order' | 'status' | 'retentionDays' | 'notify'>[] = [
  {
    id: 'demo-wgm', kind: 'demo', email: 'alex@studio.example', label: 'Studio', displayName: 'Alex Morgan', colour: '#3B82F6',
    aliases: [
      { email: 'alex@studio.example', name: 'Alex Morgan', isDefault: true, providerSignatureHtml: '<p><b>Alex Morgan</b><br>Founder &amp; Creative Director, Studio<br><a href="https://studio.example">studio.example</a></p>' },
      { email: 'accounts@studio.example', name: 'Studio Accounts', isDefault: false, providerSignatureHtml: '<p>Studio Ltd<br>Accounts</p>' },
      { email: 'hello@studio.example', name: 'Studio', isDefault: false },
    ],
  },
  {
    id: 'demo-personal', kind: 'demo', email: 'alex.personal@example.com', label: 'Personal', displayName: 'Alex Morgan', colour: '#F59E0B',
    aliases: [{ email: 'alex.personal@example.com', name: 'Alex Morgan', isDefault: true }],
  },
  {
    id: 'demo-prompter', kind: 'demo', email: 'alex@prompter.example', label: 'Teleprompter app', displayName: 'Alex Morgan', colour: '#10B981',
    aliases: [
      { email: 'alex@prompter.example', name: 'Alex Morgan', isDefault: true },
      { email: 'support@teleprompter.example', name: 'Teleprompter Support', isDefault: false },
    ],
  },
  {
    id: 'demo-church', kind: 'demo', email: 'alex.club@example.com', label: 'Club', displayName: 'Alex Morgan', colour: '#A855F7',
    aliases: [{ email: 'alex.club@example.com', name: 'Alex Morgan', isDefault: true }],
  },
  {
    id: 'demo-old', kind: 'demo', email: 'alex.old@example.com', label: 'Old Gmail', displayName: 'Alex Morgan', colour: '#EF4444',
    aliases: [{ email: 'alex.old@example.com', name: 'Alex Morgan', isDefault: true }],
  },
];

const H = 3600000;
const D = 24 * H;

// A small grey PNG used as a pretend photo attachment.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAACYOFbKAAAAPklEQVR4nO3PQQ0AIAzAQMC/5+ECOtEjp' +
  'Z7U3QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+YwBkAAH0EW1LAAAAAElFTkSuQmCC';

interface Seed {
  acc: string;
  from: Address;
  to?: Address[];
  cc?: Address[];
  subject: string;
  html: string;
  ago: number;
  labels: string[];
  thread?: string;
  attach?: { filename: string; mimeType: string; size: number }[];
  unsub?: boolean;
  deliveredTo?: string;
}

const me = (email: string): Address => ({ name: 'Alex Morgan', email });

const SEEDS: Seed[] = [
  {
    acc: 'demo-wgm', from: { name: 'Isla Grant', email: 'isla@glencorrie.example' }, to: [me('alex@studio.example')], cc: [{ name: 'Ruaridh Bell', email: 'ruaridh@glencorrie.example' }],
    subject: 'Brand film: rough cut thoughts', thread: 't-isla', ago: 0.4 * H, labels: ['INBOX', 'UNREAD', 'IMPORTANT'],
    html: '<p>Hi Alex,</p><p>Watched it twice with the team and we are thrilled. A couple of small notes on the opening sequence and the music bed, nothing major.</p><p>I have marked the frame we would love as the thumbnail below.</p><p><img src="https://images.example.com/frame-0412.jpg" width="560" alt="Thumbnail frame"></p><p>Thanks so much,<br>Isla</p>',
  },
  {
    acc: 'demo-wgm', from: me('alex@studio.example'), to: [{ name: 'Isla Grant', email: 'isla@glencorrie.example' }],
    subject: 'Re: Brand film: rough cut thoughts', thread: 't-isla', ago: 1.2 * D, labels: ['SENT'],
    html: '<p>Hi Isla,</p><p>Rough cut is up on the review link now. Let me know what you think once the team has had a look.</p><p>Cheers,<br>Alex</p>',
  },
  {
    acc: 'demo-wgm', from: { name: 'Isla Grant', email: 'isla@glencorrie.example' }, to: [me('alex@studio.example')],
    subject: 'Brand film: rough cut thoughts', thread: 't-isla', ago: 2 * D, labels: ['INBOX'],
    html: '<p>Hi Alex, any update on the rough cut? No rush, just keen to see it!</p><p>Isla</p>',
  },
  {
    acc: 'demo-wgm', from: { name: 'Ledger & Co', email: 'hello@ledgerco.example' }, to: [{ email: 'accounts@studio.example' }], deliveredTo: 'accounts@studio.example',
    subject: 'Q3 VAT return ready to review', ago: 2.5 * H, labels: ['INBOX', 'UNREAD'],
    html: '<p>Hi Alex,</p><p>Your VAT return for the quarter is ready. Please review and approve by Friday so we can submit in good time.</p><p>Kind regards,<br>Ledger &amp; Co</p>',
    attach: [{ filename: 'VAT-return-Q3.pdf', mimeType: 'application/pdf', size: 184320 }],
  },
  {
    acc: 'demo-wgm', from: { name: 'Euan Baird', email: 'euan@northlight.example' }, to: [{ email: 'hello@studio.example' }], deliveredTo: 'hello@studio.example',
    subject: 'Quote request: event coverage in March', ago: 1.8 * D, labels: ['INBOX'],
    html: '<p>Hi there,</p><p>We have a two day conference at the SEC in March and would love to chat about coverage and a highlights film. Could you send over rough pricing?</p><p>Best,<br>Euan</p>',
  },
  {
    acc: 'demo-wgm', from: { name: 'Frame.io', email: 'no-reply@frame.example' }, to: [me('alex@studio.example')],
    subject: '3 new comments on Anthem_v4', ago: 20 * H, labels: ['INBOX'],
    html: '<table width="100%" style="font-family:Arial"><tr><td><img src="https://track.example.com/open.gif?u=123" width="1" height="1"><h2>Isla Grant left 3 comments</h2><p>on <b>Anthem_v4.mp4</b></p><p><a href="https://app.frame.example/review/abc">Open review</a></p></td></tr></table>',
  },
  {
    acc: 'demo-wgm', from: { name: 'Kit Newsletter', email: 'news@creatorweekly.example' }, to: [me('alex@studio.example')],
    subject: 'Five lighting setups for small spaces', ago: 3 * D, labels: ['INBOX'], unsub: true,
    html: '<div style="max-width:600px;margin:auto;font-family:Georgia"><img src="https://cdn.creatorweekly.example/header.png" width="600" alt="Creator Weekly"><h1>Five lighting setups for small spaces</h1><p>This week we look at getting a cinematic look in a box room.</p><p><a href="https://click.creatorweekly.example/r?id=1&amp;url=https://creatorweekly.example/lighting">Read the article</a></p><img src="https://pixel.creatorweekly.example/o.gif" width="1" height="1"><p style="font-size:11px;color:#888"><a href="https://creatorweekly.example/unsubscribe">Unsubscribe</a></p></div>',
  },
  {
    acc: 'demo-wgm', from: { name: 'Suspicious Sender', email: 'security@paypa1-alerts.example' }, to: [me('alex@studio.example')],
    subject: 'Your account has been limited', ago: 4 * H, labels: ['SPAM'],
    html: '<p>Please verify your details: <a href="https://paypa1-alerts.example/login">https://www.paypal.com/verify</a></p>',
  },
  {
    acc: 'demo-wgm', from: me('alex@studio.example'), to: [{ name: 'Euan Baird', email: 'euan@northlight.example' }],
    subject: 'Re: Previous quote', ago: 6 * D, labels: ['SENT'],
    html: '<p>Hi Euan, here is the quote we discussed.</p>',
  },
  {
    acc: 'demo-wgm', from: { name: 'Calum Reid', email: 'calum@thewell.example' }, to: [me('alex@studio.example')],
    subject: 'Board meeting papers', ago: 5 * D, labels: [], attach: [{ filename: 'Agenda.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 48210 }, { filename: 'Budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 22140 }],
    html: '<p>Hi Alex, papers for next week attached. Archived for reference.</p>',
  },
  {
    acc: 'demo-personal', from: { name: 'Jamie Ross', email: 'jamie.ross@gmail.example' }, to: [me('alex.personal@example.com')],
    subject: 'Five a side on Thursday?', ago: 1.5 * H, labels: ['INBOX', 'UNREAD'],
    html: '<p>We are a man down this week. Fancy it? Same pitch, 7pm kick off.</p><p>J</p>',
  },
  {
    acc: 'demo-personal', from: { name: 'Royal Mail', email: 'no-reply@royalmail.example' }, to: [me('alex.personal@example.com')],
    subject: 'Your parcel is on its way', ago: 2.2 * D, labels: ['INBOX'],
    html: '<p><img src="https://royalmail.example/logo.png" alt="Royal Mail"></p><p>Your item will be delivered today between 10:00 and 14:00.</p>',
  },
  {
    acc: 'demo-personal', from: { name: 'Mum', email: 'mum@family.example' }, to: [me('alex.personal@example.com')],
    subject: 'Photos from Sunday', ago: 1.1 * D, labels: ['INBOX', 'STARRED'], attach: [{ filename: 'IMG_2041.png', mimeType: 'image/png', size: 2310000 }],
    html: '<p>Lovely to see you all. A few photos attached x</p>',
  },
  {
    acc: 'demo-prompter', from: { name: 'App Store Connect', email: 'no-reply@apple.example' }, to: [me('alex@prompter.example')],
    subject: 'Your build has finished processing', ago: 7 * H, labels: ['INBOX', 'UNREAD'],
    html: '<p>Build 1.0 (14) for your teleprompter app has completed processing and is ready for testing.</p>',
  },
  {
    acc: 'demo-prompter', from: { name: 'Priya Shah', email: 'priya@beta.example' }, to: [{ email: 'support@teleprompter.example' }], deliveredTo: 'support@teleprompter.example',
    subject: 'Scroll speed feedback', ago: 1.4 * D, labels: ['INBOX'],
    html: '<p>Hi! Loving the beta. The scroll speed jumps a bit between 3 and 4, could it be smoother?</p><p>Priya</p>',
  },
  {
    acc: 'demo-church', from: { name: 'Kirsty Mair', email: 'kirsty@church.example' }, to: [me('alex.club@example.com')],
    subject: 'Sunday service clips for socials', ago: 22 * H, labels: ['INBOX', 'UNREAD'],
    html: '<p>Hi Alex,</p><p>Here are the three moments we flagged from Sunday. Could we get vertical cuts by Wednesday?</p><p>Thanks,<br>Kirsty</p>',
  },
  {
    acc: 'demo-church', from: { name: 'Rota', email: 'rota@church.example' }, to: [me('alex.club@example.com')],
    subject: 'Tech team rota: November', ago: 4 * D, labels: ['INBOX'], unsub: true,
    html: '<p>You are on sound on the 9th and 23rd.</p>',
  },
  {
    acc: 'demo-old', from: { name: 'Old Forum', email: 'digest@forum.example' }, to: [me('alex.old@example.com')],
    subject: 'Weekly digest', ago: 6 * D, labels: ['INBOX'], unsub: true,
    html: '<p>12 new posts in the cameras section.</p>',
  },
  {
    acc: 'demo-old', from: { name: 'Lottery Winner', email: 'win@prize.example' }, to: [me('alex.old@example.com')],
    subject: 'You have won!!!', ago: 1 * D, labels: ['SPAM'],
    html: '<p>Claim now.</p>',
  },
];

// Pretend new mail that turns up while the app is open.
const ARRIVALS: Seed[] = [
  {
    acc: 'demo-wgm', from: { name: 'Isla Grant', email: 'isla@glencorrie.example' }, to: [me('alex@studio.example')],
    subject: 'Re: Brand film: one more thing', ago: 0, labels: ['INBOX', 'UNREAD'],
    html: '<p>Sorry, one more thing: could we see a version without the voiceover in the first 10 seconds?</p><p>Isla</p>',
  },
  {
    acc: 'demo-personal', from: { name: 'Jamie Ross', email: 'jamie.ross@gmail.example' }, to: [me('alex.personal@example.com')],
    subject: 'Re: Five a side on Thursday?', ago: 0, labels: ['INBOX', 'UNREAD'],
    html: '<p>Brilliant, see you there.</p>',
  },
];

interface DemoState {
  messages: Map<string, Message>;
  bodies: Map<string, MessageBody>;
  serial: number;
  lastArrival: number;
  arrivals: number;
  /** Sent messages waiting to show up on the next sync, like Gmail's history. */
  pending: Message[];
}

let state: DemoState | null = null;

function seedToMessage(s: Seed, i: number, now: number): [Message, MessageBody] {
  const providerId = `m${i}`;
  const id = `${s.acc}|${providerId}`;
  const attachments = (s.attach || []).map((a, n) => ({ id: `att${n}`, filename: a.filename, mimeType: a.mimeType, size: a.size, inline: false }));
  const text = htmlToText(s.html);
  const msg: Message = {
    id, accountId: s.acc, providerId, threadId: s.thread || `t${i}`, labels: s.labels,
    from: s.from, to: s.to || [], cc: s.cc || [], bcc: [], deliveredTo: s.deliveredTo,
    subject: s.subject, snippet: text.slice(0, 140), date: now - s.ago,
    unread: s.labels.includes('UNREAD'), flagged: s.labels.includes('STARRED'), isDraft: false,
    hasAttachments: attachments.length > 0, attachments, bodyHtml: s.html, bodyText: text, bodyLoaded: true,
    messageIdHeader: `<${providerId}@demo>`,
    listUnsubscribe: s.unsub ? '<https://example.com/unsubscribe>, <mailto:unsubscribe@example.com>' : undefined,
    listUnsubscribePost: s.unsub,
  };
  return [msg, { html: s.html, text, attachments }];
}

function getState(): DemoState {
  if (!state) {
    const now = Date.now();
    const messages = new Map<string, Message>();
    const bodies = new Map<string, MessageBody>();
    SEEDS.forEach((s, i) => {
      const [m, b] = seedToMessage(s, i, now);
      messages.set(m.id, m);
      bodies.set(m.id, b);
    });
    state = { messages, bodies, serial: SEEDS.length, lastArrival: now, arrivals: 0, pending: [] };
  }
  return state;
}

export function resetDemo() {
  state = null;
}


/** Demo task lists and tasks, kept until the page reloads. */
const demoTasks = new Map<string, { lists: TaskList[]; tasks: Task[] }>();
function demoTaskData(accountId: string) {
  let d = demoTasks.get(accountId);
  if (d) return d;
  const day = (n: number, h?: number, m = 0) => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + n); if (h !== undefined) x.setHours(h, m); return x.getTime(); };
  const seeds: Record<string, { lists: string[]; tasks: [number, string, number | undefined, number | undefined, boolean?][] }> = {
    'demo-wgm': { lists: ['My Tasks', 'Studio', 'Podcast'], tasks: [
      [1, 'Back up the SD cards from Thursday', 0, undefined], [0, 'Send the venue deposit for the March shoot', 0, 14],
      [2, 'Approve the episode 42 thumbnail', 0, undefined], [1, 'Send the call sheet to the crew', 0, undefined, true],
      [1, 'Book the van for the January shoot', 6, undefined], [0, 'Ring the dentist', 7, 15], [2, 'Look into a second microphone', undefined, undefined],
      [0, 'Chase the October invoice', -2, undefined], [1, 'Pick up the lights from hire', 1, 10],
    ] },
    'demo-personal': { lists: ['Home', 'Shopping'], tasks: [
      [0, 'Renew the car insurance', -2, undefined], [1, 'Oat milk, coffee beans, bin bags', undefined, undefined], [0, 'Water the plants', 2, undefined],
    ] },
  };
  const seed = seeds[accountId] || { lists: ['Tasks'], tasks: [] };
  const lists = seed.lists.map((name, n) => ({ id: `${accountId}|list${n}`, accountId, providerId: `list${n}`, name }));
  let k = 0;
  const tasks = seed.tasks.map(([li, title, dueDay, hour, done]) => {
    const due = dueDay === undefined ? undefined : day(dueDay, hour, hour === 14 ? 0 : 30 * (hour ? 0 : 0));
    const list = lists[li] || lists[0];
    k += 1;
    return { id: `${list.id}|t${k}`, accountId, listId: list.id, providerId: `t${k}`, title, due, hasTime: hour !== undefined, done: Boolean(done), completedAt: done ? Date.now() - 3600000 * 2 : undefined } as Task;
  });
  d = { lists, tasks };
  demoTasks.set(accountId, d);
  return d;
}

const demoReplies = new Map<string, AutoReply>();

export class DemoProvider implements MailProvider {
  constructor(public readonly account: Account) {}

  async getAutoReply(): Promise<AutoReply> {
    await new Promise((r) => setTimeout(r, 250));
    return demoReplies.get(this.account.id) || { on: false, html: '', subject: '', audience: 'all' };
  }

  async setAutoReply(r: AutoReply): Promise<void> {
    await new Promise((res) => setTimeout(res, 400));
    demoReplies.set(this.account.id, { ...r });
  }


  async listTaskLists(): Promise<TaskList[]> { return [...demoTaskData(this.account.id).lists]; }
  async listTasks(list: TaskList, doneSince: number): Promise<Task[]> {
    await new Promise((r) => setTimeout(r, 150));
    return demoTaskData(this.account.id).tasks.filter((t) => t.listId === list.id && (!t.done || (t.completedAt ?? 0) >= doneSince)).map((t) => ({ ...t }));
  }
  async createTask(list: TaskList, p: TaskPatch): Promise<Task> {
    await new Promise((r) => setTimeout(r, 200));
    const id = `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const t: Task = { id: `${list.id}|${id}`, accountId: this.account.id, listId: list.id, providerId: id, title: p.title || '', notes: p.notes, due: p.due ?? undefined, hasTime: Boolean(p.hasTime && p.due), done: Boolean(p.done), mail: p.mail };
    demoTaskData(this.account.id).tasks.push(t);
    return { ...t };
  }
  async updateTask(task: Task, p: TaskPatch): Promise<Task> {
    await new Promise((r) => setTimeout(r, 200));
    const d = demoTaskData(this.account.id);
    const at = d.tasks.findIndex((x) => x.id === task.id);
    const was = at >= 0 ? d.tasks[at] : task;
    const next: Task = { ...was, ...(p.title !== undefined ? { title: p.title } : {}), ...(p.notes !== undefined ? { notes: p.notes } : {}), ...(p.mail ? { mail: p.mail } : {}),
      ...(p.due !== undefined ? { due: p.due ?? undefined, hasTime: Boolean(p.due !== null && p.hasTime) } : p.hasTime !== undefined ? { hasTime: p.hasTime } : {}),
      ...(p.done !== undefined ? { done: p.done, completedAt: p.done ? Date.now() : undefined } : {}) };
    if (at >= 0) d.tasks[at] = next; else d.tasks.push(next);
    return { ...next };
  }
  async deleteTask(task: Task): Promise<void> {
    const d = demoTaskData(this.account.id);
    d.tasks = d.tasks.filter((x) => x.id !== task.id);
  }
  async createTaskList(name: string): Promise<TaskList> {
    const d = demoTaskData(this.account.id);
    const l = { id: `${this.account.id}|list${d.lists.length}`, accountId: this.account.id, providerId: `list${d.lists.length}`, name };
    d.lists.push(l);
    return l;
  }

  async addAwayEvent(): Promise<string> { return `away-${Date.now()}`; }
  async addInviteToCalendar(): Promise<void> { await new Promise((r) => setTimeout(r, 300)); }
  async removeAwayEvent(): Promise<void> { /* nothing to remove in the demo */ }

  systemFolderId(f: SystemFolder) {
    return SYSTEM[f];
  }

  private mine() {
    return [...getState().messages.values()].filter((m) => m.accountId === this.account.id);
  }

  async listFolders(): Promise<Folder[]> {
    const base: Folder[] = [
      { id: 'INBOX', accountId: this.account.id, name: 'Inbox', system: 'inbox', unread: 0, depth: 0 },
      { id: 'DRAFT', accountId: this.account.id, name: 'Drafts', system: 'drafts', unread: 0, depth: 0 },
      { id: 'SENT', accountId: this.account.id, name: 'Sent', system: 'sent', unread: 0, depth: 0 },
      { id: 'SPAM', accountId: this.account.id, name: 'Junk', system: 'junk', unread: 0, depth: 0 },
      { id: 'TRASH', accountId: this.account.id, name: 'Bin', system: 'bin', unread: 0, depth: 0 },
      { id: 'STARRED', accountId: this.account.id, name: 'Flagged', system: 'flagged', unread: 0, depth: 0 },
    ];
    if (this.account.id === 'demo-wgm') {
      base.push(
        { id: 'Label_clients', accountId: this.account.id, name: 'Clients', unread: 0, depth: 0, colour: '#3B82F6' },
        { id: 'Label_clients_glen', accountId: this.account.id, name: 'Clients/Glen Corrie', unread: 0, depth: 1 },
        { id: 'Label_finance', accountId: this.account.id, name: 'Finance', unread: 0, depth: 0, colour: '#10B981' },
      );
    }
    return base;
  }

  async listAliases(): Promise<Alias[]> {
    return DEMO_ACCOUNTS.find((a) => a.id === this.account.id)?.aliases || [];
  }

  async fullSync(_since: number | null, onBatch: (m: Message[]) => Promise<void> | void) {
    await onBatch(this.mine().map((m) => ({ ...m })));
    return { cursor: String(Date.now()) };
  }

  async incrementalSync(): Promise<SyncResult> {
    const st = getState();
    const upserted: Message[] = st.pending.filter((m) => m.accountId === this.account.id).map((m) => ({ ...m }));
    st.pending = st.pending.filter((m) => m.accountId !== this.account.id);
    // Every couple of minutes, deliver one pretend email (two in total).
    if (st.arrivals < ARRIVALS.length && Date.now() - st.lastArrival > 90 * 1000) {
      const seed = ARRIVALS[st.arrivals];
      if (seed.acc === this.account.id) {
        const [m, b] = seedToMessage(seed, st.serial++, Date.now());
        if (seed.subject.includes('one more thing')) m.threadId = 't-isla';
        st.messages.set(m.id, m);
        st.bodies.set(m.id, b);
        st.arrivals++;
        st.lastArrival = Date.now();
        upserted.push({ ...m });
      }
    }
    return { upserted, labelChanges: [], deleted: [], cursor: String(Date.now()) };
  }

  async getBody(msg: Message): Promise<MessageBody> {
    return getState().bodies.get(msg.id) || { html: msg.bodyHtml, text: msg.bodyText, attachments: msg.attachments };
  }

  async getAttachment(msg: Message, attachmentId: string): Promise<Uint8Array> {
    const att = msg.attachments.find((a) => a.id === attachmentId);
    if (att?.mimeType === 'image/png') return Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
    if (att?.filename.endsWith('.docx')) return Uint8Array.from(atob(DOCX_B64), (c) => c.charCodeAt(0));
    return new TextEncoder().encode(`Demo attachment: ${att?.filename}\n`);
  }

  async modifyLabels(msgs: Message[], add: string[], remove: string[]) {
    const st = getState();
    for (const m of msgs) {
      const cur = st.messages.get(m.id);
      if (!cur) continue;
      cur.labels = [...new Set([...cur.labels.filter((l) => !remove.includes(l)), ...add])];
    }
  }

  async trash(msgs: Message[]) {
    await this.modifyLabels(msgs, ['TRASH'], ['INBOX']);
  }

  async untrash(msgs: Message[]) {
    await this.modifyLabels(msgs, ['INBOX'], ['TRASH']);
  }

  async send(msg: OutgoingMessage) {
    const st = getState();
    const providerId = `m${st.serial++}`;
    const threadId = msg.threadId || `t-sent-${providerId}`;
    const m: Message = {
      id: `${this.account.id}|${providerId}`, accountId: this.account.id, providerId, threadId, labels: ['SENT'],
      from: msg.from, to: msg.to, cc: msg.cc, bcc: msg.bcc, subject: msg.subject, snippet: msg.text.slice(0, 140),
      date: Date.now(), unread: false, flagged: false, isDraft: false, hasAttachments: msg.attachments.some((a) => !a.inline),
      attachments: msg.attachments.filter((a) => !a.inline).map((a, i) => ({ id: `att${i}`, filename: a.filename, mimeType: a.mimeType, size: a.data.length, inline: false })),
      bodyHtml: msg.html, bodyText: msg.text, bodyLoaded: true,
    };
    st.messages.set(m.id, m);
    st.bodies.set(m.id, { html: msg.html, text: msg.text, attachments: m.attachments });
    st.pending.push(m);
    return { providerId, threadId };
  }

  async saveDraft(_msg: OutgoingMessage, serverDraftId?: string) {
    return { draftId: serverDraftId || `d${Date.now()}` };
  }

  async deleteDraft() {}

  async searchRemote(query: string): Promise<Message[]> {
    const q = query.toLowerCase();
    return this.mine().filter((m) => (m.subject + ' ' + m.snippet + ' ' + m.from.email).toLowerCase().includes(q));
  }

  async listContacts(): Promise<Address[]> {
    const seen = new Map<string, Address>();
    for (const m of getState().messages.values()) for (const a of [m.from, ...m.to, ...m.cc]) seen.set(a.email, a);
    return [...seen.values()];
  }

  /** Demo: changes are only kept until the calendar refreshes. */
  private evEdits: Record<string, Partial<CalendarEvent> | null> = {};
  writableCalendars(): string[] { return this.account.id === 'demo-wgm' ? ['Studio', 'Shoots'] : ['Personal']; }
  async editEvent(ev: CalendarEvent, patch: EventPatch): Promise<void> {
    const { calendarName, alerts, guests, video, repeat, ...rest } = patch;
    const extra: Partial<CalendarEvent> = {};
    if (alerts !== undefined) extra.reminderMinutes = alerts;
    if (guests !== undefined) extra.guests = guests.length ? [{ email: this.account.email, self: true, organiser: true, answer: 'yes' }, ...guests.map((g) => ({ ...g, answer: (ev.guests || []).find((x) => x.email === g.email)?.answer || ('waiting' as const) }))] : undefined;
    if (video !== undefined) extra.meetingUrl = video ? 'https://meet.google.com/demo-call-xyz' : undefined;
    if (repeat !== undefined) extra.recurring = Boolean(repeat);
    this.evEdits[ev.id] = { ...(this.evEdits[ev.id] || {}), ...rest, ...extra, ...(calendarName ? { calendarName } : {}) };
  }
  async deleteEvent(ev: CalendarEvent): Promise<void> { this.evEdits[ev.id] = null; this.made = this.made.filter((e) => e.id !== ev.id); }
  /** Demo: events moved in from another account. */
  private made: CalendarEvent[] = [];
  async copyOfEvent(ev: CalendarEvent, opts: { series: boolean }): Promise<EventCopy> {
    const day = new Date(ev.start).getDay();
    return {
      title: ev.title, start: ev.start, end: ev.end, allDay: ev.allDay, location: ev.location, description: ev.description,
      guests: (ev.guests || []).filter((g) => !g.self).map((g) => ({ email: g.email, name: g.name })), video: Boolean(ev.meetingUrl),
      ...(opts.series && ev.recurring ? { repeat: { freq: 'weekly' as const, interval: 1, days: [['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][day]] } } : {}),
    };
  }
  async createEvent(calendarName: string, copy: EventCopy): Promise<string> {
    const id = `${this.account.id}|moved-${Date.now()}`;
    this.made.push({ id, accountId: this.account.id, calendarName, title: copy.title, start: copy.start, end: copy.end, allDay: copy.allDay, location: copy.location, description: copy.description, reminderMinutes: copy.alerts || [], recurring: Boolean(copy.repeat), guests: copy.guests.length ? [{ email: this.account.email, self: true, organiser: true, answer: 'yes' as const }, ...copy.guests.map((g) => ({ ...g, answer: 'waiting' as const }))] : undefined, meetingUrl: copy.video ? 'https://meet.google.com/new-demo-link' : undefined });
    return id;
  }
  async endSeries(ev: CalendarEvent): Promise<void> { this.evEdits[ev.id] = null; }

  async listEvents(): Promise<CalendarEvent[]> {
    return [...(await this.demoEvents()), ...this.invitations(), ...this.made].filter((e) => this.evEdits[e.id] !== null).map((e) => ({ ...e, ...(this.evEdits[e.id] || {}), canEdit: e.canEdit ?? true }));
  }

  /** Demo: answering an invitation just remembers the answer (until the page reloads). */
  async respondToEvent(ev: CalendarEvent, status: Rsvp): Promise<void> {
    await new Promise((r) => setTimeout(r, 250));
    const answer = status === 'accepted' ? 'yes' as const : status === 'declined' ? 'no' as const : 'maybe' as const;
    this.evEdits[ev.id] = { ...(this.evEdits[ev.id] || {}), myResponse: answer, guests: ev.guests?.map((g) => (g.self ? { ...g, answer } : g)) };
  }

  /** Demo invitations from other people: some waiting for an answer (one clashes with Edit day), one cancelled, some answered. */
  private invitations(): CalendarEvent[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const t = today.getTime();
    const me = this.account.email;
    const inv = (id: string, title: string, start: number, durH: number, cal: string, from: { email: string; name: string }, answer: GuestAnswer, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
      id: `${this.account.id}|${id}`, accountId: this.account.id, calendarName: cal, title, start, end: start + durH * H, allDay: false, reminderMinutes: [10], canEdit: false,
      organiser: { email: from.email, name: from.name },
      guests: [{ email: from.email, name: from.name, answer: 'yes', organiser: true }, { email: me, name: 'Alex Morgan', answer, self: true }, { email: 'kim@example.com', name: 'Kim Reid', answer: 'waiting' }],
      myResponse: answer,
      ...extra,
    });
    if (this.account.id === 'demo-wgm') return [
      inv('i1', 'Podcast planning', t + 2 * D + 14 * H, 1, 'Studio', { email: 'sam@morganaudio.example', name: 'Sam Morgan' }, 'waiting', { meetingUrl: 'https://meet.google.com/pod-plan-now', location: 'Google Meet' }),
      inv('i3', 'Generative AI Engineering', t + 3 * D + 14 * H, 2, 'Studio', { email: 'events@outskill.example', name: 'Outskill' }, 'waiting', { cancelled: true }),
      inv('i7', 'Quarterly review with Glen Corrie', t + 6 * D + 11 * H, 1, 'Studio', { email: 'glen@glencorrie.example', name: 'Glen Corrie' }, 'waiting', { location: 'Glen Corrie offices, Glasgow' }),
      inv('i4', 'Cut & Style', t + 13 * D + 10.75 * H, 1, 'Studio', { email: 'bookings@unitone.example', name: 'Unit One Salon' }, 'yes'),
    ];
    if (this.account.id === 'demo-personal') return [
      { ...inv('i2', "Jen's birthday", t + 9 * D, 24, 'Personal', { email: 'jen@example.com', name: 'Jen Macdonald' }, 'waiting'), allDay: true, recurring: true, repeatText: 'every year' },
      inv('i5', 'Team drinks', t + 16 * D + 18 * H, 3, 'Personal', { email: 'alex.brown@example.com', name: 'Alex Brown' }, 'no'),
    ];
    if (this.account.id === 'demo-church') return [
      inv('i6', 'Choir rehearsal', t + 5 * D + 19 * H, 1.5, 'Club', { email: 'leader@club.example', name: 'Morag Fraser' }, 'maybe'),
    ];
    return [];
  }

  private async demoEvents(): Promise<CalendarEvent[]> {
    if (this.account.id !== 'demo-wgm' && this.account.id !== 'demo-personal' && this.account.id !== 'demo-church') return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const t = today.getTime();
    const ev = (id: string, title: string, start: number, mins: number[], cal: string, durH = 1): CalendarEvent => ({
      id: `${this.account.id}|${id}`, accountId: this.account.id, calendarName: cal, title, start, end: start + durH * H, allDay: false, reminderMinutes: mins,
    });
    if (this.account.id === 'demo-wgm') {
      const soon = Date.now() + 4 * 60000;
      return [
        { ...ev('e0', 'Catch up with Euan', soon, [5], 'Studio', 0.5), start: soon, end: soon + 30 * 60000, meetingUrl: 'https://meet.google.com/abc-defg-hij', description: 'Quote for the March event and edit schedule.' },
        ev('e1', 'Send invoice to Glen Corrie', t - D + 17 * H, [0], 'Studio'),
        ev('e2', 'Call Euan about March event quote', t + 14 * H, [15], 'Studio'),
        ev('e3', 'Back up SD cards from Tuesday shoot', t + 8 * H, [0], 'Studio'),
        ev('e4', 'Edit day: Anthem v5', t + 2 * D + 9 * H, [30], 'Studio', 8),
      ];
    }
    if (this.account.id === 'demo-church') return [ev('e5', 'Content planning', t + 18.5 * H, [30], 'Club')];
    return [ev('e6', 'Pick up dry cleaning', t + 9 * H, [0], 'Personal'), { ...ev('e7', 'Bins out', t + 3 * D + 19 * H, [0], 'Personal'), recurring: true }];
  }

  async uploadLargeFile(name: string): Promise<string> {
    return `https://drive.example.com/file/${encodeURIComponent(name)}`;
  }
}

/** A tiny real Word document, so the demo can show the Word preview. */
const DOCX_B64 = 'UEsDBBQAAAAIANy+al15bjPX7AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2Qy07DMBBFf8XyFsUOLBBCcbrgsQQW5QMse5JYtWcsjxvSv0dpSxeosL6Pc3W7zZKimKFwIDTyVrVSADryAUcjP7evzYMUXC16GwnByAOw3PTd9pCBxZIispFTrflRa3YTJMuKMuCS4kAl2cqKyqizdTs7gr5r23vtCCtgberaIfvuGQa7j1W8LBXwtKNAZCmeTsaVZaTNOQZnayDUM/pflOZMUAXi0cNTyHyzpCj1VcKq/A04595nKCV4EB+21DebwEj9RcVrT26fAKv6v+bKThqG4OCSX9tyIQfMAccU1UVJNuDPfn28u/8GUEsDBBQAAAAIANy+al2b/TfqsQAAACkBAAALAAAAX3JlbHMvLnJlbHONz8FqwzAQBNBfEXuv5eQQQrDsSwjkWtwPENLaFpV2hVZNnb/PJYc49NDrMLxhumFNUd2wSGAysGtaUEiOfaDZwNd4+TiCkmrJ28iEBu4oMPTdJ0ZbA5MsIYtaUyQxsNSaT1qLWzBZaTgjrSlOXJKt0nCZdbbu286o92170OXVgK2prt5AufodqPGe8T82T1NweGb3k5DqHxNvDVCjLTNWA79cvPbPuFlTBN13enOxfwBQSwMEFAAAAAgA3L5qXRl/HKfuAAAAZQEAABEAAAB3b3JkL2RvY3VtZW50LnhtbG2QQU/DMAyF/4qV82jKkBCq2u4G4oDEAbRz1mRttMSuYndt+fUoRbALl+8dbL+n5/qwxABXl9gTNuq+KBU47Mh67Bv1+fF896SAxaA1gdA1anWsDm09V5a6KToUWGJAruZGDSJjpTV3g4uGCxodLjGcKUUjXFDq9UzJjok6x+yxj0Hvy/JRR+NRZcsT2TXrmJE2vG9y0pn8BXN1NaFRD3ul21r/zaU9uhDghcjCm/EBxLHsINGEFmSmvCo/Bxu3gFuKtK9nWGmCziAkZyzI4Bk8wpGS3YERMd2QyzKY5GCmdPHYF//Y6t8W+vah9htQSwECFAAUAAAACADcvmpdeW4z1+wAAACtAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIANy+al2b/TfqsQAAACkBAAALAAAAAAAAAAAAAACAAR0BAABfcmVscy8ucmVsc1BLAQIUABQAAAAIANy+al0Zfxyn7gAAAGUBAAARAAAAAAAAAAAAAACAAfcBAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAAAUAwAAAAA=';
