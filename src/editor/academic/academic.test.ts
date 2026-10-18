import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { sameIgnoringComments } from '../../api/content';
import type { DocNode } from '../../api/types';
import { buildExtensions } from '../extensions';
import { applyStyle, insertFrontMatter, readSettings, rebuildSourceList, updateSettings } from './apply';
import { formatInText, formatReference, type Run, type Source } from './citations';

const md = (runs: Run[]) => runs.map((r) => (r.italic ? `*${r.text}*` : r.text)).join('');

const book: Source = {
  id: 'b',
  kind: 'book',
  authors: [{ given: 'Robin Wall', family: 'Kimmerer' }],
  title: 'Braiding Sweetgrass',
  publisher: 'Milkweed Editions',
  place: 'Minneapolis',
  year: '2013',
};
const article: Source = {
  id: 'a',
  kind: 'article',
  authors: [
    { given: 'Ana', family: 'Lopez' },
    { given: 'Ben', family: 'Okafor' },
  ],
  title: 'Light in shallow water',
  container: 'Journal of Optics',
  volume: '12',
  issue: '3',
  pages: '45-67',
  year: '2021',
  doi: 'https://doi.org/10.1000/xyz123',
};
const web: Source = {
  id: 'w',
  kind: 'website',
  authors: [],
  title: 'How lenses work',
  container: 'Science Today',
  year: '2024',
  month: '3',
  day: '5',
  url: 'https://science.example/lenses',
  accessed: '2026-10-17',
};

describe('references', () => {
  it('MLA 9', () => {
    expect(md(formatReference('mla', book))).toBe('Kimmerer, Robin Wall. *Braiding Sweetgrass*. Milkweed Editions, 2013.');
    expect(md(formatReference('mla', article))).toBe(
      'Lopez, Ana, and Ben Okafor. “Light in shallow water.” *Journal of Optics*, vol. 12, no. 3, 2021, pp. 45–67, https://doi.org/10.1000/xyz123.',
    );
    expect(md(formatReference('mla', web))).toBe('“How lenses work.” *Science Today*, 5 Mar. 2024, science.example/lenses. Accessed 17 Oct. 2026.');
  });

  it('APA 7', () => {
    expect(md(formatReference('apa', book))).toBe('Kimmerer, R. W. (2013). *Braiding Sweetgrass*. Milkweed Editions.');
    expect(md(formatReference('apa', article))).toBe(
      'Lopez, A., & Okafor, B. (2021). Light in shallow water. *Journal of Optics, 12*(3), 45–67. https://doi.org/10.1000/xyz123',
    );
    expect(md(formatReference('apa', web))).toBe('*How lenses work*. (2024, March 5). Science Today. https://science.example/lenses');
  });

  it('Chicago, Harvard and IEEE', () => {
    expect(md(formatReference('chicago', book))).toBe('Kimmerer, Robin Wall. 2013. *Braiding Sweetgrass*. Minneapolis: Milkweed Editions.');
    expect(md(formatReference('harvard', article))).toBe(
      'Lopez, A. and Okafor, B. (2021) ‘Light in shallow water’, *Journal of Optics*, 12(3), pp. 45–67. doi: 10.1000/xyz123.',
    );
    expect(md(formatReference('ieee', article, 2))).toBe(
      '[2] A. Lopez and B. Okafor, “Light in shallow water,” *Journal of Optics*, vol. 12, no. 3, pp. 45–67, 2021, doi: 10.1000/xyz123.',
    );
  });

  it('handles many authors', () => {
    const many: Source = { ...book, authors: ['Ada Lin', 'Bo Ma', 'Cy Ng'].map((n) => ({ given: n.split(' ')[0], family: n.split(' ')[1] })) };
    expect(md(formatReference('mla', many))).toMatch(/^Lin, Ada, et al\. /);
    expect(md(formatReference('apa', many))).toMatch(/^Lin, A\., Ma, B\., & Ng, C\. \(2013\)/);
    expect(formatInText('apa', many, '')).toBe('(Lin et al., 2013)');
  });
});

describe('in-text citations', () => {
  it('follows each style', () => {
    expect(formatInText('mla', book, '42')).toBe('(Kimmerer 42)');
    expect(formatInText('mla', article, '50-52')).toBe('(Lopez and Okafor 50–52)');
    expect(formatInText('apa', book, '42')).toBe('(Kimmerer, 2013, p. 42)');
    expect(formatInText('apa', article, '50-52')).toBe('(Lopez & Okafor, 2021, pp. 50–52)');
    expect(formatInText('chicago', book, '42')).toBe('(Kimmerer 2013, 42)');
    expect(formatInText('harvard', web, '')).toBe('(How lenses work, 2024)');
    expect(formatInText('ieee', book, '', 3)).toBe('[3]');
  });
});

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
const make = (content: DocNode) => (editor = new Editor({ element: document.createElement('div'), extensions: buildExtensions(), content }));
const texts = () => {
  const out: string[] = [];
  editor!.state.doc.forEach((n) => out.push(n.type.name === 'pageBreak' ? '<page break>' : n.textContent));
  return out;
};

describe('documents in an academic style', () => {
  const body: DocNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body text.' }] }] };

  it('stores nothing extra until a style is chosen', () => {
    const e = make(body);
    expect(sameIgnoringComments(body, e.getJSON() as DocNode)).toBe(true);
  });

  it('builds, reorders and removes the works cited list from sources', () => {
    const e = make(body);
    applyStyle(e, 'mla', 'Sam Rivera');
    expect(readSettings(e)).toMatchObject({ docStyle: 'mla', header: 'Rivera', pageNumbers: true });
    updateSettings(e, { sources: [web, book] });
    expect(texts()).toEqual(['Body text.', '<page break>', 'Works Cited', md(formatReference('mla', web)).replace(/\*/g, ''), md(formatReference('mla', book)).replace(/\*/g, '')]);

    // A new style reformats and renames the list in place.
    applyStyle(e, 'apa');
    expect(texts()[2]).toBe('References');
    expect(texts()[3]).toMatch(/^How lenses work\. \(2024/);
    expect(readSettings(e).header).toBeNull();

    // IEEE keeps the order sources were added, on the same page.
    applyStyle(e, 'ieee');
    expect(texts().slice(1)).toEqual(['References', expect.stringMatching(/^\[1\] “How lenses work/), expect.stringMatching(/^\[2\] R\. W\. Kimmerer/)]);

    updateSettings(e, { sources: [] });
    expect(texts()).toEqual(['Body text.']);
    expect((e.getJSON() as DocNode).attrs?.sources).toBeNull();
  });

  it('keeps hand-written text when the list is rebuilt', () => {
    const e = make(body);
    applyStyle(e, 'mla');
    updateSettings(e, { sources: [book] });
    e.commands.insertContentAt(e.state.doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: 'Appendix' }] });
    rebuildSourceList(e);
    expect(texts()).toEqual(['Body text.', '<page break>', 'Works Cited', expect.any(String), 'Appendix']);
  });

  it('adds an MLA heading block with flush lines and a centred title', () => {
    const e = make(body);
    applyStyle(e, 'mla');
    insertFrontMatter(e, 'mla', { name: 'Sam Rivera', instructor: 'Dr. Okafor', course: 'English 101', date: '2026-10-17', title: 'On Light', affiliation: '' });
    expect(texts().slice(0, 5)).toEqual(['Sam Rivera', 'Dr. Okafor', 'English 101', '17 October 2026', 'On Light']);
    const title = e.state.doc.child(4);
    expect(title.attrs).toMatchObject({ textAlign: 'center', textIndent: 'none' });
    // The body below keeps its own formatting.
    expect(e.state.doc.child(5).textContent).toBe('Body text.');
    expect(e.state.doc.child(5).attrs).toMatchObject({ textAlign: null, textIndent: null });
    expect(readSettings(e).header).toBe('Rivera');
  });

  it('gives APA a title page', () => {
    const e = make(body);
    insertFrontMatter(e, 'apa', { name: 'Sam Rivera', instructor: '', course: 'PSY 101', date: '2026-10-17', title: 'On Light', affiliation: 'Department of Psychology, ELUM University' });
    const t = texts();
    expect(t).toContain('October 17, 2026');
    expect(t.indexOf('<page break>')).toBeGreaterThan(t.indexOf('PSY 101'));
    expect(t[t.indexOf('<page break>') + 1]).toBe('On Light');
  });
});
