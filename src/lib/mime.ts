// Building and parsing email formats (RFC 5322 / MIME).
import type { Address, OutgoingMessage, OutgoingAttachment } from './types';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Turns the bytes of an email body into text using the charset the sender declared.
 * Some senders say "us-ascii" or "iso-8859-1" but really send UTF-8, which shows up as â€™ instead of an apostrophe
 * (browsers treat those two labels as Windows-1252). If the bytes are clean UTF-8 with accents or symbols in them,
 * UTF-8 is what they are, whatever the label says.
 */
export function decodeBody(bytes: Uint8Array, charset = 'utf-8'): string {
  const label = charset.toLowerCase();
  const legacy = /^(us-ascii|ascii|iso-8859-1|latin1|windows-1252|cp1252)$/.test(label);
  if (legacy && bytes.some((b) => b >= 0x80)) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* genuinely Windows-1252, fall through */ }
  }
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return dec.decode(bytes);
  }
}

export const base64UrlEncode =(bytes: Uint8Array) =>
  bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** RFC 2047 encode a header value when it isn't plain ASCII. */
export function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${bytesToBase64(enc.encode(value))}?=`;
}

export function formatAddress(a: Address): string {
  if (!a.name) return a.email;
  const needsQuote = /[",.;:<>@()[\]\\]/.test(a.name);
  // eslint-disable-next-line no-control-regex
  const ascii = /^[\x20-\x7e]*$/.test(a.name);
  const name = ascii ? (needsQuote ? `"${a.name.replace(/(["\\])/g, '\\$1')}"` : a.name) : encodeHeader(a.name);
  return `${name} <${a.email}>`;
}

export const formatAddressList = (list: Address[]) => list.map(formatAddress).join(', ');

/** Decode RFC 2047 encoded words in a header. */
export function decodeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset: string, mode: string, text: string) => {
    try {
      const bytes =
        mode.toUpperCase() === 'B'
          ? base64ToBytes(text)
          : Uint8Array.from(
              text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16))),
              (c) => c.charCodeAt(0),
            );
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      return text;
    }
  });
}

/** Parse "Name <a@b.com>, c@d.com" into addresses. */
export function parseAddressList(header: string | undefined): Address[] {
  if (!header) return [];
  const out: Address[] = [];
  let buf = '';
  let inQuote = false;
  let depth = 0;
  for (const ch of header) {
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote && ch === '<') depth++;
    if (!inQuote && ch === '>') depth--;
    if (ch === ',' && !inQuote && depth === 0) {
      if (buf.trim()) out.push(parseAddress(buf));
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(parseAddress(buf));
  return out.filter((a) => a.email);
}

export function parseAddress(raw: string): Address {
  const s = decodeHeader(raw.trim());
  const m = s.match(/^(.*)<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1').trim();
    return { name: name || undefined, email: m[2].trim() };
  }
  return { email: s.replace(/^"|"$/g, '').trim() };
}

function wrap76(s: string): string {
  return s.replace(/(.{76})/g, '$1\r\n');
}

function randomBoundary(): string {
  return '----=_WGM_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Turns data: URI images in the HTML into inline (cid:) attachments, which is
 * how pasted screenshots travel in email.
 */
export function extractInlineImages(html: string): { html: string; inline: OutgoingAttachment[] } {
  const inline: OutgoingAttachment[] = [];
  const out = html.replace(/src="data:(image\/[a-zA-Z+.-]+);base64,([^"]+)"/g, (_m, mime: string, b64: string) => {
    const cid = `img${inline.length + 1}.${Date.now().toString(36)}@wellgoodmail`;
    const ext = mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    inline.push({ filename: `image${inline.length + 1}.${ext}`, mimeType: mime, data: base64ToBytes(b64), contentId: cid, inline: true });
    return `src="cid:${cid}"`;
  });
  return { html: out, inline };
}

/** Builds the raw email the Gmail API (and SMTP) expects. */
export function buildRawMessage(msg: OutgoingMessage, now = new Date()): string {
  const { html, inline } = extractInlineImages(msg.html);
  const attachments = msg.attachments.filter((a) => !a.inline);
  const allInline = [...inline, ...msg.attachments.filter((a) => a.inline)];

  const headers: string[] = [];
  headers.push(`From: ${formatAddress(msg.from)}`);
  if (msg.to.length) headers.push(`To: ${formatAddressList(msg.to)}`);
  if (msg.cc.length) headers.push(`Cc: ${formatAddressList(msg.cc)}`);
  if (msg.bcc.length) headers.push(`Bcc: ${formatAddressList(msg.bcc)}`);
  if (msg.replyTo?.length) headers.push(`Reply-To: ${formatAddressList(msg.replyTo)}`);
  headers.push(`Subject: ${encodeHeader(msg.subject)}`);
  headers.push(`Date: ${now.toUTCString().replace('GMT', '+0000')}`);
  // No Message-ID of our own: Gmail adds a proper one on its own domain, which spam filters prefer.
  if (msg.inReplyTo) headers.push(`In-Reply-To: ${msg.inReplyTo}`);
  if (msg.references) headers.push(`References: ${msg.references}`);
  headers.push('MIME-Version: 1.0');

  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(bytesToBase64(enc.encode(msg.text))),
  ].join('\r\n');
  const htmlPart = [
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(bytesToBase64(enc.encode(html))),
  ].join('\r\n');

  const altBoundary = randomBoundary();
  const alternative = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    textPart,
    `--${altBoundary}`,
    htmlPart,
    `--${altBoundary}--`,
  ].join('\r\n');

  const attachmentPart = (a: OutgoingAttachment) => {
    const name = encodeHeader(a.filename);
    return [
      `Content-Type: ${a.mimeType}; name="${name}"`,
      'Content-Transfer-Encoding: base64',
      a.inline && a.contentId
        ? `Content-Disposition: inline; filename="${name}"\r\nContent-ID: <${a.contentId}>`
        : `Content-Disposition: attachment; filename="${name}"`,
      '',
      wrap76(bytesToBase64(a.data)),
    ].join('\r\n');
  };

  let body = alternative;
  if (allInline.length) {
    const b = randomBoundary();
    body = [
      `Content-Type: multipart/related; boundary="${b}"`,
      '',
      `--${b}`,
      body,
      ...allInline.flatMap((a) => [`--${b}`, attachmentPart(a)]),
      `--${b}--`,
    ].join('\r\n');
  }
  if (attachments.length) {
    const b = randomBoundary();
    body = [
      `Content-Type: multipart/mixed; boundary="${b}"`,
      '',
      `--${b}`,
      body,
      ...attachments.flatMap((a) => [`--${b}`, attachmentPart(a)]),
      `--${b}--`,
    ].join('\r\n');
  }

  return headers.join('\r\n') + '\r\n' + body + '\r\n';
}

/** Plain text version of HTML for the text/plain part and search. */
export function htmlToText(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ');
  const doc = new DOMParser().parseFromString(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '</$1>\n'),
    'text/html',
  );
  doc.querySelectorAll('style,script,head').forEach((n) => n.remove());
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('http') && a.textContent?.trim() !== href) a.append(` (${href})`);
  });
  doc.querySelectorAll('li').forEach((li) => li.prepend('• '));
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function textToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>');
}
