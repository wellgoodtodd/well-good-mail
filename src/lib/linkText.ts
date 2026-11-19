// Helpers for the Add link box: telling whether some text is an address, and a tidy way to show one.

/** The link some text stands for, if it looks like a web address, an email address or a phone link; otherwise null. */
export function asHref(text: string): string | null {
  const s = text.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^(https?:\/\/|mailto:|tel:)\S+/i.test(s)) return s;
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) return `mailto:${s}`;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(s)) return `https://${s}`;
  return null;
}

/** What is typed in the Link box, made into a full address (https:// added when it has none). */
export function fullHref(typed: string): string {
  const s = typed.trim();
  return asHref(s) || (/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
}

/** A link shown as text: no https://, www. or end slash, and an email address without mailto:. */
export function linkLabel(href: string): string {
  return href.trim()
    .replace(/^mailto:/i, '')
    .replace(/^tel:/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}
