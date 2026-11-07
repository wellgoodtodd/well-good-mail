import { describe, expect, it, vi } from 'vitest';

vi.mock('../platform', () => ({ invoke: async () => {}, isTauri: () => false }));
vi.mock('../mail', () => ({ getAttachmentData: async () => new Uint8Array(), loadBody: async () => undefined, messagesInThread: () => [], toast: () => {} }));

const { printDocument, addressText, pdfName } = await import('../print');

const part = { from: 'Sam <sam@example.com>', to: 'me@example.com', cc: '', date: 'Monday 2 November 2026, 10:00', subject: 'Plans <for> "Friday"', body: '<p>Hello</p>', styles: '', attachments: ['plan.pdf'] };

describe('print page', () => {
  it('shows who, when and what', () => {
    const html = printDocument('Plans', [part]);
    expect(html).toContain('<th>From</th><td>Sam &lt;sam@example.com&gt;</td>');
    expect(html).toContain('<th>To</th>');
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('Attachments: plan.pdf');
  });
  it('leaves out empty lines such as Cc', () => {
    expect(printDocument('x', [part])).not.toContain('<th>Cc</th>');
  });
  it('makes the subject and title safe', () => {
    const html = printDocument('A <b> title', [part]);
    expect(html).toContain('<title>A &lt;b&gt; title</title>');
    expect(html).toContain('<h2>Plans &lt;for&gt; &quot;Friday&quot;</h2>');
  });
  it('puts every message in a conversation on the page in order', () => {
    const html = printDocument('x', [{ ...part, subject: 'First' }, { ...part, subject: 'Second' }]);
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
  });
  it('names the PDF after the subject, with nothing Windows refuses', () => {
    expect(pdfName('Re: Q3 VAT return / final?')).toBe('Re Q3 VAT return final.pdf');
    expect(pdfName('   ')).toBe('Email.pdf');
    expect(pdfName('a'.repeat(200)).length).toBeLessThanOrEqual(84);
  });
  it('writes address lists with names', () => {
    expect(addressText([{ name: 'Ann', email: 'a@x.com' }, { email: 'b@x.com' }])).toBe('Ann <a@x.com>, b@x.com');
  });
});
