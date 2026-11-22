// Helpers for the Unsubscribe button: the links in the List-Unsubscribe header, the unsubscribe link in the email
// itself (meant for people, so it opens a proper page), and whether a page the app fetched has anything on it.

/** The https and mailto links in a List-Unsubscribe header. */
export function headerLinks(header: string): { https?: string; mailto?: string } {
  const links = [...header.matchAll(/<([^>]+)>/g)].map((x) => x[1].trim());
  return { https: links.find((l) => /^https:\/\//i.test(l)), mailto: links.find((l) => /^mailto:/i.test(l)) };
}

const WORDS = /unsubscribe|opt[\s-]?out|email preferences|manage (your )?(email )?(preferences|subscription)|stop (receiving|these)/i;

/** The unsubscribe link written in the email's own text, if there is one (an https link whose words or address say so). */
export function bodyUnsubscribeLink(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let byAddress: string | undefined;
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = (a.getAttribute('href') || '').trim();
    if (!/^https:\/\//i.test(href)) continue;
    if (WORDS.test(a.textContent || '') || WORDS.test(a.getAttribute('title') || '')) return href;
    if (!byAddress && /unsub|optout|opt-out/i.test(href)) byAddress = href;
  }
  return byAddress;
}

/** True when a fetched page has no words or form on it, which is how some senders confirm an unsubscribe. */
export function pageIsBlank(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, template').forEach((n) => n.remove());
  if (doc.querySelector('form, button, input, iframe')) return false;
  if (doc.querySelector('meta[http-equiv="refresh" i]')) return false;
  if (html.includes('<script')) {
    // A page built by its scripts looks empty to us but isn't: show it.
    const raw = new DOMParser().parseFromString(html, 'text/html');
    if (raw.querySelector('script[src]')) return false;
  }
  return (doc.body?.textContent || '').replace(/\s+/g, '').length === 0;
}
