// Rich text editor setup shared by the composer and the signature editor.
import { Extension, type Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { TextStyle, Color, FontFamily } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { find as findLinks } from 'linkifyjs';

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

/** The writing shortcuts every editor shares (email, AI Drafts, signatures, Out of Office): Ctrl+K for a link, Tab and Shift+Tab to indent. */
const WritingKeys = Extension.create({
  name: 'writingKeys',
  addKeyboardShortcuts() {
    return {
      // Loaded when used, so this file stays free of the toolbar and its dialogs.
      'Mod-k': () => { void import('./FormatBar').then((m) => m.promptLink(this.editor)); return true; },
      Tab: () => { changeIndent(this.editor, 1); return true; },
      'Shift-Tab': () => { changeIndent(this.editor, -1); return true; },
    };
  },
});

/**
 * Web addresses already in the text become links: in an AI draft, a reply or forward, a saved draft or a signature.
 * Typing or pasting one is handled by the Link extension itself. Returns null when there is nothing to link.
 */
export function linkifyState(state: EditorState): Transaction | null {
  const link = state.schema.marks.link;
  if (!link) return null;
  const tr = state.tr;
  state.doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text || parent?.type.spec.code || node.marks.some((m) => m.type === link || m.type.spec.code)) return;
    for (const hit of findLinks(node.text)) {
      if (hit.type !== 'url' || !hit.isLink) continue;
      tr.addMark(pos + hit.start, pos + hit.end, link.create({ href: hit.href }));
    }
  });
  if (!tr.docChanged) return null;
  // Not an edit of yours: it doesn't count as a change to the draft or go into Undo.
  return tr.setMeta('addToHistory', false).setMeta('preventUpdate', true);
}

/** Runs linkifyState when the editor opens and whenever the app (not your typing) puts new text in it. */
const LinkAddresses = Extension.create({
  name: 'linkAddresses',
  onCreate() {
    const tr = linkifyState(this.editor.state);
    if (tr) this.editor.view.dispatch(tr);
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('linkAddresses'),
      appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged && t.getMeta('preventUpdate') && !t.getMeta('linkAddresses')) ? linkifyState(state)?.setMeta('linkAddresses', true) ?? null : null),
    })];
  },
});

/**
 * A click on the space around the text puts the cursor at the end. Not after a drag that selected text and let go
 * outside the text (at the window's edge, say): that click lands on the space too, and would lose the selection.
 */
let pressedOn: EventTarget | null = null;
if (typeof document !== 'undefined') document.addEventListener('mousedown', (e) => { pressedOn = e.target; }, true);

export function clickSpaceToWrite(editor: Editor | null) {
  return (e: { target: EventTarget; currentTarget: EventTarget }) => {
    // Pressed and let go on the space itself, not a drag that started in the text.
    if (e.target !== e.currentTarget || pressedOn !== e.currentTarget || !editor) return;
    editor.commands.focus('end');
  };
}

export function editorExtensions(placeholder = 'Write your email...') {
  return [
    // Tiptap 3's StarterKit brings Underline and Link itself. Its new list keys and trailing paragraph stay off, so the editor behaves as it did on Tiptap 2.
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: null, target: null } },
      listKeymap: false,
      trailingNode: false,
    }),
    // Tiptap 2 kept nested span styles apart; keep it that way.
    TextStyle.configure({ mergeNestedSpanStyles: false }),
    Color,
    FontSize,
    FontFamily,
    Highlight.configure({ multicolor: true }),
    Image.configure({ inline: true, allowBase64: true }),
    Placeholder.configure({ placeholder }),
    Indent,
    WritingKeys,
    LinkAddresses,
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
