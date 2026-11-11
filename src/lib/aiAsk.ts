// The question about AI Connection after an account is added: which accounts are waiting to be asked.
import { create } from 'zustand';
import { useSettings } from './settings';
import { tidy } from './mcp/permissions';

export const useAiAsk = create<{ queue: { id: string; at: number }[] }>(() => ({ queue: [] }));

/** Asks about AI Connection for a new account, once it has finished its first sync. Only while AI Connection is on and nothing is chosen yet. */
export function askAiForNewAccount(accountId: string) {
  const mcp = tidy(useSettings.getState().mcp);
  if (!mcp.enabled || accountId in mcp.accounts) return;
  useAiAsk.setState((s) => (s.queue.some((q) => q.id === accountId) ? s : { queue: [...s.queue, { id: accountId, at: Date.now() }] }));
}
