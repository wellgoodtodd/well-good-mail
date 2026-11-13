// Starting again after the app's data was deleted: add the accounts back from the sign-ins Windows kept, then offer
// the settings from Google Drive if "Keep my settings the same on every computer" was on.
import { restoreSignIns, toast, useMail, type SavedSignIn } from './mail';
import { findSettingsBackup, restoreSettingsFrom } from './settingsSync';

/** Resolves once these Google accounts are in the app (each is added before its mail downloads), or after a while. */
function googleAccountsAdded(emails: string[], ms: number): Promise<boolean> {
  const has = () => emails.every((e) => useMail.getState().accounts.some((a) => a.kind === 'gmail' && a.email === e));
  if (has()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const stop = useMail.subscribe(() => { if (has()) { stop(); clearTimeout(t); resolve(true); } });
    const t = setTimeout(() => { stop(); resolve(useMail.getState().accounts.some((a) => a.kind === 'gmail')); }, ms);
  });
}

export async function restoreEverything(list: SavedSignIn[]): Promise<void> {
  toast({ text: `Adding ${list.length === 1 ? list[0].email : `${list.length} accounts`} back. Your mail downloads as usual.`, ttl: 5000 });
  const done = restoreSignIns(list);
  const google = list.filter((s) => s.kind === 'gmail').map((s) => s.email);
  if (google.length && (await googleAccountsAdded(google, 30000))) {
    const backup = await findSettingsBackup().catch(() => undefined);
    if (backup) {
      const when = new Date(backup.modifiedTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      toast({
        text: `Your settings from ${when} are saved in Google Drive (${backup.email}). Bring them back?`,
        ttl: 60000,
        action: { label: 'Bring them back', run: () => void restoreSettingsFrom(backup.email) },
      });
    }
  }
  for (const f of await done) toast({ text: `${f.s.email} couldn't be added back (${f.error}). Add it from Add account.`, ttl: 12000 });
}
