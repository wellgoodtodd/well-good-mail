// Quick look at an attachment without saving it: PDFs, pictures, text, audio and video open in a window inside the app.
// The file is held in memory only, so nothing is written to disk and there is nothing to clean up.
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { fileSize } from './ui';
import { getAttachmentData, toast } from '../lib/mail';
import { saveFile } from '../lib/platform';
import type { AttachmentMeta } from '../lib/types';

type Kind = 'pdf' | 'image' | 'text' | 'audio' | 'video';

export function previewKind(a: Pick<AttachmentMeta, 'mimeType' | 'filename'>): Kind | null {
  const m = a.mimeType.toLowerCase();
  const n = a.filename.toLowerCase();
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (m.startsWith('image/') && !m.includes('svg') && !m.includes('tiff')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if ((m.startsWith('text/') && !m.includes('html')) || /\.(txt|csv|json|md|log|srt)$/.test(n)) return 'text';
  return null;
}

export function AttachmentPreview({ messageId, items, start, onClose }: { messageId: string; items: AttachmentMeta[]; start: number; onClose: () => void }) {
  const [at, setAt] = useState(start);
  const a = items[at];
  const kind = previewKind(a);
  const [url, setUrl] = useState<string>();
  const [text, setText] = useState<string>();
  const [bytes, setBytes] = useState<Uint8Array>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: string | undefined;
    setUrl(undefined); setText(undefined); setBytes(undefined); setFailed(false);
    getAttachmentData(messageId, a.id)
      .then((data) => {
        if (cancelled) return;
        setBytes(data);
        if (kind === 'text') return setText(new TextDecoder().decode(data.slice(0, 400_000)));
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
          <button className="icon-btn" aria-label="Close preview" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="attview-body">
          {failed ? <div className="empty">Couldn't load this file</div>
            : !kind ? <div className="empty">No preview for this kind of file. Use Save to keep it.</div>
            : kind === 'text' ? (text === undefined ? <div className="empty">Loading...</div> : <pre className="attview-text">{text}</pre>)
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

/** A small peek that appears when you rest the pointer on an attachment. */
export function AttachmentPeek({ messageId, item, at }: { messageId: string; item: AttachmentMeta; at: DOMRect }) {
  const kind = previewKind(item);
  const [url, setUrl] = useState<string>();
  const [text, setText] = useState<string>();

  useEffect(() => {
    if (!kind || kind === 'audio' || kind === 'video' || item.size > 8_000_000) return;
    let cancelled = false;
    let made: string | undefined;
    getAttachmentData(messageId, item.id)
      .then((data) => {
        if (cancelled) return;
        if (kind === 'text') return setText(new TextDecoder().decode(data.slice(0, 1500)));
        made = URL.createObjectURL(new Blob([data as BlobPart], { type: item.mimeType }));
        setUrl(kind === 'pdf' ? `${made}#toolbar=0&navpanes=0&view=FitH` : made);
      })
      .catch(() => {});
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [messageId, item.id, item.mimeType, item.size, kind]);

  if (!url && text === undefined) return null;
  const left = Math.max(8, Math.min(at.left, window.innerWidth - 328));
  return (
    <div className="peek" style={{ left, bottom: window.innerHeight - at.top + 8 }}>
      {kind === 'image' && url && <img src={url} alt="" />}
      {kind === 'pdf' && url && <iframe title={item.filename} src={url} tabIndex={-1} />}
      {kind === 'text' && <pre>{text}</pre>}
    </div>
  );
}
