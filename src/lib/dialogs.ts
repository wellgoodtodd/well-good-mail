// In-app confirm and text prompts (the system dialogs are plain, and some
// web views block them entirely).
import { create } from 'zustand';

interface Pending {
  kind: 'confirm' | 'text' | 'keep' | 'choice';
  /** For a choice: the buttons, left to right; the last is the main one unless one says primary. */
  choices?: Choice[];
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  value?: string;
  /** Shows a "Don't warn me again" box; called if ticked when confirming. */
  onOptOut?: () => void;
  /** The tick box wording (default "Don't warn me about this again"). */
  optOutLabel?: string;
  resolve: (v: string | boolean | null) => void;
}

export interface Choice { id: string; label: string; primary?: boolean; danger?: boolean }

export const useDialogs = create<{ pending: Pending | null }>(() => ({ pending: null }));

export function askConfirm(title: string, message?: string, confirmLabel = 'OK', opts: { onOptOut?: () => void; optOutLabel?: string; cancelLabel?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogs.setState({ pending: { kind: 'confirm', title, message, confirmLabel, cancelLabel: opts.cancelLabel, onOptOut: opts.onOptOut, optOutLabel: opts.optOutLabel, resolve: (v) => resolve(Boolean(v)) } });
  });
}

/** Closing an email that is not sent: keep it as a draft, throw it away, or stay. `remember` is the ticked box. */
export function askKeepDraft(): Promise<{ choice: 'save' | 'discard' | 'cancel'; remember: boolean }> {
  return new Promise((resolve) => {
    useDialogs.setState({
      pending: {
        kind: 'keep', title: 'Keep this email as a draft?', message: 'It has not been sent.', confirmLabel: 'Save draft',
        resolve: (v) => {
          const [choice, remember] = String(v || 'cancel').split('+');
          resolve({ choice: (choice === 'save' || choice === 'discard' ? choice : 'cancel') as 'save' | 'discard' | 'cancel', remember: remember === 'remember' });
        },
      },
    });
  });
}

/** A question with several answers (besides Cancel). Resolves to the id picked, or null for Cancel. */
export function askChoice(title: string, message: string | undefined, choices: Choice[], cancelLabel = 'Cancel'): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogs.setState({ pending: { kind: 'choice', title, message, confirmLabel: '', cancelLabel, choices, resolve: (v) => resolve(typeof v === 'string' ? v : null) } });
  });
}

export function askText(title: string, value = '', confirmLabel = 'OK'): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogs.setState({ pending: { kind: 'text', title, value, confirmLabel, resolve: (v) => resolve(typeof v === 'string' ? v : null) } });
  });
}

export function closeDialog(result: string | boolean | null) {
  const p = useDialogs.getState().pending;
  useDialogs.setState({ pending: null });
  p?.resolve(result);
}
