// The formatting toolbar: fonts, sizes, styles, lists, indents, quote, link.
import type { MenuItem } from './ui';
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

  // Font and size: the box opens the list, the little arrows step to the one before or after.
  const setFont = (v: string) => (v ? editor.chain().focus().setFontFamily(v).run() : editor.chain().focus().unsetFontFamily().run());
  const fontValues = ['', ...FONT_CHOICES.filter((f) => f !== defaultFont)];
  const fontNow = (ts.fontFamily as string) || '';
  // Sizes run smallest to largest, with the default ('') in its place, so up is bigger.
  const sizeValues = [...new Set([...SIZE_CHOICES, `${defaultSize}pt`])].sort((a, b) => parseFloat(a) - parseFloat(b)).map((v) => (v === `${defaultSize}pt` ? '' : v));
  const sizeNow = (ts.fontSize as string) || '';
  const step = (list: string[], now: string, by: 1 | -1, apply: (v: string) => void) => {
    const i = Math.max(0, list.indexOf(now));
    const next = list[Math.max(0, Math.min(list.length - 1, i + by))];
    if (next !== now) apply(next);
  };
  const stepper = (up: () => void, down: () => void, upLabel: string, downLabel: string, children: React.ReactNode) => (
    <span className="fmt-pick">
      {children}
      <span className="fmt-pick-arrows">
        <button type="button" tabIndex={-1} aria-label={upLabel} title={upLabel} onMouseDown={(e) => e.preventDefault()} onClick={up}><Icon name="chevronDown" size={10} strokeWidth={2.5} className="rot180" /></button>
        <button type="button" tabIndex={-1} aria-label={downLabel} title={downLabel} onMouseDown={(e) => e.preventDefault()} onClick={down}><Icon name="chevronDown" size={10} strokeWidth={2.5} /></button>
      </span>
    </span>
  );

  return (
    <div className="fmt-bar" role="toolbar" aria-label="Formatting">
      {stepper(() => step(fontValues, fontNow, -1, setFont), () => step(fontValues, fontNow, 1, setFont), 'Previous font', 'Next font',
        <select aria-label="Font" value={fontNow} onChange={(e) => setFont(e.target.value)}>
          <option value="">{defaultFont}</option>
          {FONT_CHOICES.filter((f) => f !== defaultFont).map((f) => <option key={f} value={f}>{f}</option>)}
        </select>)}
      {stepper(() => step(sizeValues, sizeNow, 1, (v) => setFontSize(editor, v || null)), () => step(sizeValues, sizeNow, -1, (v) => setFontSize(editor, v || null)), 'Bigger', 'Smaller',
        <select aria-label="Size" value={sizeNow} onChange={(e) => setFontSize(editor, e.target.value || null)}>
          <option value="">{defaultSize}pt</option>
          {SIZE_CHOICES.filter((s) => s !== `${defaultSize}pt`).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>)}
      <span className="sep" />
      {btn(null, 'Bold (Ctrl+B)', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <b>B</b>)}
      {btn(null, 'Italic (Ctrl+I)', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <i>I</i>)}
      {btn(null, 'Underline (Ctrl+U)', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <u>U</u>)}
      {btn(null, 'Strikethrough', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <s>S</s>)}
      <span className="sep" />
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
      <span className="sep" />
      {btn('link', 'Link (Ctrl+K)', editor.isActive('link'), () => promptLink(editor))}
      {btn('eraser', 'Clear formatting', false, () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
      {extra}
      {end && <><span className="fmt-grow" />{end}</>}
    </div>
  );
}

/** Pastes what was copied, keeping its formatting, through the editor's usual paste tidying. */
async function pasteRich(editor: Editor) {
  editor.commands.focus();
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      if (it.types.includes('text/html')) { editor.view.pasteHTML(await (await it.getType('text/html')).text()); return; }
    }
    for (const it of items) {
      if (it.types.includes('text/plain')) { editor.view.pasteText(await (await it.getType('text/plain')).text()); return; }
    }
  } catch {
    const text = await navigator.clipboard.readText().catch(() => '');
    if (text) editor.view.pasteText(text);
  }
}

/** Pastes as plain text, in your own writing font. */
async function pastePlain(editor: Editor) {
  editor.commands.focus();
  const text = await navigator.clipboard.readText().catch(() => '');
  if (text) editor.view.pasteText(text);
}

/** The right-click menu in a message: cut, copy, the three ways to paste, quote, and link. */
export function editorMenuItems(editor: Editor): MenuItem[] {
  const picked = !editor.state.selection.empty;
  return [
    { label: 'Cut', icon: 'eraser', kbd: 'Ctrl+X', disabled: !picked, onClick: () => { editor.commands.focus(); document.execCommand('cut'); } },
    { label: 'Copy', icon: 'file', kbd: 'Ctrl+C', disabled: !picked, onClick: () => { editor.commands.focus(); document.execCommand('copy'); } },
    { label: 'Paste', icon: 'template', kbd: 'Ctrl+V', onClick: () => void pasteRich(editor) },
    { label: 'Paste without formatting', icon: 'template', kbd: 'Ctrl+Shift+V', onClick: () => void pastePlain(editor) },
    { label: 'Paste as quote', icon: 'quote', onClick: () => void pasteAsQuote(editor) },
    { divider: true },
    { label: editor.isActive('blockquote') ? 'Remove quote' : picked ? 'Quote the selected text' : 'Quote this paragraph', icon: 'quote', onClick: () => editor.chain().focus().toggleBlockquote().run() },
    { label: editor.isActive('link') ? 'Edit link...' : 'Add link...', icon: 'link', kbd: 'Ctrl+K', onClick: () => promptLink(editor) },
    { label: 'Clear formatting', icon: 'eraser', disabled: !picked, onClick: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
  ];
}

/**
 * The right-click menu in a message, with spelling first: when the word under the pointer is misspelt, its
 * suggestions (click one to swap it in) and Add to dictionary, then the usual cut, copy and paste.
 */
export async function editorMenuWithSpelling(editor: Editor, x: number, y: number): Promise<MenuItem[]> {
  const rest = editorMenuItems(editor);
  const at = editor.view.posAtCoords({ left: x, top: y });
  if (!at) return rest;
  const $p = editor.state.doc.resolve(at.pos);
  const text = $p.parent.textContent;
  const offset = $p.parentOffset;
  const isWord = (ch: string | undefined) => !!ch && /[\p{L}'’-]/u.test(ch);
  let s = offset;
  let e = offset;
  while (s > 0 && isWord(text[s - 1])) s--;
  while (e < text.length && isWord(text[e])) e++;
  const word = text.slice(s, e).replace(/^['’-]+|['’-]+$/g, '');
  if (!word) return rest;
  const lead = text.slice(s, e).indexOf(word);
  const from = at.pos - (offset - s) + lead;
  const to = from + word.length;
  // Only when the positions really hold that word (pictures or line breaks in the paragraph can shift them).
  if (editor.state.doc.textBetween(from, to) !== word) return rest;
  const { suggestFor, addToDictionary } = await import('../lib/spell');
  const suggestions = await suggestFor(word);
  if (!suggestions) return rest;
  return [
    ...(suggestions.length
      ? suggestions.map((sug) => ({ label: sug, icon: 'check' as const, onClick: () => editor.chain().focus().insertContentAt({ from, to }, sug).run() }))
      : [{ label: 'No suggestions', disabled: true }]),
    { label: `Add "${word}" to dictionary`, icon: 'plus', onClick: () => addToDictionary(word) },
    { divider: true },
    ...rest,
  ];
}
