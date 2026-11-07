// The print preview: its own window, with its own Print, Save as PDF and Close buttons, so closing it
// can never close the mail window by mistake.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { threadPage, savePdfPage } from '../lib/print';
import { closeThisWindow } from '../lib/platform';

export function PrintPreview({ threadKey }: { threadKey: string }) {
  const [page, setPage] = useState<{ html: string; subject: string } | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let alive = true;
    threadPage(threadKey).then((p) => { if (alive) setPage(p ?? null); }).catch(() => { if (alive) setPage(null); });
    return () => { alive = false; };
  }, [threadKey]);

  const print = () => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeThisWindow();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); print(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  useEffect(() => { if (page) document.title = `Print: ${page.subject}`; }, [page]);

  return (
    <div className="print-preview">
      <div className="pp-bar">
        <button className="btn primary" disabled={!page} onClick={print}><Icon name="printer" /> Print</button>
        <button className="btn" disabled={!page} onClick={async () => setNote(await savePdfPage(page!))}><Icon name="filePdf" /> Save as PDF</button>
        <span className="pp-note" role="status" aria-live="polite">{note}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={() => closeThisWindow()}><Icon name="close" size={14} /> Close</button>
      </div>
      {page === undefined && <div className="pane-empty">Getting the page ready...</div>}
      {page === null && <div className="pane-empty">That conversation couldn't be found.</div>}
      {page && <iframe ref={frame} className="pp-frame" title="Print preview" srcDoc={page.html} />}
    </div>
  );
}
