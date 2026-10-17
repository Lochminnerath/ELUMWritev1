import type { Editor } from '@tiptap/core';
import { DOMSerializer, Node as PMNode } from '@tiptap/pm/model';
import type { DocNode, ElumApi } from '../api';
import { COMMENT_MARK, isAssetRef, stripMarks } from '../api/content';
import { findFont } from './fonts';

function fileName(title: string, ext: string) {
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled document';
  return `${base}.${ext}`;
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Copies the document with Write-stored images embedded as data URLs, so the file stands alone. */
async function embedLocalImages(node: DocNode, api: ElumApi): Promise<DocNode> {
  const src = node.attrs?.src;
  if (node.type === 'image' && isAssetRef(src)) {
    try {
      return { ...node, attrs: { ...node.attrs, src: await blobToDataUrl(await api.fetchAsset(src)) } };
    } catch {
      return node;
    }
  }
  if (!node.content) return node;
  return { ...node, content: await Promise.all(node.content.map((c) => embedLocalImages(c, api))) };
}

function usedFonts(node: DocNode, into = new Set<string>()): Set<string> {
  node.marks?.forEach((m) => {
    const family = m.type === 'textStyle' ? m.attrs?.fontFamily : undefined;
    if (typeof family === 'string') into.add(family);
  });
  node.content?.forEach((c) => usedFonts(c, into));
  return into;
}

const EXPORT_CSS = `
body { margin: 0; background: #f4f5f8; color: #141a2e; }
article { box-sizing: border-box; max-width: 8.5in; margin: 32px auto; padding: 1in; background: #fff;
  font: 12pt/1.5 Manrope, "Helvetica Neue", system-ui, sans-serif; white-space: pre-wrap; tab-size: 0.5in; }
article::after { content: ""; display: block; clear: both; }
h1 { font: 300 28pt/1.2 Sora, "Avenir Next", system-ui, sans-serif; margin: 0 0 10pt; }
h2 { font: 400 18pt/1.3 Sora, "Avenir Next", system-ui, sans-serif; margin: 18pt 0 6pt; }
h3 { font-weight: 600; font-size: 14pt; margin: 14pt 0 4pt; }
h4 { font-weight: 600; font-size: 12pt; margin: 12pt 0 4pt; color: #5a6178; }
p { margin: 0 0 6pt; }
ul[data-type="taskList"] { list-style: none; padding-left: 4pt; }
ul[data-type="taskList"] li { display: flex; gap: 8px; }
blockquote { margin: 8pt 0; padding-left: 14pt; border-left: 3px solid #f8c79f; color: #5a6178; }
code { font-family: "IBM Plex Mono", monospace; background: #f4f5f8; padding: 1px 4px; border-radius: 4px; }
img { max-width: 100%; height: auto; vertical-align: bottom; }
img[data-wrap="wrap"][data-align="left"] { float: left; margin: 4px 18px 8px 0; }
img[data-wrap="wrap"][data-align="right"] { float: right; margin: 4px 0 8px 18px; }
img[data-wrap="break"] { display: block; margin: 8px 0; }
img[data-wrap="break"][data-align="center"] { margin-left: auto; margin-right: auto; }
img[data-wrap="break"][data-align="right"] { margin-left: auto; }
a { color: #3b5bd6; }
@media print { body { background: #fff; } article { margin: 0; padding: 0; max-width: none; } }
`;

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** A standalone web page of the document, with images embedded. */
export async function downloadHtml(editor: Editor, title: string, api: ElumApi) {
  const json = await embedLocalImages(stripMarks(editor.getJSON() as DocNode, COMMENT_MARK), api);
  const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(PMNode.fromJSON(editor.schema, json).content);
  const container = document.createElement('div');
  container.appendChild(fragment);

  const families = ['Manrope', 'Sora'];
  usedFonts(json).forEach((stack) => {
    const font = findFont(stack);
    if (font?.source.kind === 'google') families.push(font.source.family);
  });
  const fontLink = `https://fonts.googleapis.com/css2?${[...new Set(families)].map((f) => `family=${f.replace(/ /g, '+')}`).join('&')}&display=swap`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${fontLink}">
<style>${EXPORT_CSS}</style>
</head>
<body>
<article>${container.innerHTML}</article>
</body>
</html>
`;
  saveFile(new Blob([html], { type: 'text/html;charset=utf-8' }), fileName(title, 'html'));
}

export function downloadText(editor: Editor, title: string) {
  const text = editor.getText({ blockSeparator: '\n\n' });
  saveFile(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName(title, 'txt'));
}

export interface Counts {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
}

export function countText(text: string, paragraphs: number): Counts {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { words, characters: text.length, charactersNoSpaces: text.replace(/\s/g, '').length, paragraphs };
}

/** Counts for the selection when there is one, otherwise the whole document. */
export function countDocument(editor: Editor): { counts: Counts; selection: boolean } {
  const { from, to, empty } = editor.state.selection;
  const start = empty ? 0 : from;
  const end = empty ? editor.state.doc.content.size : to;
  let paragraphs = 0;
  editor.state.doc.nodesBetween(start, end, (node) => {
    if (node.isTextblock) {
      if (node.textContent.trim()) paragraphs++;
      return false;
    }
    return true;
  });
  const text = editor.state.doc.textBetween(start, end, '\n', ' ');
  return { counts: countText(text, paragraphs), selection: !empty };
}
