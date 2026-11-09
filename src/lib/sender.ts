// Actually sending a queued email once its undo window has passed.
import { draftToOutgoing, type SourceAttachment } from './compose';
import { addFollowup, getAttachmentData, providerFor, refreshAll, registerSender, useMail } from './mail';
import { settings } from './settings';
import { writingStyle } from './composeActions';
import { aiLabelNames, DRAFTS_LABEL } from './mcp/aiDrafts';
import type { OutboxItem } from './types';

function ctx() {
  const s = settings();
  return { accounts: useMail.getState().accounts, defaultFromEmail: s.defaultFromEmail, signatures: s.signatures, signaturePlacement: s.signaturePlacement, bodyStyle: writingStyle() };
}

async function sendItem(item: OutboxItem) {
  const draft = item.draft;
  const source = draft.sourceMessageId ? useMail.getState().messages[draft.sourceMessageId] : undefined;
  const sourceAttachments: SourceAttachment[] = [];
  if (draft.includeSourceAttachments && source) {
    for (const a of source.attachments.filter((x) => !x.inline)) {
      sourceAttachments.push({ filename: a.filename, mimeType: a.mimeType, data: await getAttachmentData(source.id, a.id) });
    }
  }
  const { accountId, message } = draftToOutgoing(draft, source, ctx(), sourceAttachments);
  const provider = providerFor(accountId);
  if (!provider) throw new Error('That account is no longer connected');
  const sent = await provider.send(message);
  if (draft.serverAccountId) {
    const p = providerFor(draft.serverAccountId);
    const id = draft.serverDraftId || (draft.serverDraftMessageId ? await p?.findDraftId?.(draft.serverDraftMessageId).catch(() => undefined) : undefined);
    if (p && id) await p.deleteDraft(id).catch(() => {});
  }
  // An AI draft keeps its group and writer once sent ("AI Drafts/Clients", "AI Writer/EA"), so you can see later where it came from.
  if (draft.byAi && provider.labelByName) {
    const names = aiLabelNames(draft).filter((n) => n !== DRAFTS_LABEL);
    if (names.length) await provider.labelByName(sent.providerId, names).catch(() => {});
  }
  if (draft.followUpDays) {
    await addFollowup({
      id: `${accountId}|${sent.threadId}|${Date.now()}`,
      accountId,
      threadId: sent.threadId,
      subject: draft.subject || '(no subject)',
      sentAt: Date.now(),
      dueAt: Date.now() + draft.followUpDays * 86400000,
      to: draft.to.map((a) => a.name || a.email).join(', '),
    });
  }
  setTimeout(refreshAll, 1500);
}

registerSender(sendItem);
