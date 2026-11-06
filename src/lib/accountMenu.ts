// The list shown by every "Add account" button: pick the kind of account to connect.
import type { MenuItem } from '../components/ui';
import { addGoogleAccount, addMicrosoftAccount } from './mail';
import { googleConfigured } from './auth/google';
import { microsoftConfigured } from './auth/microsoft';
import { openGuide } from '../components/SetupGuide';

export function addAccountItems(): MenuItem[] {
  return [
    { heading: 'Add an account' },
    { label: 'Google (Gmail)', icon: 'mail', onClick: () => (googleConfigured() ? addGoogleAccount() : openGuide('setup')) },
    { label: 'Microsoft 365 or Outlook (early)', icon: 'mail', onClick: () => (microsoftConfigured() ? addMicrosoftAccount() : openGuide('microsoft')) },
    { label: 'Other email (IMAP), coming later', icon: 'mail', disabled: true },
  ];
}
