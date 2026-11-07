// The list shown by every "Add account" button: pick the kind of account to connect.
import type { MenuItem } from '../components/ui';
import { addGoogleAccount, addMicrosoftAccount } from './mail';
import { googleConfigured } from './auth/google';
import { microsoftConfigured } from './auth/microsoft';
import { openGuide } from './guide';

export function addAccountItems(): MenuItem[] {
  return [
    { heading: 'Add an account' },
    { label: 'Google (Gmail)', brand: 'google', onClick: () => (googleConfigured() ? addGoogleAccount() : openGuide('setup')) },
    { label: 'Microsoft 365 or Outlook (early)', brand: 'microsoft', onClick: () => (microsoftConfigured() ? addMicrosoftAccount() : openGuide('microsoft')) },
    { label: 'iCloud Mail (early)', brand: 'icloud', onClick: () => openGuide('imap', { preset: 'icloud' }) },
    { label: 'Yahoo, Fastmail or other email (early)', brand: 'mail', onClick: () => openGuide('imap') },
  ];
}
