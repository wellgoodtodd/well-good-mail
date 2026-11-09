// Making email text safe and readable outside the email itself: for previews in the list, and for what an AI is
// shown. Invisible filler characters go, style code that some mail apps leave where the text should be goes, and
// for the AI, anything the sender hid from view goes too (a common way to slip instructions to an AI).

/** Characters that take up no space: used by marketing emails to pad the preview line, and to hide text. */
const FILLER = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ﻿ﾠ]/g;

/** Invisible characters an AI can still read: Unicode "tag" letters, variation selectors and direction controls. */
const INVISIBLE = /[\u{E0000}-\u{E007F}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}\u{2066}-\u{2069}\u{202A}-\u{202E}\u{200B}-\u{200F}\u{2060}-\u{2064}]/gu;

export const stripFiller = (s: string) => s.replace(FILLER, '').replace(INVISIBLE, '');

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

const HIDDEN_STYLE = /(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*(?:0(?:\.\d+)?|1(?:\.0+)?)(?:px|pt)?\s*(?:;|$|!)|font-size\s*:\s*0(?:\.\d+)?(?:em|rem|%)\s*(?:;|$|!)|opacity\s*:\s*0(?:\.0\d*)?\s*(?:;|$|!)|max-(?:height|width)\s*:\s*0(?:px)?\s*(?:;|$|!)|(?:^|;)\s*(?:height|width)\s*:\s*0(?:px)?\s*(?:;|$|!)|line-height\s*:\s*0(?:px)?\s*(?:;|$|!)|mso-hide\s*:\s*all|color\s*:\s*transparent|text-indent\s*:\s*-\d{3,}|(?:left|top|margin-left|margin-top)\s*:\s*-\d{3,}px|clip\s*:\s*rect\(\s*0|clip-path\s*:\s*inset\(\s*(?:50|100)%|transform\s*:\s*scale\(\s*0(?:\.0+)?\s*\))/i;
/** White (or nearly) text that also sits on white: invisible on screen. */
const WHITE_ON_WHITE = (style: string) => /(?:^|;)\s*color\s*:\s*(?:#f{3}\b|#f{6}\b|white\b|rgb\(\s*25[0-5]\s*,\s*25[0-5]\s*,\s*25[0-5]\s*\))/i.test(style) && (/background(?:-color)?\s*:\s*(?:#f{3}\b|#f{6}\b|white\b)/i.test(style) || !/background/i.test(style));

/** The text a person would actually see in an email: hidden parts, comments, styles and scripts removed. */
export function visibleText(html: string | undefined, text: string | undefined, max = 20000): string {
  if (html && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Rules in the email's own style sheet that hide things (".x { display: none }") are applied first, so the
    // text they hide doesn't reach the AI just because the style sheet is removed.
    doc.querySelectorAll('style').forEach((st) => {
      const css = (st.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
        const decl = m[2];
        if (!HIDDEN_STYLE.test(decl) && !WHITE_ON_WHITE(decl)) continue;
        for (const sel of m[1].split(',')) { try { doc.querySelectorAll(sel.trim()).forEach((el) => el.remove()); } catch { /* not a selector we can use */ } }
      }
    });
    doc.querySelectorAll('style, script, head, title, template, noscript, [hidden]').forEach((el) => el.remove());
    doc.querySelectorAll('[style]').forEach((el) => { const st = el.getAttribute('style') || ''; if (HIDDEN_STYLE.test(st) || WHITE_ON_WHITE(st)) el.remove(); });
    doc.querySelectorAll('font[color]').forEach((el) => { if (/^(?:#f{3}|#f{6}|white)$/i.test((el.getAttribute('color') || '').trim())) el.remove(); });
    // Pictures carry the message in many sale emails: keep what they say, but not from tiny ones (tracking dots), and not too much.
    let altLeft = 600;
    doc.querySelectorAll('img').forEach((img) => {
      const alt = (img.getAttribute('alt') || '').trim();
      const w = Number(img.getAttribute('width')) || 0;
      const h = Number(img.getAttribute('height')) || 0;
      const tiny = (w && w < 40) || (h && h < 40);
      if (alt.length > 1 && !tiny && altLeft > 0) { const said = alt.slice(0, Math.min(150, altLeft)); altLeft -= said.length; img.replaceWith(doc.createTextNode(` [Picture: ${said}] `)); }
      else img.remove();
    });
    // Keep line breaks between blocks so the text reads naturally.
    doc.querySelectorAll('br, p, div, li, tr, h1, h2, h3, h4, h5, h6').forEach((el) => el.append('\n'));
    const t = (doc.body?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n');
    return stripCss(stripFiller(t)).trim().slice(0, max);
  }
  const source = text || (html || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return stripCss(stripFiller(source)).replace(/[ \t]+/g, ' ').trim().slice(0, max);
}
