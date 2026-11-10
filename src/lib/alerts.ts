// Things in Settings that want your attention. Each one puts the coral dot on its tab and on the Settings row in the sidebar.
import { useMail } from './mail';
import { isBetaVersion, useUpdatePending, useUpdates } from './updater';
import { useBetaNotice } from './betaNotice';
import { useSettings } from './settings';

export interface SettingsAlerts {
  /** Settings tab id -> why it has a dot. */
  tabs: Record<string, string>;
  any: boolean;
}

export function useSettingsAlerts(): SettingsAlerts {
  const updatePending = useUpdatePending();
  // A newer test version lights the dot too, but only when "Tell me about test versions" is ticked
  // (it is always ticked while you are on a test version).
  const onBeta = useUpdates((s) => isBetaVersion(s.currentVersion));
  const wantsBeta = useSettings((s) => s.testVersionNotices) || onBeta;
  const betaFound = useBetaNotice((s) => Boolean(s.found));
  const needsSignIn = useMail((s) => s.accounts.some((a) => a.status === 'needs-signin'));
  const tabs: Record<string, string> = {};
  if (updatePending) tabs.updates = 'An update is waiting';
  else if (wantsBeta && betaFound) tabs.updates = 'A newer test version is out';
  if (needsSignIn) tabs.accounts = 'An account needs signing in again';
  return { tabs, any: Object.keys(tabs).length > 0 };
}
