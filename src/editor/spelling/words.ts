import type { Node as PMNode } from '@tiptap/pm/model';

export interface SpellWord {
  /** The word as checked (curly apostrophes made straight). */
  word: string;
  from: number;
  to: number;
}

const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;
const CHUNK = /\S+/g;
const LOOKS_LIKE_ADDRESS = /@|:\/\/|^www\.|\.(com|org|net|io|dev|app|co)\b/i;
const SKIP_MARKS = new Set(['code', 'link']);

/**
 * Every word worth checking, with its position. Leaves out code, links, web and
 * email addresses, words joined to digits, ACRONYMS and mixedCase names.
 */
export function findWords(doc: PMNode): SpellWord[] {
  const out: SpellWord[] = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false;
    if (!node.isTextblock) return true;
    // Generated works cited and reference lists are names and titles, not prose.
    if (node.attrs.citation) return false;
    let text = '';
    const skip: [number, number][] = [];
    node.forEach((child) => {
      if (child.isText) {
        const start = text.length;
        text += child.text;
        if (child.marks.some((m) => SKIP_MARKS.has(m.type.name))) skip.push([start, text.length]);
      } else {
        // Inline images and line breaks take one position each.
        text += ' ';
      }
    });
    for (const chunk of text.matchAll(CHUNK)) {
      if (LOOKS_LIKE_ADDRESS.test(chunk[0])) skip.push([chunk.index, chunk.index + chunk[0].length]);
    }
    for (const m of text.matchAll(WORD)) {
      const start = m.index;
      const end = start + m[0].length;
      const word = m[0];
      if (word.length < 2) continue;
      if (/[\d_]/.test(text[start - 1] ?? '') || /[\d_]/.test(text[end] ?? '')) continue;
      if (word === word.toUpperCase()) continue;
      if (/\p{Lu}/u.test(word.slice(1))) continue;
      if (skip.some(([a, b]) => start < b && end > a)) continue;
      out.push({ word: word.replace(/’/g, "'"), from: pos + 1 + start, to: pos + 1 + end });
    }
    return false;
  });
  return out;
}
