// Settings › Signatures.
import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { FormatBar } from '../FormatBar';
import { editorExtensions, tidyForEditor } from '../editorExtensions';
import { useMail } from '../../lib/mail';
import { useSettings } from '../../lib/settings';
import { Row, Radio } from './shared';

export function SignatureEditor({ email, initial, onChange }: { email: string; initial: string; onChange: (html: string) => void }) {
  const font = useSettings((s) => s.writingFont);
  const size = useSettings((s) => s.writingSize);
  const editor = useEditor({ extensions: editorExtensions('Type or paste a signature'), editorProps: { attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Signature' } }, content: tidyForEditor(initial), onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()) }, [email]);
  return (
    <div className="sig-editor">
      <FormatBar editor={editor} defaultFont={font} defaultSize={size} />
      <div className="editor-wrap"><EditorContent editor={editor} /></div>
    </div>
  );
}

export function SignaturesTab() {
  const accounts = useMail((st) => st.accounts);
  const s = useSettings();
  const sorted = [...accounts].sort((a, b) => a.order - b.order);
  const [accId, setAccId] = useState(() => sorted.find((a) => a.aliases.some((x) => x.email === s.defaultFromEmail))?.id || sorted[0]?.id);
  const acc = sorted.find((a) => a.id === accId) || sorted[0];
  const aliases = acc ? (acc.aliases.length ? acc.aliases : [{ email: acc.email, name: acc.displayName, isDefault: true }]) : [];
  const [selected, setSelected] = useState(() => aliases.find((x) => x.isDefault)?.email || aliases[0]?.email || '');
  const pick = (id: string) => {
    const a = sorted.find((x) => x.id === id);
    setAccId(id);
    setSelected((a?.aliases.find((x) => x.isDefault) || a?.aliases[0])?.email || a?.email || '');
  };
  const current = aliases.find((x) => x.email === selected);
  const providerSig = current?.providerSignatureHtml || '';
  const value = selected in s.signatures ? s.signatures[selected] : providerSig;
  const modes = (acc && s.signatureModes[acc.id]) || {};
  const setMode = (k: 'replies' | 'forwards', v: 'same' | 'none') => acc && s.set({ signatureModes: { ...s.signatureModes, [acc.id]: { ...modes, [k]: v } } });
  const reload = () => { const keep = selected; setSelected(''); setTimeout(() => setSelected(keep)); };
  return (
    <>
      <h1>Signatures &amp; Addresses</h1>
      <section className="set-section acct-section">
        {/* Like Accounts: accounts on the left; the address and its signature on the right. */}
        <div className="acct-md">
          <div className="acct-list" role="listbox" aria-label="Accounts">
            {sorted.map((a) => (
              <button key={a.id} role="option" aria-selected={acc?.id === a.id} className={`acct-item ${acc?.id === a.id ? 'on' : ''}`} onClick={() => pick(a.id)}>
                <span className="dot" style={{ background: a.colour }} />
                <span className="acct-item-name">{a.label || a.email}</span>
                {a.aliases.length > 1 ? <span className="acct-count">{a.aliases.length}</span> : <span />}
              </button>
            ))}
          </div>
          {acc ? (
            <div className="acct-detail">
              <label className="sig-addr">
                <span className="sr-only">Address</span>
                <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Address">
                  {aliases.map((x) => <option key={x.email} value={x.email}>{x.name ? `${x.name} <${x.email}>` : x.email}</option>)}
                </select>
              </label>
              <p className="hint" style={{ margin: '4px 0 12px' }}>{aliases.length > 1 ? `${acc.label} can send from ${aliases.length} addresses. Each has its own signature.` : 'More addresses for this account are added in Gmail\'s own settings (Send mail as), then appear here.'}</p>
              {selected && <SignatureEditor key={selected} email={selected} initial={value} onChange={(html) => s.set({ signatures: { ...useSettings.getState().signatures, [selected]: html } })} />}
              <div style={{ display: 'flex', gap: 8, margin: '10px 0 4px', flexWrap: 'wrap' }}>
                {selected in s.signatures && current?.providerSignatureHtml !== undefined && <button className="btn ghost" onClick={() => { const next = { ...s.signatures }; delete next[selected]; s.set({ signatures: next }); reload(); }}>Use Gmail's signature</button>}
                <button className="btn ghost" onClick={() => { s.set({ signatures: { ...s.signatures, [selected]: '' } }); reload(); }}>No signature</button>
              </div>
              <div className="acct-sum" style={{ marginTop: 10 }}>
                <div className="acct-sum-row static"><span className="k">Replies</span><span className="v" /><select aria-label="Signature on replies" value={modes.replies || 'same'} onChange={(e) => setMode('replies', e.target.value as 'same' | 'none')}><option value="same">Same as new emails</option><option value="none">No signature</option></select></div>
                <div className="acct-sum-row static"><span className="k">Forwards</span><span className="v" /><select aria-label="Signature on forwards" value={modes.forwards || 'same'} onChange={(e) => setMode('forwards', e.target.value as 'same' | 'none')}><option value="same">Same as new emails</option><option value="none">No signature</option></select></div>
                <label className="acct-sum-row static"><span className="k">Use for new emails</span><span className="v" title="New emails from All Inboxes start from this address. Replies always go from the address the email came to." /><input type="checkbox" role="switch" className="switch" checked={s.defaultFromEmail === selected} onChange={(e) => e.target.checked && s.set({ defaultFromEmail: selected })} /></label>
              </div>
            </div>
          ) : <div className="acct-detail empty">Add an account to set signatures.</div>}
        </div>
      </section>
      <section className="set-section">
        <h2>Everywhere</h2>
        <Row label="Place the signature">
          <Radio name="sigplace" value={s.signaturePlacement} onChange={(v) => s.set({ signaturePlacement: v })} options={[{ value: 'above', label: 'Above the quoted email' }, { value: 'below', label: 'Below the quoted email' }]} />
        </Row>
      </section>
    </>
  );
}

// ---------- groups ----------
