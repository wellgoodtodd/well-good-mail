// Small pieces used by several Settings tabs.
import { useEffect, useRef, useState } from 'react';
import { updateAccount, toast, restartSync, editAccount } from '../../lib/mail';
import { useSettings } from '../../lib/settings';
import type { Account } from '../../lib/types';

/** An account's name: typing is instant, and it's saved (as one Undo step) after a short pause or when you leave the box. */
export function AccountName({ a }: { a: Account }) {
  const [value, setValue] = useState(a.label);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setValue(a.label); }, [a.label]);
  const commit = (v: string) => { window.clearTimeout(timer.current); if (v !== a.label) editAccount(a.id, { label: v }, 'name'); };
  return (
    <input className="label-input acct-name" value={value} aria-label={`Name for ${a.email}`}
      onChange={(e) => { const v = e.target.value; setValue(v); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => commit(v), 600); }}
      onBlur={() => commit(value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
  );
}

export function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return <div className="set-row"><label htmlFor={htmlFor}>{label}</label>{children}</div>;
}

/** Buttons side by side for a short choice (the selected one filled). */
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; disabled?: boolean; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg set-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={o.disabled} title={o.title} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Radio<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  if (options.length <= 4 && options.every((o) => !o.sub && o.label.length <= 26)) {
    return (
      <div className="seg set-seg" role="radiogroup" aria-label={name}>
        {options.map((o) => <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
      </div>
    );
  }
  return (
    <div className="radio-list" role="radiogroup">
      {options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span><span>{o.label}</span>{o.sub && <><br /><span className="sub">{o.sub}</span></>}</span>
        </label>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return <label className="check"><span className="check-text">{children}</span><input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>;
}

// ---------- accounts ----------

/** True when signing in again is the likely fix: a sign in problem, including a sign in saved under a different Google key. */
export function wantsSignIn(a: { status: string; error?: string }): boolean {
  return a.status === 'needs-signin' || (a.status === 'error' && /sign in|unauthori[sz]ed|invalid_grant|invalid_client/i.test(a.error || ''));
}

export const RANGE_OPTS: { v: number | null; l: string }[] = [{ v: 90, l: '3 months' }, { v: 365, l: '1 year' }, { v: 1095, l: '3 years' }, { v: null, l: 'Everything' }];

/** How far back an account keeps mail on this PC. The same choice shows in Accounts and in Search & storage. */
export function KeepMail({ a, compact }: { a: Account; compact?: boolean }) {
  const change = (v: number | null) => {
    const smaller = v !== null && (a.retentionDays === null || v < a.retentionDays);
    updateAccount(a.id, { retentionDays: v, syncCursor: undefined });
    toast({ text: smaller ? `${a.label} now keeps ${RANGE_OPTS.find((o) => o.v === v)?.l}. Older mail already on this PC stays, and nothing older is fetched.` : `${a.label} is fetching mail for the new range.`, ttl: 8000 });
    restartSync(a.id);
  };
  const select = (
    <select aria-label={`How much mail to keep for ${a.email}`} value={String(a.retentionDays)} onChange={(e) => change(e.target.value === 'null' ? null : Number(e.target.value))}>
      {RANGE_OPTS.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
    </select>
  );
  return compact ? <label className="keep-mail">Keep mail from {select}</label> : select;
}

/** The one text size setting, shown in both Appearance and Accessibility: moving either moves the other. */
export function TextSizeSlider({ id }: { id: string }) {
  const scale = useSettings((st) => st.textScale) || 1;
  const pct = Math.round(scale * 100);
  return (
    <>
      <input id={id} type="range" min={0.85} max={1.3} step={0.05} value={scale} aria-valuetext={`${pct}%`} onChange={(e) => useSettings.getState().set({ textScale: Number(e.target.value) })} />
      <span>{pct}%</span>
    </>
  );
}
