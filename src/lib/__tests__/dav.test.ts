import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { url: string; method: string; depth?: string; user: string }[] = [];
const answers = new Map<string, { status: number; location?: string; body: string }>();

vi.mock('../platform', () => ({
  invoke: async (_cmd: string, args: { req: { url: string; method: string; depth?: string; user: string; body?: string } }) => {
    const { url, method, depth, user, body } = args.req;
    calls.push({ url, method, depth, user });
    const key = `${method} ${url}${method === 'REPORT' ? '' : ''}`;
    const hit = answers.get(key);
    if (!hit) throw new Error(`no answer for ${key} ${body?.slice(0, 40)}`);
    return { status: hit.status, location: hit.location ?? null, body: hit.body };
  },
}));

const { fetchContacts, fetchEvents, parseEvents, parseVCards, triggerMinutes, readItems, DavAuthError, forgetDavPlaces, DAV_PLACES_FOR } = await import('../dav');

const multi = (inner: string) => `<?xml version="1.0"?><multistatus xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cal="urn:ietf:params:xml:ns:caldav">${inner}</multistatus>`;
const ok = (href: string, prop: string) => `<response><href>${href}</href><propstat><prop>${prop}</prop><status>HTTP/1.1 200 OK</status></propstat></response>`;

describe('vCards', () => {
  it('reads names and every address', () => {
    const text = [
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Smith;Jane;;;', 'FN:Jane Smith', 'EMAIL;type=INTERNET;type=HOME;type=pref:Jane@Example.com', 'item1.EMAIL;type=INTERNET:jane.work@corp.example', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Doe;John;;;', 'EMAIL:john@example.com', 'END:VCARD',
      'BEGIN:VCARD', 'FN:No Email', 'TEL:123', 'END:VCARD',
    ].join('\r\n');
    expect(parseVCards(text)).toEqual([
      { name: 'Jane Smith', email: 'jane@example.com' },
      { name: 'Jane Smith', email: 'jane.work@corp.example' },
      { name: 'John Doe', email: 'john@example.com' },
    ]);
  });
  it('joins folded lines and unescapes', () => {
    expect(parseVCards('BEGIN:VCARD\r\nFN:Smith\\, Jane\r\nEMAIL:long.address\r\n @example.com\r\nEND:VCARD')).toEqual([{ name: 'Smith, Jane', email: 'long.address@example.com' }]);
  });
});

describe('reminders', () => {
  it('reads how long before the start', () => {
    expect(triggerMinutes('-PT15M')).toBe(15);
    expect(triggerMinutes('-PT1H30M')).toBe(90);
    expect(triggerMinutes('-P1D')).toBe(1440);
    expect(triggerMinutes('PT0S')).toBe(0);
    expect(triggerMinutes('PT5M')).toBeUndefined();
    expect(triggerMinutes('nonsense')).toBeUndefined();
  });
});

describe('events', () => {
  const ics = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;
  it('reads a timed event with a reminder', () => {
    const [e] = parseEvents(ics('BEGIN:VEVENT\r\nUID:abc\r\nSUMMARY:Lunch\\, with Sam\r\nLOCATION:Cafe\r\nDTSTART:20261110T120000Z\r\nDTEND:20261110T130000Z\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nACTION:DISPLAY\r\nEND:VALARM\r\nEND:VEVENT'), 'Home', 'imap-me');
    expect(e).toMatchObject({ title: 'Lunch, with Sam', location: 'Cafe', start: Date.UTC(2026, 10, 10, 12), end: Date.UTC(2026, 10, 10, 13), allDay: false, reminderMinutes: [15], calendarName: 'Home', accountId: 'imap-me' });
    expect(e.id).toBe(`imap-me|abc|${Date.UTC(2026, 10, 10, 12)}`);
  });
  it('reads an all day event with no end', () => {
    const [e] = parseEvents(ics('BEGIN:VEVENT\r\nUID:d\r\nSUMMARY:Birthday\r\nDTSTART;VALUE=DATE:20261112\r\nEND:VEVENT'), 'Home', 'a');
    expect(e.allDay).toBe(true);
    expect(e.start).toBe(new Date(2026, 10, 12).getTime());
    expect(e.end - e.start).toBe(86400000);
  });
  it('turns a named time zone into the right moment', () => {
    // London is on GMT in November and BST in July.
    const [winter] = parseEvents(ics('BEGIN:VEVENT\r\nUID:w\r\nSUMMARY:W\r\nDTSTART;TZID=Europe/London:20261110T090000\r\nEND:VEVENT'), 'c', 'a');
    const [summer] = parseEvents(ics('BEGIN:VEVENT\r\nUID:s\r\nSUMMARY:S\r\nDTSTART;TZID=Europe/London:20260710T090000\r\nEND:VEVENT'), 'c', 'a');
    expect(winter.start).toBe(Date.UTC(2026, 10, 10, 9));
    expect(summer.start).toBe(Date.UTC(2026, 6, 10, 8));
  });
  it('skips cancelled events and keeps several in one file', () => {
    const events = parseEvents(ics('BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:One\r\nDTSTART:20261110T100000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:2\r\nSUMMARY:Two\r\nSTATUS:CANCELLED\r\nDTSTART:20261110T110000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:3\r\nSUMMARY:Three\r\nDTSTART:20261110T120000Z\r\nDURATION:PT45M\r\nEND:VEVENT'), 'c', 'a');
    expect(events.map((e) => e.title)).toEqual(['One', 'Three']);
    expect(events[1].end - events[1].start).toBe(45 * 60000);
  });
});

describe('XML answers', () => {
  it('finds properties whatever prefix the server uses', () => {
    const items = readItems(multi(ok('/a/', '<displayname>Home</displayname>') + '<response><href>/b/</href><propstat><prop><displayname/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response>'));
    expect(items.map((i) => i.href)).toEqual(['/a/', '/b/']);
    expect(items[0].props).toHaveLength(1);
    expect(items[1].props).toHaveLength(0);
  });
});

describe('finding contacts and calendars at iCloud', () => {
  beforeEach(async () => { calls.length = 0; answers.clear(); await forgetDavPlaces(); });
  const auth = { user: 'me@icloud.com', pass: 'abcd-efgh' };

  it('follows the redirects and reads the address book', async () => {
    answers.set('PROPFIND https://contacts.icloud.com/', { status: 207, body: multi(ok('/', '<current-user-principal><href>/123/principal/</href></current-user-principal>')) });
    answers.set('PROPFIND https://contacts.icloud.com/123/principal/', { status: 301, location: 'https://p01-contacts.icloud.com/123/principal/', body: '' });
    answers.set('PROPFIND https://p01-contacts.icloud.com/123/principal/', { status: 207, body: multi(ok('/123/principal/', '<card:addressbook-home-set><href>https://p01-contacts.icloud.com:443/123/carddavhome/</href></card:addressbook-home-set>')) });
    answers.set('PROPFIND https://p01-contacts.icloud.com/123/carddavhome/', { status: 207, body: multi(ok('/123/carddavhome/', '<resourcetype><collection/></resourcetype>') + ok('/123/carddavhome/card/', '<resourcetype><collection/><card:addressbook/></resourcetype><displayname>Card</displayname>')) });
    answers.set('REPORT https://p01-contacts.icloud.com/123/carddavhome/card/', { status: 207, body: multi(ok('/123/carddavhome/card/a.vcf', '<card:address-data>BEGIN:VCARD\nFN:Ann Lee\nEMAIL:ann@example.com\nEND:VCARD</card:address-data>')) });
    const out = await fetchContacts(auth);
    expect(out).toEqual([{ name: 'Ann Lee', email: 'ann@example.com' }]);
    expect(calls.every((c) => c.user === 'me@icloud.com')).toBe(true);
  });

  it('reads events from calendars and ignores a reminders list', async () => {
    answers.set('PROPFIND https://caldav.icloud.com/', { status: 207, body: multi(ok('/', '<current-user-principal><href>/123/principal/</href></current-user-principal>')) });
    answers.set('PROPFIND https://caldav.icloud.com/123/principal/', { status: 207, body: multi(ok('/123/principal/', '<cal:calendar-home-set><href>https://p02-caldav.icloud.com:443/123/calendars/</href></cal:calendar-home-set>')) });
    answers.set('PROPFIND https://p02-caldav.icloud.com/123/calendars/', {
      status: 207,
      body: multi(
        ok('/123/calendars/home/', '<resourcetype><collection/><cal:calendar/></resourcetype><displayname>Home</displayname><cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set>') +
        ok('/123/calendars/tasks/', '<resourcetype><collection/><cal:calendar/></resourcetype><displayname>Reminders</displayname><cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set>'),
      ),
    });
    answers.set('REPORT https://p02-caldav.icloud.com/123/calendars/home/', {
      status: 207,
      body: multi(ok('/123/calendars/home/x.ics', '<cal:calendar-data>BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:e1\nSUMMARY:Dentist\nDTSTART:20261110T090000Z\nDTEND:20261110T100000Z\nEND:VEVENT\nEND:VCALENDAR</cal:calendar-data>')),
    });
    const events = await fetchEvents(auth, 'imap-me@icloud.com', Date.UTC(2026, 10, 7), Date.UTC(2026, 10, 15));
    expect(events.map((e) => e.title)).toEqual(['Dentist']);
    expect(events[0].calendarName).toBe('Home');
    expect(calls.some((c) => c.url.includes('/tasks/'))).toBe(false);
  });

  it('reports a refused password clearly', async () => {
    answers.set('PROPFIND https://contacts.icloud.com/', { status: 401, body: '' });
    await expect(fetchContacts(auth)).rejects.toBeInstanceOf(DavAuthError);
  });

  it('never sends the password to a server that is not Apple', async () => {
    answers.set('PROPFIND https://contacts.icloud.com/', { status: 302, location: 'https://evil.example.com/steal', body: '' });
    await expect(fetchContacts(auth)).rejects.toThrow(/Refusing/);
    expect(calls).toHaveLength(1);
  });
});

describe('remembering where the calendars are', () => {
  const auth = { user: 'me@icloud.com', pass: 'abcd-efgh' };
  const ROOT = 'https://caldav.icloud.com/';
  const PRINCIPAL = 'https://caldav.icloud.com/123/principal/';
  const HOME = 'https://p02-caldav.icloud.com/123/calendars/';
  const CAL = 'https://p02-caldav.icloud.com/123/calendars/home/';
  const event = (title: string) => multi(ok('/123/calendars/home/x.ics', `<cal:calendar-data>BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:${title}\nSUMMARY:${title}\nDTSTART:20261110T090000Z\nDTEND:20261110T100000Z\nEND:VEVENT\nEND:VCALENDAR</cal:calendar-data>`));
  const homeList = (cal = '/123/calendars/home/') => multi(ok(cal, '<resourcetype><collection/><cal:calendar/></resourcetype><displayname>Home</displayname>'));
  const discovery = () => calls.filter((c) => c.url === ROOT || c.url === PRINCIPAL).length;
  const fetch = () => fetchEvents(auth, 'imap-me@icloud.com', Date.UTC(2026, 10, 7), Date.UTC(2026, 10, 15));

  beforeEach(async () => {
    calls.length = 0;
    answers.clear();
    await forgetDavPlaces();
    answers.set(`PROPFIND ${ROOT}`, { status: 207, body: multi(ok('/', '<current-user-principal><href>/123/principal/</href></current-user-principal>')) });
    answers.set(`PROPFIND ${PRINCIPAL}`, { status: 207, body: multi(ok('/123/principal/', '<cal:calendar-home-set><href>https://p02-caldav.icloud.com:443/123/calendars/</href></cal:calendar-home-set>')) });
    answers.set(`PROPFIND ${HOME}`, { status: 207, body: homeList() });
    answers.set(`REPORT ${CAL}`, { status: 207, body: event('Dentist') });
  });

  it('looks the addresses up once, then goes straight to the calendars', async () => {
    expect((await fetch()).map((e) => e.title)).toEqual(['Dentist']);
    expect(discovery()).toBe(2);
    calls.length = 0;
    expect((await fetch()).map((e) => e.title)).toEqual(['Dentist']);
    expect((await fetch()).map((e) => e.title)).toEqual(['Dentist']);
    expect(discovery()).toBe(0);
    // Still lists the calendars each time, so a calendar added on the phone shows up.
    expect(calls.filter((c) => c.url === HOME)).toHaveLength(2);
  });

  it('keeps the addresses after a restart (in IndexedDB)', async () => {
    await fetch();
    const { store } = await import('../db');
    const saved = await store.kvGet<Record<string, { home: string }>>('dav-places');
    expect(Object.values(saved || {}).map((p) => p.home)).toEqual([HOME]);
  });

  it('looks them up again when the home is not found', async () => {
    await fetch();
    const NEW_HOME = 'https://p05-caldav.icloud.com/123/calendars/';
    answers.set(`PROPFIND ${HOME}`, { status: 404, body: '' });
    answers.set(`PROPFIND ${PRINCIPAL}`, { status: 207, body: multi(ok('/123/principal/', `<cal:calendar-home-set><href>${NEW_HOME}</href></cal:calendar-home-set>`)) });
    answers.set(`PROPFIND ${NEW_HOME}`, { status: 207, body: homeList('/123/calendars/home/') });
    answers.set('REPORT https://p05-caldav.icloud.com/123/calendars/home/', { status: 207, body: event('Moved dentist') });
    calls.length = 0;
    expect((await fetch()).map((e) => e.title)).toEqual(['Moved dentist']);
    expect(discovery()).toBe(2);
    calls.length = 0;
    await fetch();
    expect(discovery()).toBe(0);
    expect(calls.some((c) => c.url === NEW_HOME)).toBe(true);
  });

  it('looks them up again after a redirect', async () => {
    await fetch();
    const NEW_HOME = 'https://p07-caldav.icloud.com/123/calendars/';
    answers.set(`PROPFIND ${HOME}`, { status: 301, location: NEW_HOME, body: '' });
    answers.set(`PROPFIND ${PRINCIPAL}`, { status: 207, body: multi(ok('/123/principal/', `<cal:calendar-home-set><href>${NEW_HOME}</href></cal:calendar-home-set>`)) });
    answers.set(`PROPFIND ${NEW_HOME}`, { status: 207, body: homeList() });
    answers.set('REPORT https://p07-caldav.icloud.com/123/calendars/home/', { status: 207, body: event('Dentist') });
    calls.length = 0;
    expect((await fetch()).map((e) => e.title)).toEqual(['Dentist']);
    expect(discovery()).toBe(2);
  });

  it('looks them up again once a day', async () => {
    await fetch();
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now + DAV_PLACES_FOR + 1000);
    try {
      calls.length = 0;
      await fetch();
      expect(discovery()).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('still reports a refused password, without looking everything up again', async () => {
    await fetch();
    answers.set(`PROPFIND ${HOME}`, { status: 401, body: '' });
    calls.length = 0;
    await expect(fetch()).rejects.toBeInstanceOf(DavAuthError);
    expect(discovery()).toBe(0);
  });
});
