// Drafts written by AI apps, kept apart so they're easy to find: AI drafts in the sidebar, with groups
// like Clients or Personal. Groups are kept by id, so renaming one moves every draft in it along with it.
import { create } from 'zustand';
import { store } from '../db';
import { settings, useSettings, type DraftGroup } from '../settings';
import type { Draft } from '../types';
import { useMail, providerFor, queueSend, loadBody } from '../mail';
import { draftToOutgoing, createDraft } from '../compose';
import { composeContext } from '../composeActions';
import { record } from '../history';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain text from the AI or a quick edit, as email paragraphs. */
export const textToHtml = (text: string) => text.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
/** Draft HTML back to plain text for a quick edit. */
export const htmlToText = (html: string) => html
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*/gi, '\n\n').replace(/<\/div>\s*/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&')
  .replace(/\n{3,}/g, '\n\n').trim();
/** True when a draft is only paragraphs and line breaks, so a text-only quick edit loses nothing. */
export const isSimple = (html: string) => !/<(?!\/?(p|br|div)\b)[a-z]/i.test(html);

/** The Gmail labels an AI draft carries: "AI Drafts", its group ("AI Drafts/Clients") and who wrote it ("AI Writer/EA"). */
export const WRITER_PREFIX = 'AI Writer/';
export const DRAFTS_LABEL = 'AI Drafts';
/** "Claude Desktop" and "Claude Code" are both just Claude in Gmail; anything else keeps its own short name. */
export const writerLabel = (byAi: string) => (/^claude/i.test(byAi) ? 'Claude' : byAi.trim().slice(0, 30) || 'AI');
export function aiLabelNames(d: Draft): string[] {
  const g = (settings().draftGroups || []).find((x) => x.id === d.group);
  // Drafts made in Gmail itself may be the person's own, so they get no "AI Writer" label.
  const writer = d.byAi === OUTSIDE_WRITER ? [] : [`${WRITER_PREFIX}${writerLabel(d.byAi || 'AI')}`];
  return [DRAFTS_LABEL, ...(g ? [`${DRAFTS_LABEL}/${g.name}`] : []), ...writer];
}

/** Gmail: puts the AI labels on a draft's message, so it shows as an AI draft on other devices too. Never throws. */
export async function labelAiDraft(d: Draft, accountId: string, messageId?: string) {
  if (!d.byAi || !messageId) return;
  const p = providerFor(accountId);
  if (!p?.labelByName) return;
  try { await p.labelByName(messageId, aiLabelNames(d)); } catch (e) { console.warn('AI labels not added', e); }
}

/** Saves a draft in the app and in the account's own Drafts folder. Returns the draft with its server id. */
export async function saveDraftEverywhere(draft: Draft): Promise<Draft> {
  await store.putDraft(draft);
  try {
    const source = draft.sourceMessageId ? useMail.getState().messages[draft.sourceMessageId] : undefined;
    const { accountId, message } = draftToOutgoing(draft, source, composeContext());
    const p = providerFor(accountId);
    if (p) {
      const { draftId, messageId } = await p.saveDraft({ ...message, attachments: [] }, draft.serverDraftId);
      draft = { ...draft, serverDraftId: draftId, serverAccountId: accountId, ...(messageId ? { serverDraftMessageId: messageId } : {}) };
      await store.putDraft(draft);
      void labelAiDraft(draft, accountId, messageId);
    }
  } catch (e) {
    console.warn('Draft not saved to the server yet', e);
  }
  return draft;
}

/** Who an outside draft is marked as: made in Gmail itself (on the web, a phone, or an assistant's fallback). */
export const OUTSIDE_WRITER = 'Gmail';
/** Drafts looked at and left out (older than when outside drafts started coming in), so they aren't fetched again. */
const passedOver = new Set<string>();
let syncing = false;
let lastSync = 0;

/** The group and writer an AI draft's Gmail labels give it, or undefined when it has no "AI Drafts" label. */
export function readAiLabels(labels: string[]): { group?: string; writer?: string } | undefined {
  const base = DRAFTS_LABEL.toLowerCase();
  const isAi = labels.some((l) => l.toLowerCase() === base || l.toLowerCase().startsWith(base + '/'));
  if (!isAi) return undefined;
  const sub = labels.find((l) => l.toLowerCase().startsWith(base + '/'))?.slice(DRAFTS_LABEL.length + 1);
  const writer = labels.find((l) => l.toLowerCase().startsWith(WRITER_PREFIX.toLowerCase()))?.slice(WRITER_PREFIX.length);
  // An older label like "AI drafts/EA" named who wrote it, not a group.
  if (sub && !writer) return { writer: sub };
  return { group: sub, writer };
}

/**
 * Keeps AI Drafts in step with each Gmail account's Drafts folder:
 * - drafts labelled "AI Drafts" (by the EA, another computer, or filed later) come in with their group and writer;
 * - any other new draft made outside Well Good Mail comes in too, in No Group, marked as from Gmail;
 * - a draft sent or deleted elsewhere leaves, and one changed elsewhere shows the new version.
 * Runs every two minutes, when the window comes forward, and when AI Drafts opens.
 */
export async function syncServerDrafts(): Promise<number> {
  if (syncing) return 0;
  syncing = true;
  lastSync = Date.now();
  let changed = 0;
  try {
    let since = settings().outsideDraftsSince;
    if (!since) {
      // The first time: bring in outside drafts from the last day, then everything new from here on.
      since = Date.now() - 24 * 3600000;
      useSettings.getState().set({ outsideDraftsSince: since });
    }
    for (const account of useMail.getState().accounts) {
      const p = providerFor(account.id);
      if (!p?.listDrafts || !p.messageInfo) continue;
      let server: { draftId: string; messageId: string }[];
      try { server = await p.listDrafts(); } catch { continue; }
      const mail = useMail.getState();
      const byMessage = (providerId: string) => Object.values(mail.messages).find((x) => x.accountId === account.id && x.providerId === providerId);
      const onServer = new Map(server.map((s) => [s.draftId, s.messageId]));
      const local = await store.drafts();
      const queued = new Set(mail.outbox.map((o) => o.id));

      for (const d of local) {
        if (!d.byAi || d.serverAccountId !== account.id || !d.serverDraftId || queued.has(d.id)) continue;
        // Just saved here: give Gmail a moment before reading anything into its absence.
        if (Date.now() - d.updatedAt < 120000) continue;
        const now = onServer.get(d.serverDraftId);
        if (now === undefined) {
          // Sent or deleted elsewhere.
          await store.deleteDraft(d.id);
          changed++;
          continue;
        }
        let next = d;
        if (!mail.accounts.some((a) => a.id === d.fromAccountId)) next = { ...next, fromAccountId: account.id };
        if (d.serverDraftMessageId && now !== d.serverDraftMessageId) {
          // Changed elsewhere (Gmail on the web, a phone). Take that version once it has synced here.
          const m = byMessage(now);
          if (m && m.date > d.updatedAt) {
            const full = (await loadBody(m.id)) || m;
            next = { ...next, subject: full.subject === '(no subject)' ? '' : full.subject, to: full.to, cc: full.cc, bcc: full.bcc, html: full.bodyHtml || textToHtml(full.bodyText || ''), serverDraftMessageId: now, updatedAt: m.date };
          }
        }
        if (next !== d) { await store.putDraft(next); changed++; }
      }

      const known = new Set([...local, ...mail.outbox.map((o) => o.draft)].flatMap((d) => [d.serverDraftId, d.serverDraftMessageId]).filter(Boolean) as string[]);
      for (const s of server) {
        if (known.has(s.draftId) || known.has(s.messageId) || passedOver.has(s.messageId)) continue;
        let info: { labels: string[]; date: number };
        try { info = await p.messageInfo(s.messageId); } catch { continue; }
        const ai = readAiLabels(info.labels);
        if (!ai && info.date < since) { passedOver.add(s.messageId); continue; }
        const m = byMessage(s.messageId);
        if (!m) continue; // Not synced to this computer yet; picked up next time.
        const full = (await loadBody(m.id)) || m;
        // A reply keeps its conversation: the newest email in the thread that isn't a draft.
        const source = Object.values(mail.messages).filter((x) => x.accountId === account.id && x.threadId === full.threadId && !x.isDraft).sort((a, b) => b.date - a.date)[0];
        const html = full.bodyHtml || textToHtml(full.bodyText || '');
        const ownName = (account.aliases.find((a) => a.email === full.from.email)?.name || account.displayName || '').split(' ')[0];
        const tail = htmlToText(html.split(/gmail_quote|<blockquote/i)[0]).slice(-400);
        const draft = createDraft('new', undefined, composeContext(), {
          fromEmail: full.from.email || account.email,
          fromAccountId: account.id,
          to: full.to,
          cc: full.cc,
          bcc: full.bcc,
          subject: full.subject === '(no subject)' ? '' : full.subject,
          html,
          serverDraftId: s.draftId,
          serverAccountId: account.id,
          serverDraftMessageId: s.messageId,
          byAi: ai ? ai.writer || 'AI' : OUTSIDE_WRITER,
          group: ai?.group ? addGroup(ai.group) : undefined,
          // Already signed off with a name: don't add the signature a second time.
          noSignature: Boolean(ownName && tail.includes(ownName)),
          updatedAt: full.date,
          ...(source ? { mode: 'reply' as const, sourceMessageId: source.id, includeQuote: false } : {}),
        });
        await store.putDraft(draft);
        known.add(s.draftId);
        changed++;
      }
    }
  } finally {
    syncing = false;
  }
  if (changed) await refreshAiDrafts();
  return changed;
}

/** Starts the draft sync: soon after opening, every two minutes, and when the window comes forward. */
export function startDraftSync() {
  setTimeout(() => void syncServerDrafts(), 15000);
  setInterval(() => void syncServerDrafts(), 2 * 60000);
  window.addEventListener('focus', () => { if (Date.now() - lastSync > 30000) void syncServerDrafts(); });
}

/** When AI Drafts opens: a fresh look, unless one ran in the last half minute. */
export function syncDraftsSoon() {
  if (Date.now() - lastSync > 30000) void syncServerDrafts();
}

/** Changes made on an AI Drafts card: who it's from and to, the subject, and (for plain drafts) the text. */
export async function quickSave(id: string, patch: Partial<Pick<Draft, 'fromAccountId' | 'fromEmail' | 'to' | 'cc' | 'bcc' | 'subject'>> & { text?: string }) {
  const d = await store.getDraft(id);
  if (!d) return;
  const { text, ...rest } = patch;
  await saveDraftEverywhere({ ...d, ...rest, ...(text !== undefined ? { html: textToHtml(text) } : {}), updatedAt: Date.now() });
  await refreshAiDrafts();
}

/** Sends a draft straight from the AI Drafts screen: now (through the usual undo-send delay) or at a later time. */
export async function quickSend(id: string, subject?: string, text?: string, at?: number) {
  const d = await store.getDraft(id);
  if (!d) return;
  const final = subject === undefined ? d : { ...d, subject, html: textToHtml(text || ''), updatedAt: Date.now() };
  await queueSend(final, at ? { sendAt: at } : {});
  await refreshAiDrafts();
}

/** Which drafts the AI drafts screen shows: all, one group, or those in no group. */
export type DraftFilter = 'all' | 'none' | string;

export const useAiDrafts = create<{ list: Draft[]; filter: DraftFilter }>(() => ({ list: [], filter: 'all' }));

/** The AI drafts as last loaded, newest first. */
export const aiDraftsNow = () => useAiDrafts.getState().list;

export async function refreshAiDrafts() {
  try {
    const all = await store.drafts();
    useAiDrafts.setState({ list: all.filter((d) => d.byAi).sort((a, b) => b.updatedAt - a.updatedAt) });
  } catch { /* the list just stays as it was */ }
}

export const setDraftFilter = (filter: DraftFilter) => useAiDrafts.setState({ filter });

/** Counts for the sidebar: every group, plus drafts in no group. */
export function groupCounts(list: Draft[], groups: DraftGroup[]): { all: number; none: number; byGroup: Record<string, number> } {
  const known = new Set(groups.map((g) => g.id));
  const byGroup: Record<string, number> = {};
  let none = 0;
  for (const d of list) {
    if (d.group && known.has(d.group)) byGroup[d.group] = (byGroup[d.group] || 0) + 1;
    else none++;
  }
  return { all: list.length, none, byGroup };
}

/** Moves a draft into a group (or out of all groups). On Gmail the draft is saved again so its labels follow. */
export async function setDraftGroup(id: string, group: string | undefined, opts: { silent?: boolean } = {}) {
  const d = await store.getDraft(id);
  if (!d) return;
  if (!opts.silent && d.group !== group) {
    const was = d.group;
    const name = (settings().draftGroups || []).find((g) => g.id === group)?.name || 'No Group';
    record(`Move draft to ${name}`, () => setDraftGroup(id, was, { silent: true }), () => setDraftGroup(id, group, { silent: true }));
  }
  const next = { ...d, group };
  await store.putDraft(next);
  await refreshAiDrafts();
  if (next.serverDraftId && next.serverAccountId && providerFor(next.serverAccountId)?.labelByName) void saveDraftEverywhere(next).then(() => refreshAiDrafts());
}

const groups = () => settings().draftGroups || [];
const saveGroups = (draftGroups: DraftGroup[]) => useSettings.getState().set({ draftGroups });

/** A new group. Returns its id, or the existing one if the name is taken. */
export function addGroup(name: string): string | undefined {
  const clean = name.trim().slice(0, 40);
  if (!clean) return undefined;
  const same = groups().find((g) => g.name.toLowerCase() === clean.toLowerCase());
  if (same) return same.id;
  const id = `g${Date.now().toString(36)}`;
  saveGroups([...groups(), { id, name: clean, colour: GROUP_COLOURS[groups().length % GROUP_COLOURS.length] }]);
  return id;
}

/** Soft colours for groups, quieter than the account colours. */
export const GROUP_COLOURS = ['#5b8def', '#3fae7a', '#c46ad8', '#d9a23a', '#e06a6a', '#4fb3c4', '#8a8f98'];
const FALLBACK: Record<string, string> = { clients: '#5b8def', prospects: '#3fae7a', personal: '#c46ad8', admin: '#d9a23a' };
export const groupColour = (g?: DraftGroup) => (g ? g.colour || FALLBACK[g.id] || GROUP_COLOURS[6] : undefined);

/** Moves a group on to the next soft colour. */
export function nextGroupColour(id: string) {
  saveGroups(groups().map((g) => (g.id === id ? { ...g, colour: GROUP_COLOURS[(GROUP_COLOURS.indexOf(groupColour(g)!) + 1) % GROUP_COLOURS.length] } : g)));
}

export function renameGroup(id: string, name: string) {
  const clean = name.trim().slice(0, 40);
  if (clean) saveGroups(groups().map((g) => (g.id === id ? { ...g, name: clean } : g)));
}

/** Moves a group up or down the list (the order of the chips and the sidebar). */
export function moveGroup(id: string, by: -1 | 1) {
  const list = [...groups()];
  const i = list.findIndex((g) => g.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveGroups(list);
}

/** Removes a group. Its drafts stay, in no group. Undo puts the group and its drafts back. */
export async function deleteGroup(id: string) {
  const before = groups();
  const members = aiDraftsNow().filter((x) => x.group === id).map((d) => d.id);
  useSettings.getState().set({ draftGroups: before.filter((g) => g.id !== id) }, { quiet: true });
  for (const did of members) {
    const full = await store.getDraft(did);
    if (full) await store.putDraft({ ...full, group: undefined });
  }
  const gone = before.find((g) => g.id === id);
  record(`Delete group ${gone?.name || ''}`.trim(), async () => {
    useSettings.getState().set({ draftGroups: before }, { quiet: true });
    for (const did of members) { const full = await store.getDraft(did); if (full) await store.putDraft({ ...full, group: id }); }
    await refreshAiDrafts();
  }, () => deleteGroup(id));
  if (useAiDrafts.getState().filter === id) setDraftFilter('all');
  await refreshAiDrafts();
}

/** Labels drafts already in a Gmail account as AI drafts (with a group and writer), then brings them in. */
export async function fileServerDrafts(accountId: string, ids: string[], groupName: string | undefined, writer: string): Promise<{ filed: number; missing: string[] }> {
  const p = providerFor(accountId);
  if (!p?.labelByName) throw new Error('Filing drafts this way needs a Gmail account for now.');
  const names = [DRAFTS_LABEL, ...(groupName ? [`${DRAFTS_LABEL}/${groupName}`] : []), `${WRITER_PREFIX}${writerLabel(writer)}`];
  const messages = useMail.getState().messages;
  let n = 0;
  const missing: string[] = [];
  // Only drafts still in Gmail: one replaced or deleted there can't be filed.
  const live = p.listDrafts ? new Set((await p.listDrafts()).map((d) => d.messageId)) : undefined;
  for (const id of ids) {
    const m = messages[id];
    if (!m || (live && !live.has(m.providerId))) { missing.push(id); continue; }
    try { await p.labelByName(m.providerId, names); n++; } catch { missing.push(id); }
  }
  // Drafts this computer already knows follow the new group straight away.
  const group = groupName ? addGroup(groupName) : undefined;
  for (const d of await store.drafts()) {
    const hit = ids.some((id) => messages[id]?.providerId && messages[id]?.providerId === d.serverDraftMessageId);
    if (hit) await store.putDraft({ ...d, byAi: d.byAi || writer, group: group ?? d.group });
  }
  await syncServerDrafts();
  await refreshAiDrafts();
  return { filed: n, missing };
}
