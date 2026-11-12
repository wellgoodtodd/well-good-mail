import { describe, expect, it, vi } from 'vitest';
import { defaultPlan, type OooPlan } from '../ooo';
import { applyTemplate, copyTemplate, daysWords, findTemplate, nextWeekday, templateFromPlan, templateSummary } from '../oooTemplates';
import { handleRpc, type AskRequest, type McpWorld } from '../mcp/handlers';
import { defaultMcp } from '../mcp/permissions';
import { groupCalendars, inGroupView, visibleEvents } from '../meetings';
import type { Account, CalendarEvent } from '../types';

const NOW = new Date(2026, 10, 10, 12, 0).getTime(); // Tue 10 Nov 2026, midday

/** Friday 13:00 to Monday 09:00, everyone, with its own message. */
const fridays = (): OooPlan => ({
  ...defaultPlan(), accounts: ['a'], mode: 'dates', firstDay: '2026-11-13', backOn: '2026-11-16', useTimes: true, startTime: '13:00', backTime: '09:00',
  audience: 'all', message: { subject: 'Away on Friday afternoons', html: '<p>Back on Monday.</p>' }, addEvent: false, pauseAlerts: true,
});

describe('Out of Office templates', () => {
  it('keeps only the ticked parts, and days as a weekday and a length, never fixed dates', () => {
    const t = templateFromPlan('Friday afternoons', ['message', 'days', 'times', 'audience'], fridays());
    expect(t.message).toEqual({ html: '<p>Back on Monday.</p>' });
    expect(t.days).toEqual({ weekday: 5, length: 3 });
    expect(t.values).toEqual({ useTimes: true, startTime: '13:00', backTime: '09:00', audience: 'all' });
    expect(JSON.stringify(t)).not.toContain('2026-11');
    expect(daysWords(t.days!, t.values)).toBe('From a Friday at 13:00, back 3 days later (Monday at 09:00)');
  });

  it('applies only its parts, filling in the next matching dates', () => {
    const t = templateFromPlan('Friday afternoons', ['message', 'days', 'times'], fridays());
    const before: OooPlan = { ...defaultPlan(), accounts: ['b'], audience: 'contacts', pauseAlerts: false, firstDay: '2026-12-01', backOn: '2026-12-08' };
    const after = applyTemplate(before, t, { now: NOW });
    expect(after.firstDay).toBe('2026-11-13');
    expect(after.backOn).toBe('2026-11-16');
    expect(after.mode).toBe('dates');
    expect(after.startTime).toBe('13:00');
    expect(after.message.html).toBe('<p>Back on Monday.</p>');
    expect(after.message.subject).toBe(before.message.subject);
    // Not ticked, so left alone.
    expect(after.accounts).toEqual(['b']);
    expect(after.audience).toBe('contacts');
    expect(after.pauseAlerts).toBe(false);
  });

  it('puts the message into the account message being edited', () => {
    const t = templateFromPlan('Short', ['message'], fridays());
    const before: OooPlan = { ...defaultPlan(), own: { a: { subject: 'Mine', html: '<p>Old</p>' } } };
    const after = applyTemplate(before, t, { editing: 'a' });
    expect(after.own.a).toEqual({ subject: 'Mine', html: '<p>Back on Monday.</p>' });
    expect(after.message).toEqual(before.message);
  });

  it('finds the next weekday from today, today included', () => {
    expect(nextWeekday(2, NOW)).toBe('2026-11-10');
    expect(nextWeekday(1, NOW)).toBe('2026-11-16');
  });

  it('copies with a free name, and finds templates by name whatever the capitals', () => {
    const t = templateFromPlan('Friday afternoons', ['message'], fridays());
    const c = copyTemplate(t, ['Friday afternoons', 'Friday afternoons copy']);
    expect(c.name).toBe('Friday afternoons copy 2');
    expect(c.id).not.toBe(t.id);
    expect(findTemplate([t, c], ' friday AFTERNOONS ')?.id).toBe(t.id);
    expect(templateSummary(t)).toBe('Message');
  });
});

describe('AI apps turning on a template by name', () => {
  const accounts = [{ id: 'a', email: 'a@gmail.com', label: 'A', kind: 'gmail' }] as unknown as Account[];
  function world() {
    const turnOn = vi.fn(async (plan: { accounts: string[] }) => ({ done: plan.accounts, failed: [] }));
    const ask = vi.fn(async (req: AskRequest) => ({ allowed: req.accounts.map((x) => x.id) }));
    const holiday = templateFromPlan('Holiday', ['subject', 'message', 'audience'], { ...defaultPlan(), audience: 'contacts', message: { subject: 'On holiday', html: '<p>On holiday until [back date].</p>' } });
    const w = {
      settings: { ...defaultMcp(), enabled: true, accounts: { a: 'write' } },
      accounts, folders: {}, draftGroups: [], messages: {}, events: [], followups: [],
      search: () => [], loadBody: async () => undefined, ask, granted: () => false,
      makeDraft: vi.fn(), openDraft: vi.fn(), aiDraft: () => undefined, log: vi.fn(), version: '0.7.3', now: NOW,
      ooo: { plan: { ...defaultPlan(), accounts: [] }, templates: [holiday], status: vi.fn(async () => ({})), turnOn, turnOff: vi.fn() },
    } as unknown as McpWorld;
    return { w, ask, turnOn };
  }
  const call = (args: Record<string, unknown>) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'set_out_of_office', arguments: args } });

  it('uses the template, with the dates given, and still asks with the whole reply', async () => {
    const { w, ask, turnOn } = world();
    await handleRpc(w, call({ accounts: ['a'], template: 'holiday', from: '2026-12-21', back: '2027-01-04' }));
    expect(ask.mock.calls[0][0].ooo?.text).toBe('On holiday until Monday 4 January.');
    expect(ask.mock.calls[0][0].canRemember).toBe(false);
    expect(turnOn).toHaveBeenCalledWith(expect.objectContaining({ audience: 'contacts', firstDay: '2026-12-21', backOn: '2027-01-04', mode: 'dates' }));
  });

  it('says which templates there are when the name is wrong', async () => {
    const { w, turnOn } = world();
    const r = JSON.stringify(await handleRpc(w, call({ accounts: ['a'], template: 'Conference' })));
    expect(r).toContain('Holiday');
    expect(turnOn).not.toHaveBeenCalled();
  });
});

describe('Calendar Groups', () => {
  const ev = (accountId: string, calendarName: string): CalendarEvent => ({ id: `${accountId}|${calendarName}`, accountId, calendarName, title: calendarName, start: 0, end: 1, allDay: false, reminderMinutes: [] });
  const events = [ev('a', 'Work'), ev('a', 'Family'), ev('b', 'Studio')];
  const s = { calendarGroups: [{ id: 'w', name: 'Work', calendars: ['a|Work', 'b|Studio'] }], calendarGroup: 'w' };

  it('shows only the group, even calendars hidden under All calendars', () => {
    const only = groupCalendars(s);
    expect(visibleEvents(events, ['b|Studio'], only).map((e) => e.calendarName)).toEqual(['Work', 'Studio']);
    expect(inGroupView(events, s).length).toBe(2);
  });

  it('falls back to All calendars when the group has gone', () => {
    expect(groupCalendars({ ...s, calendarGroup: 'gone' })).toBeNull();
    expect(visibleEvents(events, ['a|Family'], groupCalendars({ ...s, calendarGroup: '' })).map((e) => e.calendarName)).toEqual(['Work', 'Studio']);
  });

  function world(level: 'allow' | 'ask' | 'off') {
    const save = vi.fn();
    const ask = vi.fn(async (req: AskRequest) => ({ allowed: req.accounts.length ? req.accounts.map((x) => x.id) : ['*'] }));
    const w = {
      settings: { ...defaultMcp(), enabled: true, accounts: { a: 'read', b: 'off' }, modes: { ...defaultMcp().modes, 'calendar.groups': level } },
      accounts: [{ id: 'a', email: 'a@x.com', label: 'A' }, { id: 'b', email: 'b@x.com', label: 'B' }], folders: {}, draftGroups: [], messages: {}, events: [], followups: [],
      search: () => [], loadBody: async () => undefined, ask, granted: () => false,
      makeDraft: vi.fn(), openDraft: vi.fn(), aiDraft: () => undefined, log: vi.fn(), version: '0.7.3', now: NOW,
      calendarGroups: { list: [{ id: 'w', name: 'Work', calendars: ['a|Work', 'b|Studio'] }], current: '', calendars: { a: ['Family', 'Work'], b: ['Studio'] }, save },
    } as unknown as McpWorld;
    return { w, save, ask };
  }
  const call = (name: string, args: Record<string, unknown>) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });

  it('lists groups with only the calendars of shared accounts', async () => {
    const { w } = world('allow');
    const r = JSON.stringify(await handleRpc(w, call('get_calendar_groups', {})));
    expect(r).toContain('Family');
    expect(r).not.toContain('Studio');
  });

  it('changes a group, keeping calendars from accounts the AI cannot see', async () => {
    const { w, save, ask } = world('ask');
    await handleRpc(w, call('set_calendar_group', { name: 'work', calendars: [{ account: 'a', calendar: 'Family' }, { account: 'a', calendar: 'Work' }] }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([{ id: 'w', name: 'Work', calendars: ['a|Family', 'a|Work', 'b|Studio'] }]);
  });

  it('is off until switched on', async () => {
    const { w, save } = world('off');
    await handleRpc(w, call('set_calendar_group', { name: 'Personal', calendars: [{ account: 'a', calendar: 'Family' }] }));
    expect(save).not.toHaveBeenCalled();
  });
});
