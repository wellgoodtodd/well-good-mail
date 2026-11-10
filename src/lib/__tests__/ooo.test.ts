import { describe, expect, it, vi } from 'vitest';
import { BACK_TOKEN, dayStart, defaultPlan, fillBackDate, oooSupport, planProblem, stateWords, windowOf, whenSentence, htmlToText, textToHtml } from '../ooo';
import { handleRpc, type AskRequest, type McpWorld } from '../mcp/handlers';
import { defaultMcp } from '../mcp/permissions';
import type { Account } from '../types';

const NOW = new Date(2026, 10, 10, 12, 0).getTime(); // Tue 10 Nov 2026, midday

describe('Out of Office dates', () => {
  it('treats dates as whole days: away from midnight on the first day, back at midnight on the back-on day', () => {
    const p = { ...defaultPlan(), accounts: ['a'], mode: 'dates' as const, firstDay: '2026-11-16', backOn: '2026-11-23' };
    const w = windowOf(p, NOW);
    expect(w.start).toBe(dayStart('2026-11-16'));
    expect(w.end).toBe(dayStart('2026-11-23'));
    expect(whenSentence(p, NOW)).toContain('stop at the end of Sun 22 Nov');
    expect(whenSentence(p, NOW)).toContain('back on Mon 23 Nov');
  });
  it('starts straight away when the first day is today or earlier', () => {
    const p = { ...defaultPlan(), accounts: ['a'], mode: 'dates' as const, firstDay: '2026-11-10', backOn: '2026-11-12' };
    expect(windowOf(p, NOW).start).toBeUndefined();
    expect(whenSentence(p, NOW)).toMatch(/^Replies start as soon as you turn it on/);
  });
  it('uses times for part days', () => {
    const p = { ...defaultPlan(), accounts: ['a'], mode: 'dates' as const, firstDay: '2026-11-16', backOn: '2026-11-17', useTimes: true, startTime: '13:00', backTime: '09:30' };
    expect(windowOf(p, NOW).start).toBe(dayStart('2026-11-16', '13:00'));
    expect(windowOf(p, NOW).end).toBe(dayStart('2026-11-17', '09:30'));
  });
  it('explains what is wrong with the dates', () => {
    const p = { ...defaultPlan(), mode: 'dates' as const, firstDay: '2026-11-16', backOn: '2026-11-16' };
    expect(planProblem(p, NOW)).toBe('Tick at least one account.');
    expect(planProblem({ ...p, accounts: ['a'] }, NOW)).toMatch(/after your first day away/);
    expect(planProblem({ ...p, accounts: ['a'], backOn: '2026-11-20' }, NOW)).toBeUndefined();
    expect(planProblem({ ...p, accounts: ['a'], mode: 'open' }, NOW)).toBeUndefined();
  });
  it('fills in the back date', () => {
    const end = dayStart('2026-11-23');
    expect(fillBackDate(`Back on ${BACK_TOKEN}.`, end)).toBe('Back on Monday 23 November.');
    expect(fillBackDate(`Back ${BACK_TOKEN}.`)).toBe('Back soon.');
  });
  it('words the state of an account', () => {
    expect(stateWords(undefined, NOW).state).toBe('off');
    expect(stateWords({ on: true, html: '', audience: 'all' }, NOW).words).toBe('On');
    expect(stateWords({ on: true, html: '', audience: 'all', start: NOW + 86400000 }, NOW).state).toBe('scheduled');
    expect(stateWords({ on: true, html: '', audience: 'all', end: NOW - 1 }, NOW).state).toBe('off');
  });
  it('knows what each kind of account can do', () => {
    expect(oooSupport({ kind: 'gmail', email: 'me@gmail.com' } as Account)).toMatchObject({ native: true, org: false, decline: false });
    expect(oooSupport({ kind: 'gmail', email: 'me@wellgood.media' } as Account)).toMatchObject({ native: true, org: true, decline: true });
    expect(oooSupport({ kind: 'microsoft', email: 'me@outlook.com' } as Account)).toMatchObject({ native: true, outside: true, decline: false });
    expect(oooSupport({ kind: 'imap', email: 'me@icloud.com' } as Account).native).toBe(false);
    expect(oooSupport({ kind: 'imap', email: 'me@icloud.com' } as Account).webUrl).toContain('icloud.com');
  });
  it('turns text into paragraphs and back', () => {
    expect(textToHtml('Hello <you>\n\nBack soon')).toBe('<p>Hello &lt;you&gt;</p><p>Back soon</p>');
    expect(htmlToText('<p>Hi</p><p>Back&nbsp;soon</p>')).toBe('Hi\nBack soon');
  });
});

describe('AI apps setting Out of Office', () => {
  const accounts = [{ id: 'a', email: 'a@gmail.com', label: 'A', kind: 'gmail' }, { id: 'b', email: 'b@icloud.com', label: 'B', kind: 'imap' }] as unknown as Account[];
  function world(level: 'read' | 'write', answer = true) {
    const turnOn = vi.fn(async (plan: { accounts: string[] }) => ({ done: plan.accounts, failed: [] }));
    const ask = vi.fn(async (req: AskRequest) => ({ allowed: answer ? req.accounts.map((x) => x.id) : [] }));
    const w = {
      settings: { ...defaultMcp(), enabled: true, accounts: { a: level, b: level } },
      accounts, folders: {}, draftGroups: [], messages: {}, events: [], followups: [],
      search: () => [], loadBody: async () => undefined, ask, granted: () => false,
      makeDraft: vi.fn(), openDraft: vi.fn(), aiDraft: () => undefined, log: vi.fn(), version: '0.7.2', now: NOW,
      ooo: { plan: { ...defaultPlan(), accounts: [] }, status: vi.fn(async () => ({})), turnOn, turnOff: vi.fn(async (ids: string[]) => ({ done: ids, failed: [] })) },
    } as unknown as McpWorld;
    return { w, ask, turnOn };
  }
  const call = (args: Record<string, unknown>) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'set_out_of_office', arguments: args } });

  it('always asks, with the whole reply on the card, and leaves out accounts it cannot set', async () => {
    const { w, ask, turnOn } = world('write');
    const r = JSON.stringify(await handleRpc(w, call({ accounts: ['all'], from: '2026-11-16', back: '2026-11-23', message: 'Away until [back date].' })));
    expect(ask).toHaveBeenCalledTimes(1);
    const req = ask.mock.calls[0][0];
    expect(req.canRemember).toBe(false);
    expect(req.ooo?.text).toBe('Away until Monday 23 November.');
    expect(req.accounts.map((x) => x.id)).toEqual(['a']);
    expect(turnOn).toHaveBeenCalledWith(expect.objectContaining({ accounts: ['a'], mode: 'dates', firstDay: '2026-11-16', backOn: '2026-11-23' }));
    expect(r).toContain('web mail');
  });
  it('does nothing when the person says no', async () => {
    const { w, turnOn } = world('write', false);
    const r = JSON.stringify(await handleRpc(w, call({ accounts: ['a'] })));
    expect(turnOn).not.toHaveBeenCalled();
    expect(r).toContain('said no');
  });
  it('refuses accounts that are Read only', async () => {
    const { w, ask } = world('read');
    const r = JSON.stringify(await handleRpc(w, call({ accounts: ['a'] })));
    expect(ask).not.toHaveBeenCalled();
    expect(r).toContain('Read only');
  });
});
