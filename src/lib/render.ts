// Making incoming email safe to show: strip scripts, hold back remote images
// until you allow them, block tracking pixels, and spot misleading links.
import DOMPurify from 'dompurify';
import { textToHtml } from './mime';

const TRACKER_HOSTS = [
  'track.', 'tracking.', 'pixel.', 'open.', 'click.', 'mailtrack', 'list-manage.com/track', 'sendgrid.net/wf/open', 'mandrillapp.com/track',
  'mailchimp.com/track', 'hubspotemail', 'hs-analytics', 'google-analytics.com', 'doubleclick.net', 'bit.ly/open', 'emltrk', 'mailgun.org/o',
  'sparkpostmail.com/q', 'getnotify', 'yesware', 'mixmax', 'superhuman.com', 'streak.com',
];

export interface RenderOptions {
  allowRemote: boolean;
  blockTrackers: boolean;
  dark: boolean;
  /** contentId -> data: URL for inline images we already have. */
  inlineImages: Record<string, string>;
  font: string;
  /** Accessibility: underline every link. */
  underlineLinks?: boolean;
}

export interface RenderResult {
  html: string;
  remoteBlocked: number;
  trackersBlocked: number;
  hasRemote: boolean;
}

function isTracker(img: Element): boolean {
  const src = (img.getAttribute('src') || img.getAttribute('data-wgm-src') || '').toLowerCase();
  const w = img.getAttribute('width');
  const h = img.getAttribute('height');
  const style = (img.getAttribute('style') || '').replace(/\s/g, '').toLowerCase();
  const tiny = (w === '1' || w === '0') && (h === '1' || h === '0');
  const hidden = /display:none|width:1px|height:1px|width:0|height:0/.test(style);
  return tiny || hidden || TRACKER_HOSTS.some((t) => src.includes(t));
}

/** Plain text emails mark where a picture went with <name.jpeg> (Apple Mail does this). Put the picture back at that spot. */
function textWithPictures(text: string, pictures: Record<string, string>): string {
  const parts = text.split(/(<[^<>\n]{1,200}\.(?:jpe?g|png|gif|heic|webp)>)/i);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const src = pictures[`name:${part.slice(1, -1)}`];
      if (src) return `<img src="${src}" alt="${part.slice(1, -1).replace(/[<>"&]/g, '')}" style="display:block;max-width:100%;max-height:600px;margin:6px 0;border-radius:6px">`;
    }
    return textToHtml(part);
  }).join('');
}

/** The readable text of an HTML email, used to find <name.jpeg> notes that stand in for pictures. */
export function plainTextOf(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
}

const PICTURE_NOTE = /(<[^<>\n]{1,200}\.(?:jpe?g|png|gif|heic|webp)>)/i;

export function renderEmail(bodyHtml: string | undefined, bodyText: string | undefined, opts: RenderOptions): RenderResult {
  const source = bodyHtml || (bodyText ? `<div style="white-space:pre-wrap">${textWithPictures(bodyText, opts.inlineImages)}</div>` : '<p></p>');
  const clean = DOMPurify.sanitize(source, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta', 'base', 'link'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ADD_ATTR: ['target'],
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');

  // An HTML email can also carry the plain text <name.jpeg> notes (forwards from Apple Mail do). Show the picture there.
  if (bodyHtml && Object.keys(opts.inlineImages).some((k) => k.startsWith('name:'))) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const t = node.nodeValue || '';
      if (!PICTURE_NOTE.test(t)) continue;
      const frag = doc.createDocumentFragment();
      t.split(PICTURE_NOTE).forEach((part, i) => {
        const src = i % 2 === 1 ? opts.inlineImages[`name:${part.slice(1, -1)}`] : undefined;
        if (src) {
          const img = doc.createElement('img');
          img.setAttribute('src', src);
          img.setAttribute('alt', part.slice(1, -1).replace(/[<>"&]/g, ''));
          img.setAttribute('style', 'display:block;max-width:100%;max-height:600px;margin:6px 0;border-radius:6px');
          frag.appendChild(img);
        } else {
          frag.appendChild(doc.createTextNode(part));
        }
      });
      node.parentNode?.replaceChild(frag, node);
    }
  }

  let remoteBlocked = 0;
  let trackersBlocked = 0;
  let hasRemote = false;

  // Anything that would fetch from the internet: "https:", "http:", or an address starting "//" (or backslashes). Read
  // the way the browser reads it, which drops tabs and line breaks anywhere, and spaces or control characters in front.
  const isRemote = (v: string | null) => Boolean(v && /^(?:https?:|[\\/]{2})/i.test(v.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+/, '')));
  const remoteInList = (v: string | null) => Boolean(v && v.split(',').some((part) => isRemote(part.trim())));
  // url(...) and image-set(...) in style that point at the internet, in any quoting.
  const CSS_REMOTE = /url\(\s*(['"]?)\s*(?:https?:|\/\/)[^)]*\)/gi;
  const CSS_IMPORT = /@import[^;]*;?/gi;

  doc.querySelectorAll('img').forEach((img) => {
    const src = (img.getAttribute('src') || '').trim();
    if (!opts.allowRemote && remoteInList(img.getAttribute('srcset'))) { img.setAttribute('data-wgm-srcset', img.getAttribute('srcset') || ''); img.removeAttribute('srcset'); hasRemote = true; }
    if (src.startsWith('cid:')) {
      const data = opts.inlineImages[src.slice(4)];
      if (data) img.setAttribute('src', data);
      else img.setAttribute('data-wgm-cid', src.slice(4));
      return;
    }
    if (!isRemote(src)) return;
    hasRemote = true;
    if (opts.blockTrackers && isTracker(img)) {
      img.remove();
      trackersBlocked++;
      return;
    }
    if (!opts.allowRemote) {
      img.setAttribute('data-wgm-src', src);
      img.removeAttribute('src');
      img.removeAttribute('srcset');
      img.classList.add('wgm-blocked');
      remoteBlocked++;
    }
  });

  // Other ways an email can fetch a picture: <picture> sources, video posters, SVG images, and backgrounds in styles.
  if (!opts.allowRemote) {
    doc.querySelectorAll('source, video, audio, track').forEach((el) => {
      for (const attr of ['src', 'srcset', 'poster']) if (isRemote(el.getAttribute(attr)) || (attr === 'srcset' && remoteInList(el.getAttribute(attr)))) { el.removeAttribute(attr); hasRemote = true; }
    });
    doc.querySelectorAll('image, use, feImage').forEach((el) => {
      for (const attr of ['href', 'xlink:href', 'src']) if (isRemote(el.getAttribute(attr))) { el.removeAttribute(attr); hasRemote = true; }
    });
    doc.querySelectorAll('[style]').forEach((el) => {
      const st = el.getAttribute('style') || '';
      if (CSS_REMOTE.test(st)) { el.setAttribute('style', st.replace(CSS_REMOTE, 'none')); hasRemote = true; }
      CSS_REMOTE.lastIndex = 0;
    });
    doc.querySelectorAll('style').forEach((el) => {
      const css = el.textContent || '';
      const next = css.replace(CSS_IMPORT, '').replace(CSS_REMOTE, 'none');
      if (next !== css) { el.textContent = next; hasRemote = true; }
    });
  }
  doc.querySelectorAll('[background]').forEach((el) => {
    if (!opts.allowRemote) {
      el.removeAttribute('background');
      hasRemote = true;
    }
  });

  // Flag links whose text shows one site but point at another.
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    a.setAttribute('title', href);
    const text = (a.textContent || '').trim();
    const shown = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}/i.exec(text)?.[0];
    try {
      if (shown && /^https?:/i.test(href)) {
        const shownHost = new URL(shown.startsWith('http') ? shown : `https://${shown}`).hostname.replace(/^www\./, '');
        const realHost = new URL(href).hostname.replace(/^www\./, '');
        if (shownHost !== realHost && !realHost.endsWith('.' + shownHost)) {
          a.setAttribute('data-wgm-mismatch', realHost);
        }
      }
    } catch { /* ignore */ }
  });

  const style = `
    <style>
      html { color-scheme: only light; }
      html, body { margin: 0; padding: 0; }
      body { font-family: ${opts.font}, 'Segoe UI', system-ui, sans-serif; font-size: 15px; line-height: 1.55; color: #1d1d1f; background: #ffffff; padding: 14px 16px 24px; overflow-wrap: anywhere; }
      img { max-width: 100%; height: auto; }
      img.wgm-blocked { display: inline-block; min-width: 24px; min-height: 24px; background: repeating-linear-gradient(45deg,#f2f2f4,#f2f2f4 6px,#e9e9ec 6px,#e9e9ec 12px); border-radius: 4px; }
      a { color: #0a66d8; }${opts.underlineLinks ? ' a[href] { text-decoration: underline !important; }' : ''}
      a[data-wgm-mismatch] { outline: 2px solid #e5484d; outline-offset: 1px; border-radius: 2px; }
      blockquote { margin: 0 0 0 .8ex; border-left: 2px solid #c8c8cc; padding-left: 1ex; color: #555; }
      pre { white-space: pre-wrap; }
      table { max-width: 100% !important; }
      ${opts.dark ? `
      html { filter: invert(0.92) hue-rotate(180deg); background: #fff; }
      img, video, picture, [style*="background-image"] { filter: invert(1) hue-rotate(180deg); }
      ` : ''}
    </style>`;
  const head = doc.head.innerHTML;
  // While pictures are held back, the frame itself refuses anything from the internet, so nothing the checks above
  // miss (escaped addresses in styles, odd attributes) can fetch a picture and tell the sender the email was opened.
  const noRemote = opts.allowRemote ? '' : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; font-src 'self' data:">`;
  const html = `<!doctype html><html><head><meta charset="utf-8">${noRemote}<meta name="referrer" content="no-referrer"><meta name="color-scheme" content="only light">${style}${head}</head><body>${doc.body.innerHTML}</body></html>`;
  return { html, remoteBlocked, trackersBlocked, hasRemote };
}
