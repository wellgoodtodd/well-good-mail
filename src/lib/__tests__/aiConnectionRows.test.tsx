// Beta 7: AI Connection's "What it can do" rows fold out to each account, using the same overrides as the
// account's own AI page; and the calendar and task alerts live in Alerts & Notifications.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AiConnectionTab, differs } from '../../components/AiConnection';
import { NotificationsTab } from '../../components/settings/NotificationsTab';
import { useMail } from '../mail';
import { useSettings } from '../settings';
import { tidy } from '../mcp/permissions';
import type { Account } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const acc = (id: string, label: string, order: number): Account => ({ id, label, order, email: `${id}@example.com`, kind: 'gmail', colour: '#5b8def', status: 'ok', retentionDays: 365, notify: 'all', aliases: [] } as unknown as Account);

let host: HTMLDivElement;
let root: Root;
const render = (el: React.ReactElement) => act(() => { root.render(el); });

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // Listed out of order on purpose: the page should follow `order`.
  useMail.setState({ accounts: [acc('b', 'Personal', 1), acc('a', 'Studio', 0), acc('c', 'Club', 2)] });
  useSettings.setState({ mcp: tidy({ enabled: true, accounts: { a: 'write', b: 'write', c: 'off' }, modes: { 'read.search': 'allow' }, overrides: { b: { 'read.search': 'ask' } } }) });
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('AI Connection switches for each account', () => {
  it('flags accounts set differently and lists every account in the Accounts order when opened', async () => {
    await render(<AiConnectionTab />);
    const flag = [...host.querySelectorAll('.ai-flag')].map((x) => x.textContent);
    expect(flag).toContain('▲ 1 account set differently');
    const fold = host.querySelector('button[aria-label="Set Search your mail for each account"]') as HTMLButtonElement;
    await act(async () => { fold.click(); });
    const rows = [...host.querySelectorAll('.ai-per-row')];
    expect(rows.map((r) => r.querySelector('.grow > span')?.textContent)).toEqual(['Studio', 'Personal', 'Club']);
    expect(rows[1].classList.contains('diff')).toBe(true);
    expect(rows[2].classList.contains('off')).toBe(true);
    expect(rows[2].textContent).toContain('Off under Accounts');
  });

  it('writes the same overrides as the account page, and Reset clears them', async () => {
    await render(<AiConnectionTab />);
    await act(async () => { (host.querySelector('button[aria-label="Set Search your mail for each account"]') as HTMLButtonElement).click(); });
    const studioOff = host.querySelector('[aria-label="Search your mail for Studio"] button') as HTMLButtonElement;
    await act(async () => { studioOff.click(); });
    expect(useSettings.getState().mcp.overrides.a?.['read.search']).toBe('off');
    expect(differs(tidy(useSettings.getState().mcp), 'a', 'read.search')).toBe(true);
    const reset = [...host.querySelectorAll('.ai-per-row')][1].querySelector('.link-btn') as HTMLButtonElement;
    await act(async () => { reset.click(); });
    expect(useSettings.getState().mcp.overrides.b?.['read.search']).toBeUndefined();
  });

  it('picking the same as all accounts keeps no override', async () => {
    await render(<AiConnectionTab />);
    await act(async () => { (host.querySelector('button[aria-label="Set Search your mail for each account"]') as HTMLButtonElement).click(); });
    const studioAllow = host.querySelectorAll('[aria-label="Search your mail for Studio"] button')[2] as HTMLButtonElement;
    await act(async () => { studioAllow.click(); });
    expect(useSettings.getState().mcp.overrides.a?.['read.search']).toBeUndefined();
  });
});

describe('Alerts & Notifications', () => {
  it('holds the calendar and task alerts', async () => {
    await render(<NotificationsTab />);
    expect(host.querySelector('h1')?.textContent).toBe('Alerts & Notifications');
    expect(host.querySelector('#settings-calendar-alerts h2')?.textContent).toBe('Calendar and tasks');
    expect(host.querySelector('#settings-meeting-alerts h2')?.textContent).toBe('Video meetings');
    expect(host.querySelector('#settings-hidden-alerts h2')?.textContent).toBe('Alerts from hidden calendars');
  });
});
