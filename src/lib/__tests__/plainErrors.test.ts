import { describe, expect, it, vi } from 'vitest';
import { calendarFailureText, calendarFailureToast, plainError, splitFailure } from '../plainErrors';
import { graphRetryWait } from '../providers/microsoft';
import { templateFor, withTemplatePicked } from '../oooTemplates';
import { defaultPlan } from '../ooo';

const graph502 = 'Microsoft 502: {"error":{"code":"UnknownError","message":"","innerError":{"date":"2026-11-12T10:00:00"}}}';

describe('plain words for provider errors', () => {
  it('turns a Graph 502 UnknownError into "Outlook didn\'t answer."', () => {
    expect(plainError(new Error(graph502))).toEqual({ text: "Outlook didn't answer.", permission: false, retry: true });
  });
  it('names Google for Gmail errors and uses the account type when the words do not say', () => {
    expect(plainError('Gmail 503: backendError').text).toBe("Google didn't answer.");
    expect(plainError(Object.assign(new Error('{"error":"boom"}'), { status: 500 }), 'gmail').text).toBe("Google didn't answer.");
  });
  it('spots permission problems so the page can offer Sign in', () => {
    expect(plainError('Microsoft 403: {"error":{"code":"ErrorAccessDenied","message":"Access is denied."}}').permission).toBe(true);
    expect(plainError(Object.assign(new Error('x'), { status: 401 }), 'microsoft')).toMatchObject({ permission: true, retry: false });
    expect(plainError(Object.assign(new Error('needs'), { needsPermission: true })).permission).toBe(true);
    expect(plainError(new Error('Please sign in to a@b.com again.'), 'gmail')).toMatchObject({ text: 'Google needs you to sign in again.', permission: true });
  });
  it('does not take a quota 403 for a permission problem', () => {
    expect(plainError('Gmail 403: rateLimitExceeded quota').permission).toBe(false);
  });
  it('says busy for 429 and connection words for network failures', () => {
    expect(plainError('Microsoft 429: {"error":{"code":"TooManyRequests"}}').text).toBe('Outlook is busy right now.');
    expect(plainError(new TypeError('Failed to fetch'), 'microsoft').text).toBe("Couldn't connect to Outlook. Check the internet connection.");
  });
  it('keeps a message that is already plain, and never shows raw JSON', () => {
    expect(plainError(new Error("Outlook didn't answer.")).text).toBe("Outlook didn't answer.");
    expect(plainError(new Error('This calendar is read only')).text).toBe('This calendar is read only.');
    expect(plainError(new Error('{"weird":{"x":1}}'), 'microsoft').text).toBe('Outlook had a problem.');
  });
});

describe('the calendar refresh toast', () => {
  const accounts = [
    { id: 'm', label: 'WGM Microsoft', email: 'm@x.com', kind: 'microsoft' as const },
    { id: 'g', email: 'g@x.com', kind: 'gmail' as const },
  ];
  it('splits "Name (raw)" from refreshEvents', () => {
    expect(splitFailure('WGM Microsoft (Microsoft 502: {"error":{"code":"UnknownError"})')).toEqual({ name: 'WGM Microsoft', raw: 'Microsoft 502: {"error":{"code":"UnknownError"}' });
    expect(splitFailure('Plain name')).toEqual({ name: 'Plain name', raw: '' });
  });
  it('reads plainly for one account', () => {
    expect(calendarFailureText([`WGM Microsoft (${graph502.slice(0, 90)})`], accounts).text).toBe("Outlook didn't answer for WGM Microsoft. Try again in a moment.");
  });
  it('joins accounts with the same problem', () => {
    expect(calendarFailureText(['WGM Microsoft (Microsoft 503: x)', 'g@x.com (Microsoft 503: y)'], accounts).text).toContain('for WGM Microsoft and g@x.com');
  });
  it('offers Try again, and Sign in for a permission problem', () => {
    const again = vi.fn();
    const signIn = vi.fn();
    const t = calendarFailureToast(['g@x.com (Gmail 401: invalid credentials)'], accounts, again, signIn);
    expect(t.actions.map((a) => a.label)).toEqual(['Sign in', 'Try again']);
    t.actions[0].run();
    expect(signIn).toHaveBeenCalledWith('g');
    expect(calendarFailureToast([`WGM Microsoft (${graph502})`], accounts, again, signIn).actions.map((a) => a.label)).toEqual(['Try again']);
  });
});

describe('Microsoft Graph quiet retry', () => {
  it('waits briefly on 502, 503 and 504 for reads and changes', () => {
    expect(graphRetryWait(502, '{"error":{"code":"UnknownError"}}', 'GET')).toBe(800);
    expect(graphRetryWait(504, '', 'PATCH')).toBe(800);
    expect(graphRetryWait(503, '', 'POST')).toBe(800);
  });
  it('does not send a POST twice after a 502', () => {
    expect(graphRetryWait(502, '', 'POST')).toBeUndefined();
  });
  it('honours Retry-After on 429, within reason', () => {
    expect(graphRetryWait(429, '', 'GET', '3')).toBe(3000);
    expect(graphRetryWait(429, '', 'GET', '120')).toBe(20000);
    expect(graphRetryWait(429, '', 'POST', null)).toBe(2000);
  });
  it('gives up straight away on other errors', () => {
    expect(graphRetryWait(404, '', 'GET')).toBeUndefined();
    expect(graphRetryWait(400, '{"error":{"code":"UnknownError"}}', 'GET')).toBeUndefined();
  });
});

describe('Out of Office template picker per account tab', () => {
  it('keeps the template picked on each tab', () => {
    let p = { ...defaultPlan(), accounts: ['a', 'b'] };
    p = withTemplatePicked(p, 'holiday', 'a');
    p = withTemplatePicked(p, 'conference', 'b');
    expect(templateFor(p, 'a')?.id).toBe('holiday');
    expect(templateFor(p, 'b')?.id).toBe('conference');
    expect(p.lastTemplate).toEqual({ id: 'conference', editing: 'b' });
  });
  it('shows the shared message\'s template on a tab nobody has picked for', () => {
    const p = withTemplatePicked({ ...defaultPlan(), accounts: ['a'] }, 'away');
    expect(templateFor(p)?.id).toBe('away');
    expect(templateFor(p, 'a')).toEqual({ id: 'away', editing: 'a' });
  });
});
