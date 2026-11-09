// Which signature goes on an email, like Apple Mail: the From address's own by default, any other address's,
// or none. Shown in the editor and on AI Drafts cards, on the From line.
import { useMemo } from 'react';
import { useMail } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { allAliases } from '../lib/compose';

/** Every address that has a signature, for the list. */
export function useSignatureChoices(): { email: string; label: string }[] {
  const accounts = useMail((s) => s.accounts);
  const signatures = useSettings((s) => s.signatures);
  return useMemo(() => {
    const out: { email: string; label: string }[] = [];
    for (const { alias, account } of allAliases(accounts)) {
      const has = (alias.email in signatures ? Boolean(signatures[alias.email]) : Boolean(alias.providerSignatureHtml));
      if (has && !out.some((x) => x.email === alias.email)) out.push({ email: alias.email, label: `${account.label}${alias.email !== account.email ? ` (${alias.email})` : ''}` });
    }
    return out;
  }, [accounts, signatures]);
}

/** `value`: undefined for the From address's own, '' for none, or another address. */
export function SignaturePicker({ fromEmail, value, onChange }: { fromEmail: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const choices = useSignatureChoices();
  const own = choices.find((c) => c.email === fromEmail);
  const current = value === undefined ? 'default' : value === '' ? 'none' : value;
  return (
    <label className="sig-pick" title="Which signature goes on this email">
      <span>Signature</span>
      <select aria-label="Signature" value={current} onChange={(e) => onChange(e.target.value === 'default' ? undefined : e.target.value === 'none' ? '' : e.target.value)}>
        <option value="default">{own ? own.label : 'Default (none set)'}</option>
        {choices.filter((c) => c.email !== fromEmail).map((c) => <option key={c.email} value={c.email}>{c.label}</option>)}
        <option value="none">None</option>
      </select>
    </label>
  );
}
