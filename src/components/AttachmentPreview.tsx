// Quick look at an attachment without saving it: PDFs, pictures, Word documents, text, audio and video open in a window inside the app.
// The file is held in memory only, so nothing is written to disk and there is nothing to clean up.
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { fileSize } from './ui';
import { getAttachmentData, toast } from '../lib/mail';
import { saveFile, openWithApp, isTauri } from '../lib/platform';
import { base64ToBytes } from '../lib/mime';
import { docxToHtml } from '../lib/docPreview';
import { describeFile, isDocx } from '../lib/fileKinds';
import type { AttachmentMeta } from '../lib/types';

type Kind = 'pdf' | 'image' | 'text' | 'audio' | 'video' | 'word';

export function previewKind(a: Pick<AttachmentMeta, 'mimeType' | 'filename'>): Kind | null {
  const m = a.mimeType.toLowerCase();
  const n = a.filename.toLowerCase();
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (isDocx(a.filename, a.mimeType)) return 'word';
  if (m.startsWith('image/') && !m.includes('svg') && !m.includes('tiff')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if ((m.startsWith('text/') && !m.includes('html')) || /\.(txt|csv|json|md|log|srt)$/.test(n)) return 'text';
  return null;
}

export function AttachmentPreview({ messageId, items, start, onClose, onOpenApp, load }: { messageId?: string; items: AttachmentMeta[]; start: number; onClose: () => void; onOpenApp?: (a: AttachmentMeta) => void; load?: (a: AttachmentMeta) => Promise<Uint8Array> }) {
  const [at, setAt] = useState(start);
  const a = items[at];
  const kind = previewKind(a);
  const [url, setUrl] = useState<string>();
  const [text, setText] = useState<string>();
  const [bytes, setBytes] = useState<Uint8Array>();
  const [doc, setDoc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: string | undefined;
    setUrl(undefined); setText(undefined); setBytes(undefined); setDoc(undefined); setFailed(false);
    (load ? load(a) : getAttachmentData(messageId || '', a.id))
      .then(async (data) => {
        if (cancelled) return;
        setBytes(data);
        if (kind === 'text') return setText(new TextDecoder().decode(data.slice(0, 400_000)));
        if (kind === 'word') { const html = await docxToHtml(data); if (!cancelled) setDoc(html); return; }
        made = URL.createObjectURL(new Blob([data as BlobPart], { type: a.mimeType }));
        setUrl(made);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [messageId, a.id, a.mimeType, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setAt((i) => Math.min(items.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setAt((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length, onClose]);

  const save = async () => {
    try {
      if (bytes) await saveFile(a.filename, bytes, a.mimeType);
    } catch (e) {
      toast({ text: `Couldn't save ${a.filename}: ${e instanceof Error ? e.message : e}` });
    }
  };

  return (
    <div className="attview-back" onMouseDown={onClose}>
      <div className="attview" role="dialog" aria-label={`Preview of ${a.filename}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="attview-head">
          <span className="fname">{a.filename}</span>
          <span className="fsize">{fileSize(a.size)}{items.length > 1 ? ` · ${at + 1} of ${items.length}` : ''}</span>
          <span className="grow" />
          {items.length > 1 && (
            <>
              <button className="icon-btn" aria-label="Previous attachment" disabled={at === 0} onClick={() => setAt(at - 1)}><Icon name="chevronLeft" /></button>
              <button className="icon-btn" aria-label="Next attachment" disabled={at === items.length - 1} onClick={() => setAt(at + 1)}><Icon name="chevronRight" /></button>
            </>
          )}
          <button className="btn" onClick={save} disabled={!bytes}><Icon name="download" /> Save</button>
          {onOpenApp && kind === 'word' && <button className="btn primary" onClick={() => onOpenApp(a)}>Open in {describeFile(a.filename).app || 'its own app'}</button>}
          <button className="icon-btn" aria-label="Close preview" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="attview-body">
          {failed ? <div className="empty">Couldn't load this file</div>
            : !kind ? <div className="empty">No preview for this kind of file. Use Save to keep it.</div>
            : kind === 'text' ? (text === undefined ? <div className="empty">Loading...</div> : <pre className="attview-text">{text}</pre>)
            : kind === 'word' ? (doc === undefined ? <div className="empty">Loading...</div> : <iframe className="attview-doc" title={a.filename} sandbox="" srcDoc={doc} />)
            : !url ? <div className="empty">Loading...</div>
            : kind === 'pdf' ? <iframe title={a.filename} src={url} />
            : kind === 'image' ? <img src={url} alt={a.filename} />
            : kind === 'audio' ? <audio src={url} controls autoPlay={false} />
            : <video src={url} controls />}
        </div>
      </div>
    </div>
  );
}

/** A file attached to a draft (or carried over from the email being forwarded), as the preview window wants it. */
export interface DraftFile { meta: AttachmentMeta; load: () => Promise<Uint8Array> }

export const draftFile = (a: { id: string; filename: string; mimeType: string; size: number; dataB64: string }): DraftFile => ({
  meta: { id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, inline: false },
  load: async () => base64ToBytes(a.dataB64),
});

/**
 * Clicking a file on a draft: a preview inside the app when there is one, otherwise it opens in its own app (or
 * saves, in the browser). Returns the index to preview, or null when it was opened elsewhere.
 */
export async function openDraftFile(files: DraftFile[], i: number): Promise<number | null> {
  const f = files[i];
  if (previewKind(f.meta)) return i;
  try {
    const data = await f.load();
    if (isTauri()) await openWithApp(f.meta.filename, data, f.meta.mimeType);
    else await saveFile(f.meta.filename, data, f.meta.mimeType);
  } catch (e) {
    toast({ text: `Couldn't open ${f.meta.filename}: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
  }
  return null;
}

/** The preview window for a draft's files. */
export function DraftFilesPreview({ files, start, onClose }: { files: DraftFile[]; start: number; onClose: () => void }) {
  const byId = new Map(files.map((f) => [f.meta.id, f]));
  return (
    <AttachmentPreview items={files.map((f) => f.meta)} start={start} onClose={onClose}
      load={(a) => byId.get(a.id)!.load()}
      onOpenApp={isTauri() ? (a) => { void byId.get(a.id)!.load().then((d) => openWithApp(a.filename, d, a.mimeType)); } : undefined} />
  );
}

/** A small peek that appears when you rest the pointer on an attachment. */
export function AttachmentPeek({ messageId, item, at }: { messageId: string; item: AttachmentMeta; at: DOMRect }) {
  const kind = previewKind(item);
  const [url, setUrl] = useState<string>();
  const [text, setText] = useState<string>();
  const [doc, setDoc] = useState<string>();

  useEffect(() => {
    if (!kind || kind === 'audio' || kind === 'video' || item.size > 8_000_000) return;
    let cancelled = false;
    let made: string | undefined;
    getAttachmentData(messageId, item.id)
      .then(async (data) => {
        if (cancelled) return;
        if (kind === 'text') return setText(new TextDecoder().decode(data.slice(0, 1500)));
        if (kind === 'word') { const html = await docxToHtml(data); if (!cancelled) setDoc(html); return; }
        made = URL.createObjectURL(new Blob([data as BlobPart], { type: item.mimeType }));
        setUrl(kind === 'pdf' ? `${made}#toolbar=0&navpanes=0&view=FitH` : made);
      })
      .catch(() => {});
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [messageId, item.id, item.mimeType, item.size, kind]);

  if (!url && text === undefined && doc === undefined) return null;
  const left = Math.max(8, Math.min(at.left, window.innerWidth - 328));
  return (
    <div className="peek" style={{ left, bottom: window.innerHeight - at.top + 8 }}>
      {kind === 'image' && url && <img src={url} alt="" />}
      {kind === 'pdf' && url && <iframe title={item.filename} src={url} tabIndex={-1} />}
      {kind === 'text' && <pre>{text}</pre>}
      {kind === 'word' && doc && <iframe title={item.filename} sandbox="" srcDoc={doc} tabIndex={-1} className="peek-doc" />}
    </div>
  );
}

/** For files that can't be shown here: what it is, what opens it, and Open or Save. Stays while the pointer is on it. */
export function FileCard({ item, at, onOpen, onSave }: { item: AttachmentMeta; at: DOMRect; onOpen?: () => void; onSave: () => void }) {
  const d = describeFile(item.filename);
  const left = Math.max(8, Math.min(at.left, window.innerWidth - 288));
  return (
    <div className="file-card" style={{ left, bottom: window.innerHeight - at.top + 8 }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="file-card-top">
        <span className="file-card-name">{item.filename}</span>
        <span className="file-card-kind">{d.kind} · {fileSize(item.size)}</span>
      </div>
      <p>{d.blocked ? 'Programs and scripts are never opened from an email. Save it only if you trust who sent it.'
        : onOpen ? `Opens in ${d.app || 'its own app'}. Changes there aren't saved back to the email.`
        : 'No preview for this kind of file. Save it to open it.'}</p>
      <div className="file-card-actions">
        {onOpen && !d.blocked && <button className="btn primary small" onClick={onOpen}>Open{d.app ? ` in ${d.app}` : ''}</button>}
        <button className="btn small" onClick={onSave}><Icon name="download" size={13} /> Save</button>
      </div>
    </div>
  );
}
