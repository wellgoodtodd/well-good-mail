// Making email text safe and readable outside the email itself: for previews in the list, and for what an AI is
// shown. Invisible filler characters go, style code that some mail apps leave where the text should be goes, and
// for the AI, anything the sender hid from view goes too (a common way to slip instructions to an AI).

/** Characters that take up no space: used by marketing emails to pad the preview line, and to hide text. */
const FILLER = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ﻿ﾠ]/g;

export const stripFiller = (s: string) => s.replace(FILLER, '');

/** Drops style rules such as ".x{margin:0}" or "@media (...) { ... }" that sit where text should be. */
export function stripCss(s: string): string {
  if (!/\{[^{}]*:[^{}]*\}/.test(s)) return s;
  let out = s;
  // @media and similar blocks with rules inside them.
  out = out.replace(/@[\w-]+[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ');
  // Plain rules: a selector (no full stops at sentence ends, short) followed by { property: value; }.
  out = out.replace(/(^|[\s}>])([.#]?[\w\-*:,\s\[\]="'>+~()]{1,200})\{[^{}]*:[^{}]*\}/g, '$1 ');
  return out;
}

/** A short, clean preview line. */
export function cleanPreview(s: string, max = 160): string {
  return stripCss(stripFiller(s)).replace(/\s+/g, ' ').trim().slice(0, max);
}

const HIDDEN_STYLE = /(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:\.0+)?(?:px|pt|em|rem|%)?\s*(?:;|$|!)|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$|!)|max-height\s*:\s*0(?:px)?\s*(?:;|$|!)|mso-hide\s*:\s*all|color\s*:\s*transparent)/i;

/** The text a person would actually see in an email: hidden parts, comments, styles and scripts removed. */
export function visibleText(html: string | undefined, text: string | undefined, max = 20000): string {
  if (html && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style, script, head, title, template, noscript, [hidden], [aria-hidden="true"]').forEach((el) => el.remove());
    doc.querySelectorAll('[style]').forEach((el) => { if (HIDDEN_STYLE.test(el.getAttribute('style') || '')) el.remove(); });
    // Keep line breaks between blocks so the text reads naturally.
    doc.querySelectorAll('br, p, div, li, tr, h1, h2, h3, h4, h5, h6').forEach((el) => el.append('\n'));
    const t = (doc.body?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n');
    return stripCss(stripFiller(t)).trim().slice(0, max);
  }
  const source = text || (html || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return stripCss(stripFiller(source)).replace(/[ \t]+/g, ' ').trim().slice(0, max);
}
