import { useEffect, useRef, useState } from 'react';
import { Dialog } from './ui';
import { useDialogs, closeDialog } from '../lib/dialogs';

export function DialogHost() {
  const pending = useDialogs((s) => s.pending);
  const [value, setValue] = useState('');
  const [optOut, setOptOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setOptOut(false);
    if (pending?.kind === 'text') {
      setValue(pending.value || '');
      setTimeout(() => inputRef.current?.select(), 30);
    }
  }, [pending]);
  if (!pending) return null;
  if (pending.kind === 'keep') {
    const pick = (c: string) => closeDialog(c === 'cancel' ? 'cancel' : optOut ? `${c}+remember` : c);
    return (
      <Dialog
        title={pending.title}
        onClose={() => pick('cancel')}
        actions={<>
          <button className="btn" onClick={() => pick('cancel')}>Keep editing</button>
          <button className="btn" onClick={() => pick('discard')}>Close without saving</button>
          <button className="btn primary" onClick={() => pick('save')}>Save draft and close</button>
        </>}
      >
        {pending.message && <p>{pending.message}</p>}
        <label className="check" style={{ marginTop: 6 }}>
          <input id="dialog-remember" type="checkbox" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} />
          <span>Remember my choice. You can change it in Settings.</span>
        </label>
      </Dialog>
    );
  }
  const ok = () => {
    if (optOut) pending.onOptOut?.();
    closeDialog(pending.kind === 'text' ? value : true);
  };
  return (
    <Dialog
      title={pending.title}
      onClose={() => closeDialog(pending.kind === 'text' ? null : false)}
      actions={<>
        <button className="btn" onClick={() => closeDialog(pending.kind === 'text' ? null : false)}>{pending.cancelLabel || 'Cancel'}</button>
        <button className="btn primary" onClick={ok}>{pending.confirmLabel}</button>
      </>}
    >
      {pending.message && <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{pending.message}</p>}
      {pending.onOptOut && (
        <label className="check" style={{ marginTop: 6 }}>
          <input id="dialog-optout" type="checkbox" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} />
          <span>Don't warn me about this again</span>
        </label>
      )}
      {pending.kind === 'text' && (
        <input
          id="dialog-text"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok()}
          style={{ width: '100%', height: 32, border: '1px solid var(--border)', borderRadius: 7, padding: '0 8px', background: 'var(--bg-input)' }}
        />
      )}
    </Dialog>
  );
}
