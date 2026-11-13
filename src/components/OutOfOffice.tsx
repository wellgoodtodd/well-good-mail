// Out of Office: the Settings page, the amber bar while you're away, the holiday suggestion and "While you were away".
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import DOMPurify from 'dompurify';
import { Icon } from './Icon';
import { FormatBar } from './FormatBar';
import { editorExtensions } from './editorExtensions';
import { Check, Dialog, Seg, SwitchLine } from './ui';
import { useMail, providerFor, reconnectAccount, selectThread, setView, toast, openScreen } from '../lib/mail';
import { threadKey } from '../lib/mailbox';
import { useSettings } from '../lib/settings';
import { allAliases } from '../lib/compose';
import { BACK_TOKEN, fillBackDate, htmlToText, messageFor, oooSupport, perAccountOn, planProblem, setAccountOn, setPerAccount, stateWords, whenSentence, windowOf, type OooMessage, type OooPlan } from '../lib/ooo';
import { awayAccounts, awayDigest, closeSummary, dismissSuggestion, nativeAccounts, refreshOoo, replyFor, turnOffOoo, turnOnOoo, useOoo, applySuggestion, oooToastResult, oooSignIn, oooSignInDue, shortReason } from '../lib/oooStore';
import type { Account, Message } from '../lib/types';
import { TemplateBar, UpdateTemplateQuestion, shouldAskAboutTemplate } from './OooTemplates';
import '../styles/ooo.css';

const nameOf = (a: Account) => a.label || a.email;
/** The sign in pop-up shows once each time the app runs; the bar above the accounts stays until it's done. */
let askedSignIn = false;
const listNames = (n: string[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
const dayWords = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** The away message editor: the basic formatting bar, like a quick edit in AI Drafts. */
export function MessageEditor({ html, onChange, label }: { html: string; onChange: (html: string) => void; label: string }) {
  const writing = { font: useSettings((s) => s.writingFont), size: useSettings((s) => s.writingSize) };
  const timer = useRef<number | undefined>(undefined);
  const editor = useEditor({
    extensions: editorExtensions('Write your away message...'),
    content: html,
    editorProps: { attributes: { spellcheck: 'true', lang: 'en-GB', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, class: 'ai-rich' } },
    onUpdate: ({ editor: ed }) => { window.clearTimeout(timer.current); const v = ed.getHTML(); timer.current = window.setTimeout(() => onChange(v), 350); },
  });
  // A template or another account's message replaces what's in the box.
  useEffect(() => { if (editor && editor.getHTML() !== html && !editor.isFocused) editor.commands.setContent(html, { emitUpdate: false }); }, [html, editor]);
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
  const setPlan = (f: (p: OooPlan) => OooPlan) => useSettings.getState().set({ ooo: f(useSettings.getState().ooo) });
  const accounts = useMail((s) => s.accounts);
  const by = useOoo((s) => s.byAccount);
  const busy = useOoo((s) => s.busy);
  const suggestion = useOoo((s) => s.suggestion);
  const [tab, setTab] = useState<string>('');
  const [preview, setPreview] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    void refreshOoo().then(() => {
      if (askedSignIn || !oooSignInDue().length) return;
      askedSignIn = true;
      void oooSignIn(undefined, { ask: true });
    });
  }, []);

  // In the order set in Settings › Accounts, like everywhere else.
  const ordered = [...accounts].sort((a, b) => a.order - b.order);
  const native = ordered.filter((a) => oooSupport(a).native);
  const others = ordered.filter((a) => !oooSupport(a).native);
  const ticked = native.filter((a) => plan.accounts.includes(a.id));
  const anyOn = native.some((a) => by[a.id]?.reply?.on && stateWords(by[a.id]?.reply).state !== 'off');
  const supOrg = ticked.some((a) => oooSupport(a).org);
  const supOutside = ticked.some((a) => oooSupport(a).outside);
  const supDecline = ticked.some((a) => oooSupport(a).decline);
  const problem = planProblem(plan);
  const { start, end } = windowOf(plan);
  const scheduling = Boolean(start);
  const perAccount = perAccountOn(plan);
  // The tab showing: one of the switched-on accounts while each has its own message, otherwise the shared message.
  const editAcc = perAccount ? ticked.find((a) => a.id === tab) || ticked[0] : undefined;
  const msg: OooMessage = editAcc ? messageFor(plan, editAcc.id) : plan.message;
  const supSubject = editAcc ? oooSupport(editAcc).subject : ticked.length === 0 || ticked.some((a) => oooSupport(a).subject);
  const setMsg = (patch: Partial<OooMessage>) => {
    const p = useSettings.getState().ooo;
    if (editAcc) set({ own: { ...p.own, [editAcc.id]: { ...messageFor(p, editAcc.id), ...patch } } });
    else set({ message: { ...p.message, ...patch } });
  };
  const outsideOn = supOutside && plan.outsideDifferent && plan.audience !== 'org';
  const extras = [
    { on: plan.addEvent, off: plan.mode === 'open' },
    { on: plan.remindBefore, off: plan.mode === 'open' },
    { on: plan.decline, off: !supDecline || plan.mode === 'open' || !plan.addEvent },
    { on: plan.pauseAlerts, off: false },
    { on: plan.awaySummary, off: false },
  ];
  const extrasOn = extras.filter((x) => x.on && !x.off);
  const mainLabel = busy ? 'Working...' : `${ticked.some((a) => stateWords(by[a.id]?.reply).state !== 'off') ? 'Update' : scheduling ? 'Schedule' : 'Turn on'}${ticked.length ? ` for ${ticked.length > 2 ? `${ticked.length} accounts` : listNames(ticked.map(nameOf))}` : ''}`;

  const turnOn = async () => {
    const plan = useSettings.getState().ooo;
    const r = await turnOnOoo(plan);
    // Accounts that need one more sign in: ask, sign in to each, then carry on turning it on for them.
    if (r.needSignIn.length) {
      askedSignIn = true;
      const ready = await oooSignIn(r.needSignIn, { ask: true });
      if (ready.length) {
        const again = await turnOnOoo({ ...plan, accounts: ready });
        r.done.push(...again.done);
        r.failed.push(...again.failed);
      }
    }
    const names = accounts.filter((a) => r.done.includes(a.id)).map(nameOf);
    if (r.done.length) toast({ text: `Out of Office ${scheduling ? 'is scheduled' : 'is on'} for ${listNames(names)}.` });
    oooToastResult(r, scheduling ? 'scheduled' : 'turned on');
  };
  // A template that's been changed since it was applied: ask once whether to update it, then go ahead either way.
  const pressMain = () => {
    if (shouldAskAboutTemplate(useSettings.getState().ooo, useSettings.getState().oooTemplates)) setAsking(true);
    else void turnOn();
  };
  const turnOff = async () => {
    const r = await turnOffOoo();
    if (r.done.length) toast({ text: 'Out of Office is off.' });
    oooToastResult(r, 'turned off');
  };
  const sendTest = async () => {
    const a = editAcc || ticked[0];
    if (!a) return;
    const p = providerFor(a.id);
    const reply = replyFor(useSettings.getState().ooo, a);
    try {
      await p?.send({ from: { email: a.email, name: a.displayName }, to: [{ email: a.email, name: a.displayName }], cc: [], bcc: [], subject: `Test: ${reply.subject || 'Out of Office reply'}`, html: reply.html, text: htmlToText(reply.html), attachments: [] });
      toast({ text: `A test of the reply is on its way to ${a.email}.` });
    } catch (e) { toast({ text: `The test couldn't be sent: ${(e as Error).message}`, ttl: 9000 }); }
  };

  // The read-back: who, which accounts, the subject, when, and whether alerts are paused.
  const who = plan.audience === 'contacts' ? 'Your contacts who email' : plan.audience === 'org' ? 'People in your organisation who email' : 'Everyone who emails';
  const subjects = [...new Set(ticked.filter((a) => oooSupport(a).subject).map((a) => fillBackDate(messageFor(plan, a.id).subject, end)))];
  const gets = !subjects.length ? 'your away message' : subjects.length > 1 ? "each account's own message" : subjects[0] ? <>"{subjects[0]}"</> : 'your away message (no subject)';
  const readBack = ticked.length ? (
    <>
      {who}{' '}{ticked.map((a, i) => <span key={a.id}>{i > 0 && (i === ticked.length - 1 ? ' or ' : ', ')}<b>{nameOf(a)}</b></span>)} gets {gets}. {whenSentence(plan)}{plan.pauseAlerts ? ' New-mail alerts are paused while you\'re away.' : ''}
    </>
  ) : null;

  return (
    <div className="ooo-page">
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

      <section className="set-section ooo-card">
        <h2>Accounts</h2>
        <OooSignInBar />
        {native.length === 0 && <p className="hint">None of your accounts can have Out of Office set from here yet.</p>}
        {native.map((a) => {
          const x = by[a.id];
          const st = stateWords(x?.reply);
          const on = plan.accounts.includes(a.id);
          return (
            <div key={a.id} className="ooo-row ooo-acc">
              <span className="dot" style={{ background: a.colour }} />
              <span className="grow ooo-acc-text">
                <span className="ooo-acc-name">{nameOf(a)}</span>
                <span className="ooo-acc-state">
                  {x?.loading ? 'Checking...' : x?.needsPermission ? <span className="ooo-warnword">Needs one more sign in</span> : x?.error ? <span className="status-bad" title={x.errorDetail || x.error}>{shortReason(x.error).replace(/\.$/, '')}. {x.errorSignIn ? 'Sign in again to fix it.' : 'Try again in a moment.'}</span> : <span className={`ooo-state ${st.state}`}>{st.state !== 'off' && <Icon name="plane" size={12} />}{st.words}</span>}
                </span>
              </span>
              {x?.error && !x.loading && !x.needsPermission && <button className="btn small" onClick={() => void refreshOoo([a.id])}>Try again</button>}
              {(x?.needsPermission || (x?.error && x.errorSignIn && !x.loading)) && <button className="btn small" onClick={async () => { await reconnectAccount(a.id); void refreshOoo([a.id]); }}>Sign in</button>}
              <input type="checkbox" role="switch" className="switch" aria-label={`Out of Office for ${nameOf(a)}`} checked={on} onChange={(e) => setPlan((p) => setAccountOn(p, a.id, e.target.checked))} />
            </div>
          );
        })}
        {others.length > 0 && (
          <p className="hint ooo-others">
            {others.map((a) => {
              const sup = oooSupport(a);
              return <span key={a.id}>{nameOf(a)}: set it in {sup.webUrl ? <a href={sup.webUrl} target="_blank" rel="noreferrer">{sup.webName}</a> : 'its own web mail'}. </span>;
            })}
          </p>
        )}
      </section>

      <section className="set-section ooo-card">
        <div className="set-h2-row ooo-cap-row">
          <h2>Message</h2>
          <label className="ooo-cap-switch">
            <span>Different message for each account</span>
            <input type="checkbox" role="switch" className="switch" checked={perAccount} disabled={!ticked.length} title={ticked.length ? '' : 'Switch on an account first'} onChange={(e) => setPlan((p) => setPerAccount(p, e.target.checked))} />
          </label>
        </div>
        {/* The account tabs on the left (when each account has its own message), the Template picker on the right. */}
        <div className="ooo-tabrow">
          {editAcc && (
            <div className="ooo-tabs" role="tablist" aria-label="Which account's message">
              {ticked.map((a) => (
                <button key={a.id} role="tab" aria-selected={a.id === editAcc.id} className={a.id === editAcc.id ? 'on' : ''} onClick={() => setTab(a.id)}>
                  <span className="dot" style={{ background: a.colour }} />{nameOf(a)}
                </button>
              ))}
            </div>
          )}
          <TemplateBar editing={editAcc?.id} onBuiltIn={(t) => setMsg({ subject: t.subject, html: t.html })} />
        </div>
        {supSubject && (
          <div className="set-row ooo-subject-row">
            <label htmlFor="ooo-subj">Subject{!editAcc && ticked.some((a) => !oooSupport(a).subject) ? ' (Gmail)' : ''}</label>
            <input id="ooo-subj" type="text" value={msg.subject} onChange={(e) => setMsg({ subject: e.target.value })} />
          </div>
        )}
        <MessageEditor key={`in-${editAcc?.id || 'shared'}`} label={editAcc ? `Away message for ${nameOf(editAcc)}` : 'Away message'} html={msg.html} onChange={(html) => setMsg({ html })} />
        {outsideOn && (
          <>
            <h3 className="ooo-h3">Message for people outside my organisation</h3>
            <MessageEditor key={`out-${editAcc?.id || 'shared'}`} label="Message for people outside my organisation" html={msg.outsideHtml || msg.html} onChange={(outsideHtml) => setMsg({ outsideHtml })} />
          </>
        )}
        {plan.mode === 'open' && msg.html.includes(BACK_TOKEN) && <p className="hint ooo-warn">The message has a [back date], but there are no dates. It will say "soon" instead.</p>}
      </section>

      <section className="set-section ooo-card">
        <h2>When</h2>
        <div className="set-row">
          <span className="label">Replies go out</span>
          <Seg label="Replies go out" value={plan.mode} onChange={(v) => set({ mode: v })} options={[{ value: 'open', label: 'Until I turn it off' }, { value: 'dates', label: 'Between dates' }]} />
        </div>
        {plan.mode === 'dates' && (
          <>
            <div className="set-row">
              <label htmlFor="ooo-first">First day away</label>
              <span className="ooo-datetime">
                <input id="ooo-first" type="date" value={plan.firstDay} onChange={(e) => set({ firstDay: e.target.value })} />
                {plan.useTimes && <input type="time" aria-label="From" value={plan.startTime} onChange={(e) => set({ startTime: e.target.value })} />}
              </span>
            </div>
            <div className="set-row">
              <label htmlFor="ooo-back">Back on</label>
              <span className="ooo-datetime">
                <input id="ooo-back" type="date" value={plan.backOn} onChange={(e) => set({ backOn: e.target.value })} />
                {plan.useTimes && <input type="time" aria-label="Back at" value={plan.backTime} onChange={(e) => set({ backTime: e.target.value })} />}
              </span>
            </div>
            <Check checked={plan.useTimes} onChange={(v) => set({ useTimes: v })}>Part days (set times)</Check>
          </>
        )}
      </section>

      <section className="set-section ooo-card">
        <h2>Who gets it</h2>
        <div className="set-row">
          <label htmlFor="ooo-aud">Who gets a reply</label>
          <select id="ooo-aud" value={plan.audience} onChange={(e) => set({ audience: e.target.value as OooPlan['audience'] })}>
            <option value="all">Everyone who emails me</option>
            <option value="contacts">My contacts only</option>
            <option value="org" disabled={!supOrg}>People in my organisation only{supOrg ? '' : ' (work accounts)'}</option>
          </select>
        </div>
        {plan.audience === 'contacts' && <p className="hint ooo-small">Mailing lists and strangers don't get one.</p>}
        {plan.audience === 'org' && <p className="hint ooo-small">Work accounts (Google Workspace, Microsoft 365). Personal accounts that are on reply to everyone.</p>}
        {!supOrg && <p className="hint ooo-small">People in my organisation only needs a work account (Google Workspace or Microsoft 365) switched on above.</p>}
        {supOutside && plan.audience !== 'org' && (
          <>
            <div className="set-row">
              <label htmlFor="ooo-out">People outside my organisation <span className="ooo-muted">· Microsoft</span></label>
              <select id="ooo-out" value={plan.outsideAudience} onChange={(e) => set({ outsideAudience: e.target.value as OooPlan['outsideAudience'] })}>
                <option value="all">Everyone</option>
                <option value="contacts">My contacts only</option>
                <option value="none">Nobody</option>
              </select>
            </div>
            <Check checked={plan.outsideDifferent} onChange={(v) => set({ outsideDifferent: v })}>Separate message for people outside my organisation</Check>
          </>
        )}
        <p className="hint ooo-small ooo-gmail">Gmail replies to each person once every 4 days, however many times they email.</p>
      </section>

      <section className="set-section ooo-card">
        <h2>While I'm away</h2>
        <button type="button" className="ooo-fold" aria-expanded={extrasOpen} onClick={() => setExtrasOpen(!extrasOpen)}>
          <Icon name={extrasOpen ? 'chevronDown' : 'chevronRight'} size={14} />
          <span className="grow">Choose what happens while you're away</span>
          <span className="ooo-muted">{extrasOn.length} of {extras.length} on</span>
        </button>
        {extrasOpen && (
          <div className="ooo-extras">
            <SwitchLine off={plan.mode === 'open'} disabled={plan.mode === 'open'} checked={plan.addEvent} onChange={(v) => set({ addEvent: v })}>Add an Away event to my calendar{plan.mode === 'open' && <span className="check-sub">Needs dates.</span>}</SwitchLine>
            <SwitchLine off={plan.mode === 'open'} disabled={plan.mode === 'open'} checked={plan.remindBefore} onChange={(v) => set({ remindBefore: v })}>Remind me the day before it ends</SwitchLine>
            <SwitchLine off={!(supDecline && plan.mode === 'dates' && plan.addEvent)} disabled={!supDecline || plan.mode === 'open' || !plan.addEvent} checked={plan.decline} onChange={(v) => set({ decline: v })}>
              Decline new invitations while I'm away<span className="check-sub">{supDecline ? 'Google Workspace accounts, through the Away event.' : 'Google Workspace accounts only. Microsoft and personal Gmail can\'t do this from here yet.'}</span>
            </SwitchLine>
            <SwitchLine checked={plan.pauseAlerts} onChange={(v) => set({ pauseAlerts: v })}>Pause new-mail alerts while I'm away</SwitchLine>
            <SwitchLine checked={plan.awaySummary} onChange={(v) => set({ awaySummary: v })}>Show "While you were away" when I'm back</SwitchLine>
          </div>
        )}
      </section>

      <p className={`ooo-readback ${problem ? 'problem' : ''}`} aria-live="polite">{problem ? (ticked.length ? problem : 'Switch on at least one account above.') : readBack}</p>
      <div className="ooo-foot">
        <button className="btn" disabled={!ticked.length} onClick={() => setPreview(true)}>Preview</button>
        <button className="btn" disabled={!ticked.length || busy} onClick={sendTest} title={(editAcc || ticked[0]) ? `Sends the reply to ${(editAcc || ticked[0])!.email}, so you can see it as others will` : ''}>Send me a test</button>
        <span className="grow" />
        {anyOn && <button className="btn" disabled={busy} onClick={turnOff}>Turn off now</button>}
        <button className="btn primary" disabled={Boolean(problem) || busy} onClick={pressMain}>{mainLabel}</button>
      </div>
      {preview && <OooPreview plan={plan} accounts={ticked} onClose={() => setPreview(false)} />}
      {asking && <UpdateTemplateQuestion onClose={() => setAsking(false)} onDone={() => { setAsking(false); void turnOn(); }} />}
    </div>
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
        <button className="btn" onClick={() => openScreen('settings', 'ooo')}>Change</button>
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


/** Blatant, so it isn't missed: accounts that need one more sign in before Out of Office can be set. */
function OooSignInBar() {
  const byAccount = useOoo((s) => s.byAccount);
  const due = nativeAccounts().filter((a) => byAccount[a.id]?.needsPermission);
  const [busy, setBusy] = useState(false);
  if (!due.length) return null;
  return (
    <div className="ooo-signin" role="alert">
      <Icon name="alert" size={16} />
      <span><b>{due.length === 1 ? `${nameOf(due[0])} needs one more sign in` : `${due.length} accounts need one more sign in`}</b> before Out of Office can be set. Tick every box when asked.</span>
      <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await oooSignIn(due.map((a) => a.id)); setBusy(false); }}>{due.length === 1 ? 'Sign in' : 'Sign in to each'}</button>
    </div>
  );
}
