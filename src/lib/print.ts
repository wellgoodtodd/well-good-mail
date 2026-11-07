// Printing a conversation, and saving it as a PDF. Both open Windows' own print window: a PDF is a choice
// ("Save as PDF") in that window. The email is drawn on a clean page of its own, not the app around it.
import { renderEmail } from './render';
import { bytesToBase64 } from './mime';
import { getAttachmentData, loadBody, messagesInThread, toast } from './mail';
import { settings } from './settings';
import { invoke, isTauri } from './platform';
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

/** The page for a conversation (oldest message first), and its subject. */
async function threadPage(key: string): Promise<{ html: string; subject: string } | undefined> {
  const thread = messagesInThread(key);
  if (!thread.length) return undefined;
  const parts = await Promise.all(thread.map(partFor));
  const subject = thread[thread.length - 1].subject;
  return { html: printDocument(subject, parts), subject };
}

/** Tells the app a print window is open, so its corner X can't quit the app by accident. */
const setPrinting = (on: boolean) => { if (isTauri()) invoke('set_printing', { on }).catch(() => {}); };

/** Opens the Windows print window for a conversation. */
export async function printThread(key: string, opts: { pdf?: boolean } = {}): Promise<void> {
  const page = await threadPage(key);
  if (!page) return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.srcdoc = page.html;
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    const finish = () => { setPrinting(false); setTimeout(() => frame.remove(), 1000); };
    win.addEventListener('afterprint', finish);
    // Give pictures a moment to finish loading before the page is drawn for printing.
    setTimeout(() => {
      win.focus();
      setPrinting(true);
      setTimeout(finish, 10 * 60000);
      win.print();
    }, 400);
  };
  document.body.appendChild(frame);
  toast({ text: opts.pdf ? 'In the print window, choose Save as PDF as the printer. Use Cancel to close it.' : 'Use Cancel to close the print window.', ttl: 5000 });
}

/** A file name that Windows accepts, made from the subject. */
export function pdfName(subject: string): string {
  const clean = subject.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${clean || 'Email'}.pdf`;
}

/** Asks where to save, then writes the conversation as a PDF. Falls back to the print window if that isn't possible. */
export async function savePdfThread(key: string): Promise<void> {
  if (!isTauri()) return printThread(key, { pdf: true });
  const page = await threadPage(key);
  if (!page) return;
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: pdfName(page.subject), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (!path) return;
  try {
    await invoke('save_pdf', { html: page.html, path });
    toast({ text: `PDF saved to ${path}`, ttl: 7000 });
  } catch (e) {
    console.warn('PDF save failed', e);
    toast({ text: "Couldn't save the PDF directly, so here is the print window. Choose Save as PDF.", ttl: 6000 });
    await printThread(key, { pdf: true });
  }
}
