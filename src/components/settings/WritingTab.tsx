// Settings › Writing.
import { useState } from 'react';
import { Icon } from '../Icon';
import { FONT_CHOICES } from '../editorExtensions';
import { syncWakes } from '../../lib/mail';
import { useSettings, type Settings as S } from '../../lib/settings';
import { SPELL_LANGS } from '../../lib/spell';
import { Row, Radio, Check } from './shared';
import { SignatureEditor } from './SignaturesTab';

export function WritingTab() {
  const s = useSettings();
  return (
    <>
      <h1>Composing</h1>
      <section className="set-section">
        <h2>Fonts</h2>
        <Row label="Interface font" htmlFor="uifont">
          <select id="uifont" value={s.interfaceFont} onChange={(e) => s.set({ interfaceFont: e.target.value })}>{['Inter', 'Segoe UI', 'Rubik', 'Atkinson Hyperlegible'].map((f) => <option key={f}>{f}</option>)}</select>
        </Row>
        <Row label="Writing font" htmlFor="wfont">
          <select id="wfont" value={s.writingFont} onChange={(e) => s.set({ writingFont: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f}>{f}</option>)}</select>
        </Row>
        <Row label="Writing size" htmlFor="wsize">
          <select id="wsize" value={s.writingSize} onChange={(e) => s.set({ writingSize: Number(e.target.value) })}>{[9, 10, 11, 12, 13, 14, 16].map((n) => <option key={n} value={n}>{n}pt</option>)}</select>
        </Row>
        <Row label="Writing colour" htmlFor="wcol">
          <input id="wcol" type="color" value={s.writingColour || '#1d1d1f'} onChange={(e) => s.set({ writingColour: e.target.value })} />
          {s.writingColour && <button className="btn ghost" onClick={() => s.set({ writingColour: '' })}>Default</button>}
        </Row>
        <Row label="Reading font for plain emails" htmlFor="rfont">
          <select id="rfont" value={s.readingFont} onChange={(e) => s.set({ readingFont: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f}>{f}</option>)}</select>
        </Row>
        <p className="hint">Rubik and Inter are built into the app. People reading your emails see them if they have the font, otherwise a similar one.</p>
      </section>
      <section className="set-section">
        <h2>Sending</h2>
        <Row label="Undo send window" htmlFor="undo">
          <select id="undo" value={s.undoSendSeconds} onChange={(e) => s.set({ undoSendSeconds: Number(e.target.value) as S['undoSendSeconds'] })}>
            {[0, 10, 20, 30, 60].map((n) => <option key={n} value={n}>{n === 0 ? 'Off' : `${n} seconds`}</option>)}
          </select>
        </Row>
        <Row label="Scheduled email when the app is closed" htmlFor="wake">
          <select id="wake" value={s.wakeToSend ? 'wake' : 'wait'} onChange={(e) => { s.set({ wakeToSend: e.target.value === 'wake' }); syncWakes(); }}>
            <option value="wake">Start Well Good Mail and send it (wakes the PC from sleep)</option>
            <option value="wait">Wait until Well Good Mail is open</option>
          </select>
        </Row>
        <Row label="Closing an unsent email" htmlFor="closeunsent">
          <select id="closeunsent" value={s.closeUnsent} onChange={(e) => s.set({ closeUnsent: e.target.value as S['closeUnsent'] })}>
            <option value="ask">Ask me</option>
            <option value="save">Save it as a draft</option>
            <option value="discard">Close without saving</option>
          </select>
        </Row>
        <Row label="Reply button does">
          <Radio name="defreply" value={s.defaultReply} onChange={(v) => s.set({ defaultReply: v })} options={[{ value: 'reply', label: 'Reply' }, { value: 'replyAll', label: 'Reply All' }]} />
        </Row>
        <Check checked={s.popOutCompose} onChange={(v) => s.set({ popOutCompose: v })}>Always open replies in their own window</Check>
        <Check checked={s.spellCheck} onChange={(v) => s.set({ spellCheck: v })}>Underline spelling mistakes while I write</Check>
        <Row label="Spelling" htmlFor="spelllang">
          <select id="spelllang" value={s.spellLang} onChange={(e) => s.set({ spellLang: e.target.value as typeof s.spellLang })}>
            {SPELL_LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Row>
      </section>
      <section className="set-section">
        <h2>Warnings before sending</h2>
        <p className="hint">Each warning also has a "Don't warn me again" box. Switch them back on here.</p>
        <Check checked={s.warnings.noSubject} onChange={(v) => s.set({ warnings: { ...s.warnings, noSubject: v } })}>No subject line</Check>
        <Check checked={s.warnings.missingAttachment} onChange={(v) => s.set({ warnings: { ...s.warnings, missingAttachment: v } })}>You mention an attachment but nothing is attached</Check>
        <Check checked={s.warnings.manyRecipients} onChange={(v) => s.set({ warnings: { ...s.warnings, manyRecipients: v } })}>Sending to more than 10 people</Check>
        <Check checked={s.warnings.fromMismatch} onChange={(v) => s.set({ warnings: { ...s.warnings, fromMismatch: v } })}>Replying from a different address than the email was sent to</Check>
      </section>
    </>
  );
}

// ---------- reminders ----------

export function TemplatesTab() {
  const templates = useSettings((s) => s.templates);
  const set = useSettings((s) => s.set);
  const [editing, setEditing] = useState<string | null>(templates[0]?.id || null);
  const current = templates.find((t) => t.id === editing);
  return (
    <>
      <h1>Templates</h1>
      <section className="set-section">
        <p className="hint">Saved replies for quotes, bookings and common questions. Insert them from the template button in the toolbar while writing. Use [Name] style blanks to fill in.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {templates.map((t) => <button key={t.id} className={`btn ${t.id === editing ? 'primary' : ''}`} onClick={() => setEditing(t.id)}>{t.name}</button>)}
          <button className="btn ghost" onClick={() => { const t = { id: `tpl-${Date.now()}`, name: 'New template', html: '' }; set({ templates: [...templates, t] }); setEditing(t.id); }}><Icon name="plus" /> New</button>
        </div>
        {current && (
          <>
            <Row label="Name"><input type="text" aria-label="Template name" value={current.name} onChange={(e) => set({ templates: templates.map((t) => (t.id === current.id ? { ...t, name: e.target.value } : t)) })} /></Row>
            <SignatureEditor key={current.id} email={current.id} initial={current.html} onChange={(html) => set({ templates: useSettings.getState().templates.map((t) => (t.id === current.id ? { ...t, html } : t)) })} />
            <button className="btn ghost danger" style={{ marginTop: 10 }} onClick={() => { set({ templates: templates.filter((t) => t.id !== current.id) }); setEditing(null); }}>Delete template</button>
          </>
        )}
      </section>
    </>
  );
}

// ---------- people ----------
