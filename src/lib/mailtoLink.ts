// Email links (mailto:) from a browser or another app open a new email here.
import { escapeHtml } from './mime';
import type { Address } from './types';

export interface MailtoParts { to: Address[]; cc: Address[]; bcc: Address[]; subject: string; body: string }

const list = (s: string): Address[] => s.split(/[,;]/).map((x) => x.trim()).filter((x) => x.includes('@')).map((email) => ({ email }));

/** mailto:a@b.com,c@d.com?cc=e@f.com&subject=Hello&body=Hi%20there */
export function parseMailto(link: string): MailtoParts {
  const raw = link.replace(/^mailto:/i, '');
  const [addr, query = ''] = raw.split('?');
  const dec = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, '%20')); } catch { return s; } };
  const out: MailtoParts = { to: list(dec(addr)), cc: [], bcc: [], subject: '', body: '' };
  for (const pair of query.split('&')) {
    const [k, v = ''] = pair.split('=');
    const key = k.toLowerCase();
    const val = dec(v);
    if (key === 'to') out.to.push(...list(val));
    else if (key === 'cc') out.cc.push(...list(val));
    else if (key === 'bcc') out.bcc.push(...list(val));
    else if (key === 'subject') out.subject = val;
    else if (key === 'body') out.body = val;
  }
  return out;
}

export const mailtoBodyHtml = (body: string) => (body ? body.split(/\r?\n/).map((l) => `<p>${escapeHtml(l) || '<br>'}</p>`).join('') : '');
