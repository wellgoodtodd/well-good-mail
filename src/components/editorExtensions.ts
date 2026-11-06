// Rich text editor setup shared by the composer and the signature editor.
import { Extension, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

/** Font size as a text style (e.g. "14pt"). */
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
            renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
          },
        },
      },
    ];
  },
});

/** Paragraph indent levels, sent as margin-left so every mail app shows them. */
const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Math.round((parseInt((el as HTMLElement).style.marginLeft, 10) || 0) / 40),
            renderHTML: (attrs) => (attrs.indent ? { style: `margin-left: ${attrs.indent * 40}px` } : {}),
          },
        },
      },
    ];
  },
});

export function editorExtensions(placeholder = 'Write your email...') {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: null, target: null } }),
    TextStyle,
    Color,
    FontSize,
    FontFamily,
    Highlight.configure({ multicolor: true }),
    Image.configure({ inline: true, allowBase64: true }),
    Placeholder.configure({ placeholder }),
    Indent,
  ];
}

export function changeIndent(editor: Editor, delta: 1 | -1) {
  if (editor.isActive('listItem')) {
    if (delta > 0) editor.chain().focus().sinkListItem('listItem').run();
    else editor.chain().focus().liftListItem('listItem').run();
    return;
  }
  const type = editor.isActive('heading') ? 'heading' : 'paragraph';
  const current = (editor.getAttributes(type).indent as number) || 0;
  editor.chain().focus().updateAttributes(type, { indent: Math.max(0, Math.min(8, current + delta)) }).run();
}

export function setFontSize(editor: Editor, size: string | null) {
  if (!size) editor.chain().focus().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
  else editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
}

export const FONT_CHOICES = ['Rubik', 'Inter', 'Arial', 'Calibri', 'Georgia', 'Segoe UI', 'Times New Roman', 'Verdana'];
export const SIZE_CHOICES = ['9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '24pt', '32pt'];

const BLOCK_TAGS = 'p,div,table,tbody,thead,tfoot,tr,td,th,ul,ol,li,blockquote,h1,h2,h3,pre,hr';

/** Gmail signatures are built from divs and tables, which the editor would run together on one line. Turn them into plain paragraphs first. */
export function tidyForEditor(html: string): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blockish = (el: Element) =>
    ['DIV', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TD', 'TH'].includes(el.tagName) || /display\s*:\s*(block|flex|table)/i.test(el.getAttribute('style') || '');
  // Innermost first, so a div that only holds other blocks can simply be unwrapped.
  for (const el of Array.from(doc.body.querySelectorAll('*')).filter(blockish).reverse()) {
    if (el.querySelector(BLOCK_TAGS)) {
      el.replaceWith(...Array.from(el.childNodes));
    } else {
      const p = doc.createElement('p');
      p.append(...Array.from(el.childNodes));
      el.replaceWith(p);
    }
  }
  return doc.body.innerHTML;
}
