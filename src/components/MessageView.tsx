// One email inside the reading pane: sender, image banner, body, attachments.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { EmailFrame } from './EmailFrame';
import { InviteCard } from './InviteCard';
import { AttachmentPeek, AttachmentPreview, previewKind } from './AttachmentPreview';
import { avatarColour, fileSize, fullDate, initials, useMenu } from './ui';
import { renderEmail, plainTextOf } from '../lib/render';
import { loadBody, refetchBody, looksGarbled, getAttachmentData, markRead, messagesInThread, useMail, unsubscribe, toggleVip, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { saveFile, saveFilesToFolder, openExternal } from '../lib/platform';
import { askConfirm } from '../lib/dialogs';
import { bytesToBase64 } from '../lib/mime';
import { startCompose, editServerDraft } from '../lib/composeActions';
import { messageMenu } from '../lib/actions';
import { threadKey } from '../lib/mailbox';
import type { Message } from '../lib/types';

/** True when the email's HTML really uses this picture (cid:...), so it needs no chip of its own. */
/** The little letters on an attachment's tile: PDF, JPG, ICS and so on. */
function fileTag(a: Message['attachments'][number]): string {
  const ext = (a.filename.match(/.([A-Za-z0-9]{1,5})$/)?.[1] || a.mimeType.split('/')[1] || 'file').toUpperCase();
  return ext.slice(0, 4);
}

/** A colour family for the tile: documents, pictures, calendar files, everything else. */
function fileTone(a: Message['attachments'][number]): string {
  if (/calendar|ics/i.test(a.mimeType) || /.ics$/i.test(a.filename)) return 'cal';
  if (a.mimeType.startsWith('image/')) return 'img';
  if (/pdf/i.test(a.mimeType) || /.pdf$/i.test(a.filename)) return 'pdf';
  if (/word|document|sheet|excel|presentation|powerpoint|text|csv/i.test(a.mimeType)) return 'doc';
  return 'other';
}

function pointedAt(m: Message, a: Message['attachments'][number]): boolean {
  return Boolean(a.contentId && m.bodyHtml && m.bodyHtml.toLowerCase().includes(`cid:${a.contentId.toLowerCase()}`));
}

/** The <name.jpeg> note in a plain text email for this attachment: same name, or same name with another picture extension. */
function noteFor(text: string, a: Message['attachments'][number]): string | undefined {
  if (text.includes(`<${a.filename}>`)) return a.filename;
  const stem = a.filename.replace(/\.[^.]+$/, '').toLowerCase();
  const notes = text.match(/<[^<>\n]{1,200}\.(?:jpe?g|png|gif|heic|webp)>/gi) || [];
  const hit = notes.find((n) => n.slice(1, -1).replace(/\.[^.]+$/, '').toLowerCase() === stem);
  return hit?.slice(1, -1);
}

export function MessageView({ message, expanded, onToggle }: { message: Message; expanded: boolean; onToggle: () => void; isLatest?: boolean }) {
  const account = useMail((s) => s.accounts.find((a) => a.id === message.accountId));
  const contacts = useMail((s) => s.contacts);
  const imagePolicy = useSettings((s) => s.imagePolicy);
  const trusted = useSettings((s) => s.trustedSenders);
  const blockTrackers = useSettings((s) => s.blockTrackers);
  const darkEmails = useSettings((s) => s.darkEmails);
  const readingFont = useSettings((s) => s.readingFont);
  const theme = useSettings((s) => s.theme);
  const vips = useSettings((s) => s.vips);
  const toggleIn = useSettings((s) => s.toggleIn);
  const [loaded, setLoaded] = useState<boolean>(message.bodyLoaded);
  const [allowOnce, setAllowOnce] = useState(false);
  const [darkOverride, setDarkOverride] = useState<boolean | null>(null);
  const [previewAt, setPreviewAt] = useState<number | null>(null);
  const [peek, setPeek] = useState<{ i: number; rect: DOMRect } | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout>>();
  const [inline, setInline] = useState<Record<string, string>>({});
  const [hover, setHover] = useState<{ href: string; mismatch?: string } | null>(null);
  const menu = useMenu();

  useEffect(() => {
    if (expanded && !message.bodyLoaded) loadBody(message.id).then(() => setLoaded(true));
  }, [expanded, message.id, message.bodyLoaded]);

  // Inline (cid:) images are part of the email itself, so they always load.
  useEffect(() => {
    if (!expanded || !message.bodyLoaded) return;
    // Pictures the email's HTML points at (by cid), plus pictures the text marks as <name.jpeg> (plain text or HTML).
    const text = message.bodyHtml ? plainTextOf(message.bodyHtml) : message.bodyText || '';
    const jobs = [
      ...message.attachments.filter((a) => a.contentId && pointedAt(message, a)).map((a) => ({ a, key: a.contentId! })),
      ...message.attachments.filter((a) => a.mimeType.startsWith('image/') && !pointedAt(message, a) && noteFor(text, a)).map((a) => ({ a, key: `name:${noteFor(text, a)}` })),
    ];
    if (!jobs.length) return;
    let cancelled = false;
    Promise.all(
      jobs.map(async ({ a, key }) => {
        try {
          const data = await getAttachmentData(message.id, a.id);
          return [key, `data:${a.mimeType};base64,${bytesToBase64(data)}`] as const;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => !cancelled && setInline(Object.fromEntries(pairs.filter(Boolean) as [string, string][])));
    return () => { cancelled = true; };
  }, [expanded, message.id, message.bodyLoaded, message.attachments]);

  // An email saved before the symbol fix may show â€™ for an apostrophe. Fetch it again once.
  useEffect(() => {
    if (expanded && message.bodyLoaded && looksGarbled(message)) refetchBody(message.id);
  }, [expanded, message.id, message.bodyLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const sender = message.from.email.toLowerCase();
  const isKnown = useMemo(() => contacts.some((c) => c.email === sender), [contacts, sender]);
  const allowRemote = allowOnce || imagePolicy === 'always' || trusted.includes(sender) || (imagePolicy === 'known' && isKnown);
  const systemDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const appDark = theme === 'dark' || (theme === 'system' && systemDark);
  const dark = darkOverride ?? (darkEmails && appDark);

  const rendered = useMemo(
    () => (expanded && (loaded || message.bodyLoaded) ? renderEmail(message.bodyHtml, message.bodyText, { allowRemote, blockTrackers, dark, inlineImages: inline, font: readingFont }) : null),
    [expanded, loaded, message.bodyLoaded, message.bodyHtml, message.bodyText, allowRemote, blockTrackers, dark, inline, readingFont],
  );
  const onLinkHover = useCallback((h: { href: string; mismatch?: string } | null) => setHover(h), []);
  // Right click in the email body: the same actions as the list, plus Copy when text is selected.
  const onFrameContext = useCallback((at: { x: number; y: number; selection: string; link?: { href: string; mismatch: boolean } }) => {
    // A link gets its own menu: open it, or copy where it goes.
    if (at.link) {
      const { href, mismatch } = at.link;
      const mail = /^mailto:/i.test(href) ? decodeURIComponent(href.replace(/^mailto:/i, '').split('?')[0]) : '';
      const open = () => { if (/^(https?:|mailto:|tel:)/i.test(href)) openExternal(href); };
      const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast({ text: 'Copied', ttl: 1500 })).catch(() => {});
      menu.open({ x: at.x, y: at.y }, [
        ...(mail
          ? [{ label: 'New email to this address', icon: 'compose' as const, onClick: () => startCompose('new', undefined, { extra: { to: [{ email: mail }] } }) }, { label: 'Copy email address', icon: 'file' as const, onClick: () => copy(mail) }]
          : [{ label: 'Open link in your browser', icon: 'link' as const, onClick: () => (mismatch ? askConfirm('This link looks misleading', `It says one thing but really goes to:
${href}`, 'Open anyway').then((ok) => ok && open()) : open()) }, { label: 'Copy link address', icon: 'file' as const, onClick: () => copy(href) }]),
        ...(at.selection ? [{ divider: true as const }, { label: 'Copy selected text', icon: 'file' as const, onClick: () => copy(at.selection) }] : []),
      ]);
      return;
    }
    const items = messageMenu([threadKey(message)]);
    menu.open({ x: at.x, y: at.y }, at.selection ? [{ label: 'Copy', icon: 'file', onClick: () => { navigator.clipboard?.writeText(at.selection).catch(() => {}); } }, { divider: true }, ...items] : items);
  }, [message]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = message.from.name || message.from.email;
  const attachments = message.attachments.filter((a) => !pointedAt(message, a));

  const download = async (id: string, filename: string, mime: string) => {
    try {
      await saveFile(filename, await getAttachmentData(message.id, id), mime);
    } catch (e) {
      toast({ text: `Couldn't save ${filename}: ${e instanceof Error ? e.message : e}` });
    }
  };

  const saveAll = async () => {
    try {
      const files = await Promise.all(attachments.map(async (a) => ({ filename: a.filename, mimeType: a.mimeType, data: await getAttachmentData(message.id, a.id) })));
      const n = await saveFilesToFolder(files);
      if (n) toast({ text: n === 1 ? 'Saved 1 file' : `Saved ${n} files` });
    } catch (e) {
      toast({ text: `Couldn't save the files: ${e instanceof Error ? e.message : e}` });
    }
  };

  if (!expanded) {
    return (
      <div className="msg collapsed" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <div className="msg-head">
          <span className="avatar" style={{ background: avatarColour(sender) }}>{initials(name)}</span>
          <div className="msg-who">
            <div className="name">{message.isDraft && <span className="draft-tag">Draft</span>}{name}</div>
            <div className="snip">{message.snippet}</div>
          </div>
          <div className="msg-date">{fullDate(message.date)}</div>
        </div>
      </div>
    );
  }

  return (
    <article className="msg" aria-label={`Email from ${name}`}>
      <div className="msg-head">
        <span className="avatar" style={{ background: avatarColour(sender) }}>{initials(name)}</span>
        <div className="msg-who" onClick={onToggle} title="Click to fold this message away">
          <div className="name">
            {message.isDraft && <span className="draft-tag">Draft</span>}{name} <span className="addr">&lt;{message.from.email}&gt;</span>
            {vips.includes(sender) && <span title="Important sender" style={{ color: '#f0a020', marginLeft: 6 }}><Icon name="star" size={12} /></span>}
          </div>
          <div className="to">
            To: {message.to.map((a) => a.name || a.email).join(', ') || '(undisclosed)'}
            {message.cc.length > 0 && <> · Cc: {message.cc.map((a) => a.name || a.email).join(', ')}</>}
          </div>
        </div>
        <div className="msg-date">
          <span>{fullDate(message.date)}</span>
          {account && <span className="acct-chip"><span className="dot" style={{ background: account.colour }} />{account.label}</span>}
        </div>
        <button
          className="icon-btn"
          aria-label="More actions"
          onClick={(e) => menu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), [
            { label: 'Reply', icon: 'reply', onClick: () => startCompose('reply', message) },
            { label: 'Reply All', icon: 'replyAll', onClick: () => startCompose('replyAll', message) },
            { label: 'Forward', icon: 'forward', onClick: () => startCompose('forward', message) },
            { divider: true },
            { label: 'Mark as unread', icon: 'mail', onClick: () => markRead([message.id], false) },
            { label: 'Mark as unread from here', icon: 'mail', onClick: () => markRead(messagesInThread(threadKey(message)).filter((m) => m.date >= message.date).map((m) => m.id), false) },
            { divider: true },
            { label: vips.includes(sender) ? 'Remove from important senders' : 'Mark sender as important', icon: 'star', onClick: () => toggleVip(sender) },
            { label: trusted.includes(sender) ? 'Stop loading images from this sender' : 'Always load images from this sender', icon: 'imageOff', onClick: () => toggleIn('trustedSenders', sender) },
            { label: dark ? 'Show original colours' : 'Show in dark mode', icon: dark ? 'sun' : 'moon', onClick: () => setDarkOverride(!dark) },
          ], 'right')}
        >
          <Icon name="more" />
        </button>
      </div>

      {message.listUnsubscribe && (
        <div className="banner">
          <span className="grow">This is a mailing list email.</span>
          <button className="btn" onClick={() => unsubscribe(message.id)}>Unsubscribe</button>
        </div>
      )}

      {rendered && rendered.remoteBlocked > 0 && !allowRemote && (
        <div className="banner">
          <Icon name="imageOff" />
          <span className="grow">Images are hidden so senders can't tell when you open this.{rendered.trackersBlocked > 0 && ` ${rendered.trackersBlocked} tracker${rendered.trackersBlocked > 1 ? 's' : ''} blocked.`}</span>
          <button className="btn primary" onClick={() => setAllowOnce(true)}>Load images</button>
          <button className="btn" onClick={() => toggleIn('trustedSenders', sender)}>Always load from this sender</button>
        </div>
      )}
      {rendered && allowRemote && rendered.trackersBlocked > 0 && (
        <div className="banner"><Icon name="shield" /><span className="grow">{rendered.trackersBlocked} tracker{rendered.trackersBlocked > 1 ? 's' : ''} blocked.</span></div>
      )}

      {message.isDraft && (
        <div className="draft-banner">
          <span className="draft-tag">Draft</span><span>Not sent yet.</span>
          <button className="btn" onClick={() => editServerDraft(message)}>Edit draft</button>
        </div>
      )}
      {message.attachments.some((a) => /calendar|ics/i.test(a.mimeType) || /.ics$/i.test(a.filename)) && <InviteCard message={message} />}
      <div className="frame-wrap">
        {rendered ? <EmailFrame html={rendered.html} onLinkHover={onLinkHover} onContext={onFrameContext} /> : <div className="empty">Loading...</div>}
      </div>

      {attachments.length > 0 && (
        <div className={`attachments ${attachments.length === 1 ? 'single' : 'chips'}`}>
          {attachments.map((a, i) => {
            const canPreview = previewKind(a) !== null;
            const single = attachments.length === 1;
            // Big files are slow to load, so they skip the hover preview and say to click instead.
            const big = a.size > 5 * 1024 * 1024;
            return (
              <div key={a.id} className="attachment" onContextMenu={(e) => { e.preventDefault(); setPeek(null); menu.open({ x: e.clientX, y: e.clientY }, [
                ...(canPreview ? [{ label: 'Preview', icon: 'eye' as const, onClick: () => setPreviewAt(i) }] : []),
                { label: 'Save...', icon: 'download' as const, onClick: () => download(a.id, a.filename, a.mimeType) },
                ...(attachments.length > 1 ? [{ label: `Save all ${attachments.length} to a folder...`, icon: 'folder' as const, onClick: saveAll }] : []),
              ]); }} onMouseEnter={(e) => { const rect = e.currentTarget.getBoundingClientRect(); clearTimeout(peekTimer.current); if (canPreview && !big) peekTimer.current = setTimeout(() => setPeek({ i, rect }), 400); }} onMouseLeave={() => { clearTimeout(peekTimer.current); setPeek(null); }}>
                <button className="open" onClick={() => (canPreview ? (setPeek(null), setPreviewAt(i)) : download(a.id, a.filename, a.mimeType))} title={canPreview ? (big ? `Large file: click to preview ${a.filename}` : `Preview ${a.filename}`) : `Save ${a.filename}`}>
                  <span className={`ftile ${fileTone(a)}`} aria-hidden="true">{fileTag(a)}</span>
                  <span className="info">
                    <div className="fname">{a.filename}</div>
                    <div className="fsize">{fileSize(a.size)}</div>
                  </span>
                </button>
                {single && canPreview && <button className="btn small" onClick={() => { setPeek(null); setPreviewAt(i); }}>Preview</button>}
                <button className="icon-btn" onClick={() => download(a.id, a.filename, a.mimeType)} title={`Save ${a.filename}`} aria-label={`Save ${a.filename}`}><Icon name="download" /></button>
              </div>
            );
          })}
          {attachments.length > 1 && (
            <button className="btn ghost" onClick={saveAll}>Save all</button>
          )}
        </div>
      )}

      {peek && previewAt === null && attachments[peek.i] && <AttachmentPeek messageId={message.id} item={attachments[peek.i]} at={peek.rect} />}
      {previewAt !== null && <AttachmentPreview messageId={message.id} items={attachments} start={previewAt} onClose={() => setPreviewAt(null)} />}

      {hover && (
        <div className={`link-status ${hover.mismatch ? 'bad' : ''}`}>
          {hover.mismatch ? `Careful: this link goes to ${hover.mismatch}` : hover.href}
        </div>
      )}
      {menu.node}
    </article>
  );
}
