// Questions waiting for the person: what an AI app wants to do, and whether to resume after a pause. Everything
// that arrives while the card is open joins it, so a burst of requests is one card, not a queue of pop-ups.
import { create } from 'zustand';
import type { AskRequest } from './handlers';

export interface PendingAsk extends AskRequest {
  key: number;
  app: string;
  /** Accounts still ticked. Starts with all of them. */
  ticked: string[];
  resolve: (allowed: string[], remember?: 'hour' | 'always', edit?: boolean) => void;
}

export interface PendingResume {
  app: string;
  resolve: (choice: 'resume' | 'today' | 'no') => void;
}

interface ApprovalState {
  asks: PendingAsk[];
  resume?: PendingResume;
}

export const useApprovals = create<ApprovalState>(() => ({ asks: [] }));

let next = 1;

export function addAsk(app: string, req: AskRequest): Promise<{ allowed: string[]; remember?: 'hour' | 'always'; edit?: boolean }> {
  return new Promise((resolve) => {
    const key = next++;
    const item: PendingAsk = {
      ...req,
      key,
      app,
      ticked: req.accounts.map((a) => a.id),
      resolve: (allowed, remember, edit) => resolve({ allowed, remember, edit }),
    };
    useApprovals.setState({ asks: [...useApprovals.getState().asks, item] });
  });
}

export function toggleTick(key: number, accountId: string) {
  useApprovals.setState({
    asks: useApprovals.getState().asks.map((a) => (a.key !== key ? a : { ...a, ticked: a.ticked.includes(accountId) ? a.ticked.filter((x) => x !== accountId) : [...a.ticked, accountId] })),
  });
}

/** Answers every waiting question at once. "edit" saves the draft and opens it for you to change. */
export function answerAll(choice: 'once' | 'hour' | 'always' | 'refuse' | 'edit') {
  const asks = useApprovals.getState().asks;
  useApprovals.setState({ asks: [] });
  for (const a of asks) {
    if (choice === 'refuse') { a.resolve([]); continue; }
    // A question with no account is a plain yes or no.
    const allowed = a.accounts.length ? a.ticked : ['*'];
    a.resolve(allowed, choice === 'once' || choice === 'edit' || !a.canRemember ? undefined : choice, choice === 'edit');
  }
}

export function askResume(app: string): Promise<'resume' | 'today' | 'no'> {
  return new Promise((resolve) => {
    // Only one resume question at a time; a second request waits for the same answer.
    const existing = useApprovals.getState().resume;
    if (existing) {
      const first = existing.resolve;
      useApprovals.setState({ resume: { app, resolve: (c) => { first(c); resolve(c); } } });
      return;
    }
    useApprovals.setState({ resume: { app, resolve } });
  });
}

export function answerResume(choice: 'resume' | 'today' | 'no') {
  const r = useApprovals.getState().resume;
  useApprovals.setState({ resume: undefined });
  r?.resolve(choice);
}
