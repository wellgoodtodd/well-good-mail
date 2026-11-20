// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../../components/editorExtensions';

// The editor finishes opening a moment after it is made.
const open = async (content: string) => { const ed = new Editor({ extensions: editorExtensions(), content }); await new Promise((r) => setTimeout(r, 0)); return ed; };

describe('web addresses become links', async () => {
  it('links addresses already in the text when the editor opens', async () => {
    const ed = await open('<p>The cut is at https://frame.example/v/123 and www.bbc.co.uk too.</p>');
    const html = ed.getHTML();
    expect(html).toContain('<a href="https://frame.example/v/123">https://frame.example/v/123</a>');
    expect(html).toContain('<a href="http://www.bbc.co.uk">www.bbc.co.uk</a>');
    ed.destroy();
  });

  it('leaves existing links and plain words alone', async () => {
    const ed = await open('<p><a href="https://a.example">see here</a> and nothing else.</p>');
    expect(ed.getHTML()).toBe('<p><a href="https://a.example">see here</a> and nothing else.</p>');
    ed.destroy();
  });

  it('links addresses put in later by the app, without adding to Undo', async () => {
    const ed = await open('<p>Hi</p>');
    ed.commands.setContent('<p>Link: https://b.example/x</p>', { emitUpdate: false });
    expect(ed.getHTML()).toContain('<a href="https://b.example/x">');
    ed.destroy();
  });
});
