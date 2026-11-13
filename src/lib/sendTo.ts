// Send To: saved places an email or its files go to (forwarded to an address like Hubdoc, saved into a folder, or
// both), rules that send new mail there by themselves, and finding the senders whose invoices come in.
import { create } from 'zustand';
import { useMail, loadBody, getAttachmentData, queueSend, toast, providerFor } from './mail';
import { createDraft, myAddresses } from './compose';
import { composeContext, openDraft } from './composeActions';
import { store } from './db';
import { inSystemFolder } from './mailbox';
import { invoke, isTauri } from './platform';
import { settings, useSettings, type SendPlace, type SendRule } from './settings';
import { askConfirm, askText } from './dialogs';
import { htmlToText } from './mime';
import type { Message } from './types';

// ---------- plain helpers (tested) ----------

/** What a place does, for menus and Settings: "Hubdoc and Invoices folder", "Forward only", "Save only". */
export function placeSummary(p: SendPlace): string {
  const folderName = p.askFolder ? 'a folder you choose' : p.folder ? `${p.folder.split(/[\\/]/).filter(Boolean).pop()} folder` : '';
  const fwd = p.forwardTo ? forwardName(p.forwardTo) : '';
  if (fwd && folderName) return `${fwd} and ${folderName}`;
  if (fwd) return 'Forward only';
  if (folderName) return 'Save only';
  return 'Not set up yet';
}

/** A short name for a forwarding address: "Hubdoc" for something@app.hubdoc.com. */
export function forwardName(address: string): string {
  const domain = address.trim().toLowerCase().split('@')[1];
  if (!domain) return address.trim();
  const part = domain.split('.').filter((x) => !['app', 'mail', 'in', 'inbox', 'email', 'my'].includes(x))[0] || domain;
  return part.charAt(0).toUpperCase() + part.slice(1);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The year or month folder a file goes in: "", "2026" or "2026/11 November". */
export function subfolderFor(p: Pick<SendPlace, 'subfolders'>, date: number): string {
  const d = new Date(date);
  if (p.subfolders === 'year') return String(d.getFullYear());
  if (p.subfolders === 'month') return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
  return '';
}

/** The text with YYYY, YY, MM and DD swapped for a date: "YYMMDD_" on 13 Nov 2026 is "261113_". */
export function fillDate(text: string, date: number): string {
  const d = new Date(date);
  const two = (n: number) => String(n).padStart(2, '0');
  return text.replace(/YYYY|YY|MM|DD/g, (t) => (t === 'YYYY' ? String(d.getFullYear()) : t === 'YY' ? two(d.getFullYear() % 100) : t === 'MM' ? two(d.getMonth() + 1) : two(d.getDate())));
}

/** The placeholders a file name can use, for the buttons under the box. Dates use the letters YYYY, YY, MM and DD. */
export const NAME_PARTS: { label: string; insert: string }[] = [
  { label: 'Date', insert: 'YYMMDD' },
  { label: 'Sender', insert: '{sender}' },
  { label: 'Amount', insert: '{amount}' },
  { label: 'Description', insert: '{description}' },
  { label: 'Original name', insert: '{name}' },
];
export const DEFAULT_PATTERN = 'YYMMDD_{sender} {amount}';

/** What fills the placeholders for one saved file. */
export interface NameFacts { date: number; sender: string; amount: string; description: string; original: string }

const cleanPart = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Fills a pattern like "YYMMDD_{sender} {amount}". Empty parts leave no stray spaces or separators. */
export function fillName(pattern: string, f: NameFacts): string {
  const dot = f.original.lastIndexOf('.');
  const stem = dot > 0 ? f.original.slice(0, dot) : f.original;
  const parts: Record<string, string> = { sender: f.sender, amount: f.amount, description: f.description, name: stem };
  // The placeholders are swapped out first, so a sender called "Daddy's" doesn't have its D's taken for a date.
  const slots: string[] = [];
  const marked = pattern.replace(/\{(sender|supplier|amount|description|name)\}/gi, (_, k: string) => { slots.push(cleanPart(parts[k.toLowerCase() === 'supplier' ? 'sender' : k.toLowerCase()] || '')); return `\u0000${slots.length - 1}\u0000`; });
  const out = fillDate(marked, f.date).replace(/\u0000(\d+)\u0000/g, (_, i: string) => slots[Number(i)])
    .replace(/\s{2,}/g, ' ').replace(/([_\-\s])[_\-\s]+/g, '$1').replace(/^[_\-\s]+|[_\-\s]+$/g, '');
  return out || stem;
}

/**
 * A saved file's name: Custom (a pattern), Prefix or Suffix (text added to the start or end), or the original. "Ask
 * each time" is asked by the caller, starting from the Custom name.
 */
export function renamedFile(rename: SendPlace['rename'], f: NameFacts): string {
  const dot = f.original.lastIndexOf('.');
  const ext = dot > 0 ? f.original.slice(dot) : '';
  const stem = dot > 0 ? f.original.slice(0, dot) : f.original;
  if (!rename?.on) return f.original;
  const how = rename.how === 'smart' ? 'custom' : rename.how;
  if (how === 'custom' || how === 'ask') return `${fillName(rename.pattern || DEFAULT_PATTERN, f)}${ext}`;
  if (!rename.text) return f.original;
  const add = fillName(`{name}${rename.text}`, f).slice(stem.length);
  const addStart = fillName(`${rename.text}{name}`, f);
  return how === 'start' ? `${addStart.slice(0, addStart.length - stem.length) || ''}${stem}${ext}` : `${stem}${add}${ext}`;
}

/** The facts for a file from its email: the sender's name, the amount paid, and the subject as a description. */
export function nameFacts(m: Pick<Message, 'from' | 'subject' | 'date'>, text: string, original: string): NameFacts {
  const sender = cleanPart(senderName(m)).replace(/,?\s+(PBC|Ltd\.?|Limited|Inc\.?|LLC|GmbH|plc)$/i, '');
  const description = cleanPart(m.subject.replace(/^((re|fwd?|fw)\s*:\s*)+/i, '')).slice(0, 60);
  return { date: m.date, sender, amount: invoiceAmount(`${m.subject}\n${text}`), description, original };
}

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})`;
const CURRENCY = String.raw`(?:£|€|US\$|\$|GBP|USD|EUR)\s?`;
/** Words that come before the amount actually paid, most telling first. */
const PAID_WORDS = [
  String.raw`amount paid|total paid|you paid|payment of|amount charged|charged|paid`,
  String.raw`grand total|total due|amount due|balance due|invoice total`,
  String.raw`total`,
];

/** The amount an invoice or receipt is for, as plain numbers ("18.00"), or "" when none is found. */
export function invoiceAmount(text: string): string {
  const pick = (re: RegExp) => { const m = re.exec(text); return m ? m[1].replace(/,/g, '') : ''; };
  for (const words of PAID_WORDS) {
    const hit = pick(new RegExp(String.raw`\b(?:${words})\b[^0-9£€$\n]{0,40}(?:${CURRENCY})?${AMOUNT}`, 'i'));
    if (hit) return hit;
  }
  return pick(new RegExp(`${CURRENCY}${AMOUNT}`)) || pick(new RegExp(String.raw`${AMOUNT}\s?(?:GBP|USD|EUR)\b`));
}


/** Big free email services, where a rule matches the whole address rather than everyone at the domain. */
const SHARED_DOMAINS = /^(gmail|googlemail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|gmx|yahoo)\./i;

/** Payment services that send receipts on behalf of many companies (Stripe, PayPal, Paddle and so on). */
const PAYMENT_DOMAINS = /(^|\.)(stripe\.com|paypal\.com|paypal\.co\.uk|paddle\.com|paddle\.net|squareup\.com|square\.com|gocardless\.com|chargebee\.com|recurly\.com|fastspring\.com|gumroad\.com|lemonsqueezy\.com|shopify\.com|xero\.com|quickbooks\.com|intuit\.com|sumup\.com|zettle\.com)$/i;

/** What a rule for this sender matches: the domain for a company ("canva.com"), the address for a Gmail user. */
export function senderKey(email: string): string {
  const e = email.trim().toLowerCase();
  const domain = e.split('@')[1] || e;
  // Payment services send receipts for many different companies, each from its own address.
  if (SHARED_DOMAINS.test(domain) || PAYMENT_DOMAINS.test(domain)) return e;
  return domain.replace(/^(mail|email|e|info|billing|invoice|invoices|receipts|no-?reply|news|updates)\./, '');
}

/** A name for a sender: "Canva" from canva.com, or the person's name. */
export function senderName(m: Pick<Message, 'from'>): string {
  const key = senderKey(m.from.email);
  const given = (m.from.name || '').replace(/^["'\s]+|["'\s]+$/g, '');
  if (key.includes('@')) return given || key;
  const base = key.split('.')[0];
  return given && !/no.?reply|billing|invoice|receipt|team|support/i.test(given) ? given : base.charAt(0).toUpperCase() + base.slice(1);
}

const hasPdf = (m: Pick<Message, 'attachments' | 'hasAttachments'>) => m.attachments.some((a) => !a.inline && (a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.filename)));

/** Whether a rule takes this email. The date and "is it new" checks are done by the caller. */
export function ruleMatches(r: SendRule, m: Pick<Message, 'from' | 'subject' | 'attachments' | 'hasAttachments'>): boolean {
  if (!r.on) return false;
  const from = m.from.email.trim().toLowerCase();
  const want = r.from.trim().toLowerCase();
  if (!want) return false;
  const domain = from.split('@')[1] || '';
  const fromOk = want.includes('@') ? from === want : domain === want || domain.endsWith(`.${want}`);
  if (!fromOk) return false;
  if (r.needsPdf && !hasPdf(m)) return false;
  if (r.subjectHas && !m.subject.toLowerCase().includes(r.subjectHas.trim().toLowerCase())) return false;
  return true;
}

const INVOICE_WORDS = /\b(invoice|invoices|receipt|receipts|billing|bill|payment|paid|subscription|renewal|order confirmation|your order|statement|tax invoice|VAT)\b/i;

export interface InvoiceSender { key: string; name: string; count: number; last: number; cadence: string; ids: string[] }

/** Find my invoices: senders of emails in the last year that look like invoices or receipts, most first. */
export function findInvoiceSenders(messages: Message[], mine: Set<string>, now = Date.now()): InvoiceSender[] {
  const since = now - 366 * 86400000;
  const by = new Map<string, { name: string; dates: number[]; ids: string[] }>();
  for (const m of messages) {
    if (m.date < since || m.isDraft || mine.has(m.from.email.toLowerCase())) continue;
    const words = `${m.subject} ${m.snippet}`;
    if (!INVOICE_WORDS.test(words)) continue;
    if (!m.hasAttachments && !/\b(invoice|receipt)\b/i.test(m.subject)) continue;
    const key = senderKey(m.from.email);
    const e = by.get(key) || { name: senderName(m), dates: [], ids: [] };
    e.dates.push(m.date);
    e.ids.push(m.id);
    by.set(key, e);
  }
  return [...by.entries()].map(([key, e]) => {
    const dates = e.dates.sort((a, b) => a - b);
    const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / 86400000);
    const typical = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0;
    const cadence = dates.length < 2 ? 'once' : typical >= 25 && typical <= 35 ? 'monthly' : typical >= 330 && typical <= 400 ? 'yearly' : typical >= 6 && typical <= 8 ? 'weekly' : 'now and then';
    return { key, name: e.name, count: dates.length, last: dates[dates.length - 1], cadence, ids: e.ids };
  }).sort((a, b) => b.count - a.count || b.last - a.last);
}

// ---------- the dialogs ----------

export type SendToDialog = { kind: 'place'; place?: SendPlace; then?: (p: SendPlace) => void } | { kind: 'invoices' } | { kind: 'rule'; rule: SendRule } | { kind: 'log' } | null;
export const useSendToDialog = create<{ open: SendToDialog }>(() => ({ open: null }));
export const openPlaceEditor = (place?: SendPlace, then?: (p: SendPlace) => void) => useSendToDialog.setState({ open: { kind: 'place', place, then } });
export const openFindInvoices = () => useSendToDialog.setState({ open: { kind: 'invoices' } });
export const closeSendToDialog = () => useSendToDialog.setState({ open: null });

// ---------- what has been sent ----------

export interface SendLogEntry { at: number; place: string; subject: string; from: string; rule?: string; saved?: string; forwarded?: string }
const LOG_KEY = 'sendto-log';
const DONE_KEY = 'sendto-done';
export async function sendLog(): Promise<SendLogEntry[]> { return (await store.kvGet<SendLogEntry[]>(LOG_KEY)) || []; }
async function addLog(e: SendLogEntry) { await store.kvSet(LOG_KEY, [e, ...(await sendLog())].slice(0, 200)); }
async function doneIds(): Promise<string[]> { return (await store.kvGet<string[]>(DONE_KEY)) || []; }

// ---------- sending ----------

const toB64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

async function pickFolder(): Promise<string | undefined> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const dir = await open({ directory: true, title: 'Choose a folder for these files' });
  return typeof dir === 'string' ? dir : undefined;
}

/**
 * Sends one email (or one of its files) to a place: forwards it, saves its files, or both. Returns a short line on
 * what happened, or throws. With `quiet` (rules), nothing is asked and no window opens.
 */
async function sendOne(place: SendPlace, m: Message, opts: { attachmentId?: string; quiet?: boolean; folder?: string; rule?: string }): Promise<string> {
  const full = (await loadBody(m.id)) || m;
  const files = full.attachments.filter((a) => !a.inline && (!opts.attachmentId || a.id === opts.attachmentId));
  const data = await Promise.all(files.map(async (a) => ({ a, bytes: await getAttachmentData(full.id, a.id) })));
  const done: string[] = [];
  let saved: string | undefined;
  const folder = opts.folder || (place.askFolder ? undefined : place.folder);
  if (folder && data.length) {
    if (!isTauri()) throw new Error('Saving into a folder works in the desktop app');
    const sub = subfolderFor(place, full.date);
    const text = full.bodyText || htmlToText(full.bodyHtml || '') || full.snippet;
    for (const f of data) {
      // Rules never ask, so for them "Ask each time" uses the Custom name.
      let name = renamedFile(place.rename, nameFacts(full, text, f.a.filename));
      if (place.rename?.on && place.rename.how === 'ask' && !opts.quiet) {
        // Suggests the Custom name, so usually it's just Enter.
        const asked = await askText(`Save ${f.a.filename} as`, name, 'Save');
        if (asked === null) continue;
        name = asked.trim() || f.a.filename;
        if (!/\.[a-z0-9]{1,5}$/i.test(name) && /\.[a-z0-9]{1,5}$/i.test(f.a.filename)) name += f.a.filename.slice(f.a.filename.lastIndexOf('.'));
      }
      await invoke<string>('save_into_subfolder', { folder, subfolder: sub, name, data: toB64(f.bytes) });
    }
    saved = sub ? `${folder.split(/[\\/]/).filter(Boolean).pop()} › ${sub.replace('/', ' › ')}` : folder.split(/[\\/]/).filter(Boolean).pop();
    done.push(`saved in ${saved}`);
  }
  if (place.forwardTo) {
    const draft = createDraft('forward', full, composeContext(), {
      to: [{ email: place.forwardTo.trim() }],
      includeSourceAttachments: false,
      attachments: data.map((f) => ({ id: f.a.id, filename: f.a.filename, mimeType: f.a.mimeType, size: f.bytes.length, dataB64: toB64(f.bytes) })),
      includeQuote: !place.filesOnly || !data.length,
    });
    if (place.sendMode === 'open' && !opts.quiet) {
      await store.putDraft(draft);
      await openDraft(draft.id);
      done.push('opened to send');
    } else {
      await queueSend(draft);
      done.push(`forwarded to ${place.forwardTo.trim()}`);
    }
  }
  await addLog({ at: Date.now(), place: place.name, subject: full.subject, from: full.from.name || full.from.email, rule: opts.rule, saved, forwarded: place.forwardTo || undefined });
  return done.join(' and ');
}

/** Send to › a place, from a menu. Several emails ask first, and each goes as its own forward. */
export async function sendToPlace(place: SendPlace, messages: Message[], opts: { attachmentId?: string } = {}) {
  if (!messages.length) return;
  if (!place.forwardTo && !place.folder && !place.askFolder) return void openPlaceEditor(place);
  if (messages.length > 1 && !(await askConfirm(`Send ${messages.length} emails to ${place.name}?`, place.forwardTo ? `Each one is forwarded to ${place.forwardTo} on its own${place.folder ? ', and its files are saved' : ''}.` : 'Their files are saved into the folder.', 'Send them'))) return;
  const folder = place.askFolder && isTauri() ? await pickFolder() : undefined;
  if (place.askFolder && isTauri() && !folder) return;
  let ok = 0;
  let what = '';
  for (const m of messages) {
    try { what = await sendOne(place, m, { attachmentId: opts.attachmentId, folder }); ok++; } catch (e) { toast({ text: `${m.subject || 'An email'} wasn't sent to ${place.name}: ${e instanceof Error ? e.message : e}`, ttl: 10000 }); }
  }
  if (!ok) return;
  const m = messages[0];
  const key = senderKey(m.from.email);
  const hasRule = settings().sendRules.some((r) => r.placeId === place.id && r.from.toLowerCase() === key);
  if (messages.length === 1 && !hasRule) {
    const name = senderName(m);
    toast({
      text: `Sent to ${place.name}: ${what}. Always send ${name}'s ${hasPdf(m) ? 'invoices' : 'emails'} there?`,
      ttl: 15000,
      action: { label: 'Make a rule', run: () => addRule({ name, from: key, needsPdf: hasPdf(m), placeId: place.id }) },
    });
  } else {
    toast({ text: messages.length === 1 ? `Sent to ${place.name}: ${what}` : `${ok} emails sent to ${place.name}`, ttl: 5000 });
  }
}

export function addRule(r: Pick<SendRule, 'name' | 'from' | 'needsPdf' | 'placeId'> & { subjectHas?: string }) {
  const same = settings().sendRules.find((x) => x.placeId === r.placeId && x.from.toLowerCase() === r.from.toLowerCase());
  if (same) return same;
  const rule: SendRule = { id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, on: true, since: Date.now(), sent: 0, ...r };
  useSettings.getState().set({ sendRules: [...settings().sendRules, rule] });
  toast({ text: `New rule: ${r.name} goes to ${settings().sendPlaces.find((p) => p.id === r.placeId)?.name || 'its place'}`, ttl: 4000 });
  return rule;
}

let running = false;
/** New mail that matches a rule goes to its place. Each email only ever once; mail from before the rule is left alone. */
export async function runSendRules(msgs: Message[]) {
  const rules = settings().sendRules.filter((r) => r.on);
  if (!rules.length || !msgs.length || running) return;
  running = true;
  try {
    const mine = myAddresses(useMail.getState().accounts);
    const done = new Set(await doneIds());
    const places = settings().sendPlaces;
    const sentBy: Record<string, number> = {};
    for (const m of msgs) {
      if (done.has(m.id) || m.isDraft || mine.has(m.from.email.toLowerCase())) continue;
      if (!inSystemFolder(m, 'inbox', providerFor(m.accountId)) && !inSystemFolder(m, 'archive', providerFor(m.accountId))) continue;
      const rule = rules.find((r) => m.date >= r.since && ruleMatches(r, m));
      const place = rule && places.find((p) => p.id === rule.placeId);
      if (!rule || !place || place.askFolder) continue;
      done.add(m.id);
      await store.kvSet(DONE_KEY, [...done].slice(-3000));
      try {
        await sendOne({ ...place, sendMode: 'now' }, m, { quiet: true, rule: rule.name });
        sentBy[rule.id] = (sentBy[rule.id] || 0) + 1;
      } catch (e) {
        toast({ text: `The ${rule.name} rule couldn't send "${m.subject}": ${e instanceof Error ? e.message : e}`, ttl: 10000 });
      }
    }
    if (Object.keys(sentBy).length) {
      useSettings.getState().set({ sendRules: settings().sendRules.map((r) => (sentBy[r.id] ? { ...r, sent: r.sent + sentBy[r.id] } : r)) }, { quiet: true });
      const n = Object.values(sentBy).reduce((a, b) => a + b, 0);
      toast({ text: `${n} new ${n === 1 ? 'email' : 'emails'} sent by your Send To rules`, ttl: 5000 });
    }
  } finally {
    running = false;
  }
}

/** Forward... on an attachment: the normal writing window, as a forward with only that file. */
export async function forwardAttachment(m: Message, attachmentId: string) {
  const full = (await loadBody(m.id)) || m;
  const a = full.attachments.find((x) => x.id === attachmentId);
  if (!a) return;
  const bytes = await getAttachmentData(full.id, a.id);
  const { startCompose } = await import('./composeActions');
  await startCompose('forward', full, { extra: { includeSourceAttachments: false, attachments: [{ id: a.id, filename: a.filename, mimeType: a.mimeType, size: bytes.length, dataB64: toB64(bytes) }] } });
}
