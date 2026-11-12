// Settings › Accounts.
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { ColourPicker } from '../ColourPicker';
import { useMail, setLeaveOutOfAll, openScreen, removeAccount, reconnectAccount, syncAccount, isSyncing, reorderAccounts, startDemo, leaveDemo, toast, restartSync, editAccount } from '../../lib/mail';
import { useSettings } from '../../lib/settings';
import { LEVEL_WORDS, tidy, CAPABILITIES, effectiveMode, type Mode } from '../../lib/mcp/permissions';
import { undoSteps, useHistory } from '../../lib/history';
import { signatureFor } from '../../lib/compose';
import { composeContext } from '../../lib/composeActions';
import { oooSignIn, refreshOoo, turnOnOoo, turnOffOoo, oooToastResult } from '../../lib/oooStore';
import type { Account } from '../../lib/types';
import { useGoogleConfigured, useGoogleKeys } from '../../lib/auth/google';
import { openGuide } from '../SetupGuide';
import { IMAP_PRESETS } from '../../lib/imapUtil';
import { addAccountItems } from '../../lib/accountMenu';
import { backupDue } from '../../lib/backup';
import { isTauri } from '../../lib/platform';
import { useMenu, Dialog } from '../ui';
import type { IconName } from '../Icon';
import { MessageEditor as OooMessageEditor } from '../OutOfOffice';
import { useOoo } from '../../lib/oooStore';
import { stateWords as oooStateWords, oooSupport, messageFor as messageForOoo, planProblem, ymd as ymdOoo, TEMPLATES as OOO_TEMPLATES, type OooPlan, type OooMessage } from '../../lib/ooo';
import { AccountName, wantsSignIn, RANGE_OPTS, KeepMail } from './shared';
import { Seg } from '../ui';
import { SignatureEditor } from './SignaturesTab';

export type AcctSection = 'signature' | 'sending' | 'calendars' | 'alerts' | 'ai' | 'ooo' | 'mail';
/** What was open on the Accounts page, so Back (or coming back to Settings) returns to the same account and panel. */
export const acctMemo: { selId?: string; open: Record<string, AcctSection | null> } = { open: {} };

/** One sentence on how the account is doing, with the fix right there when something is wrong. */
export function AccountHealth({ a }: { a: Account }) {
  const messages = useMail((st) => st.messages);
  const ooo = useOoo((o) => o.byAccount[a.id]);
  const count = useMemo(() => Object.values(messages).filter((m) => m.accountId === a.id).length, [messages, a.id]);
  const checked = a.lastSync ? new Date(a.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  if (wantsSignIn(a)) return <div className="acct-health bad" role="status"><span>Needs signing in again before mail can come through.</span><button className="btn primary small" onClick={() => reconnectAccount(a.id)}>Sign in</button></div>;
  if (a.status === 'error') return <div className="acct-health bad" role="status"><span title={a.error}>Problem syncing{a.error ? `: ${a.error.replace(/\s+/g, ' ').slice(0, 90)}` : ''}</span><button className="btn small" onClick={() => restartSync(a.id)}>Try again</button></div>;
  if (a.status === 'syncing') return <div className="acct-health busy" role="status"><span>Syncing{a.syncDone ? `, ${a.syncDone.toLocaleString()} so far` : ''}.</span></div>;
  if (ooo?.needsPermission) return <div className="acct-health warn" role="status"><span>Out of Office needs one more sign in for this account.</span><button className="btn small" onClick={() => void oooSignIn([a.id])}>Sign in</button></div>;
  return <div className="acct-health ok" role="status"><span>All good.{checked ? ` Checked at ${checked},` : ''} {count.toLocaleString()} emails on this computer.</span></div>;
}

export const DISMISSED_KEY = 'wgm-acct-suggestions-dismissed';
export const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; } };

/** One suggestion at a time, worked out on this computer. One click to act, or Not now. */
export function AccountSuggestion({ a }: { a: Account }) {
  const s = useSettings();
  const keys = useGoogleKeys();
  const [dismissed, setDismissed] = useState(readDismissed);
  const own = a.aliases.find((x) => x.isDefault)?.email || a.email;
  const hasSig = Boolean(signatureFor(own, composeContext()).replace(/<[^>]+>/g, '').trim());
  const list: { id: string; text: string; action: string; run: () => void }[] = [];
  if (isTauri() && a.kind === 'gmail' && backupDue(Boolean(keys.own), s.keysBackedUpAt)) list.push({ id: 'backup', text: 'Back up your Google key, so setting up another computer takes a minute.', action: 'Back up', run: () => openScreen('settings', 'offline') });
  if (a.kind !== 'demo' && !hasSig) list.push({ id: `sig|${a.id}`, text: `${a.label || a.email} has no signature. Add one?`, action: 'Add signature', run: () => openScreen('settings', 'signatures') });
  const next = list.find((x) => !dismissed.includes(x.id));
  if (!next) return null;
  const hide = () => { const d = [...dismissed, next.id]; setDismissed(d); try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(d)); } catch { /* fine */ } };
  return (
    <div className="acct-suggest">
      <Icon name="sparkle" size={15} />
      <span>{next.text}</span>
      <button className="btn primary small" onClick={next.run}>{next.action}</button>
      <button className="btn small" onClick={hide}>Not now</button>
    </div>
  );
}

/** "Saved" with Undo, for a moment after any change made here. Every change saves straight away. */
export function SavedNote() {
  const top = useHistory((h) => h.past[h.past.length - 1]);
  const [, bump] = useState(0);
  useEffect(() => { const t = setTimeout(() => bump((x) => x + 1), 6000); return () => clearTimeout(t); }, [top?.id]);
  if (!top || Date.now() - top.at > 6000) return null;
  return <span className="acct-saved" aria-live="polite">Saved · <button className="link-btn" onClick={() => void undoSteps(1)}>Undo</button></span>;
}

/** Out of Office for one account. Off: the three things that matter (until when, who, the words) and one button. On: what's going out, with Change and Turn off now. */
export function AccountOooPanel({ a }: { a: Account }) {
  const plan = useSettings((st) => st.ooo);
  const ooo = useOoo((o) => o.byAccount[a.id]);
  const busy = useOoo((o) => o.busy);
  const [until, setUntil] = useState<'open' | 'dates'>('open');
  const [backOn, setBackOn] = useState(() => ymdOoo(Date.now() + 7 * 86400000));
  useEffect(() => { void refreshOoo([a.id]); }, [a.id]);
  const name = a.label || a.email;
  const sup = oooSupport(a);
  if (!sup.native) return <p className="hint">This kind of account sets Out of Office in {sup.webUrl ? <a href={sup.webUrl} target="_blank" rel="noreferrer">{sup.webName}</a> : 'its own web mail'}.</p>;
  if (ooo?.needsPermission) return <><p className="hint">This account needs one more sign in before Out of Office can be set.</p><div className="acct-panel-actions"><button className="btn primary" onClick={() => void oooSignIn([a.id])}>Sign in</button></div></>;
  const state = oooStateWords(ooo?.reply);
  const own = Boolean(plan.own[a.id]);
  const msg = messageForOoo(plan, a.id);
  const setPlan = (patch: Partial<OooPlan>) => useSettings.getState().set({ ooo: { ...useSettings.getState().ooo, ...patch } });
  // Editing here gives this account its own message, so the default for every account stays as it was.
  const setMsg = (patch: Partial<OooMessage>) => {
    const p = useSettings.getState().ooo;
    const base = p.own[a.id] || p.message;
    setPlan({ own: { ...p.own, [a.id]: { ...base, ...patch } } });
  };
  if (state.state !== 'off') {
    const r = ooo?.reply;
    const text = (r?.html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const who = r?.audience === 'contacts' ? 'Replying to your contacts.' : r?.audience === 'org' ? 'Replying to people in your organisation.' : 'Replying to everyone who emails you.';
    const turnOff = async () => { const res = await turnOffOoo([a.id]); if (res.done.length) toast({ text: `Out of Office is off for ${name}.` }); oooToastResult(res, 'turned off'); };
    return (
      <>
        <div className="acct-ooo-msg">{r?.subject && <b>{r.subject}</b>}<span>{text || 'No message.'}</span></div>
        <p className="hint" style={{ margin: 0 }}>{state.state === 'scheduled' ? `${state.words}. ` : ''}{who}</p>
        <div className="acct-panel-actions"><button className="btn" onClick={() => openScreen('settings', 'ooo')}>Change…</button><button className="btn" disabled={busy} onClick={() => void turnOff()}>{busy ? 'Turning off…' : 'Turn off now'}</button></div>
      </>
    );
  }
  const turnOn = async () => {
    const p: OooPlan = { ...useSettings.getState().ooo, accounts: [a.id], mode: until, firstDay: ymdOoo(Date.now()), backOn: until === 'dates' ? backOn : plan.backOn, useTimes: false };
    const problem = planProblem(p);
    if (problem) { toast({ text: problem, ttl: 8000 }); return; }
    const r = await turnOnOoo(p);
    if (r.needSignIn.length) { const ok = await oooSignIn(r.needSignIn, { ask: true }); if (ok.length) { const again = await turnOnOoo(p); r.done.push(...again.done); r.failed.push(...again.failed); } }
    if (r.done.length) toast({ text: `Out of Office is on for ${name}.` });
    oooToastResult(r, 'turned on');
  };
  const audiences: { value: OooPlan['audience']; label: string; disabled?: boolean; title?: string }[] = [
    { value: 'all', label: 'Everyone' },
    { value: 'contacts', label: 'My contacts' },
    ...(sup.org ? [{ value: 'org' as const, label: 'My organisation' }] : []),
  ];
  const audience = plan.audience === 'org' && !sup.org ? 'all' : plan.audience;
  return (
    <>
      <div className="acct-field"><span>Until</span><span className="acct-times">
        <Seg label="Until" value={until} onChange={setUntil} options={[{ value: 'open', label: 'I turn it off' }, { value: 'dates', label: 'A date' }]} />
        {until === 'dates' && <input type="date" aria-label="Back on" title="The day you're back" value={backOn} min={ymdOoo(Date.now() + 86400000)} onChange={(e) => setBackOn(e.target.value)} />}
      </span></div>
      <div className="acct-field"><span>Who gets it</span><Seg label="Who gets it" value={audience} onChange={(v) => setPlan({ audience: v })} options={audiences} /></div>
      <div className="acct-ooo-edit">
        <div className="acct-ooo-edit-head">
          <span>Message</span>
          <select aria-label="Start from a template" value="" onChange={(e) => { const t = OOO_TEMPLATES.find((x) => x.id === e.target.value); if (t) setMsg({ subject: t.subject, html: t.html }); }}>
            <option value="">Templates…</option>
            {OOO_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {sup.subject && <input type="text" className="acct-ooo-subject" aria-label="Subject" placeholder="Subject" value={msg.subject} onChange={(e) => setMsg({ subject: e.target.value })} />}
        <OooMessageEditor key={`acct-${a.id}`} label={`Away message for ${name}`} html={msg.html} onChange={(html) => setMsg({ html })} />
        <p className="hint" style={{ margin: 0 }}>{own ? <>Saved as {name}'s own message. <button className="link-btn" onClick={() => { const o = { ...useSettings.getState().ooo.own }; delete o[a.id]; setPlan({ own: o }); }}>Use the default instead</button></> : 'The default message for every account. Changing it here gives this account its own.'}</p>
      </div>
      <div className="acct-panel-actions"><button className="btn primary" disabled={busy} onClick={() => void turnOn()}>{busy ? 'Turning on…' : `Turn on for ${name}`}</button></div>
    </>
  );
}

/** AI Connection for one account: how much it can see, then each thing an AI app may do here, as buttons. */
export function AccountAiPanel({ a }: { a: Account }) {
  const s = useSettings();
  const mcp = tidy(s.mcp);
  if (!mcp.enabled) return <><p className="hint">AI Connection is switched off, so no AI app can see this account.</p><div className="acct-panel-actions"><button className="btn" onClick={() => openScreen('settings', 'ai')}>Set up AI Connection</button></div></>;
  const level = mcp.accounts[a.id] ?? 'off';
  const save = (patch: Partial<typeof mcp>) => s.set({ mcp: { ...mcp, ...patch } });
  const setOverride = (cap: string, mode: Mode) => {
    const own = { ...(mcp.overrides[a.id] || {}) };
    if (mode === mcp.modes[cap]) delete own[cap]; else own[cap] = mode;
    save({ overrides: { ...mcp.overrides, [a.id]: own } });
  };
  const caps = CAPABILITIES.filter((c) => c.group === 'read' || level === 'write');
  return (
    <>
      <div className="acct-field"><span>This account</span>
        <Seg label="How much AI apps can do here" value={level} onChange={(v) => save({ accounts: { ...mcp.accounts, [a.id]: v } })}
          options={[{ value: 'off', label: LEVEL_WORDS.off }, { value: 'read', label: LEVEL_WORDS.read }, { value: 'write', label: LEVEL_WORDS.write }]} />
      </div>
      <p className="hint" style={{ margin: 0 }}>{level === 'write' ? 'Sending and anything that reaches other people always asks you first.' : level === 'read' ? 'AI apps can look, but never change or write anything here.' : 'AI apps can\'t see this account.'}</p>
      {level !== 'off' && (
        <div className="acct-caps">
          {caps.map((c, i) => {
            const mode = effectiveMode(mcp, c.id, a.id);
            const own = mcp.overrides[a.id]?.[c.id] !== undefined;
            const heading = i === 0 || caps[i - 1].group !== c.group ? ({ read: 'Looking', organise: 'Organising', calendar: 'Calendar', send: 'Sending' } as Record<string, string>)[c.group] : undefined;
            return (
              <div key={c.id} className="acct-cap-wrap">{heading && <div className="acct-cap-group">{heading}</div>}
              <div className="acct-cap">
                <span><span>{c.label}</span>{own && <small className="acct-note">Only for this account</small>}</span>
                <Seg label={c.label} value={mode} onChange={(v) => setOverride(c.id, v)}
                  options={[{ value: 'off', label: 'Off' }, { value: 'ask', label: 'Ask' }, { value: 'allow', label: 'Allow', disabled: c.max !== 'allow', title: c.max !== 'allow' ? 'This always asks first' : undefined }]} />
              </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="acct-panel-actions"><button className="btn" onClick={() => openScreen('settings', 'ai')}>AI Connection settings</button></div>
    </>
  );
}

/** The summary rows; clicking one opens its settings below, or to the right on a wide window. */
export function AccountSections({ a, sigLine, calLine }: { a: Account; sigLine: (a: Account) => string; calLine: (a: Account) => string }) {
  const s = useSettings();
  const accounts = useMail((st) => st.accounts);
  const events = useMail((st) => st.events);
  const calNames = useMail((st) => st.calendarNames);
  const ooo = useOoo((o) => o.byAccount[a.id]);
  const mcp = tidy(s.mcp);
  const [open, setOpenNow] = useState<AcctSection | null>(() => acctMemo.open[a.id] ?? null);
  const setOpen = (v: AcctSection | null) => { acctMemo.open[a.id] = v; setOpenNow(v); };
  const [sigAddr, setSigAddr] = useState("");
  const modes = s.signatureModes[a.id] || {};
  const setMode = (k: 'replies' | 'forwards', v: 'same' | 'none') => s.set({ signatureModes: { ...s.signatureModes, [a.id]: { ...modes, [k]: v } } });
  const aliases = a.aliases.length ? a.aliases : [{ email: a.email, name: a.displayName, isDefault: true }];
  const own = aliases.find((x) => x.isDefault)?.email || a.email;
  const sigOf = aliases.some((x) => x.email === sigAddr) ? sigAddr : own;
  const alertWords = { all: 'Every new email', important: 'Only VIPs', off: 'Off' } as const;
  const calendars = [...new Set<string>([...(calNames[a.id] || []), ...events.filter((e) => e.accountId === a.id).map((e) => e.calendarName), ...s.hiddenCalendars.filter((k) => k.startsWith(`${a.id}|`)).map((k) => k.slice(a.id.length + 1))])].sort((x, y) => Number(y.toLowerCase() === a.email.toLowerCase()) - Number(x.toLowerCase() === a.email.toLowerCase()) || x.localeCompare(y));
  const toggleCal = (name: string, show: boolean) => { const k = `${a.id}|${name}`; s.set({ hiddenCalendars: show ? s.hiddenCalendars.filter((x) => x !== k) : [...s.hiddenCalendars, k] }); };
  // The signature's first line (usually the name), then only what differs from the usual.
  const firstLine = (aliases.find((x) => x.isDefault)?.name || a.displayName || sigLine(a)).trim();
  const sigBits = [modes.replies === 'none' && 'none on replies', modes.forwards === 'none' && 'none on forwards'].filter(Boolean);
  const sigSummary = sigLine(a) === 'None' ? 'None' : `${firstLine.split(' ').slice(0, 3).join(' ')}${sigBits.length ? `, ${sigBits.join(' and ')}` : ''}`;
  const rows: { id: AcctSection; k: string; v: string; chip?: string }[] = [
    { id: 'signature', k: 'Signature', v: sigSummary },
    { id: 'sending', k: 'Sending as', v: aliases.length > 1 ? `${aliases.length} addresses` : aliases[0]?.email || a.email },
    { id: 'calendars', k: 'Calendars', v: calLine(a) },
    { id: 'alerts', k: 'Alerts', v: `${alertWords[a.notify]}${s.quietHours.enabled ? ` · quiet ${s.quietHours.from} to ${s.quietHours.to}` : ''}` },
    { id: 'ai', k: 'AI Connection', v: mcp.enabled ? LEVEL_WORDS[mcp.accounts[a.id] ?? 'off'] : 'Switched off', chip: mcp.enabled && a.kind !== 'demo' && !(a.id in mcp.accounts) ? 'Not decided' : undefined },
    { id: 'ooo', k: 'Out of Office', v: oooSupport(a).native ? (ooo?.needsPermission ? 'Needs one more sign in' : oooStateWords(ooo?.reply).words) : 'Set in its own web mail' },
    { id: 'mail', k: 'Mail and storage', v: `Keep ${(RANGE_OPTS.find((o) => o.v === a.retentionDays)?.l || 'everything').toLowerCase()}${accounts.length > 1 && a.leaveOutOfAll ? ', not in All Inboxes' : ''}` },
  ];
  const title = rows.find((r) => r.id === open)?.k;
  return (
    <div className={`acct-body ${open ? 'has-panel' : ''}`}>
      <div className="acct-sum" role="list">
        {rows.map((r) => (
          <button key={r.id} role="listitem" className={`acct-sum-row ${open === r.id ? 'on' : ''}`} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
            <span className="k">{r.k}</span><span className="v">{r.v}{r.chip && <span className="acct-chip">{r.chip}</span>}</span><Icon name="chevronRight" size={14} />
          </button>
        ))}
      </div>
      {open && (
        <div className="acct-panel" role="region" aria-label={title}>
          <div className="acct-panel-head"><strong>{title}</strong><SavedNote />
            {open === 'ooo' && oooSupport(a).native && <button className="btn small" onClick={() => openScreen('settings', 'ooo')}>Out of Office settings</button>}
            {open === 'ai' && mcp.enabled && <button className="btn small" onClick={() => openScreen('settings', 'ai')}>AI Connection settings</button>}
            <button className="icon-btn" aria-label="Close" onClick={() => setOpen(null)}><Icon name="close" size={14} /></button></div>
          {open === 'signature' && (
            <>
              {/* The address first (each has its own signature), then its signature to edit right here, then the
                  account-wide choices for replies and forwards. The full page has the rest. */}
              {aliases.length > 1 && (
                <div className="acct-field"><span>Address</span><select value={sigOf} onChange={(e) => setSigAddr(e.target.value)}>{aliases.map((x) => <option key={x.email} value={x.email}>{x.email}</option>)}</select></div>
              )}
              <div className="acct-sig-edit">
                <SignatureEditor key={sigOf} email={sigOf} initial={sigOf in s.signatures ? s.signatures[sigOf] : (aliases.find((x) => x.email === sigOf) as { providerSignatureHtml?: string } | undefined)?.providerSignatureHtml || ''} onChange={(html) => s.set({ signatures: { ...useSettings.getState().signatures, [sigOf]: html } })} />
              </div>
              <div className="acct-subhead">For every address on this account</div>
              <div className="acct-field"><span>Replies</span><select value={modes.replies || 'same'} onChange={(e) => setMode('replies', e.target.value as 'same' | 'none')}><option value="same">Same as new emails</option><option value="none">No signature</option></select></div>
              <div className="acct-field"><span>Forwards</span><select value={modes.forwards || 'same'} onChange={(e) => setMode('forwards', e.target.value as 'same' | 'none')}><option value="same">Same as new emails</option><option value="none">No signature</option></select></div>
              <button className="btn" onClick={() => openScreen('settings', 'signatures')}>Signatures &amp; Addresses</button>
            </>
          )}
          {open === 'sending' && (
            <>
              <ul className="acct-aliases">{aliases.map((x) => <li key={x.email}><span>{x.name ? `${x.name} <${x.email}>` : x.email}</span>{x.isDefault && <span className="acct-pill ok">Default</span>}</li>)}</ul>
              <p className="hint">{a.kind === 'gmail' ? 'Addresses come from Gmail\'s "Send mail as" settings.' : 'Addresses this account can send from.'}</p>
              <button className="btn" onClick={() => openScreen('settings', 'signatures')}>Signatures & Addresses</button>
            </>
          )}
          {open === 'calendars' && (
            <>
              {calendars.length > 1 && (() => {
                // All of this account's calendars at once: on when every one shows, a dash when some do.
                const keys = calendars.map((n) => `${a.id}|${n}`);
                const shownCount = keys.filter((k) => !s.hiddenCalendars.includes(k)).length;
                return (
                  <label className="acct-field switch-row acct-all-cals">
                    <span><b>All calendars</b><small className="acct-note">{shownCount} of {keys.length} shown</small></span>
                    <input type="checkbox" role="switch" className="switch" checked={shownCount === keys.length} ref={(el) => { if (el) el.indeterminate = shownCount > 0 && shownCount < keys.length; }}
                      onChange={(e) => s.set({ hiddenCalendars: e.target.checked ? s.hiddenCalendars.filter((k) => !keys.includes(k)) : [...new Set([...s.hiddenCalendars, ...keys])] })} />
                  </label>
                );
              })()}
              {calendars.length ? calendars.map((name) => {
                const shown = !s.hiddenCalendars.includes(`${a.id}|${name}`);
                return <label key={name} className="acct-field switch-row"><span>{name}</span><input type="checkbox" role="switch" className="switch" checked={shown} onChange={(e) => toggleCal(name, e.target.checked)} /></label>;
              }) : <p className="hint">{a.kind === 'imap' ? 'Calendars from this account come through once it has signed in.' : 'Calendars appear here once they have loaded.'}</p>}
              <button className="btn" onClick={() => useMail.setState({ settingsTab: 'calendar' })}>More calendar settings</button>
            </>
          )}
          {open === 'alerts' && (
            <>
              <div className="acct-field"><span>New mail alerts</span><select value={a.notify} onChange={(e) => editAccount(a.id, { notify: e.target.value as Account['notify'] }, 'alerts')}><option value="all">Every new email</option><option value="important">Only VIPs</option><option value="off">Off</option></select></div>
              <label className="acct-field switch-row"><span>Quiet hours<small className="acct-note">No alerts overnight, for every account.</small></span><input type="checkbox" role="switch" className="switch" checked={s.quietHours.enabled} onChange={(e) => s.set({ quietHours: { ...s.quietHours, enabled: e.target.checked } })} /></label>
              {s.quietHours.enabled && (
                <div className="acct-field"><span>From</span><span className="acct-times"><input type="time" aria-label="Quiet hours start" value={s.quietHours.from} onChange={(e) => s.set({ quietHours: { ...s.quietHours, from: e.target.value } })} /> to <input type="time" aria-label="Quiet hours end" value={s.quietHours.to} onChange={(e) => s.set({ quietHours: { ...s.quietHours, to: e.target.value } })} /></span></div>
              )}
              <button className="link-btn" onClick={() => openScreen('settings', 'notifications')}>More in Notifications</button>
            </>
          )}
          {open === 'ai' && <AccountAiPanel a={a} />}
          {open === 'ooo' && <AccountOooPanel a={a} />}
          {open === 'mail' && (
            <>
              {accounts.length > 1 && <label className="acct-field switch-row"><span>Show in All Inboxes</span><input type="checkbox" role="switch" className="switch" checked={!a.leaveOutOfAll} onChange={(e) => setLeaveOutOfAll(a.id, !e.target.checked)} /></label>}
              <div className="acct-field"><span>Keep mail from</span><KeepMail a={a} /></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AccountsTab() {
  const accounts = useMail((s) => s.accounts);
  const demo = useSettings((s) => s.demoMode);
  const s = useSettings();
  const googleOn = useGoogleConfigured();
  const addMenu = useMenu();
  const moreMenu = useMenu();
  const keys = useGoogleKeys();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [keepMail, setKeepMail] = useState(true);
  const messages = useMail((st) => st.messages);
  const confirmCount = useMemo(() => (confirm ? Object.values(messages).filter((m) => m.accountId === confirm).length : 0), [confirm, messages]);
  const moreItems = (a: Account) => [
    ...(a.kind === 'gmail' || a.kind === 'microsoft' || a.kind === 'imap' ? [{ label: 'Sign in again', icon: 'user' as IconName, onClick: () => void reconnectAccount(a.id) }] : []),
    { label: 'Change colour', icon: 'contrast' as IconName, onClick: () => { const el = document.querySelector('.acct-avatar') as HTMLElement | null; const r = el?.getBoundingClientRect(); setPicker({ accountId: a.id, anchor: { x: r ? r.left : 200, y: r ? r.bottom + 6 : 200 } }); } },
    { label: 'Remove account…', icon: 'trash' as IconName, onClick: () => { setKeepMail(true); setConfirm(a.id); } },
  ];
  const [picker, setPicker] = useState<{ accountId: string; anchor: { x: number; y: number } } | null>(null);
  const sorted = [...accounts].sort((a, b) => a.order - b.order);
  const [selId, setSelIdNow] = useState<string | undefined>(() => acctMemo.selId);
  const setSelId = (id: string | undefined) => { acctMemo.selId = id; setSelIdNow(id); };
  const [dropOn, setDropOn] = useState<string | null>(null);
  // The account shown on the right: the one you picked, else the first that needs attention, else the first.
  const sel = sorted.find((a) => a.id === selId) || sorted.find((a) => wantsSignIn(a) || a.status === 'error') || sorted[0];
  const events = useMail((st) => st.events);
  const calNames = useMail((st) => st.calendarNames);
  const kindName = (a: Account) => (a.kind === 'gmail' ? 'Google' : a.kind === 'microsoft' ? 'Microsoft 365' : a.kind === 'demo' ? 'Demo' : IMAP_PRESETS.find((p) => p.host === a.imap?.host)?.name || 'IMAP');
  const statusWords = (a: Account) => (a.status === 'error' ? 'Problem syncing' : a.status === 'syncing' ? (a.syncDone ? `Syncing, ${a.syncDone.toLocaleString()}` : 'Syncing') : 'Connected');
  const sigLine = (a: Account) => {
    const own = a.aliases.find((x) => x.isDefault)?.email || a.email;
    const html = own in s.signatures ? s.signatures[own] : a.aliases.find((x) => x.email === own)?.providerSignatureHtml || '';
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    return text ? (text.length > 42 ? `${text.slice(0, 42)}…` : text) : 'None';
  };
  const calLine = (a: Account) => {
    const names = new Set<string>([...(calNames[a.id] || []), ...events.filter((e) => e.accountId === a.id).map((e) => e.calendarName)]);
    s.hiddenCalendars.filter((k) => k.startsWith(`${a.id}|`)).forEach((k) => names.add(k.slice(a.id.length + 1)));
    if (!names.size) return a.kind === 'imap' ? 'None (plain email account)' : 'None yet';
    const hidden = [...names].filter((n) => s.hiddenCalendars.includes(`${a.id}|${n}`)).length;
    return `${names.size - hidden} of ${names.size} shown`;
  };
  // If an account says Syncing but nothing is really syncing, check it again every few seconds until it settles.
  useEffect(() => {
    const t = setInterval(() => {
      for (const a of useMail.getState().accounts) if (a.status === 'syncing' && !isSyncing(a.id)) syncAccount(a.id, { quiet: true });
    }, 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <h1>Accounts</h1>
      {!accounts.some((a) => a.kind !== 'demo') && (
        <section className="set-section">
          <h2>Demo mode</h2>
          <p className="hint">Pretend accounts and emails for trying things out. Nothing is sent anywhere. This goes away once you connect a real account.</p>
          {demo ? <button className="btn" onClick={leaveDemo}>Leave demo mode and clear demo data</button> : <button className="btn" onClick={() => startDemo()}>Try demo mode</button>}
        </section>
      )}
      <section className="set-section acct-section">
        {/* Like Apple Mail: your accounts on the left, everything about the one you pick on the right. */}
        <div className="acct-md">
          <div className="acct-list" role="listbox" aria-label="Accounts">
            {sorted.map((a) => {
              const issue = wantsSignIn(a) || a.status === 'error';
              return (
                <button key={a.id} role="option" aria-selected={sel?.id === a.id} className={`acct-item ${sel?.id === a.id ? 'on' : ''} ${dropOn === a.id ? 'drop-before' : ''}`}
                  onClick={() => setSelId(a.id)} draggable title="Drag to change the order"
                  onContextMenu={(e) => { e.preventDefault(); setSelId(a.id); moreMenu.open({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0, x: e.clientX, y: e.clientY, toJSON: () => ({}) } as DOMRect, moreItems(a)); }}
                  onDragStart={(e) => { e.dataTransfer.setData('text/wgm-account', a.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('text/wgm-account')) { e.preventDefault(); setDropOn(a.id); } }}
                  onDragLeave={() => setDropOn(null)}
                  onDrop={(e) => { const from = e.dataTransfer.getData('text/wgm-account'); setDropOn(null); if (!from || from === a.id) return; e.preventDefault(); const ids = sorted.map((x) => x.id).filter((x) => x !== from); ids.splice(ids.indexOf(a.id), 0, from); reorderAccounts(ids); }}>
                  <span className="dot" style={{ background: a.colour }} />
                  <span className="acct-item-name">{a.label || a.email}</span>
                  {issue && <span className="acct-warn" aria-label={wantsSignIn(a) ? 'Needs signing in' : 'Problem syncing'} title={wantsSignIn(a) ? 'Needs signing in' : 'Problem syncing'} />}
                </button>
              );
            })}
            <button className="acct-item add" onClick={(e) => addMenu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), addAccountItems())}><Icon name="plus" size={14} /> Add account</button>
          </div>
          {sel ? (
            <div className="acct-detail">
              <div className="acct-head">
                <button className="acct-avatar" style={{ background: sel.colour }} aria-label={`Colour for ${sel.email}`} title="Change colour" onClick={(e) => setPicker({ accountId: sel.id, anchor: { x: e.clientX, y: e.clientY + 12 } })}>{(sel.label || sel.email).slice(0, 1).toUpperCase()}</button>
                <div className="acct-head-text">
                  <AccountName key={sel.id} a={sel} />
                  <div className="acct-sub">{sel.email} · {kindName(sel)}</div>
                </div>
                <div className="acct-head-actions">
                  {wantsSignIn(sel)
                    ? <button className="btn primary small" onClick={() => reconnectAccount(sel.id)}>Sign in</button>
                    : <span className={`acct-pill ${sel.status === 'error' ? 'bad' : sel.status === 'syncing' ? 'busy' : 'ok'}`} title={sel.status === 'error' ? sel.error : undefined}>{statusWords(sel)}</span>}
                  {sel.kind !== 'demo' && <button className="btn small" disabled={sel.status === 'syncing'} title="Fetch this account's mail again from the start" onClick={() => restartSync(sel.id)}><Icon name="refresh" size={13} /> Resync</button>}
                  <button className="btn small icon-only" aria-label={`More for ${sel.label || sel.email}`} title="More" onClick={(e) => moreMenu.open((e.currentTarget as HTMLElement).getBoundingClientRect(), moreItems(sel))}><Icon name="more" size={14} /></button>
                </div>
              </div>

              <AccountHealth a={sel} />
              <AccountSuggestion a={sel} />
              <AccountSections key={sel.id} a={sel} sigLine={sigLine} calLine={calLine} />
            </div>
          ) : (
            <div className="acct-detail empty">Add an account to get started.</div>
          )}
        </div>
        <p className="hint acct-hint">Click the name to rename it and the coloured square to change its colour. Drag accounts in the list to change their order.</p>
        {!isTauri() && <p className="hint" style={{ marginTop: 10 }}>Signing in to real accounts works in the desktop app. This browser preview runs in demo mode.</p>}
        {isTauri() && !googleOn && <p className="hint" style={{ marginTop: 10 }}>Gmail isn't set up yet. The setup guide takes about 10 minutes.</p>}
        {isTauri() && (
          <details className="own-keys">
            <summary>Use your own app keys</summary>
            <p className="hint">Only needed for a different Google project, or if your organisation blocks the shared Microsoft app.</p>
          {googleOn && (
            <div className="set-card">
              <div className="tx"><strong>Google key</strong><span>Only needed if you have changed your Google Cloud project, or want to run the setup guide again. A new key means signing in to each account again.</span></div>
              <button className="btn" onClick={() => openGuide('setup')}>Set up with a different key…</button>
            </div>
        )}
          <div className="set-card">
            <div className="tx"><strong>Microsoft app ID</strong><span>Microsoft accounts sign in through a shared app that comes with Well Good Mail. Only change it if your organisation blocks it and you have registered your own.</span></div>
            <button className="btn" onClick={() => openGuide('microsoft')}>Use my own ID…</button>
          </div>
          </details>
        )}
      </section>
      {isTauri() && googleOn && keys.own && !s.googlePublished && (
        <section className="set-section">
          <div className="weekly-card">
            <Icon name="clock" size={20} />
            <div style={{ flex: 1 }}>
              <strong>Stop signing in every week</strong>
              <p className="hint" style={{ margin: '2px 0 8px' }}>While your Google project is in testing mode, Google signs you out after 7 days. Publishing it takes about two minutes and needs no review for personal use.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={() => openGuide('publish')}>Show me how</button>
                <button className="btn ghost" onClick={() => s.set({ googlePublished: true })}>I've already done this</button>
              </div>
            </div>
          </div>
        </section>
      )}
      {addMenu.node}
      {moreMenu.node}
      {picker && <ColourPicker anchor={picker.anchor} value={accounts.find((x) => x.id === picker.accountId)?.colour || '#888888'} onPick={(c) => editAccount(picker.accountId, { colour: c }, 'colour')} onClose={() => setPicker(null)} />}
      {confirm && (
        (() => {
          const acc = accounts.find((x) => x.id === confirm);
          const where = acc?.kind === 'gmail' ? 'Gmail' : acc?.kind === 'microsoft' ? 'Outlook' : 'the account';
          return (
            <Dialog title={`Remove ${acc ? acc.label || acc.email : 'this account'}?`} onClose={() => setConfirm(null)} actions={<>
              <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn danger-fill" onClick={() => { const id = confirm; setConfirm(null); void removeAccount(id, { keepMail: acc?.kind !== 'demo' && keepMail }).then(() => toast({ text: keepMail ? `${acc?.label || acc?.email} removed. Its mail is kept on this computer for if you add it again.` : `${acc?.label || acc?.email} removed, and its mail deleted from this computer.` })); }}>Remove account</button>
            </>}>
              <p style={{ marginTop: 0 }}>Nothing changes in {where} itself. Your mail stays there.</p>
              {acc?.kind !== 'demo' && (
                <div className="remove-opts" role="radiogroup" aria-label="What happens to its mail here">
                  <label className={`remove-opt ${keepMail ? 'on' : ''}`}><input type="radio" name="keepmail" checked={keepMail} onChange={() => setKeepMail(true)} />
                    <span><b>Keep its mail on this computer</b><small>Hidden until you add the account again, then it's back at once instead of downloading {confirmCount.toLocaleString()} emails. You can clear it later in Storage.</small></span></label>
                  <label className={`remove-opt ${!keepMail ? 'on' : ''}`}><input type="radio" name="keepmail" checked={!keepMail} onChange={() => setKeepMail(false)} />
                    <span><b>Delete its mail from this computer</b><small>Frees the space its {confirmCount.toLocaleString()} emails take. Adding it again downloads everything from the start.</small></span></label>
                </div>
              )}
            </Dialog>
          );
        })()
      )}
    </>
  );
}

// ---------- signatures & addresses ----------
