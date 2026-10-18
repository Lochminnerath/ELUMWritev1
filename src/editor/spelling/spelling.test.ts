import { Editor } from '@tiptap/core';
import NSpell from 'nspell';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { DocNode } from '../../api/types';
import { buildExtensions } from '../extensions';
import { hexToHsv, hsvToHex, normalizeHex } from '../toolbar/colorMath';
import { editDistance, rankSuggestions } from './rank';
import { findWords } from './words';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function words(content: DocNode['content']) {
  editor = new Editor({ element: document.createElement('div'), extensions: buildExtensions(), content: { type: 'doc', content } });
  return findWords(editor.state.doc);
}

const text = (t: string, marks?: DocNode['marks']): DocNode => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });

describe('finding words to check', () => {
  it('finds words with their exact positions', () => {
    const found = words([{ type: 'paragraph', content: [text('Teh cat’s hat')] }]);
    expect(found.map((w) => w.word)).toEqual(['Teh', "cat's", 'hat']);
    const doc = editor!.state.doc;
    found.forEach((w) => expect(doc.textBetween(w.from, w.to).replace(/’/g, "'")).toBe(w.word));
  });

  it('leaves out code, links, addresses, acronyms, mixedCase and words joined to digits', () => {
    const found = words([
      {
        type: 'paragraph',
        content: [
          text('Plain '),
          text('codeword', [{ type: 'code' }]),
          text(' '),
          text('linkk', [{ type: 'link', attrs: { href: 'https://example.org' } }]),
          text(' mail ada@example.org www.elum.services NASA iPhone 3rd x99 a done'),
        ],
      },
      { type: 'codeBlock', content: [text('consst x')] },
    ]);
    expect(found.map((w) => w.word)).toEqual(['Plain', 'mail', 'done']);
  });

  it('counts inline images as one position', () => {
    const found = words([
      { type: 'paragraph', content: [text('before '), { type: 'image', attrs: { src: 'https://example.org/a.png' } }, text(' after')] },
    ]);
    const doc = editor!.state.doc;
    expect(found.map((w) => doc.textBetween(w.from, w.to))).toEqual(['before', 'after']);
  });
});

describe('dictionaries', () => {
  const load = (pkg: string) =>
    new NSpell(readFileSync(`node_modules/${pkg}/index.aff`, 'utf8'), readFileSync(`node_modules/${pkg}/index.dic`, 'utf8'));

  it('knows US and UK spelling apart', () => {
    const us = load('dictionary-en');
    const gb = load('dictionary-en-gb');
    expect(us.correct('color')).toBe(true);
    expect(gb.correct('colour')).toBe(true);
    expect(us.correct('teh')).toBe(false);
    expect(us.suggest('teh')).toContain('the');
    expect(us.correct("don't")).toBe(true);
  });
});

describe('colour maths', () => {
  it('round-trips hex through HSV', () => {
    for (const hex of ['#000000', '#ffffff', '#f59a52', '#3b5bd6', '#141a2e']) expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
    expect(normalizeHex('F80')).toBe('#ff8800');
    expect(normalizeHex('nope')).toBeNull();
  });
});

describe('ranking suggestions', () => {
  const us = new NSpell(readFileSync('node_modules/dictionary-en/index.aff', 'utf8'), readFileSync('node_modules/dictionary-en/index.dic', 'utf8'));
  const top = (w: string) => rankSuggestions(w, us.suggest(w))[0];

  it('puts the likely word first', () => {
    expect(top('teh')).toBe('the');
    expect(top('Teh')).toBe('The');
    expect(top('recieved')).toBe('received');
    expect(top('mesage')).toBe('message');
    expect(top('adress')).toBe('address');
  });

  it('counts swapped letters as one edit', () => {
    expect(editDistance('teh', 'the')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});
