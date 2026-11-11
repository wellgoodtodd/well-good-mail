// Writing an email: inline in the reading pane, or in its own window.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import DOMPurify from 'dompurify';
import { Icon } from './Icon';
import { RecipientField } from './RecipientField';
import { SendLaterPicker } from './SendLaterPicker';
import { SignaturePicker } from './SignaturePicker';
import { FormatBar, promptLink, pasteAsQuote, editorMenuWithSpelling } from './FormatBar';
import { editorExtensions, changeIndent } from './editorExtensions';
import { Dialog, fileSize, sendLaterOptions, useMenu } from './ui';
import { DraftFilesPreview, draftFile, openDraftFile, type DraftFile } from './AttachmentPreview';
import { getAttachmentData } from '../lib/mail';
import { store } from '../lib/db';
import { useMail, queueSend, providerFor, toast, broadcast, unschedule } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { allAliases, findAlias, switchMode, draftSignature, draftToOutgoing, draftIsEmpty, pickFromForMessage, ATTACHMENT_LIMIT_BYTES, encodedSize } from '../lib/compose';
import { labelAiDraft } from '../lib/mcp/aiDrafts';
import { composeContext, writingStyle } from '../lib/composeActions';
import { closeThisWindow, isPopout, isTauri, openPopout } from '../lib/platform';
import { trackOpen, trackClosed } from '../lib/openDrafts';
import { askConfirm, askKeepDraft, useDialogs } from '../lib/dialogs';
import { matchAction } from '../lib/shortcuts';
import type { Address, ComposeMode, Draft } from '../lib/types';

const MODE_LABEL: Record<ComposeMode, string> = { new: 'New email', reply: 'Reply', replyAll: 'Reply All', forward: 'Forward' };

function readFileB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function Composer({ draftId, variant }: { draftId: string; variant: 'inline' | 'full' }) {
  const [filePreview, setFilePreview] = useState<number | null>(null);
  // Remember this email is open, so a restart or an update brings it back. Closing it, sending it, or moving
  // on to something else forgets it again; the app just stopping does not.
  useEffect(() => {
    trackOpen(draftId, isPopout());
    return () => { trackClosed(draftId); };
  }, [draftId]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bigFiles, setBigFiles] = useState<File[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  const accounts = useMail((s) => s.accounts);
  const contacts = useMail((s) => s.contacts);
  const messages = useMail((s) => s.messages);
  const s = useSettings();
  const menu = useMenu();
  const fileInput = useRef<HTMLInputElement>(null);
  const serverSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const localSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const draftRef = useRef<Draft | null>(null);
  const sentRef = useRef(false);
  const closingRef = useRef(false);
  draftRef.current = draft;

  const source = draft?.sourceMessageId ? messages[draft.sourceMessageId] : undefined;
  const aliases = useMemo(() => allAliases(accounts), [accounts]);

  // ---------- load & save ----------
  useEffect(() => {
    store.getDraft(draftId).then((d) => {
      if (!d) return;
      setDraft(d);
      setShowCc(d.cc.length > 0);
      setShowBcc(d.bcc.length > 0);
    });
  }, [draftId]);

  const saveToServer = useCallback(async (d: Draft) => {
    if (sentRef.current || draftIsEmpty(d)) return;
    try {
      const ctx = composeContext();
      const { accountId, message } = draftToOutgoing(d, d.sourceMessageId ? useMail.getState().messages[d.sourceMessageId] : undefined, ctx);
      const p = providerFor(accountId);
      if (!p) return;
      // Changed account: remove the old server draft first.
      if (d.serverDraftId && d.serverAccountId && d.serverAccountId !== accountId) {
        await providerFor(d.serverAccountId)?.deleteDraft(d.serverDraftId);
        d = { ...d, serverDraftId: undefined };
      }
      const { draftId: serverDraftId, messageId } = await p.saveDraft({ ...message, attachments: message.attachments.slice(0, 20) }, d.serverDraftId);
      if (sentRef.current) return;
      const next = { ...(draftRef.current || d), serverDraftId, serverAccountId: accountId, ...(messageId ? { serverDraftMessageId: messageId } : {}) };
      // Gmail gives a saved draft a new copy each time, so an AI draft's labels go on again.
      void labelAiDraft(next, accountId, messageId);
      draftRef.current = next;
      setDraft(next);
      await store.putDraft(next);
      setSavedAt(Date.now());
    } catch (e) {
      console.warn('Draft save to server failed', e);
    }
  }, []);

  const update = useCallback((patch: Partial<Draft> | ((d: Draft) => Draft)) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch, updatedAt: Date.now() };
      draftRef.current = next;
      clearTimeout(localSaveTimer.current);
      localSaveTimer.current = setTimeout(() => { if (!sentRef.current) { store.putDraft(next); setSavedAt(Date.now()); } }, 500);
      clearTimeout(serverSaveTimer.current);
      serverSaveTimer.current = setTimeout(() => draftRef.current && saveToServer(draftRef.current), 8000);
      return next;
    });
  }, [saveToServer]);

  useEffect(() => () => { clearTimeout(serverSaveTimer.current); clearTimeout(localSaveTimer.current); }, []);

  // ---------- editor ----------
  const addFiles = useCallback(async (files: File[]) => {
    const current = draftRef.current;
    if (!current || !files.length) return;
    const existing = current.attachments.reduce((n, a) => n + a.size, 0);
    const incoming = files.reduce((n, f) => n + f.size, 0);
    if (encodedSize(existing + incoming) > ATTACHMENT_LIMIT_BYTES) {
      setBigFiles(files);
      return;
    }
    const added = await Promise.all(files.map(async (f) => ({ id: Math.random().toString(36).slice(2), filename: f.name, mimeType: f.type || 'application/octet-stream', size: f.size, dataB64: await readFileB64(f) })));
    update((d) => ({ ...d, attachments: [...d.attachments, ...added], updatedAt: Date.now() }));
  }, [update]);

  const editor = useEditor({
    extensions: editorExtensions(),
    content: '',
    editorProps: {
      attributes: { spellcheck: 'true', lang: 'en-GB', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Email body' },
      // Files dropped straight onto the message are attached (the editor would otherwise take the drop itself).
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files || []);
        if (!files.length) return false;
        event.preventDefault();
        setDragOver(false);
        void addFiles(files);
        return true;
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files || []);
        if (!files.length) return false;
        const images = files.filter((f) => f.type.startsWith('image/') && f.size < 5 * 1024 * 1024);
        const others = files.filter((f) => !images.includes(f));
        images.forEach(async (img) => {
          const b64 = await readFileB64(img);
          const node = view.state.schema.nodes.image.create({ src: `data:${img.type};base64,${b64}` });
          view.dispatch(view.state.tr.replaceSelectionWith(node));
        });
        if (others.length) addFiles(others);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Tab' && editorRef.current) {
          event.preventDefault();
          changeIndent(editorRef.current, event.shiftKey ? -1 : 1);
          return true;
        }
        if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && editorRef.current) {
          event.preventDefault();
          promptLink(editorRef.current);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => update({ html: ed.getHTML() }),
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // Spelling underlines follow the setting, and change straight away when it is switched.
  useEffect(() => {
    editor?.view.dom.setAttribute('spellcheck', s.spellCheck ? 'true' : 'false');
  }, [editor, s.spellCheck]);

  /** Where typing starts: in To when nobody is on the email yet (a forward or a new email), otherwise in the message. */
  const startTyping = (d: { to: unknown[]; cc: unknown[]; bcc: unknown[] }) => {
    setTimeout(() => {
      const nobody = !d.to.length && !d.cc.length && !d.bcc.length;
      const to = document.querySelector<HTMLInputElement>(`[data-composer="${draftId}"] [data-field="to"] input`);
      if (nobody && to) to.focus();
      else editor?.commands.focus('start');
    }, 30);
  };

  // Put the saved body into the editor once both exist.
  const loadedInto = useRef<string | null>(null);
  useEffect(() => {
    if (editor && draft && loadedInto.current !== draft.id) {
      loadedInto.current = draft.id;
      editor.commands.setContent(draft.html || '', false);
      startTyping(draft);
    }
  }, [editor, draft]);

  // ---------- recipients & mode ----------
  const addRecipients = (field: 'to' | 'cc' | 'bcc', list: Address[]) =>
    update((d) => {
      const existing = new Set([...d.to, ...d.cc, ...d.bcc].map((a) => a.email.toLowerCase()));
      const fresh = list.filter((a) => !existing.has(a.email.toLowerCase()));
      return { ...d, [field]: [...d[field], ...fresh], manualRecipients: [...d.manualRecipients, ...fresh.map((address) => ({ field, address }))], updatedAt: Date.now() };
    });
  const removeRecipient = (field: 'to' | 'cc' | 'bcc', email: string) =>
    update((d) => ({ ...d, [field]: d[field].filter((a) => a.email !== email), manualRecipients: d.manualRecipients.filter((m) => m.address.email !== email), updatedAt: Date.now() }));

  const changeMode = useCallback((mode: ComposeMode) => {
    update((d) => {
      const next = switchMode(d, mode, d.sourceMessageId ? useMail.getState().messages[d.sourceMessageId] : undefined, useMail.getState().accounts);
      if (next.cc.length) setShowCc(true);
      // Switching to Forward empties To, so typing starts there.
      if (mode === 'forward' && !next.to.length) startTyping(next);
      return next;
    });
  }, [update]);

  // ---------- send ----------
  const close = useCallback(async () => {
    if (isPopout()) await closeThisWindow();
    else useMail.setState({ inlineDraftId: undefined });
  }, []);

  const send = useCallback(async (sendAt?: number) => {
    const d = draftRef.current;
    if (!d) return;
    if (!d.to.length && !d.cc.length && !d.bcc.length) {
      toast({ text: 'Add at least one recipient' });
      return;
    }
    const bad = [...d.to, ...d.cc, ...d.bcc].find((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email));
    if (bad) {
      toast({ text: `"${bad.email}" doesn't look like an email address` });
      return;
    }
    if (!(await preSendChecks(d, editor?.getText() || ''))) return;
    sentRef.current = true;
    clearTimeout(serverSaveTimer.current);
    clearTimeout(localSaveTimer.current);
    const final = { ...d, html: editor?.getHTML() || d.html, scheduledAt: undefined };
    await queueSend(final, { sendAt });
    await close();
  }, [editor, close]);

  // Save and close: keeps what you wrote as a draft (it also goes to your Drafts folder), then closes straight away.
  const keepDraft = useCallback(async () => {
    const d = draftRef.current;
    if (d && !draftIsEmpty(d)) {
      clearTimeout(localSaveTimer.current);
      clearTimeout(serverSaveTimer.current);
      const now = { ...d, html: editor?.getHTML() || d.html };
      await store.putDraft(now);
      // Don't hold the window up if the network is slow; the copy on this computer is already safe.
      await Promise.race([saveToServer(now).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
      if (isPopout()) broadcast({ type: 'toast', text: 'Draft saved' }); else toast({ text: 'Draft saved' });
    } else if (d) {
      await store.deleteDraft(d.id);
    }
  }, [editor, saveToServer]);

  const saveAndClose = useCallback(async () => {
    closingRef.current = true;
    // A scheduled email being edited stays scheduled, with the changes, at the same time.
    const sched = draftRef.current?.scheduledAt;
    if (sched) { await send(sched > Date.now() + 60000 ? sched : undefined); return; }
    await keepDraft();
    await close();
  }, [keepDraft, close, send]);

  /** "Back to drafts": no longer scheduled; kept as an ordinary draft with your changes. */
  const backToDrafts = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    await unschedule(d.id);
    draftRef.current = { ...d, scheduledAt: undefined };
    await keepDraft();
    toast({ text: 'No longer scheduled. It\'s in your drafts.' });
    await close();
  }, [keepDraft, close]);

  const discard = useCallback(async () => {
    const d = draftRef.current;
    sentRef.current = true;
    clearTimeout(serverSaveTimer.current);
    clearTimeout(localSaveTimer.current);
    if (d?.scheduledAt) {
      // Throwing away changes to a scheduled email: the email itself stays scheduled as it was.
      await store.deleteDraft(d.id);
      toast({ text: 'Changes thrown away. It\'s still scheduled as before.' });
      await close();
      return;
    }
    if (d) {
      await store.deleteDraft(d.id);
      if (d.serverDraftId && d.serverAccountId) providerFor(d.serverAccountId)?.deleteDraft(d.serverDraftId);
    }
    await close();
  }, [close]);

  // The window's own close button (pop out windows). Sent or empty emails just close. Otherwise ask whether to keep it,
  // unless that has been decided in Settings.
  useEffect(() => {
    if (!isPopout() || !isTauri()) return;
    let off: (() => void) | undefined;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().onCloseRequested(async (e) => {
      const d = draftRef.current;
      if (closingRef.current || sentRef.current || !d || draftIsEmpty({ ...d, html: editor?.getHTML() || d.html })) { trackClosed(draftId); return; }
      e.preventDefault();
      let choice = useSettings.getState().closeUnsent;
      if (choice === 'ask') {
        const r = await askKeepDraft();
        if (r.choice === 'cancel') return;
        choice = r.choice;
        if (r.remember) useSettings.getState().set({ closeUnsent: r.choice });
      }
      closingRef.current = true;
      if (choice === 'save') await keepDraft();
      else await discard();
      trackClosed(draftId);
      await closeThisWindow();
    })).then((f) => { off = f; }).catch(() => {});
    return () => { off?.(); };
  }, [editor, draftId, keepDraft, discard]);

  const popOut = async () => {
    const d = draftRef.current;
    if (!d) return;
    await store.putDraft({ ...d, html: editor?.getHTML() || d.html });
    if (await openPopout(`compose/${d.id}`, d.subject || 'Email')) useMail.setState({ inlineDraftId: undefined });
  };

  // Keyboard: Send, and Reply / Reply All / Forward switch the draft (see Settings > Keyboard shortcuts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!draftRef.current) return;
      const within = rootRef.current?.contains(document.activeElement) || isPopout();
      if (!within) return;
      if (useDialogs.getState().pending) return;
      const st = useSettings.getState();
      const action = matchAction(e, st.keybindings, false, { inComposer: true });
      const hasSource = Boolean(draftRef.current.sourceMessageId);
      if (action === 'send') { e.preventDefault(); e.stopPropagation(); const at = draftRef.current.scheduledAt; send(at && at > Date.now() + 60000 ? at : undefined); }
      else if (action === 'reply' && hasSource) { e.preventDefault(); e.stopPropagation(); changeMode('reply'); }
      else if (action === 'replyAll' && hasSource) { e.preventDefault(); e.stopPropagation(); changeMode('replyAll'); }
      else if (action === 'forward' && hasSource) { e.preventDefault(); e.stopPropagation(); changeMode('forward'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveToServer(draftRef.current); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [send, changeMode, saveToServer]);
  const rootRef = useRef<HTMLDivElement>(null);

  // ---------- big attachments ----------
  const uploadToDrive = async () => {
    const files = bigFiles;
    const d = draftRef.current;
    if (!files || !d) return;
    const hit = findAlias(accounts, d.fromEmail, d.fromAccountId);
    const p = hit && providerFor(hit.account.id);
    if (!p?.uploadLargeFile) { toast({ text: 'Large file links need a Google account' }); setBigFiles(null); return; }
    setUploading(true);
    try {
      for (const f of files) {
        const url = await p.uploadLargeFile(f.name, f.type || 'application/octet-stream', new Uint8Array(await f.arrayBuffer()));
        update((cur) => ({ ...cur, driveLinks: [...cur.driveLinks, { name: f.name, url }], updatedAt: Date.now() }));
      }
      toast({ text: 'Uploaded to Google Drive. Anyone with the link can view.' });
    } catch (e) {
      toast({ text: `Upload failed: ${e instanceof Error ? e.message : e}` });
    } finally {
      setUploading(false);
      setBigFiles(null);
    }
  };

  if (!draft) return <div className="composer"><div className="empty">Loading draft...</div></div>;

  const signature = draftSignature(draft, { ...composeContext() });
  const fromHit = findAlias(accounts, draft.fromEmail, draft.fromAccountId);
  const fromAccount = fromHit?.account;
  const totalSize = draft.attachments.reduce((n, a) => n + a.size, 0);
  const writingCss = writingStyle();
  const laterOptions = sendLaterOptions();

  // The files on this draft (and those carried over from the email being forwarded), for opening and previewing.
  const draftFiles: DraftFile[] = [
    ...draft.attachments.map(draftFile),
    ...(draft.includeSourceAttachments && source ? source.attachments.filter((a) => !a.inline).map((a) => ({ meta: a, load: () => getAttachmentData(source.id, a.id) })) : []),
  ];

  return (
    <div
      ref={rootRef}
      data-composer={draftId}
      className={`composer ${variant}`}
      style={{ position: 'relative' }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => {
        // Dropped onto the message itself: the editor has attached them already.
        if (!e.dataTransfer.files.length || e.defaultPrevented) { setDragOver(false); return; }
        e.preventDefault();
        setDragOver(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {dragOver && <div className="drop-hint">Drop to attach</div>}
      <div className="comp-top">
        {draft.sourceMessageId ? (
          <select className="mode-select" aria-label="Reply type" value={draft.mode} onChange={(e) => changeMode(e.target.value as ComposeMode)} title="Switch without losing what you've written (Ctrl+R, Ctrl+Shift+R, Ctrl+Shift+F)">
            <option value="reply">Reply</option>
            <option value="replyAll">Reply All</option>
            <option value="forward">Forward</option>
          </select>
        ) : (
          <strong>{MODE_LABEL[draft.mode]}</strong>
        )}
        <span style={{ flex: 1 }} />
        {draft.scheduledAt
          ? <button className="btn primary" onClick={() => void saveAndClose()} title="Save your changes and keep the same send time" style={{ padding: '4px 10px' }}><Icon name="clock" /> Keep scheduled</button>
          : <button className="btn primary" onClick={() => send()} title="Send (Ctrl+Enter)" style={{ padding: '4px 10px' }}><Icon name="send" /> Send</button>}
        {variant === 'inline' && <button className="icon-btn" title="Pop out into its own window" aria-label="Pop out" onClick={popOut}><Icon name="popout" /></button>}
        <button className="btn" onClick={saveAndClose} title="Close this and keep it as a draft" style={{ padding: '4px 10px' }}><Icon name="file" /> Save &amp; close</button>
      </div>

      {draft.scheduledAt && (
        <div className="sched-banner"><Icon name="clock" size={14} /> Scheduled for {new Date(draft.scheduledAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Keep scheduled saves your changes and keeps this time.</div>
      )}
      <div className="comp-field">
        <label htmlFor={`from-${draft.id}`}>From</label>
        <span className="dot" style={{ background: fromAccount?.colour, marginTop: 10 }} />
        <select id={`from-${draft.id}`} value={fromHit ? `${fromHit.account.id}|${fromHit.alias.email}` : ''} onChange={(e) => { const [accountId, ...rest] = e.target.value.split('|'); update({ fromAccountId: accountId, fromEmail: rest.join('|') }); }}>
          {accounts.map((acc) => (
            <optgroup key={acc.id} label={acc.label}>
              {aliases.filter((a) => a.account.id === acc.id).map(({ alias }) => (
                <option key={alias.email} value={`${acc.id}|${alias.email}`}>{alias.name} &lt;{alias.email}&gt;</option>
              ))}
            </optgroup>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {/* Each one shows or hides its line. A line with addresses in it stays, so nothing is hidden by accident. */}
          {(['cc', 'bcc'] as const).map((k) => {
            const shown = k === 'cc' ? showCc : showBcc;
            const set = k === 'cc' ? setShowCc : setShowBcc;
            const filled = draft[k].length > 0;
            const name = k === 'cc' ? 'Cc' : 'Bcc';
            return (
              <button key={k} className={`btn ghost ${shown ? 'active' : ''}`} aria-pressed={shown}
                title={shown ? (filled ? `Remove the ${name} addresses to hide this line` : `Hide ${name}`) : `Show ${name}`}
                onClick={() => { if (!shown) set(true); else if (!filled) set(false); }}>{name}</button>
            );
          })}
        </span>
      </div>
      <RecipientField label="To" value={draft.to} contacts={contacts} onAdd={(l) => addRecipients('to', l)} onRemove={(e) => removeRecipient('to', e)} autoFocus={draft.mode === 'new' || draft.mode === 'forward'} />
      {showCc && <RecipientField label="Cc" value={draft.cc} contacts={contacts} onAdd={(l) => addRecipients('cc', l)} onRemove={(e) => removeRecipient('cc', e)} />}
      {showBcc && <RecipientField label="Bcc" value={draft.bcc} contacts={contacts} onAdd={(l) => addRecipients('bcc', l)} onRemove={(e) => removeRecipient('bcc', e)} />}
      <div className="comp-field">
        <label htmlFor={`subj-${draft.id}`}>Subject</label>
        <input id={`subj-${draft.id}`} className="plain" value={draft.subject} onChange={(e) => update({ subject: e.target.value })} onKeyDown={(e) => { /* Tab goes straight to the message, past the formatting bar. */ if (e.key === 'Tab' && !e.shiftKey && editor) { e.preventDefault(); editor.commands.focus(); } }} spellCheck lang="en-GB" style={{ fontWeight: 600 }} />
      </div>

      <FormatBar
        editor={editor}
        defaultFont={s.writingFont}
        defaultSize={s.writingSize}
        end={<SignaturePicker fromEmail={draft.fromEmail} value={draft.signatureOf} onChange={(v) => update({ signatureOf: v })} />}
        extra={
          <>
            <span className="sep" />
            <button type="button" className="icon-btn" title="Paste as quote" aria-label="Paste as quote" onMouseDown={(e) => e.preventDefault()} onClick={() => editor && pasteAsQuote(editor)}><Icon name="quote" size={15} /><span style={{ fontSize: 10, marginLeft: -2 }}>+</span></button>
            <button type="button" className="icon-btn" title="Dictate: press the Windows key and H" aria-label="Dictate" onMouseDown={(e) => e.preventDefault()} onClick={() => { editor?.commands.focus(); toast({ text: 'Press the Windows key and H together to speak. Windows types what you say.', ttl: 6000 }); }}><Icon name="mic" size={15} /></button>
            <button type="button" className="icon-btn" title="Attach files" aria-label="Attach files" onClick={() => fileInput.current?.click()}><Icon name="paperclip" size={15} /></button>
            <button type="button" className="icon-btn" title="Templates" aria-label="Templates" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), s.templates.length ? s.templates.map((t) => ({ label: t.name, icon: 'template', onClick: () => editor?.chain().focus().insertContent(t.html).run() })) : [{ label: 'No templates yet. Add them in Settings.', disabled: true }])}><Icon name="template" size={15} /></button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          </>
        }
      />

      <div className="editor-wrap" onClick={(e) => { if (e.target === e.currentTarget) editor?.commands.focus('end'); }}>
        <div style={cssToStyle(writingCss)}>
          <EditorContent editor={editor} onContextMenu={(e) => { if (!editor) return; e.preventDefault(); const at = { x: e.clientX, y: e.clientY }; void editorMenuWithSpelling(editor, at.x, at.y).then((items) => menu.open(at, items)); }} />
        </div>
        {s.signaturePlacement === 'above' && signature && <div className="signature-preview" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signature) }} />}
        {draft.driveLinks.length > 0 && (
          <div className="signature-preview">
            {draft.driveLinks.map((l) => <div key={l.url}><Icon name="link" size={12} /> {l.name} (Google Drive link)</div>)}
          </div>
        )}
        {draft.quotedHtml && (
          <div className="quote-toggle">
            <button className="btn ghost" onClick={() => update({ includeQuote: !draft.includeQuote })}>
              {draft.includeQuote ? (draft.mode === 'forward' ? 'Forwarded email included' : 'Quoted email included') : 'Quoted email removed'} · {draft.includeQuote ? 'Remove' : 'Include'}
            </button>
            {draft.includeQuote && <div className="quoted" dangerouslySetInnerHTML={{ __html: sanitizeQuote(draft.quotedHtml) }} />}
          </div>
        )}
        {s.signaturePlacement === 'below' && signature && <div className="signature-preview" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signature) }} />}
      </div>

      {(draft.attachments.length > 0 || (draft.includeSourceAttachments && source?.attachments.some((a) => !a.inline))) && (
        <div className="comp-attachments">
          {draft.attachments.map((a, i) => (
            <span key={a.id} className="attachment">
              <button className="att-open" title={`Open ${a.filename}`} onClick={() => void openDraftFile(draftFiles, i).then((n) => n !== null && setFilePreview(n))}>
                <Icon name="paperclip" />
                <span className="info"><div className="fname">{a.filename}</div><div className="fsize">{fileSize(a.size)}</div></span>
              </button>
              <button className="icon-btn" aria-label={`Remove ${a.filename}`} onClick={() => update((d) => ({ ...d, attachments: d.attachments.filter((x) => x.id !== a.id), updatedAt: Date.now() }))}><Icon name="close" size={13} /></button>
            </span>
          ))}
          {draft.includeSourceAttachments && source?.attachments.filter((a) => !a.inline).map((a, j) => (
            <span key={a.id} className="attachment" title="From the original email">
              <button className="att-open" title={`Open ${a.filename}`} onClick={() => void openDraftFile(draftFiles, draft.attachments.length + j).then((n) => n !== null && setFilePreview(n))}>
                <Icon name="forward" />
                <span className="info"><div className="fname">{a.filename}</div><div className="fsize">{fileSize(a.size)} · forwarded</div></span>
              </button>
            </span>
          ))}
          {filePreview !== null && <DraftFilesPreview files={draftFiles} start={filePreview} onClose={() => setFilePreview(null)} />}
          <span className="fsize" style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>{fileSize(totalSize)} of 25 MB</span>
        </div>
      )}

      <div className="comp-foot">
        {draft.scheduledAt ? (
          <div className="btn-group">
            <button className="btn primary" onClick={() => void saveAndClose()} title="Save your changes and keep the same send time"><Icon name="clock" /> Keep scheduled</button>
            <button className="btn primary" aria-label="More sending choices" title="Send now, change the time, or back to drafts" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), [
              { label: 'Send now', icon: 'send', onClick: () => send() },
              { heading: 'Change time' },
              ...laterOptions.map((o) => ({ label: o.label, icon: 'clock' as const, onClick: () => send(o.at) })),
              { label: 'Pick a date and time...', icon: 'calendar', onClick: () => setLaterOpen(true) },
              { divider: true },
              { label: 'Back to drafts', icon: 'undo', onClick: () => void backToDrafts() },
            ])}><Icon name="chevronDown" /></button>
          </div>
        ) : (
          <div className="btn-group">
            <button className="btn primary" onClick={() => send()} title="Send (Ctrl+Enter)"><Icon name="send" /> Send</button>
            <button className="btn primary" aria-label="Send later" title="Send later" onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), [
              { heading: 'Send later' },
              ...laterOptions.map((o) => ({ label: o.label, icon: 'clock' as const, onClick: () => send(o.at) })),
              { label: 'Pick a date and time...', icon: 'calendar', onClick: () => setLaterOpen(true) },
            ])}><Icon name="chevronDown" /></button>
          </div>
        )}
        <button className="btn" onClick={saveAndClose} title="Close this and keep it as a draft"><Icon name="file" /> Save &amp; close</button>
        <button className="btn" onClick={() => fileInput.current?.click()} title="Attach files (or drag them onto the email)"><Icon name="paperclip" /> Attach</button>
        <label className="check" style={{ padding: 0 }} title="Brings this back as a reminder if nobody replies">
          <Icon name="bell" size={14} />
          <select className="mode-select" aria-label="Follow up reminder" value={draft.followUpDays || 0} onChange={(e) => update({ followUpDays: Number(e.target.value) || undefined })}>
            <option value={0}>No follow up</option>
            <option value={1}>Remind me in 1 day if no reply</option>
            <option value={3}>Remind me in 3 days if no reply</option>
            <option value={7}>Remind me in 1 week if no reply</option>
          </select>
        </label>
        <span className="grow" />
        <span style={{ color: 'var(--text-faint)', fontSize: '0.86em' }}>{savedAt ? `Draft saved ${new Date(savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        <button className="icon-btn" title="Discard draft" aria-label="Discard draft" onClick={discard}><Icon name="trash" /></button>
      </div>

      {bigFiles && (
        <Dialog
          title="Too big to attach"
          onClose={() => setBigFiles(null)}
          actions={<>
            <button className="btn" onClick={() => setBigFiles(null)}>Cancel</button>
            <button className="btn primary" disabled={uploading} onClick={uploadToDrive}>{uploading ? 'Uploading...' : 'Send as Google Drive link'}</button>
          </>}
        >
          <p>{bigFiles.map((f) => `${f.name} (${fileSize(f.size)})`).join(', ')} would take this email over Gmail's 25 MB limit.</p>
          <p style={{ color: 'var(--text-muted)' }}>I can upload {bigFiles.length > 1 ? 'them' : 'it'} to your Google Drive and put a link in the email instead. Anyone with the link can view.</p>
        </Dialog>
      )}
      {laterOpen && <SendLaterPicker initial={draft.scheduledAt} onClose={() => setLaterOpen(false)} onPick={(at) => { setLaterOpen(false); send(at); }} />}
      {menu.node}
    </div>
  );
}

/** The classic "are you sure?" checks. Each can be switched off from its own dialog or in Settings. */
async function preSendChecks(d: Draft, bodyText: string): Promise<boolean> {
  const w = useSettings.getState().warnings;
  const off = (key: keyof typeof w) => () => useSettings.getState().set({ warnings: { ...useSettings.getState().warnings, [key]: false } });
  if (w.noSubject && !d.subject.trim()) {
    if (!(await askConfirm('Send without a subject?', 'This email has no subject line.', 'Send anyway', { onOptOut: off('noSubject') }))) return false;
  }
  const mentions = /\b(attach(ed|ment|ments|ing)?|enclosed|i('ve| have) included|please find|find (it )?below|see the (file|doc|document|pdf|link)|here('s| is| are) the (file|files|doc|pdf|quote|invoice|photos?|images?))\b/i;
  const hasFiles = d.attachments.length > 0 || d.driveLinks.length > 0 || d.includeSourceAttachments || /<img/i.test(d.html);
  if (w.missingAttachment && !hasFiles && (mentions.test(bodyText) || mentions.test(d.subject))) {
    if (!(await askConfirm('Forgot an attachment?', 'You mention an attachment, but nothing is attached.', 'Send anyway', { onOptOut: off('missingAttachment') }))) return false;
  }
  const count = d.to.length + d.cc.length + d.bcc.length;
  if (w.manyRecipients && count > 10) {
    if (!(await askConfirm(`Send to ${count} people?`, 'That\'s a lot of recipients. Check it isn\'t an accidental Reply All.', 'Send', { onOptOut: off('manyRecipients') }))) return false;
  }
  const source = d.sourceMessageId ? useMail.getState().messages[d.sourceMessageId] : undefined;
  if (w.fromMismatch && source && d.mode !== 'forward') {
    const expected = pickFromForMessage(source, composeContext());
    if (expected && expected.toLowerCase() !== d.fromEmail.toLowerCase()) {
      if (!(await askConfirm('Different From address', `This email was sent to ${expected}, but you're replying from ${d.fromEmail}.`, 'Send anyway', { onOptOut: off('fromMismatch') }))) return false;
    }
  }
  return true;
}

export function cssToStyle(css: string): React.CSSProperties {
  const out: Record<string, string> = {};
  css.split(';').forEach((rule) => {
    const [k, v] = rule.split(':');
    if (k && v) out[k.trim().replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = v.trim();
  });
  return out as React.CSSProperties;
}

function sanitizeQuote(html: string): string {
  // Quoted mail is untrusted: strip anything active and hold back remote images.
  // Pictures and media from the internet are left out entirely (however their address is written), so replying never
  // tells a sender you opened their email.
  const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input', 'button', 'picture', 'source', 'video', 'audio', 'svg'], FORBID_ATTR: ['style', 'srcset', 'background', 'poster'], RETURN_DOM: true }) as HTMLElement;
  clean.querySelectorAll('img').forEach((img) => {
    const src = (img.getAttribute('src') || '').trim();
    if (!/^(data:|cid:|blob:)/i.test(src)) {
      const note = document.createElement('span');
      note.style.opacity = '.6';
      note.textContent = '[image]';
      img.replaceWith(note);
    }
  });
  return clean.innerHTML;
}
