// Help & Feedback: suggest a feature, email support, or report a problem. All go to support@wellgood.media from
// your own account, so you see exactly what is sent. A problem report is a short form like a crash report: an
// optional note, and a log of what the app has been doing, attached as a text file.
import { useState } from 'react';
import { Dialog } from './ui';
import { useMail, queueSend, toast } from '../lib/mail';
import { useUpdates } from '../lib/updater';
import { createDraft } from '../lib/compose';
import { composeContext, startCompose } from '../lib/composeActions';
import { bytesToBase64 } from '../lib/mime';
import { logText, activityLog } from '../lib/activityLog';
import { openExternal } from '../lib/platform';

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
export function diagnosticsText(): string {
  const st = useMail.getState();
  const count = (id: string) => Object.values(st.messages).filter((m) => m.accountId === id).length;
  return [
    `Well Good Mail ${version()}`,
    `When: ${new Date().toISOString()}`,
    `System: ${navigator.userAgent}`,
    `Screen: ${st.screen}`,
    `Emails stored: ${Object.keys(st.messages).length}`,
    '',
    'Accounts:',
    ...st.accounts.map((a) => `- ${a.label} (${a.kind}${a.imap?.host ? `, ${a.imap.host}` : ''}): ${a.status}${a.error ? `, ${a.error.replace(/\s+/g, ' ').slice(0, 200)}` : ''}, ${count(a.id)} emails, last checked ${a.lastSync ? new Date(a.lastSync).toISOString() : 'never'}`),
    '',
    'Recent activity (errors, warnings and messages the app showed):',
    logText(),
  ].join('\n');
}

/** The problem report form. */
export function ReportProblem({ onClose }: { onClose: () => void }) {
  const [what, setWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const accounts = useMail((s) => s.accounts).filter((a) => a.kind !== 'demo');
  const lines = activityLog().length;
  const send = async () => {
    setBusy(true);
    const report = diagnosticsText();
    const subject = `Well Good Mail: problem report (${version()})`;
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
    <Dialog title="Report a problem" onClose={onClose} actions={<>
      <button className="btn" onClick={onClose}>Don't send</button>
      <button className="btn primary" disabled={busy} onClick={send}>{busy ? 'Sending...' : 'Send report'}</button>
    </>}>
      <div className="report-form">
        <p className="hint" style={{ marginTop: 0 }}>Sorry something went wrong. This sends a short report to {SUPPORT} from your own email{accounts.length ? '' : ' app'}, so you'll find it in Sent.</p>
        <label className="report-label" htmlFor="report-what">What were you doing, and what happened? <span className="hint">(optional)</span></label>
        <textarea id="report-what" rows={5} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="For example: I clicked Send on a reply to Isla and it stayed in the Outbox." autoFocus />
        <p className="hint">Attached: the version, each account's status, and the last {lines} line{lines === 1 ? '' : 's'} of the app's activity log (errors and warnings). No email text and no passwords. <button className="link-btn" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide it' : 'See exactly what is sent'}</button></p>
        {showLog && <pre className="report-log">{diagnosticsText()}</pre>}
      </div>
    </Dialog>
  );
}
