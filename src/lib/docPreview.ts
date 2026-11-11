// A Word document turned into a page for the preview window. Read on this computer with mammoth: text, headings,
// lists, tables and pictures. The result is cleaned with DOMPurify and shown in a sandboxed frame with no scripts,
// the same care as email.
import DOMPurify from 'dompurify';

const STYLE = `<style>
html{background:#fff;color:#1f1f1f}
body{margin:0;padding:36px 44px;font:15px/1.5 Calibri,Carlito,'Segoe UI',Arial,sans-serif;max-width:760px}
h1,h2,h3,h4{line-height:1.25;margin:1.1em 0 .4em}
p{margin:0 0 .7em}
img{max-width:100%;height:auto}
table{border-collapse:collapse;margin:.6em 0}
td,th{border:1px solid #c8c8c8;padding:4px 8px;vertical-align:top}
a{color:#1a5fb4;text-decoration:underline;pointer-events:none}
</style>`;

export async function docxToHtml(data: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth');
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const clean = DOMPurify.sanitize(value, { FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input'], FORBID_ATTR: ['style'] });
  return `<!doctype html><html><head><meta charset="utf-8">${STYLE}</head><body>${clean || '<p style="color:#777">This document has no text to show.</p>'}</body></html>`;
}
