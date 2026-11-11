// After an account is added, while AI Connection is on: one question, so it's clear the new account starts hidden
// from AI apps, and you can choose there and then. Keep it off is picked to begin with, so Done never shares anything.
import { useEffect, useState } from 'react';
import { useMail } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { tidy, type AccountLevel } from '../lib/mcp/permissions';
import { useAiAsk } from '../lib/aiAsk';
import { Dialog } from './ui';

const CHOICES: { value: AccountLevel; label: string; hint: string }[] = [
  { value: 'off', label: 'Keep it off', hint: "AI apps can't see this account." },
  { value: 'read', label: 'Read only', hint: 'They can search and read its mail and calendar.' },
  { value: 'write', label: 'Read and write', hint: 'They can also write drafts and file emails, always asking you first for anything that sends.' },
];

export function NewAccountAi() {
  const queue = useAiAsk((s) => s.queue);
  const accounts = useMail((s) => s.accounts);
  const [choice, setChoice] = useState<AccountLevel>('off');
  const [, tick] = useState(0);
  const first = queue[0];
  const acc = first && accounts.find((a) => a.id === first.id);
  // Wait for the first sync (or 20 seconds), so it never gets in the way of signing in.
  const ready = Boolean(acc && (acc.status !== 'syncing' || Date.now() - first.at > 20000));
  useEffect(() => {
    if (!first || ready) return;
    const t = window.setInterval(() => tick((n) => n + 1), 2000);
    return () => window.clearInterval(t);
  }, [first, ready]);
  const next = () => useAiAsk.setState((s) => ({ queue: s.queue.slice(1) }));
  useEffect(() => { setChoice('off'); }, [first?.id]);
  // An account removed before it was asked about: skip it.
  useEffect(() => { if (first && !acc) next(); }, [first, acc]);
  if (!first || !acc) return null;
  if (!ready) return null;
  const name = acc.label || acc.email;
  const done = () => {
    const mcp = tidy(useSettings.getState().mcp);
    useSettings.getState().set({ mcp: { ...mcp, accounts: { ...mcp.accounts, [acc.id]: choice } } });
    next();
  };
  return (
    <Dialog
      title={`Share ${name} with AI apps?`}
      onClose={next}
      actions={<><button className="btn" onClick={next}>Decide later</button><button className="btn primary" onClick={done}>Done</button></>}
    >
      <p>AI apps like Claude only see the accounts you choose. {name} is off until you say otherwise.</p>
      <div className="remove-opts" role="radiogroup" aria-label={`AI access for ${name}`}>
        {CHOICES.map((c) => (
          <label key={c.value} className={`remove-opt ${choice === c.value ? 'on' : ''}`}>
            <input type="radio" name="new-account-ai" checked={choice === c.value} onChange={() => setChoice(c.value)} />
            <span>{c.label}<small>{c.hint}</small></span>
          </label>
        ))}
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>Change it any time in Settings › Accounts › AI Connection.</p>
    </Dialog>
  );
}
