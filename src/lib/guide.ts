// Which setup guide is showing. Lives apart from the guide screens so the mail code can open one too.
import { create } from 'zustand';

export type GuideMode = 'setup' | 'publish' | 'microsoft' | 'imap';

interface GuideState {
  mode: GuideMode | null;
  /** For the IMAP guide: the service to start on (such as "icloud"), or the account whose password is being replaced. */
  preset?: string;
  email?: string;
  /** For the Google guide: the step to open on (5 is "Paste your key", for someone moving from another computer). */
  step?: number;
}

export const useGuide = create<GuideState>(() => ({ mode: null }));
export const openGuide = (mode: GuideMode = 'setup', opts: { preset?: string; email?: string; step?: number } = {}) => useGuide.setState({ mode, preset: opts.preset, email: opts.email, step: opts.step });
export const openImapGuide = (email: string) => openGuide('imap', { email });
export const closeGuide = () => useGuide.setState({ mode: null, preset: undefined, email: undefined, step: undefined });
