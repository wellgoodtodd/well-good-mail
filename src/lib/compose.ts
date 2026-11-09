// Building drafts for new, reply, reply all and forward, and switching
// between them without losing what you've written.
import { escapeHtml, htmlToText, textToHtml, base64ToBytes } from './mime';
import type { Account, Address, Alias, ComposeMode, Draft, Message, OutgoingMessage } from './types';

export interface ComposeContext {
  accounts: Account[];
  defaultFromEmail: string;
  signatures: Record<string, string>;
  signaturePlacement: 'above' | 'below';
  /** Default writing style applied to the sent email, e.g. "font-family:Rubik;font-size:11pt". */
  bodyStyle?: string;
}

const lc = (s: string) => s.toLowerCase();

export function allAliases(accounts: Account[]): { alias: Alias; account: Account }[] {
  return accounts.flatMap((account) =>
    (account.aliases.length ? account.aliases : [{ email: account.email, name: account.displayName, isDefault: true }]).map((alias) => ({ alias, account })),
  );
}

export function myAddresses(accounts: Account[]): Set<string> {
  return new Set(allAliases(accounts).map((a) => lc(a.alias.email)));
}

/** Finds who can send as this address. Pass the account when known, since two accounts can share an address. */
export function findAlias(accounts: Account[], email: string, accountId?: string) {
  const all = allAliases(accounts).filter((a) => lc(a.alias.email) === lc(email));
  return (accountId && all.find((a) => a.account.id === accountId)) || all[0];
}

/** Which of my addresses should a reply to this message come from? */
export function pickFromForMessage(source: Message, ctx: ComposeContext): string {
  const account = ctx.accounts.find((a) => a.id === source.accountId);
  const aliases = account ? allAliases([account]) : [];
  const candidates = [source.deliveredTo, ...source.to.map((a) => a.email), ...source.cc.map((a) => a.email), source.from.email].filter(Boolean) as string[];
  for (const c of candidates) {
    const hit = aliases.find((a) => lc(a.alias.email) === lc(c));
    if (hit) return hit.alias.email;
  }
  const def = aliases.find((a) => a.alias.isDefault) || aliases[0];
  return def?.alias.email || defaultFrom(ctx);
}

export function defaultFrom(ctx: ComposeContext): string {
  if (ctx.defaultFromEmail && findAlias(ctx.accounts, ctx.defaultFromEmail)) return ctx.defaultFromEmail;
  const first = [...ctx.accounts].sort((a, b) => a.order - b.order)[0];
  return first ? (first.aliases.find((a) => a.isDefault)?.email || first.email) : '';
}

function dedupe(list: Address[], exclude: Set<string>): Address[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const e = lc(a.email);
    if (exclude.has(e) || seen.has(e)) return false;
    seen.add(e);
    return true;
  });
}

export function autoRecipients(mode: ComposeMode, source: Message | undefined, accounts: Account[]): { to: Address[]; cc: Address[] } {
  if (!source || mode === 'new' || mode === 'forward') return { to: [], cc: [] };
  const mine = myAddresses(accounts);
  const fromMe = mine.has(lc(source.from.email));
  const replyTargets = fromMe ? source.to : source.replyTo?.length ? source.replyTo : [source.from];
  if (mode === 'reply') return { to: dedupe(replyTargets, fromMe ? new Set() : mine), cc: [] };
  const to = dedupe([...replyTargets, ...source.to], mine);
  const cc = dedupe(source.cc, new Set([...mine, ...to.map((a) => lc(a.email))]));
  return { to, cc };
}

export function subjectFor(mode: ComposeMode, subject: string): string {
  const base = subject.replace(/^((re|fwd?|fw)\s*:\s*)+/i, '').trim();
  if (mode === 'reply' || mode === 'replyAll') return /^re:/i.test(subject) ? subject : `Re: ${base}`;
  if (mode === 'forward') return `Fwd: ${base}`;
  return subject;
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const fmt = (a: Address) => (a.name ? `${escapeHtml(a.name)} &lt;${escapeHtml(a.email)}&gt;` : escapeHtml(a.email));

export function quoteFor(mode: ComposeMode, source: Message | undefined): string {
  if (!source || mode === 'new') return '';
  const body = source.bodyHtml || (source.bodyText ? textToHtml(source.bodyText) : escapeHtml(source.snippet));
  if (mode === 'forward') {
    return (
      `<div class="wgm-forward"><p>---------- Forwarded message ----------<br>` +
      `From: ${fmt(source.from)}<br>Date: ${formatDate(source.date)}<br>Subject: ${escapeHtml(source.subject)}<br>` +
      `To: ${source.to.map(fmt).join(', ')}${source.cc.length ? `<br>Cc: ${source.cc.map(fmt).join(', ')}` : ''}</p>${body}</div>`
    );
  }
  return (
    `<div class="wgm-quote"><p>On ${formatDate(source.date)}, ${fmt(source.from)} wrote:</p>` +
    `<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${body}</blockquote></div>`
  );
}

const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function createDraft(mode: ComposeMode, source: Message | undefined, ctx: ComposeContext, extra: Partial<Draft> = {}): Draft {
  const { to, cc } = autoRecipients(mode, source, ctx.accounts);
  return {
    id: newId(),
    mode,
    sourceMessageId: source?.id,
    fromEmail: source ? pickFromForMessage(source, ctx) : defaultFrom(ctx),
    fromAccountId: source ? source.accountId : findAlias(ctx.accounts, defaultFrom(ctx))?.account.id,
    to,
    cc,
    bcc: [],
    manualRecipients: [],
    includeSourceAttachments: mode === 'forward',
    subject: source ? subjectFor(mode, source.subject) : '',
    html: '',
    attachments: [],
    driveLinks: [],
    quotedHtml: quoteFor(mode, source),
    includeQuote: true,
    updatedAt: Date.now(),
    ...extra,
  };
}

/** Change Reply / Reply All / Forward in place. Your text and hand added recipients stay. */
export function switchMode(draft: Draft, mode: ComposeMode, source: Message | undefined, accounts: Account[]): Draft {
  if (draft.mode === mode) return draft;
  const auto = autoRecipients(mode, source, accounts);
  const manual = (field: 'to' | 'cc' | 'bcc') => draft.manualRecipients.filter((m) => m.field === field).map((m) => m.address);
  const merge = (a: Address[], b: Address[]) => dedupe([...a, ...b], new Set());
  return {
    ...draft,
    mode,
    to: merge(auto.to, manual('to')),
    cc: merge(auto.cc, manual('cc')),
    bcc: merge([], manual('bcc')),
    subject: source ? subjectFor(mode, draft.subject || source.subject) : draft.subject,
    quotedHtml: quoteFor(mode, source),
    includeSourceAttachments: mode === 'forward',
    updatedAt: Date.now(),
  };
}

/** The signature a draft gets: its own choice, or the From address's. */
export function draftSignature(draft: Pick<Draft, 'fromEmail' | 'signatureOf'>, ctx: ComposeContext): string {
  if (draft.signatureOf === '') return '';
  return signatureFor(draft.signatureOf || draft.fromEmail, ctx);
}

export function signatureFor(email: string, ctx: ComposeContext): string {
  if (email in ctx.signatures) return ctx.signatures[email];
  return findAlias(ctx.accounts, email)?.alias.providerSignatureHtml || '';
}

export function draftIsEmpty(d: Draft): boolean {
  return !htmlToText(d.html).trim() && !d.attachments.length && !d.driveLinks.length && (d.mode !== 'new' || (!d.to.length && !d.subject));
}

export interface SourceAttachment {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

/** Turns a draft into the message that gets sent. */
export function draftToOutgoing(draft: Draft, source: Message | undefined, ctx: ComposeContext, sourceAttachments: SourceAttachment[] = []): { accountId: string; message: OutgoingMessage } {
  const hit = findAlias(ctx.accounts, draft.fromEmail, draft.fromAccountId);
  if (!hit) throw new Error(`No account can send as ${draft.fromEmail}`);
  const signature = draftSignature(draft, ctx);
  const sigBlock = signature ? `<div class="wgm-signature">${signature}</div>` : '';
  const links = draft.driveLinks.length
    ? `<p>${draft.driveLinks.map((l) => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.name)}</a> (Google Drive)`).join('<br>')}</p>`
    : '';
  const quote = draft.includeQuote ? draft.quotedHtml : '';
  const body = ctx.signaturePlacement === 'above' ? draft.html + links + sigBlock + quote : draft.html + links + quote + sigBlock;
  const html = `<div dir="ltr"${ctx.bodyStyle ? ` style="${ctx.bodyStyle}"` : ''}>${body}</div>`;

  const sameAccount = source && source.accountId === hit.account.id;
  const isReply = draft.mode === 'reply' || draft.mode === 'replyAll';
  const references = source?.messageIdHeader ? [source.references, source.messageIdHeader].filter(Boolean).join(' ') : undefined;

  return {
    accountId: hit.account.id,
    message: {
      from: { name: hit.alias.name, email: hit.alias.email },
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      replyTo: hit.alias.replyTo ? [{ email: hit.alias.replyTo }] : undefined,
      subject: draft.subject,
      html,
      text: htmlToText(html),
      attachments: [
        ...draft.attachments.map((a) => ({ filename: a.filename, mimeType: a.mimeType, data: base64ToBytes(a.dataB64) })),
        ...(draft.includeSourceAttachments ? sourceAttachments : []),
      ],
      inReplyTo: isReply ? source?.messageIdHeader : undefined,
      references: isReply ? references : undefined,
      threadId: isReply && sameAccount ? source?.threadId : undefined,
    },
  };
}

/** Gmail's limit is 25 MB including encoding overhead (~37% for base64). */
export const ATTACHMENT_LIMIT_BYTES = 25 * 1024 * 1024;
export const encodedSize = (bytes: number) => Math.ceil(bytes * 1.37);
