// Printing a conversation, and saving it as a PDF. Both open Windows' own print window: a PDF is a choice
// ("Save as PDF") in that window. The email is drawn on a clean page of its own, not the app around it.
import { renderEmail } from './render';
import { bytesToBase64 } from './mime';
import { getAttachmentData, loadBody, messagesInThread, toast } from './mail';
import { settings } from './settings';
import type { Address, Message } from './types';

export interface PrintPart {
  from: string;
  to: string;
  cc: string;
  date: string;
  subject: string;
  /** Already made safe by renderEmail. */
  body: string;
  styles: string;
  attachments: string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const addressText = (list: Address[]) => list.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', ');

/** The page that gets printed. */
export function printDocument(title: string, parts: PrintPart[]): string {
  const head = (label: string, value: string) => (value ? `<tr><th>${label}</th><td>${esc(value)}</td></tr>` : '');
  const messages = parts
    .map((p) => `<section class="msg">
<h2>${esc(p.subject)}</h2>
<table class="head">${head('From', p.from)}${head('To', p.to)}${head('Cc', p.cc)}${head('Date', p.date)}</table>
<div class="body">${p.styles}${p.body}</div>
${p.attachments.length ? `<p class="att">Attachments: ${p.attachments.map(esc).join(', ')}</p>` : ''}
</section>`)
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { margin: 16mm; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #000; background: #fff; font-size: 11pt; line-height: 1.45; }
.msg { padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid #bbb; }
.msg:last-child { border-bottom: 0; }
h2 { font-size: 15pt; margin: 0 0 8px; }
table.head { border-collapse: collapse; margin-bottom: 12px; font-size: 10pt; }
table.head th { text-align: left; color: #555; font-weight: 600; padding: 1px 12px 1px 0; vertical-align: top; white-space: nowrap; }
table.head td { padding: 1px 0; word-break: break-word; }
.body img { max-width: 100%; height: auto; }
.att { color: #555; font-size: 10pt; }
</style></head><body>${messages}</body></html>`;
}

/** Pictures an email's HTML points at, as data: addresses, so they print too. */
async function inlineImagesFor(m: Message): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const html = (m.bodyHtml || '').toLowerCase();
  for (const a of m.attachments) {
    if (!a.contentId || !a.mimeType.startsWith('image/') || !html.includes(`cid:${a.contentId.toLowerCase()}`)) continue;
    try { out[a.contentId] = `data:${a.mimeType};base64,${bytesToBase64(await getAttachmentData(m.id, a.id))}`; } catch { /* print without it */ }
  }
  return out;
}

async function partFor(m: Message): Promise<PrintPart> {
  const s = settings();
  const loaded = m.bodyLoaded ? m : (await loadBody(m.id)) || m;
  const allowRemote = s.imagePolicy === 'always' || s.trustedSenders.includes(m.from.email.toLowerCase());
  const rendered = renderEmail(loaded.bodyHtml, loaded.bodyText, { allowRemote, blockTrackers: s.blockTrackers, dark: false, inlineImages: await inlineImagesFor(loaded), font: s.readingFont });
  // Take the body and any styles out of the rendered page, so several emails sit on one page.
  const doc = new DOMParser().parseFromString(rendered.html, 'text/html');
  const styles = [...doc.querySelectorAll('style')].map((el) => el.outerHTML).join('');
  return {
    from: addressText([loaded.from]),
    to: addressText(loaded.to),
    cc: addressText(loaded.cc),
    date: new Date(loaded.date).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    subject: loaded.subject,
    body: doc.body.innerHTML,
    styles,
    attachments: loaded.attachments.filter((a) => !a.inline).map((a) => a.filename),
  };
}

/** Opens the print window for a conversation (oldest message first). */
export async function printThread(key: string, opts: { pdf?: boolean } = {}): Promise<void> {
  const thread = messagesInThread(key);
  if (!thread.length) return;
  const parts = await Promise.all(thread.map(partFor));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.srcdoc = printDocument(thread[thread.length - 1].subject, parts);
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    // Give pictures a moment to finish loading before the page is drawn for printing.
    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(() => frame.remove(), 60000);
    }, 400);
  };
  document.body.appendChild(frame);
  if (opts.pdf) toast({ text: 'In the print window, choose Save as PDF as the printer.', ttl: 7000 });
}
