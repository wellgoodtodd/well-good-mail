// Starting a new email, reply or forward, inline or in its own window.
import { createDraft } from './compose';
import { store } from './db';
import { loadBody, useMail } from './mail';
import { openPopout } from './platform';
import { settings } from './settings';
import type { ComposeMode, Draft, Message } from './types';

export function composeContext() {
  const s = settings();
  return { accounts: useMail.getState().accounts, defaultFromEmail: s.defaultFromEmail, signatures: s.signatures, signaturePlacement: s.signaturePlacement, bodyStyle: writingStyle(), signatureModes: s.signatureModes };
}

/** The default writing font, size and colour from Settings, as inline CSS. */
export function writingStyle(): string {
  const s = settings();
  const fonts: Record<string, string> = {
    Rubik: "Rubik, 'Segoe UI', Arial, sans-serif",
    Inter: "Inter, 'Segoe UI', Arial, sans-serif",
    Arial: 'Arial, Helvetica, sans-serif',
    Georgia: 'Georgia, serif',
    'Segoe UI': "'Segoe UI', Arial, sans-serif",
    Verdana: 'Verdana, sans-serif',
    'Times New Roman': "'Times New Roman', serif",
    Calibri: 'Calibri, Arial, sans-serif',
  };
  return `font-family:${fonts[s.writingFont] || s.writingFont};font-size:${s.writingSize}pt${s.writingColour ? `;color:${s.writingColour}` : ''}`;
}

export async function startCompose(mode: ComposeMode, source?: Message, opts: { popout?: boolean; extra?: Partial<Draft> } = {}) {
  const full = source ? (await loadBody(source.id)) || source : undefined;
  const ctx = composeContext();
  // Use the scope's account for new emails when looking at one account.
  const view = useMail.getState().view;
  let extra = opts.extra || {};
  if (mode === 'new' && view.scope.type === 'account' && !extra.fromEmail) {
    const acc = ctx.accounts.find((a) => a.id === (view.scope as { accountId: string }).accountId);
    const def = acc?.aliases.find((a) => a.isDefault)?.email || acc?.email;
    if (def && acc) extra = { ...extra, fromEmail: def, fromAccountId: acc.id };
  }
  const draft = createDraft(mode, full, ctx, extra);
  await store.putDraft(draft);
  const popout = opts.popout ?? (settings().popOutCompose || mode === 'new');
  if (!popout || !(await openPopout(`compose/${draft.id}`, draft.subject || 'New email'))) {
    // New emails take over the reading pane when there's no separate window.
    useMail.setState(mode === 'new' ? { inlineDraftId: draft.id, selectedKey: undefined, selectedKeys: [], screen: 'mail' } : { inlineDraftId: draft.id });
  }
  return draft;
}

export async function openDraft(draftId: string, popout = true) {
  if (!popout || !(await openPopout(`compose/${draftId}`, 'Draft'))) useMail.setState({ inlineDraftId: draftId, selectedKey: undefined, selectedKeys: [] });
}

/** Opening something from the Drafts folder: a server draft becomes a local draft. */
export async function editServerDraft(m: Message) {
  const full = (await loadBody(m.id)) || m;
  const draft = createDraft('new', undefined, composeContext(), {
    fromEmail: full.from.email,
    fromAccountId: full.accountId,
    to: full.to,
    cc: full.cc,
    bcc: full.bcc,
    subject: full.subject === '(no subject)' ? '' : full.subject,
    html: full.bodyHtml || (full.bodyText || '').replace(/\n/g, '<br>'),
    serverDraftId: full.draftId,
    serverAccountId: full.accountId,
    serverDraftMessageId: full.providerId,
  });
  await store.putDraft(draft);
  if (!(await openPopout(`compose/${draft.id}`, draft.subject || 'Draft'))) useMail.setState({ inlineDraftId: draft.id, selectedKey: undefined, selectedKeys: [] });
}

export async function popoutMessage(key: string) {
  if (!(await openPopout(`thread/${encodeURIComponent(key)}`, 'Email'))) {
    useMail.setState({ selectedKey: key, selectedKeys: [key] });
  }
}
