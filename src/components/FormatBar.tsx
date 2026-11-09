// The formatting toolbar: fonts, sizes, styles, lists, indents, quote, link.
import { useEffect, useReducer } from 'react';
import type { Editor } from '@tiptap/core';
import { Icon, type IconName } from './Icon';
import { changeIndent, setFontSize, FONT_CHOICES, SIZE_CHOICES } from './editorExtensions';
import { escapeHtml, textToHtml } from '../lib/mime';
import { askText } from '../lib/dialogs';

export async function promptLink(editor: Editor) {
  const prev = editor.getAttributes('link').href as string | undefined;
  const url = await askText('Link address', prev || 'https://', 'Add link');
  if (url === null) return;
  if (!url || url === 'https://') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
  if (editor.state.selection.empty) {
    editor.chain().focus().insertContent(`<a href="${escapeHtml(href)}">${escapeHtml(url)}</a> `).run();
  } else {
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }
}

export async function pasteAsQuote(editor: Editor) {
  try {
    const text = await navigator.clipboard.readText();
    if (text) editor.chain().focus().insertContent(`<blockquote><p>${textToHtml(text)}</p></blockquote><p></p>`).run();
  } catch {
    editor.chain().focus().toggleBlockquote().run();
  }
}

export function FormatBar({ editor, extra, end, basic, defaultFont, defaultSize }: { editor: Editor | null; extra?: React.ReactNode; end?: React.ReactNode; basic?: boolean; defaultFont: string; defaultSize: number }) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', rerender);
    editor.on('transaction', rerender);
    return () => {
      editor.off('selectionUpdate', rerender);
      editor.off('transaction', rerender);
    };
  }, [editor]);
  if (!editor) return <div className="fmt-bar" />;

  const btn = (icon: IconName | null, label: string, on: boolean, run: () => void, text?: React.ReactNode) => (
    <button type="button" className={`icon-btn ${on ? 'on' : ''}`} title={label} aria-label={label} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {icon ? <Icon name={icon} size={15} /> : text}
    </button>
  );
  const ts = editor.getAttributes('textStyle');

  if (basic) {
    // Cards: just the everyday ones.
    return (
      <div className="fmt-bar basic" role="toolbar" aria-label="Formatting">
        {btn(null, 'Bold (Ctrl+B)', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <b>B</b>)}
        {btn(null, 'Italic (Ctrl+I)', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <i>I</i>)}
        {btn(null, 'Underline (Ctrl+U)', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <u>U</u>)}
        <span className="sep" />
        {btn('list', 'Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run())}
        {btn('listOrdered', 'Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
        {btn('link', 'Link (Ctrl+K)', editor.isActive('link'), () => promptLink(editor))}
        {btn('eraser', 'Clear formatting', false, () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
        {end && <><span className="fmt-grow" />{end}</>}
      </div>
    );
  }

  return (
    <div className="fmt-bar" role="toolbar" aria-label="Formatting">
      <select aria-label="Font" value={(ts.fontFamily as string) || ''} onChange={(e) => (e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run())}>
        <option value="">{defaultFont}</option>
        {FONT_CHOICES.filter((f) => f !== defaultFont).map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select aria-label="Size" value={(ts.fontSize as string) || ''} onChange={(e) => setFontSize(editor, e.target.value || null)}>
        <option value="">{defaultSize}pt</option>
        {SIZE_CHOICES.filter((s) => s !== `${defaultSize}pt`).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <span className="sep" />
      {btn(null, 'Bold (Ctrl+B)', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <b>B</b>)}
      {btn(null, 'Italic (Ctrl+I)', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <i>I</i>)}
      {btn(null, 'Underline (Ctrl+U)', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <u>U</u>)}
      {btn(null, 'Strikethrough', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <s>S</s>)}
      <label className="icon-btn" title="Text colour" style={{ position: 'relative' }}>
        <span style={{ fontWeight: 700, borderBottom: `3px solid ${(ts.color as string) || 'currentColor'}`, lineHeight: 1 }}>A</span>
        <input type="color" aria-label="Text colour" style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }} onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} />
      </label>
      <label className="icon-btn" title="Highlight" style={{ position: 'relative' }}>
        <span style={{ background: '#fde68a', color: '#1d1d1f', padding: '0 3px', borderRadius: 2, fontWeight: 700, lineHeight: 1.2 }}>H</span>
        <input type="color" defaultValue="#fde68a" aria-label="Highlight colour" style={{ position: 'absolute', opacity: 0, inset: 0, cursor: 'pointer' }} onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
      </label>
      <span className="sep" />
      {btn('list', 'Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run())}
      {btn('listOrdered', 'Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
      {btn('outdent', 'Decrease indent (Shift+Tab)', false, () => changeIndent(editor, -1))}
      {btn('indent', 'Increase indent (Tab)', false, () => changeIndent(editor, 1))}
      {btn('quote', 'Quote block', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run())}
      {btn('link', 'Link (Ctrl+K)', editor.isActive('link'), () => promptLink(editor))}
      {btn('eraser', 'Clear formatting', false, () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
      {extra}
      {end && <><span className="fmt-grow" />{end}</>}
    </div>
  );
}
