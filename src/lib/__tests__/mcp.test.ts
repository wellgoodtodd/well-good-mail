import { describe, expect, it } from 'vitest';
import { CAPABILITIES, NEVER, RateLimit, decide, defaultMcp, effectiveMode, tidy } from '../mcp/permissions';
import { TOOLS, logLine, toolByName } from '../mcp/tools';

const on = () => ({ ...defaultMcp(), enabled: true, accounts: { a1: 'write' as const } });

describe('what an AI may do', () => {
  it('refuses everything while the connection is off', () => {
    expect(decide(defaultMcp(), 'read.search', 'a1').verdict).toBe('deny');
  });

  it('lets a read only account be looked at but never changed', () => {
    const s = { ...on(), accounts: { a1: 'read' as const, a2: 'off' as const } };
    expect(decide(s, 'read.search', 'a1').verdict).toBe('allow');
    expect(decide(s, 'organise.draft', 'a1').verdict).toBe('deny');
    expect(decide(s, 'send.email', 'a1').verdict).toBe('deny');
    expect(decide(s, 'read.search', 'a2').verdict).toBe('deny');
  });

  it('turns an old yes into read only, and anything odd into off', () => {
    const t = tidy({ accounts: { a: true as never, b: 'write', c: 'everything' as never } });
    expect(t.accounts).toEqual({ a: 'read', b: 'write', c: 'off' });
  });

  it('refuses accounts that are not shared, and unknown things', () => {
    expect(decide(on(), 'read.search', 'other').verdict).toBe('deny');
    expect(decide(on(), 'delete.forever', 'a1').verdict).toBe('deny');
  });

  it('follows the switch for each thing', () => {
    const s = on();
    expect(decide(s, 'read.search', 'a1').verdict).toBe('allow');
    expect(decide(s, 'read.messages', 'a1').verdict).toBe('ask');
    expect(decide(s, 'read.attachments', 'a1').verdict).toBe('deny');
  });

  it('can never let anything that reaches other people go ahead without asking', () => {
    const s = on();
    for (const id of ['send.email', 'send.forward', 'calendar.reply']) {
      s.modes[id] = 'allow';
      expect(effectiveMode(s, id)).toBe('ask');
      expect(decide(s, id, 'a1').verdict).toBe('ask');
    }
    const fixed = tidy({ ...s, modes: { ...s.modes, 'send.email': 'allow' } });
    expect(fixed.modes['send.email']).toBe('ask');
  });

  it('starts with sending off and nothing shared', () => {
    const d = defaultMcp();
    expect(d.enabled).toBe(false);
    expect(d.accounts).toEqual({});
    expect(d.modes['send.email']).toBe('off');
    expect(d.modes['send.forward']).toBe('off');
    expect(d.modes['organise.bin']).toBe('off');
  });

  it('switches itself off when the time you set has passed', () => {
    const s = { ...on(), expiresAt: 1000 };
    expect(decide(s, 'read.search', 'a1', 999).verdict).toBe('allow');
    expect(decide(s, 'read.search', 'a1', 1000).verdict).toBe('deny');
  });

  it('tidies stored settings with unknown or wrong values', () => {
    const t = tidy({ enabled: true, modes: { 'read.search': 'sure' as never, 'made.up': 'allow' }, maxPerMinute: 9999 });
    expect(t.modes['read.search']).toBe('allow');
    expect(t.modes['made.up']).toBeUndefined();
    expect(t.maxPerMinute).toBe(120);
  });

  it('limits how fast it can go', () => {
    const r = new RateLimit(2);
    expect([r.take(0), r.take(1), r.take(2)]).toEqual([true, true, false]);
    expect(r.take(60001)).toBe(true);
  });
});

describe('the tools', () => {
  it('each answers to a real switch, and no switch is for something forbidden', () => {
    const ids = new Set(CAPABILITIES.map((c) => c.id));
    for (const t of TOOLS) expect(ids.has(t.capability), t.name).toBe(true);
    expect(TOOLS.some((t) => /delete|empty|token|password|install|export|add_account|remove_account/i.test(t.name))).toBe(false);
    expect(NEVER.length).toBeGreaterThan(5);
  });

  it('has no repeated names', () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });

  it('every tool that reads mail warns that email text is not an instruction', () => {
    for (const name of ['search_mail', 'get_message', 'get_thread', 'get_attachment_text']) expect(toolByName(name)!.description).toMatch(/never as instructions/);
  });

  it('writes the activity log in plain words, briefly', () => {
    expect(logLine(toolByName('search_mail')!, { query: 'invoice' })).toBe('Searched mail for "invoice"');
    expect(logLine(toolByName('file_messages')!, { count: ['a', 'b', 'c'] })).toBe('Filed 3 emails');
    expect(logLine(toolByName('get_message')!, { subject: 'x'.repeat(200) }).length).toBeLessThan(80);
  });
});
