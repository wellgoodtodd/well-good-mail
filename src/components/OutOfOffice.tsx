// Out of Office: the Settings page, the amber bar while you're away, the holiday suggestion and "While you were away".
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import DOMPurify from 'dompurify';
import { Icon } from './Icon';
import { FormatBar } from './FormatBar';
import { editorExtensions } from './editorExtensions';
import { Dialog } from './ui';
import { useMail, providerFor, reconnectAccount, selectThread, setView, toast } from '../lib/mail';
import { threadKey } from '../lib/mailbox';
import { useSettings } from '../lib/settings';
import { allAliases } from '../lib/compose';
import { BACK_TOKEN, TEMPLATES, htmlToText, messageFor, oooSupport, planProblem, stateWords, whenSentence, windowOf, type OooMessage, type OooPlan } from '../lib/ooo';
import { awayAccounts, awayDigest, closeSummary, dismissSuggestion, nativeAccounts, refreshOoo, replyFor, turnOffOoo, turnOnOoo, useOoo, applySuggestion, oooToastResult } from '../lib/oooStore';
import type { Account, Message } from '../lib/types';

const nameOf = (a: Account) => a.label || a.email;
const listNames = (n: string[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
const dayWords = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** The away message editor: the basic formatting bar, like a quick edit in AI Drafts. */
function MessageEditor({ html, onChange, label }: { html: string; onChange: (html: string) => void; label: string }) {
  const writing = { font: useSettings((s) => s.writingFont), size: useSettings((s) => s.writingSize) };
  const timer = useRef<number | undefined>(undefined);
  const editor = useEditor({
    extensions: editorExtensions('Write your away message...'),
    content: html,
    editorProps: { attributes: { spellcheck: 'true', lang: 'en-GB', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, class: 'ai-rich' } },
    onUpdate: ({ editor: ed }) => { window.clearTimeout(timer.current); const v = ed.getHTML(); timer.current = window.setTimeout(() => onChange(v), 350); },
  });
  // A template or another account's message replaces what's in the box.
  useEffect(() => { if (editor && editor.getHTML() !== html && !editor.isFocused) editor.commands.setContent(html, false); }, [html, editor]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const insert = (h: string) => { editor?.chain().focus().insertContent(h).run(); };
  return (
    <div className="ooo-editor">
      <FormatBar editor={editor} basic defaultFont={writing.font} defaultSize={writing.size}
        end={<OooInserts onInsert={insert} />} />
      <div className="ai-body ooo-body" onClick={(e) => { if (e.target === e.currentTarget) editor?.commands.focus('end'); }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/** "Insert back date" and the signature menu, at the end of the formatting bar. */
function OooInserts({ onInsert }: { onInsert: (html: string) => void }) {
  const accounts = useMail((s) => s.accounts);
  const sigs = useSettings((s) => s.signatures);
  const mode = useSettings((s) => s.ooo.mode);
  const choices = useMemo(() => allAliases(accounts).map((x) => ({ email: x.alias.email, html: sigs[x.alias.email] })).filter((x) => x.html), [accounts, sigs]);
  return (
    <span className="ooo-inserts">
      <button className="btn ghost" disabled={mode === 'open'} title={mode === 'open' ? 'Choose dates first: there is no back date while it runs until you turn it off' : 'Adds the day you\'re back, kept in step if the dates change'} onClick={() => onInsert(BACK_TOKEN)}>Insert back date</button>
      {choices.length > 0 && (
        <select className="ooo-sig" value="" aria-label="Insert a signature" onChange={(e) => { const c = choices.find((x) => x.email === e.target.value); if (c) onInsert(DOMPurify.sanitize(c.html)); }}>
          <option value="">Signature...</option>
          {choices.map((c) => <option key={c.email} value={c.email}>{c.email}</option>)}
        </select>
      )}
    </span>
  );
}

export function OutOfOfficeTab() {
  const plan = useSettings((s) => s.ooo);
  const suggestOn = useSettings((s) => s.oooSuggest);
  const set = (patch: Partial<OooPlan>) => useSettings.getState().set({ ooo: { ...useSettings.getState().ooo, ...patch } });
  const accounts = useMail((s) => s.accounts);
  const by = useOoo((s) => s.byAccount);
  const busy = useOoo((s) => s.busy);
  const suggestion = useOoo((s) => s.suggestion);
  const [editing, setEditing] = useState<string>('default');
  const [preview, setPreview] = useState(false);
  useEffect(() => { void refreshOoo(); }, []);

  const native = accounts.filter((a) => oooSupport(a).native);
  const others = accounts.filter((a) => !oooSupport(a).native);
  const ticked = native.filter((a) => plan.accounts.includes(a.id));
  const allTicked = native.length > 0 && ticked.length === native.length;
  const anyOn = native.some((a) => by[a.id]?.reply?.on && stateWords(by[a.id]?.reply).state !== 'off');
  const supOrg = ticked.some((a) => oooSupport(a).org);
  const supOutside = ticked.some((a) => oooSupport(a).outside);
  const supDecline = ticked.some((a) => oooSupport(a).decline);
  const supSubject = ticked.length === 0 || ticked.some((a) => oooSupport(a).subject);
  const problem = planProblem(plan);
  const { start } = windowOf(plan);
  const scheduling = Boolean(start);
  const editAcc = editing === 'default' ? undefined : accounts.find((a) => a.id === editing);
  const msg: OooMessage = editAcc ? messageFor(plan, editAcc.id) : plan.message;
  const setMsg = (patch: Partial<OooMessage>) => {
    const p = useSettings.getState().ooo;
    if (editAcc && p.own[editAcc.id]) set({ own: { ...p.own, [editAcc.id]: { ...p.own[editAcc.id], ...patch } } });
    else set({ message: { ...p.message, ...patch } });
  };
  const toggle = (id: string) => set({ accounts: plan.accounts.includes(id) ? plan.accounts.filter((x) => x !== id) : [...plan.accounts, id] });
  const setOwn = (id: string, on: boolean) => {
    const own = { ...plan.own };
    if (on) own[id] = { ...plan.message }; else delete own[id];
    set({ own });
    setEditing(on ? id : 'default');
  };

  const turnOn = async () => {
    const r = await turnOnOoo(useSettings.getState().ooo);
    const names = accounts.filter((a) => r.done.includes(a.id)).map(nameOf);
    if (r.done.length) toast({ text: `Out of Office ${scheduling ? 'is scheduled' : 'is on'} for ${listNames(names)}.` });
    oooToastResult(r, scheduling ? 'scheduled' : 'turned on');
  };
  const turnOff = async () => {
    const r = await turnOffOoo();
    if (r.done.length) toast({ text: 'Out of Office is off.' });
    oooToastResult(r, 'turned off');
  };
  const sendTest = async () => {
    const a = ticked[0];
    if (!a) return;
    const p = providerFor(a.id);
    const reply = replyFor(useSettings.getState().ooo, a);
    try {
      await p?.send({ from: { email: a.email, name: a.displayName }, to: [{ email: a.email, name: a.displayName }], cc: [], bcc: [], subject: `Test: ${reply.subject || 'Out of Office reply'}`, html: reply.html, text: htmlToText(reply.html), attachments: [] });
      toast({ text: `A test of the reply is on its way to ${a.email}.` });
    } catch (e) { toast({ text: `The test couldn't be sent: ${(e as Error).message}`, ttl: 9000 }); }
  };

  return (
    <>
      <div className="set-title-row"><h1>Out of Office</h1></div>
      <p className="hint ooo-intro">Set inside each account, so replies go out even when this computer is off, and Gmail and Outlook show it too.</p>

      {suggestion && suggestOn && (
        <div className="ooo-suggest set-section">
          <Icon name="calendar" size={16} />
          <span className="grow">Your calendar has <b>{suggestion.title}</b> from {dayWords(new Date(suggestion.firstDay + 'T00:00').getTime())}. Use those dates?</span>
          <button className="btn" onClick={dismissSuggestion}>Not now</button>
          <button className="btn primary" onClick={applySuggestion}>Use these dates</button>
        </div>
      )}

      <section className="set-section">
        <div className="set-h2-row"><h2>Accounts</h2>{anyOn && <button className="btn" disabled={busy} onClick={turnOff}>Turn off now</button>}</div>
        {native.length === 0 && <p className="hint">None of your accounts can have Out of Office set from here yet.</p>}
        {native.length > 1 && (
          <label className="check ooo-all"><input type="checkbox" checked={allTicked} onChange={(e) => set({ accounts: e.target.checked ? native.map((a) => a.id) : [] })} /><span>All accounts</span></label>
        )}
        <div className="ooo-chips">
          {native.map((a) => {
            const x = by[a.id];
            const st = stateWords(x?.reply);
            const own = Boolean(plan.own[a.id]);
            const on = plan.accounts.includes(a.id);
            return (
              <div key={a.id} className={`ooo-chip ${on ? 'on' : ''}`}>
                <label className="ooo-chip-main">
                  <input type="checkbox" checked={on} onChange={() => toggle(a.id)} />
                  <span className="dot" style={{ background: a.colour }} />
                  <span className="ooo-chip-text">
                    <b>{nameOf(a)}</b>
                    <small>
                      {x?.loading ? 'Checking...' : x?.needsPermission ? 'Needs one more sign in' : x?.error ? 'Couldn\'t check' : <span className={`ooo-state ${st.state}`}>{st.state !== 'off' && <Icon name="plane" size={12} />}{st.words}</span>}
                      {on && <span className="ooo-which-msg">{own ? 'Own message' : 'Default message'}</span>}
                    </small>
                  </span>
                </label>
                {x?.needsPermission ? (
                  <button className="btn" onClick={async () => { await reconnectAccount(a.id); void refreshOoo([a.id]); }}>Sign in</button>
                ) : on && (
                  <button className="btn ghost" aria-pressed={own} onClick={() => setOwn(a.id, !own)} title={own ? 'Go back to the default message' : 'Give this account its own message'}>{own ? 'Use default' : 'Own message'}</button>
                )}
              </div>
            );
          })}
        </div>
        {others.length > 0 && (
          <p className="hint ooo-others">
            {others.map((a) => {
              const sup = oooSupport(a);
              return <span key={a.id}>{nameOf(a)}: set it in {sup.webUrl ? <a href={sup.webUrl} target="_blank" rel="noreferrer">{sup.webName}</a> : 'its own web mail'}. </span>;
            })}
          </p>
        )}
      </section>

      <section className="set-section">
        <h2>When</h2>
        <div className="radio-list" role="radiogroup">
          <label><input type="radio" name="ooomode" checked={plan.mode === 'open'} onChange={() => set({ mode: 'open' })} /><span>From now until I turn it off</span></label>
          <label><input type="radio" name="ooomode" checked={plan.mode === 'dates'} onChange={() => set({ mode: 'dates' })} /><span>Between dates</span></label>
        </div>
        {plan.mode === 'dates' && (
          <div className="ooo-dates">
            <label><span>First day away</span><input type="date" value={plan.firstDay} onChange={(e) => set({ firstDay: e.target.value })} /></label>
            {plan.useTimes && <label><span>From</span><input type="time" value={plan.startTime} onChange={(e) => set({ startTime: e.target.value })} /></label>}
            <label><span>Back on</span><input type="date" value={plan.backOn} onChange={(e) => set({ backOn: e.target.value })} /></label>
            {plan.useTimes && <label><span>At</span><input type="time" value={plan.backTime} onChange={(e) => set({ backTime: e.target.value })} /></label>}
          </div>
        )}
        {plan.mode === 'dates' && <label className="check"><input type="checkbox" checked={plan.useTimes} onChange={(e) => set({ useTimes: e.target.checked })} /><span>Set times as well (for part days)</span></label>}
        <p className="ooo-sentence" aria-live="polite">{whenSentence(plan)}</p>
      </section>

      <section className="set-section">
        <h2>Who gets the reply</h2>
        <div className="radio-list" role="radiogroup">
          <label><input type="radio" name="oooaud" checked={plan.audience === 'all'} onChange={() => set({ audience: 'all' })} /><span>Everyone who emails me</span></label>
          <label><input type="radio" name="oooaud" checked={plan.audience === 'contacts'} onChange={() => set({ audience: 'contacts' })} /><span>My contacts only<br /><span className="sub">Mailing lists and strangers don't get one.</span></span></label>
          <label className={supOrg ? '' : 'off'}><input type="radio" name="oooaud" disabled={!supOrg} checked={plan.audience === 'org'} onChange={() => set({ audience: 'org' })} /><span>People in my organisation only<br /><span className="sub">{supOrg ? 'Work accounts (Google Workspace, Microsoft 365). Personal accounts that are ticked reply to everyone.' : 'For work accounts (Google Workspace, Microsoft 365).'}</span></span></label>
        </div>
        {supOutside && plan.audience !== 'org' && (
          <>
            <div className="set-row">
              <label htmlFor="ooo-out">Outside my organisation (Microsoft)</label>
              <select id="ooo-out" value={plan.outsideAudience} onChange={(e) => set({ outsideAudience: e.target.value as OooPlan['outsideAudience'] })}>
                <option value="all">Everyone</option>
                <option value="contacts">My contacts only</option>
                <option value="none">Nobody</option>
              </select>
            </div>
            <label className="check"><input type="checkbox" checked={plan.outsideDifferent} onChange={(e) => set({ outsideDifferent: e.target.checked })} /><span>A different message for people outside my organisation</span></label>
          </>
        )}
        <p className="hint" style={{ margin: '8px 0 0' }}>Gmail replies to each person once every 4 days, however many times they email.</p>
      </section>

      <section className="set-section">
        <div className="set-h2-row">
          <h2>Message</h2>
          <select aria-label="Start from a template" value="" onChange={(e) => { const t = TEMPLATES.find((x) => x.id === e.target.value); if (t) setMsg({ subject: t.subject, html: t.html }); }}>
            <option value="">Templates...</option>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {Object.keys(plan.own).some((id) => plan.accounts.includes(id)) && (
          <div className="seg ooo-which" role="tablist" aria-label="Which message">
            <button role="tab" aria-selected={editing === 'default'} className={editing === 'default' ? 'on' : ''} onClick={() => setEditing('default')}>Default message</button>
            {native.filter((a) => plan.own[a.id] && plan.accounts.includes(a.id)).map((a) => (
              <button key={a.id} role="tab" aria-selected={editing === a.id} className={editing === a.id ? 'on' : ''} onClick={() => setEditing(a.id)}>{nameOf(a)}</button>
            ))}
          </div>
        )}
        {supSubject && (
          <div className="set-row">
            <label htmlFor="ooo-subj">Subject{ticked.some((a) => !oooSupport(a).subject) ? ' (Gmail)' : ''}</label>
            <input id="ooo-subj" type="text" value={msg.subject} onChange={(e) => setMsg({ subject: e.target.value })} />
          </div>
        )}
        <MessageEditor key={`in-${editing}`} label="Away message" html={msg.html} onChange={(html) => setMsg({ html })} />
        {supOutside && plan.outsideDifferent && plan.audience !== 'org' && (
          <>
            <h3 className="ooo-h3">For people outside my organisation</h3>
            <MessageEditor key={`out-${editing}`} label="Away message for outside the organisation" html={msg.outsideHtml || msg.html} onChange={(outsideHtml) => setMsg({ outsideHtml })} />
          </>
        )}
        {plan.mode === 'open' && msg.html.includes(BACK_TOKEN) && <p className="hint ooo-warn">The message has a [back date], but there are no dates. It will say "soon" instead.</p>}
      </section>

      <section className="set-section">
        <h2>While I'm away</h2>
        <label className={`check ${plan.mode === 'open' ? 'off' : ''}`}><input type="checkbox" disabled={plan.mode === 'open'} checked={plan.addEvent} onChange={(e) => set({ addEvent: e.target.checked })} /><span>Add an Away event to my calendar</span></label>
        <label className={`check ${plan.mode === 'open' ? 'off' : ''}`}><input type="checkbox" disabled={plan.mode === 'open'} checked={plan.remindBefore} onChange={(e) => set({ remindBefore: e.target.checked })} /><span>Remind me the day before it ends</span></label>
        <label className={`check ${supDecline && plan.mode === 'dates' && plan.addEvent ? '' : 'off'}`}>
          <input type="checkbox" disabled={!supDecline || plan.mode === 'open' || !plan.addEvent} checked={plan.decline} onChange={(e) => set({ decline: e.target.checked })} />
          <span>Decline new invitations while I'm away<br /><span className="sub">{supDecline ? 'Google Workspace accounts, through the Away event.' : 'Google Workspace accounts only. Microsoft and personal Gmail can\'t do this from here yet.'}</span></span>
        </label>
        <label className="check"><input type="checkbox" checked={plan.pauseAlerts} onChange={(e) => set({ pauseAlerts: e.target.checked })} /><span>Pause new-mail alerts while I'm away</span></label>
        <label className="check"><input type="checkbox" checked={plan.awaySummary} onChange={(e) => set({ awaySummary: e.target.checked })} /><span>Show "While you were away" when I'm back</span></label>
        <label className="check"><input type="checkbox" checked={suggestOn} onChange={(e) => useSettings.getState().set({ oooSuggest: e.target.checked })} /><span>Suggest Out of Office from Holiday and Annual leave in my calendar</span></label>
      </section>

      <div className="ooo-actions">
        {problem && <span className="ooo-problem">{problem}</span>}
        <span className="grow" />
        <button className="btn" disabled={!ticked.length} onClick={() => setPreview(true)}>Preview</button>
        <button className="btn" disabled={!ticked.length || busy} onClick={sendTest} title={ticked[0] ? `Sends the reply to ${ticked[0].email}, so you can see it as others will` : ''}>Send me a test</button>
        <button className="btn primary" disabled={Boolean(problem) || busy} onClick={turnOn}>{busy ? 'Working...' : ticked.some((a) => stateWords(by[a.id]?.reply).state !== 'off') ? 'Update' : scheduling ? 'Schedule' : 'Turn on'}</button>
      </div>
      {preview && <OooPreview plan={plan} accounts={ticked} onClose={() => setPreview(false)} />}
    </>
  );
}

/** The reply as people will get it, account by account. */
function OooPreview({ plan, accounts, onClose }: { plan: OooPlan; accounts: Account[]; onClose: () => void }) {
  const [id, setId] = useState(accounts[0]?.id);
  const a = accounts.find((x) => x.id === id) || accounts[0];
  if (!a) return null;
  const r = replyFor(plan, a);
  const who = r.audience === 'contacts' ? 'Your contacts' : r.audience === 'org' ? 'People in your organisation' : 'Everyone who emails you';
  return (
    <Dialog title="Preview the reply" onClose={onClose} actions={<button className="btn primary" onClick={onClose}>Done</button>}>
      {accounts.length > 1 && (
        <div className="seg" role="tablist" style={{ marginBottom: 10 }}>
          {accounts.map((x) => <button key={x.id} role="tab" aria-selected={x.id === a.id} className={x.id === a.id ? 'on' : ''} onClick={() => setId(x.id)}>{nameOf(x)}</button>)}
        </div>
      )}
      <div className="ai-draft">
        <div className="ai-draft-row"><b>From</b><span>{a.displayName} &lt;{a.email}&gt;</span></div>
        <div className="ai-draft-row"><b>To</b><span>{who}{r.outsideAudience && r.audience !== 'org' ? (r.outsideAudience === 'none' ? ', inside your organisation only' : r.outsideAudience === 'contacts' ? ', and contacts outside it' : '') : ''}</span></div>
        {r.subject !== undefined && <div className="ai-draft-row"><b>Subject</b><span>{r.subject || '(none)'}</span></div>}
        <div className="ai-draft-row"><b>When</b><span>{whenSentence(plan)}</span></div>
        <div className="ooo-preview-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.html) }} />
        {r.outsideHtml && <><div className="ai-draft-row"><b>Outside</b><span>The message for people outside your organisation:</span></div><div className="ooo-preview-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.outsideHtml) }} /></>}
      </div>
    </Dialog>
  );
}

/** The quiet amber bar at the top of the mail while replies are going out, and the holiday suggestion. */
export function OooBanner() {
  const by = useOoo((s) => s.byAccount);
  const accounts = useMail((s) => s.accounts);
  const busy = useOoo((s) => s.busy);
  const suggestion = useOoo((s) => s.suggestion);
  const suggestOn = useSettings((s) => s.oooSuggest);
  useEffect(() => {
    // Read once at start, then every half hour, so changes made in Gmail or Outlook show here.
    const t0 = window.setTimeout(() => void refreshOoo(), 8000);
    const t = window.setInterval(() => void refreshOoo(), 30 * 60 * 1000);
    return () => { window.clearTimeout(t0); window.clearInterval(t); };
  }, []);
  void by; void accounts;
  const away = awayAccounts();
  if (away.length) {
    const ends = away.map((a) => useOoo.getState().byAccount[a.id]?.reply?.end).filter((x): x is number => Boolean(x));
    const until = ends.length === away.length && ends.length ? ` until the end of ${dayWords(Math.max(...ends) - 1)}` : '';
    return (
      <div className="ooo-bar" role="status">
        <Icon name="plane" size={15} />
        <span className="grow">Out of Office is on for {listNames(away.map(nameOf))}{until}.</span>
        <button className="btn" onClick={() => useMail.setState({ screen: 'settings', settingsTab: 'ooo' })}>Change</button>
        <button className="btn" disabled={busy} onClick={async () => { const r = await turnOffOoo(away.map((a) => a.id)); if (r.done.length) toast({ text: 'Out of Office is off.' }); oooToastResult(r, 'turned off'); }}>Turn off now</button>
      </div>
    );
  }
  if (suggestion && suggestOn && nativeAccounts().length) {
    return (
      <div className="ooo-bar suggest" role="status">
        <Icon name="calendar" size={15} />
        <span className="grow">Your calendar has <b>{suggestion.title}</b> from {dayWords(new Date(suggestion.firstDay + 'T00:00').getTime())}. Set Out of Office for it?</span>
        <button className="btn" onClick={dismissSuggestion}>Not now</button>
        <button className="btn" onClick={applySuggestion}>Set it up</button>
      </div>
    );
  }
  return null;
}

/** "While you were away": the emails from people that came in, sorted into what most needs you. */
export function AwaySummary() {
  const summary = useOoo((s) => s.summary);
  if (!summary) return null;
  const d = awayDigest(summary.start, summary.end, summary.accounts);
  const total = d.vips.length + d.questions.length + d.direct.length + d.cc.length;
  const open = (m: Message) => { closeSummary(); setView({ scope: { type: 'all' }, mailbox: { kind: 'system', folder: 'inbox' } }); useMail.setState({ screen: 'mail' }); selectThread(threadKey(m)); };
  const group = (title: string, list: Message[]) => list.length > 0 && (
    <div className="away-group">
      <h3>{title} <span className="count">{list.length}</span></h3>
      <ul>{list.slice(0, 8).map((m) => (
        <li key={m.id}><button className="away-row" onClick={() => open(m)}><b>{m.from.name || m.from.email}</b><span>{m.subject || '(no subject)'}</span><small>{dayWords(m.date)}</small></button></li>
      ))}</ul>
      {list.length > 8 && <p className="hint">And {list.length - 8} more in your inbox.</p>}
    </div>
  );
  return (
    <Dialog title="While you were away" onClose={closeSummary} actions={<button className="btn primary" onClick={closeSummary}>Done</button>}>
      <p className="hint" style={{ marginTop: 0 }}>{total ? `${total} emails from people came in between ${dayWords(summary.start)} and ${dayWords(summary.end - 1)}. Out of Office has switched itself off.` : 'Nothing from people came in while you were away. Out of Office has switched itself off.'}</p>
      <div className="away-groups">
        {group('From your VIPs', d.vips)}
        {group('Questions for you', d.questions)}
        {group('Sent to you', d.direct)}
        {group('Copied in', d.cc)}
      </div>
    </Dialog>
  );
}

