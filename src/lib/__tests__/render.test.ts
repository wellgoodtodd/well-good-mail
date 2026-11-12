import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { parseQuery } from '../search';
import { dueReminders } from '../reminders';

const base = { allowRemote: false, blockTrackers: true, dark: false, inlineImages: {}, font: 'Rubik' };

describe('render', () => {
  it('removes scripts and holds back remote images', () => {
    const r = renderEmail('<p>Hi</p><script>alert(1)</script><img src="https://x.com/a.png" width="300">', undefined, base);
    expect(r.html).not.toContain('<script');
    expect(r.html).not.toMatch(/\ssrc="https:\/\/x\.com\/a\.png"/);
    expect(r.remoteBlocked).toBe(1);
  });
  it('blocks tracking pixels even when images are allowed', () => {
    const r = renderEmail('<img src="https://x.com/o.gif" width="1" height="1"><img src="https://x.com/photo.jpg">', undefined, { ...base, allowRemote: true });
    expect(r.trackersBlocked).toBe(1);
    expect(r.html).toContain('photo.jpg');
  });
  it('holds back remote images hidden with line breaks or backslashes, and the frame refuses the internet', () => {
    const r = renderEmail('<img src="ht&#10;tps://x.com/a.png"><img src="\\\\x.com/b.png">', undefined, base);
    expect(r.remoteBlocked).toBe(2);
    expect(r.html).toContain("img-src data: blob:");
    const allowed = renderEmail('<img src="https://x.com/c.png">', undefined, { ...base, allowRemote: true });
    expect(allowed.html).not.toContain('Content-Security-Policy');
  });
  it('flags links that pretend to go somewhere else', () => {
    const r = renderEmail('<a href="https://evil.example/login">https://www.paypal.com</a>', undefined, base);
    expect(r.html).toContain('data-wgm-mismatch="evil.example"');
  });
});

describe('search query', () => {
  it('understands operators', () => {
    expect(parseQuery('from:isla has:attachment invoice')).toMatchObject({ from: 'isla', hasAttachment: true, text: 'invoice' });
  });
  it('reads after: and before: dates as local days', () => {
    expect(parseQuery('after:2026-11-12').after).toBe(new Date(2026, 10, 12).getTime());
  });
});

describe('reminders', () => {
  it('collects due items until dismissed', () => {
    const now = Date.now();
    const ev = { id: 'e', accountId: 'a', calendarName: 'Cal', title: 'Call', start: now - 60000, end: now + 3600000, allDay: false, reminderMinutes: [10] };
    expect(dueReminders([ev], [], new Set(), now)).toHaveLength(1);
    expect(dueReminders([ev], [], new Set([`ev|e|${ev.start}`]), now)).toHaveLength(0);
    const future = { ...ev, id: 'f', start: now + 7200000 };
    expect(dueReminders([future], [], new Set(), now)).toHaveLength(0);
  });
});

describe('remote pictures stay blocked however they are written (security review, Nov 2026)', () => {
  const base2 = { allowRemote: false, blockTrackers: true, dark: false, inlineImages: {}, font: 'Rubik' };
  it('catches spaces, // addresses, srcset, sources and style sheets', () => {
    const r = renderEmail('<img src=" https://a.example/1.png" width="300"><img src="//b.example/2.png" width="300"><picture><source srcset="https://c.example/3.png"><img src="data:image/png;base64,AA"></picture><div style="background:url( \'https://d.example/4.png\' )">x</div><style>.y{background:url(https://e.example/5.png)} @import url(https://f.example/x.css);</style>', undefined, base2);
    // Only what actually loads counts (a saved data-wgm-src for "Load pictures" is fine).
    for (const host of ['a.example', 'b.example', 'c.example', 'd.example', 'e.example', 'f.example']) {
      expect(r.html).not.toMatch(new RegExp(`\\s(?:src|srcset)="[^"]*${host}`));
      expect(r.html).not.toMatch(new RegExp(`url\\([^)]*${host}`));
    }
  });
});
