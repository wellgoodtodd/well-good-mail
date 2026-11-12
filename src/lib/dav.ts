// Contacts (CardDAV) and calendar (CalDAV) for iCloud. The requests go through the Rust side (src-tauri/src/dav.rs),
// and the answers are read here. Everything is signed in with the same app password as the mail.
import { invoke } from './platform';
import { store } from './db';
import { findMeetingUrl } from './meetings';
import type { Address, CalendarEvent, EventGuest, GuestAnswer } from './types';

export interface DavAuth { user: string; pass: string }

interface DavRes { status: number; location: string | null; body: string }

export class DavAuthError extends Error {
  needsSignIn = false;
  constructor() {
    super('Apple did not accept this password for contacts and calendars. If your Apple Account uses a different email address from your iCloud mail, add it in the account settings.');
  }
}

/** The password is only ever sent to Apple's own servers. */
const ALLOWED_HOST = /(^|\.)icloud\.com$/i;

/** One request, following redirects by hand so the password never leaves Apple's servers. */
export async function davRequest(auth: DavAuth, url: string, method: string, body?: string, depth?: string): Promise<{ status: number; body: string; url: string }> {
  let target = url;
  for (let hop = 0; hop < 6; hop++) {
    const u = new URL(target);
    if (u.protocol !== 'https:' || !ALLOWED_HOST.test(u.hostname)) throw new Error(`Refusing to send a password to ${u.hostname}`);
    const res = await invoke<DavRes>('dav_request', { req: { url: target, method, user: auth.user, pass: auth.pass, depth, body } });
    if (res.status >= 300 && res.status < 400 && res.location) {
      target = new URL(res.location, target).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new DavAuthError();
    return { status: res.status, body: res.body, url: target };
  }
  throw new Error('Too many redirects while looking for contacts and calendars.');
}

// ---------- reading the XML answers ----------

const parseXml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');
const kids = (el: Element | Document, name: string): Element[] => Array.from(el.getElementsByTagNameNS('*', name));
const first = (el: Element | Document | undefined | null, name: string): Element | undefined => (el ? kids(el, name)[0] : undefined);
const textOf = (el?: Element | null) => el?.textContent?.trim() || '';

interface Item { href: string; props: Element[] }

/** The items in a multi-status answer, each with the properties the server reported as found. */
export function readItems(xml: string): Item[] {
  const doc = parseXml(xml);
  return kids(doc, 'response').map((r) => ({
    href: textOf(first(r, 'href')),
    props: kids(r, 'propstat').filter((p) => / 200/.test(textOf(first(p, 'status')))).flatMap((p) => kids(p, 'prop')),
  }));
}

const inProps = (item: Item, name: string) => item.props.map((p) => first(p, name)).find(Boolean);

const PROPFIND_HEAD = '<?xml version="1.0" encoding="utf-8"?>';

async function principalUrl(auth: DavAuth, root: string): Promise<string> {
  const r = await davRequest(auth, root, 'PROPFIND', `${PROPFIND_HEAD}<propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>`, '0');
  const href = textOf(first(first(parseXml(r.body), 'current-user-principal'), 'href'));
  if (!href) throw new Error('Apple did not say where this account keeps its contacts and calendars.');
  return new URL(href, r.url).toString();
}

async function homeUrl(auth: DavAuth, principal: string, ns: string, name: string): Promise<string> {
  const r = await davRequest(auth, principal, 'PROPFIND', `${PROPFIND_HEAD}<propfind xmlns="DAV:" xmlns:x="${ns}"><prop><x:${name}/></prop></propfind>`, '0');
  const href = textOf(first(first(parseXml(r.body), name), 'href'));
  if (!href) throw new Error('Apple did not list any contacts or calendars for this account.');
  return new URL(href, r.url).toString();
}

// ---------- remembering where things are ----------
// Finding an account's contacts or calendars takes two lookups (who you are, then where your calendars live) before
// the calendars themselves. The answer rarely changes, so it is remembered (here and in IndexedDB) and found again
// only when Apple says it has moved (a redirect, not found, or any unexpected answer), or once a day.

type Service = 'caldav' | 'carddav';
const SERVICES: Record<Service, { root: string; ns: string; prop: string }> = {
  caldav: { root: 'https://caldav.icloud.com/', ns: 'urn:ietf:params:xml:ns:caldav', prop: 'calendar-home-set' },
  carddav: { root: 'https://contacts.icloud.com/', ns: 'urn:ietf:params:xml:ns:carddav', prop: 'addressbook-home-set' },
};
const PLACES_KEY = 'dav-places';
/** Found again at least this often, even when nothing has gone wrong. */
export const DAV_PLACES_FOR = 24 * 60 * 60 * 1000;

interface Place { home: string; at: number }
const places = new Map<string, Place>();
let placesLoaded: Promise<void> | null = null;

function loadPlaces(): Promise<void> {
  placesLoaded ||= store.kvGet<Record<string, Place>>(PLACES_KEY)
    .then((saved) => { for (const [k, v] of Object.entries(saved || {})) if (!places.has(k) && v?.home) places.set(k, v); })
    .catch(() => undefined);
  return placesLoaded;
}
const savePlaces = () => { void store.kvSet(PLACES_KEY, Object.fromEntries(places)).catch(() => undefined); };
const placeKey = (service: Service, auth: DavAuth) => `${service}|${auth.user.toLowerCase()}`;

function forgetPlace(key: string) {
  if (places.delete(key)) savePlaces();
}

/** Forgets every remembered address (the tests, and a fresh start). */
export async function forgetDavPlaces(): Promise<void> {
  places.clear();
  placesLoaded = null;
  await store.kvSet(PLACES_KEY, {}).catch(() => undefined);
}

/** The remembered address was wrong: the answer said it moved or isn't there. */
class Moved extends Error {}

/**
 * Runs `use` with the account's contacts or calendar home: the remembered one if it's less than a day old (and
 * `use` doesn't find it moved), otherwise found again from the start and remembered.
 */
async function withHome<T>(auth: DavAuth, service: Service, use: (home: string, remembered: boolean) => Promise<T>): Promise<T> {
  await loadPlaces();
  const key = placeKey(service, auth);
  const known = places.get(key);
  if (known && Date.now() - known.at < DAV_PLACES_FOR && Date.now() >= known.at) {
    try {
      return await use(known.home, true);
    } catch (e) {
      if (!(e instanceof Moved)) throw e;
      forgetPlace(key);
    }
  }
  const { root, ns, prop } = SERVICES[service];
  const principal = await principalUrl(auth, root);
  const home = await homeUrl(auth, principal, ns, prop);
  places.set(key, { home, at: Date.now() });
  savePlaces();
  return use(home, false);
}

interface Collection { url: string; name: string }

/** With `strict` (a remembered home), anything but a straight multi-status answer counts as moved. */
async function collections(auth: DavAuth, home: string, kind: 'addressbook' | 'calendar', strict = false): Promise<Collection[]> {
  const body = `${PROPFIND_HEAD}<propfind xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><prop><resourcetype/><displayname/><c:supported-calendar-component-set/></prop></propfind>`;
  const r = await davRequest(auth, home, 'PROPFIND', body, '1');
  if (strict && (r.status !== 207 || r.url !== home)) throw new Moved();
  const out: Collection[] = [];
  for (const item of readItems(r.body)) {
    const types = inProps(item, 'resourcetype');
    if (!types || !kids(types, kind).length) continue;
    // Calendars that only hold reminders (tasks) are not wanted.
    const comps = kids(inProps(item, 'supported-calendar-component-set') || types, 'comp').map((c) => (c.getAttribute('name') || '').toUpperCase());
    if (kind === 'calendar' && comps.length && !comps.includes('VEVENT')) continue;
    out.push({ url: new URL(item.href, r.url).toString(), name: textOf(inProps(item, 'displayname') as Element | undefined) || (kind === 'calendar' ? 'Calendar' : 'Contacts') });
  }
  return out;
}

// ---------- contacts ----------

export const unfold = (text: string) => text.replace(/\r?\n[ \t]/g, '');
export const unescapeText = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** Names and email addresses from vCards. Someone with two addresses gives two entries. */
export function parseVCards(text: string): Address[] {
  const out: Address[] = [];
  for (const card of unfold(text).split(/BEGIN:VCARD/i).slice(1)) {
    let name = '';
    let nameParts = '';
    const emails: string[] = [];
    for (const line of card.split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const prop = line.slice(0, i).split(';')[0].toUpperCase().replace(/^ITEM\d+\./, '');
      const value = line.slice(i + 1).trim();
      if (prop === 'FN' && !name) name = unescapeText(value);
      else if (prop === 'N' && !nameParts) { const [last, firstName] = value.split(';'); nameParts = [firstName, last].filter(Boolean).join(' '); }
      else if (prop === 'EMAIL' && value.includes('@')) emails.push(value.toLowerCase());
    }
    const display = name || unescapeText(nameParts).trim();
    for (const email of emails) out.push({ name: display || undefined, email });
  }
  return out;
}

export async function fetchContacts(auth: DavAuth): Promise<Address[]> {
  const books = await withHome(auth, 'carddav', (home, remembered) => collections(auth, home, 'addressbook', remembered));
  const query = `${PROPFIND_HEAD}<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><card:address-data/></d:prop></card:addressbook-query>`;
  const out: Address[] = [];
  for (const b of books) {
    const r = await davRequest(auth, b.url, 'REPORT', query, '1');
    for (const item of readItems(r.body)) out.push(...parseVCards(textOf(inProps(item, 'address-data') as Element | undefined)));
  }
  return out;
}

// ---------- calendar ----------

/** Offset of a time zone from UTC at a moment, in milliseconds. */
function zoneOffset(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(ms / 1000) * 1000;
}

export function parseTime(value: string, params: Record<string, string>): { ms: number; allDay: boolean } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { ms: NaN, allDay: false };
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  if (m[4] === undefined) return { ms: new Date(y, mo, d).getTime(), allDay: true };
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6])];
  if (m[7]) return { ms: Date.UTC(y, mo, d, h, mi, s), allDay: false };
  const zone = params.TZID;
  if (zone) {
    try {
      const guess = Date.UTC(y, mo, d, h, mi, s);
      return { ms: guess - zoneOffset(guess - zoneOffset(guess, zone), zone), allDay: false };
    } catch { /* unknown zone: treat as local time */ }
  }
  return { ms: new Date(y, mo, d, h, mi, s).getTime(), allDay: false };
}

/** "-PT15M" or "-P1D" as minutes before the start. Returns undefined for anything after the start. */
export function triggerMinutes(value: string): number | undefined {
  const m = value.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return undefined;
  const mins = Number(m[2] || 0) * 10080 + Number(m[3] || 0) * 1440 + Number(m[4] || 0) * 60 + Number(m[5] || 0) + Math.round(Number(m[6] || 0) / 60);
  return m[1] === '-' || mins === 0 ? mins : undefined;
}

export const parseProp = (line: string) => {
  const i = line.indexOf(':');
  const [name, ...rest] = line.slice(0, i).split(';');
  const params: Record<string, string> = {};
  for (const p of rest) { const [k, v] = p.split('='); if (k) params[k.toUpperCase()] = (v || '').replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
};

/** What a calendar file's PARTSTAT says, as a guest answer. */
export function partstatAnswer(s?: string): GuestAnswer {
  const v = (s || '').toUpperCase();
  return v === 'ACCEPTED' ? 'yes' : v === 'DECLINED' ? 'no' : v === 'TENTATIVE' ? 'maybe' : 'waiting';
}

/** The guest list for an event, marking you and the organiser, and your own answer. Nothing when nobody was invited. */
export function davGuests(guests: EventGuest[], organiser: string | undefined, mine: Set<string>): Pick<CalendarEvent, 'guests' | 'myResponse'> {
  const seen = new Set<string>();
  const list: EventGuest[] = [];
  for (const g of guests) {
    if (seen.has(g.email)) continue;
    seen.add(g.email);
    list.push({ ...g, organiser: g.email === organiser || undefined, self: mine.has(g.email) || undefined });
  }
  // The organiser sometimes isn't in the attendee list. They are coming.
  if (organiser && !seen.has(organiser) && list.length) list.unshift({ email: organiser, answer: 'yes', organiser: true, self: mine.has(organiser) || undefined });
  if (!list.length) return {};
  return { guests: list.slice(0, 60), myResponse: list.find((g) => g.self)?.answer };
}

/** Events from calendar text. Repeating events should already have been expanded by the server. `own` is every address that counts as you. */
export function parseEvents(ics: string, calendarName: string, accountId: string, own: string[] = []): CalendarEvent[] {
  const mine = new Set(own.map((a) => a.toLowerCase()));
  const out: CalendarEvent[] = [];
  let ev: { uid?: string; title?: string; location?: string; description?: string; url?: string; start?: { ms: number; allDay: boolean }; end?: number; duration?: string; cancelled?: boolean; reminders: number[]; guests: EventGuest[]; organiser?: string } | undefined;
  let inAlarm = false;
  for (const line of unfold(ics).split(/\r?\n/)) {
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') { ev = { reminders: [], guests: [] }; continue; }
    if (upper === 'END:VEVENT') {
      if (ev?.start && Number.isFinite(ev.start.ms) && !ev.cancelled) {
        let end = ev.end;
        if (!Number.isFinite(end)) {
          const dur = ev.duration ? triggerMinutes(`-${ev.duration.replace(/^[+-]/, '')}`) : undefined;
          end = dur !== undefined ? ev.start.ms + dur * 60000 : ev.start.allDay ? ev.start.ms + 86400000 : ev.start.ms;
        }
        out.push({
          id: `${accountId}|${ev.uid || ev.title}|${ev.start.ms}`,
          accountId,
          calendarName,
          title: ev.title || '(no title)',
          start: ev.start.ms,
          end: end as number,
          allDay: ev.start.allDay,
          location: ev.location,
          description: ev.description ? ev.description.slice(0, 600) : undefined,
          meetingUrl: findMeetingUrl(ev.url, ev.location, ev.description),
          reminderMinutes: ev.reminders,
          ...davGuests(ev.guests, ev.organiser, mine),
        });
      }
      ev = undefined;
      continue;
    }
    if (!ev) continue;
    if (upper === 'BEGIN:VALARM') { inAlarm = true; continue; }
    if (upper === 'END:VALARM') { inAlarm = false; continue; }
    if (line.indexOf(':') < 0) continue;
    const p = parseProp(line);
    if (inAlarm) {
      if (p.name === 'TRIGGER' && p.params.VALUE !== 'DATE-TIME' && !(p.params.RELATED || '').toUpperCase().startsWith('END')) {
        const mins = triggerMinutes(p.value);
        if (mins !== undefined) ev.reminders.push(mins);
      }
      continue;
    }
    if (p.name === 'UID') ev.uid = p.value;
    else if (p.name === 'SUMMARY') ev.title = unescapeText(p.value);
    else if (p.name === 'LOCATION') ev.location = unescapeText(p.value) || undefined;
    else if (p.name === 'DESCRIPTION') ev.description = unescapeText(p.value) || undefined;
    else if (p.name === 'URL') ev.url = p.value;
    else if (p.name === 'DTSTART') ev.start = parseTime(p.value, p.params);
    else if (p.name === 'DTEND') ev.end = parseTime(p.value, p.params).ms;
    else if (p.name === 'DURATION') ev.duration = p.value;
    else if (p.name === 'STATUS') ev.cancelled = p.value.toUpperCase() === 'CANCELLED';
    else if (p.name === 'ORGANIZER') ev.organiser = p.value.replace(/^mailto:/i, '').trim().toLowerCase();
    else if (p.name === 'ATTENDEE') {
      const email = p.value.replace(/^mailto:/i, '').trim().toLowerCase();
      if (email.includes('@') && !/^(ROOM|RESOURCE)$/i.test(p.params.CUTYPE || '')) ev.guests.push({ email, name: p.params.CN ? unescapeText(p.params.CN) : undefined, answer: partstatAnswer(p.params.PARTSTAT) });
    }
  }
  return out;
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

export async function fetchEvents(auth: DavAuth, accountId: string, fromMs: number, toMs: number, own: string[] = [auth.user]): Promise<CalendarEvent[]> {
  const cals = await withHome(auth, 'caldav', (home, remembered) => collections(auth, home, 'calendar', remembered));
  const range = `start="${stamp(fromMs)}" end="${stamp(toMs)}"`;
  const query = `${PROPFIND_HEAD}<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data><c:expand ${range}/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${range}/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const out: CalendarEvent[] = [];
  for (const c of cals) {
    const r = await davRequest(auth, c.url, 'REPORT', query, '1');
    // A calendar that has gone or moved: look everything up again next time.
    if (r.status === 404 || r.url !== c.url) forgetPlace(placeKey('caldav', auth));
    for (const item of readItems(r.body)) out.push(...parseEvents(textOf(inProps(item, 'calendar-data') as Element | undefined), c.name, accountId, own));
  }
  return out;
}
