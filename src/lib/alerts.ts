// Things in Settings that want your attention. Each one puts the coral dot on its tab and on the Settings row in the sidebar.
import { useMail } from './mail';
import { useUpdatePending } from './updater';

export interface SettingsAlerts {
  /** Settings tab id -> why it has a dot. */
  tabs: Record<string, string>;
  any: boolean;
}

export function useSettingsAlerts(): SettingsAlerts {
  const updatePending = useUpdatePending();
  const needsSignIn = useMail((s) => s.accounts.some((a) => a.status === 'needs-signin'));
  const tabs: Record<string, string> = {};
  if (updatePending) tabs.updates = 'An update is waiting';
  if (needsSignIn) tabs.accounts = 'An account needs signing in again';
  return { tabs, any: Object.keys(tabs).length > 0 };
}
