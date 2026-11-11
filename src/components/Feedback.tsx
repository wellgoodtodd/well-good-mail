// Help & Feedback: suggest a feature, email support, or report a problem. All go to support@wellgood.media from
// your own account, so you see exactly what is sent. A problem report is a short form like a crash report: an
// optional note, and a log of what the app has been doing, attached as a text file.
import { useEffect, useState } from 'react';
import { Dialog } from './ui';
import { useMail, queueSend, toast } from '../lib/mail';
import { useUpdates } from '../lib/updater';
import { createDraft } from '../lib/compose';
import { composeContext, startCompose } from '../lib/composeActions';
import { bytesToBase64 } from '../lib/mime';
import { logText, activityLog } from '../lib/activityLog';
import { openExternal, invoke, isTauri, isPopout } from '../lib/platform';

/** How the last run ended, when it closed unexpectedly. */
export interface LastRun { seen: number; panic?: string | null }

export const SUPPORT = 'support@wellgood.media';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const version = () => useUpdates.getState().currentVersion || 'unknown';

/** A new email to support, ready to write in. Without an account, the computer's own mail app opens instead. */
export async function emailSupport(kind: 'feature' | 'support') {
  const subject = kind === 'feature' ? 'Well Good Mail: feature suggestion' : 'Well Good Mail: support';
  const prompt = kind === 'feature' ? 'What would you like Well Good Mail to do?' : 'What do you need a hand with?';
  if (!useMail.getState().accounts.some((a) => a.kind !== 'demo')) {
    void openExternal(`mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}`);
    return;
  }
  await startCompose('new', undefined, { extra: { to: [{ email: SUPPORT, name: 'Well Good Mail support' }], subject, html: `<p>${prompt}</p><p></p><p style="color:#888">Version ${escape(version())}</p>` } });
}

/** Everything about the app's state that helps find a problem, with no email text and no passwords. */
export function diagnosticsText(crash?: LastRun): string {
  const st = useMail.getState();
  const count = (id: string) => Object.values(st.messages).filter((m) => m.accountId === id).length;
  return [
    `Well Good Mail ${version()}`,
    `When: ${new Date().toISOString()}`,
    `System: ${navigator.userAgent}`,
    `Screen: ${st.screen}`,
    `Emails stored: ${Object.keys(st.messages).length}`,
    ...(crash ? ['', `Closed unexpectedly: last seen running ${crash.seen ? new Date(crash.seen).toISOString() : 'unknown'}`, ...(crash.panic ? [`Panic: ${crash.panic}`] : [])] : []),
    '',
    'Accounts:',
    ...st.accounts.map((a) => `- ${a.label} (${a.kind}${a.imap?.host ? `, ${a.imap.host}` : ''}): ${a.status}${a.error ? `, ${a.error.replace(/\s+/g, ' ').slice(0, 200)}` : ''}, ${count(a.id)} emails, last checked ${a.lastSync ? new Date(a.lastSync).toISOString() : 'never'}`),
    '',
    'Recent activity (errors, warnings and messages the app showed):',
    logText(),
  ].join('\n');
}

/** The problem report form. */
export function ReportProblem({ onClose, crash }: { onClose: () => void; crash?: LastRun }) {
  const [what, setWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const accounts = useMail((s) => s.accounts).filter((a) => a.kind !== 'demo');
  const lines = activityLog().length;
  const send = async () => {
    setBusy(true);
    const report = diagnosticsText(crash);
    const subject = `Well Good Mail: ${crash ? 'closed unexpectedly' : 'problem report'} (${version()})`;
    if (!accounts.length) {
      await navigator.clipboard?.writeText(`${what}\n\n${report}`).catch(() => undefined);
      void openExternal(`mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}`);
      toast({ text: 'The report is copied. Paste it into the email that opened.', ttl: 9000 });
      onClose();
      return;
    }
    try {
      const data = new TextEncoder().encode(report);
      const draft = createDraft('new', undefined, composeContext(), {
        to: [{ email: SUPPORT, name: 'Well Good Mail support' }],
        subject,
        html: `<p>${what.trim() ? escape(what.trim()).replace(/\n/g, '<br>') : '(No description given.)'}</p><p style="color:#888">The app's report is attached.</p>`,
        attachments: [{ id: 'report', filename: 'well-good-mail-report.txt', mimeType: 'text/plain', size: data.length, dataB64: bytesToBase64(data) }],
      });
      await queueSend(draft);
      toast({ text: 'Report sent to support. Thank you.' });
      onClose();
    } catch (e) {
      toast({ text: `Couldn't send the report: ${e instanceof Error ? e.message : e}`, ttl: 9000 });
      setBusy(false);
    }
  };
  return (
    <Dialog title={crash ? 'Well Good Mail closed unexpectedly' : 'Report a problem'} onClose={onClose} actions={<>
      <button className="btn" onClick={onClose}>Don't send</button>
      <button className="btn primary" disabled={busy} onClick={send}>{busy ? 'Sending...' : 'Send report'}</button>
    </>}>
      <div className="report-form">
        <p className="hint" style={{ marginTop: 0 }}>{crash ? `Last time, it stopped without being quit${crash.seen ? ` (around ${new Date(crash.seen).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})` : ''}. Sorry about that. Sending a report helps find out why. ` : 'Sorry something went wrong. '}This sends a short report to {SUPPORT} from your own email{accounts.length ? '' : ' app'}, so you'll find it in Sent.</p>
        <label className="report-label" htmlFor="report-what">What were you doing, and what happened? <span className="hint">(optional)</span></label>
        <textarea id="report-what" rows={5} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="For example: I clicked Send on a reply to Isla and it stayed in the Outbox." autoFocus />
        <p className="hint">Attached: the version, each account's status, and the last {lines} line{lines === 1 ? '' : 's'} of the app's activity log (errors and warnings). No email text and no passwords. <button className="link-btn" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide it' : 'See exactly what is sent'}</button></p>
        {showLog && <pre className="report-log">{diagnosticsText(crash)}</pre>}
      </div>
    </Dialog>
  );
}

/** At start: if the app closed unexpectedly last time, offers to send a report (the same form, Don't send to skip). */
export function CrashPrompt() {
  const [crash, setCrash] = useState<LastRun | null>(null);
  useEffect(() => {
    if (!isTauri() || isPopout()) return;
    // A few seconds in, once the window has settled.
    const t = setTimeout(() => { void invoke<LastRun | null>('last_run_crashed').then((r) => { if (r) setCrash(r); }).catch(() => undefined); }, 4000);
    return () => clearTimeout(t);
  }, []);
  return crash ? <ReportProblem crash={crash} onClose={() => setCrash(null)} /> : null;
}
