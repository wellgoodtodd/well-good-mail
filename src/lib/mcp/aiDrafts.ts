// Drafts written by AI apps, kept apart so they're easy to find: AI drafts in the sidebar, with groups
// like Clients or Personal. Groups are kept by id, so renaming one moves every draft in it along with it.
import { create } from 'zustand';
import { store } from '../db';
import { settings, useSettings, type DraftGroup } from '../settings';
import type { Draft } from '../types';
import { useMail, providerFor, queueSend, loadBody } from '../mail';
import { draftToOutgoing, createDraft } from '../compose';
import { composeContext } from '../composeActions';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain text from the AI or a quick edit, as email paragraphs. */
export const textToHtml = (text: string) => text.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
/** Draft HTML back to plain text for a quick edit. */
export const htmlToText = (html: string) => html
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*/gi, '\n\n').replace(/<\/div>\s*/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
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
  return [DRAFTS_LABEL, ...(g ? [`${DRAFTS_LABEL}/${g.name}`] : []), `${WRITER_PREFIX}${writerLabel(d.byAi || 'AI')}`];
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
      await labelAiDraft(draft, accountId, messageId);
    }
  } catch (e) {
    console.warn('Draft not saved to the server yet', e);
  }
  return draft;
}

/**
 * Gmail drafts carrying the "AI Drafts" label that this computer doesn't know yet (written by the EA through Gmail,
 * on another computer, or filed by an AI later) become AI drafts here, in their group and with their writer.
 */
export async function importLabelledDrafts(): Promise<number> {
  const mail = useMail.getState();
  const local = await store.drafts();
  const knownServer = new Set(local.flatMap((d) => [d.serverDraftId, d.serverDraftMessageId]).filter(Boolean) as string[]);
  let added = 0;
  for (const account of mail.accounts) {
    const p = providerFor(account.id);
    if (!p?.draftsWithLabel) continue;
    let found: { draftId: string; messageId: string; labels: string[] }[] = [];
    try { found = await p.draftsWithLabel(DRAFTS_LABEL); } catch { continue; }
    for (const f of found) {
      const already = local.find((d) => d.serverDraftId === f.draftId || d.serverDraftMessageId === f.messageId);
      const groupName = f.labels.find((l) => l.toLowerCase().startsWith(DRAFTS_LABEL.toLowerCase() + '/'))?.slice(DRAFTS_LABEL.length + 1);
      const writer = f.labels.find((l) => l.toLowerCase().startsWith(WRITER_PREFIX.toLowerCase()))?.slice(WRITER_PREFIX.length) || 'AI';
      const group = groupName ? addGroup(groupName) : undefined;
      if (already) {
        // Known here already: just follow a group changed elsewhere.
        if (group && already.group !== group) await store.putDraft({ ...already, group });
        continue;
      }
      if (knownServer.has(f.draftId) || knownServer.has(f.messageId)) continue;
      const m = Object.values(mail.messages).find((x) => x.accountId === account.id && x.providerId === f.messageId);
      if (!m) continue; // Not synced to this computer yet; picked up next time.
      const full = (await loadBody(m.id)) || m;
      // A reply keeps its conversation: the newest email in the thread that isn't a draft.
      const source = Object.values(mail.messages).filter((x) => x.accountId === account.id && x.threadId === full.threadId && !x.isDraft).sort((a, b) => b.date - a.date)[0];
      const html = full.bodyHtml || (full.bodyText || '').replace(/\n/g, '<br>');
      const ownName = (account.aliases.find((a) => a.email === full.from.email)?.name || '').split(' ')[0];
      const tail = htmlToText(html.split(/gmail_quote|<blockquote/i)[0]).slice(-400);
      const draft = createDraft('new', undefined, composeContext(), {
        fromEmail: full.from.email,
        fromAccountId: account.id,
        to: full.to,
        cc: full.cc,
        bcc: full.bcc,
        subject: full.subject === '(no subject)' ? '' : full.subject,
        html,
        serverDraftId: f.draftId,
        serverAccountId: account.id,
        serverDraftMessageId: f.messageId,
        byAi: writer,
        group,
        // Already signed off with a name: don't add the signature a second time.
        noSignature: Boolean(ownName && tail.includes(ownName)),
        updatedAt: full.date,
        ...(source ? { mode: 'reply' as const, sourceMessageId: source.id, includeQuote: false } : {}),
      });
      await store.putDraft(draft);
      added++;
    }
  }
  if (added) await refreshAiDrafts();
  return added;
}

/** A quick text-only change from the AI Drafts screen. */
export async function quickSave(id: string, subject: string, text: string) {
  const d = await store.getDraft(id);
  if (!d) return;
  await saveDraftEverywhere({ ...d, subject, html: textToHtml(text), updatedAt: Date.now() });
  await refreshAiDrafts();
}

/** Sends a draft straight from the AI Drafts screen, through the usual undo-send delay. */
export async function quickSend(id: string, subject?: string, text?: string) {
  const d = await store.getDraft(id);
  if (!d) return;
  const final = subject === undefined ? d : { ...d, subject, html: textToHtml(text || ''), updatedAt: Date.now() };
  await queueSend(final);
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
export async function setDraftGroup(id: string, group: string | undefined) {
  const d = await store.getDraft(id);
  if (!d) return;
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

/** Removes a group. Its drafts stay, in no group. */
export async function deleteGroup(id: string) {
  saveGroups(groups().filter((g) => g.id !== id));
  for (const d of aiDraftsNow().filter((x) => x.group === id)) {
    const full = await store.getDraft(d.id);
    if (full) await store.putDraft({ ...full, group: undefined });
  }
  if (useAiDrafts.getState().filter === id) setDraftFilter('all');
  await refreshAiDrafts();
}

/** Labels drafts already in a Gmail account as AI drafts (with a group and writer), then brings them in. */
export async function fileServerDrafts(accountId: string, ids: string[], groupName: string | undefined, writer: string): Promise<number> {
  const p = providerFor(accountId);
  if (!p?.labelByName) throw new Error('Filing drafts this way needs a Gmail account for now.');
  const names = [DRAFTS_LABEL, ...(groupName ? [`${DRAFTS_LABEL}/${groupName}`] : []), `${WRITER_PREFIX}${writerLabel(writer)}`];
  const messages = useMail.getState().messages;
  let n = 0;
  for (const id of ids) {
    const m = messages[id];
    if (!m) continue;
    await p.labelByName(m.providerId, names);
    n++;
  }
  // Drafts this computer already knows follow the new group straight away.
  const group = groupName ? addGroup(groupName) : undefined;
  for (const d of await store.drafts()) {
    const hit = ids.some((id) => messages[id]?.providerId && messages[id]?.providerId === d.serverDraftMessageId);
    if (hit) await store.putDraft({ ...d, byAi: d.byAi || writer, group: group ?? d.group });
  }
  await importLabelledDrafts();
  await refreshAiDrafts();
  return n;
}
