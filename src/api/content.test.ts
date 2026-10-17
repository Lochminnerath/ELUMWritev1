import { describe, expect, it } from 'vitest';
import { buildPreview, collectAssetIds, sameIgnoringComments, stripMarks } from './content';
import type { DocNode } from './types';

const comment = (id: string) => ({ type: 'comment', attrs: { commentId: id } });

describe('stripMarks', () => {
  it('removes comment marks and merges the text they split', () => {
    const doc: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'brave', marks: [comment('c1')] },
            { type: 'text', text: ' world', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    };
    expect(stripMarks(doc, 'comment').content?.[0].content).toEqual([
      { type: 'text', text: 'Hello brave' },
      { type: 'text', text: ' world', marks: [{ type: 'bold' }] },
    ]);
  });
});

describe('sameIgnoringComments', () => {
  const base: DocNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi there' }] }] };

  it('accepts added comment anchors', () => {
    const anchored: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi ' },
            { type: 'text', text: 'there', marks: [comment('c1')] },
          ],
        },
      ],
    };
    expect(sameIgnoringComments(base, anchored)).toBe(true);
  });

  it('rejects any text or formatting change', () => {
    const edited: DocNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi there!' }] }] };
    const bolded: DocNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi there', marks: [{ type: 'bold' }] }] }],
    };
    expect(sameIgnoringComments(base, edited)).toBe(false);
    expect(sameIgnoringComments(base, bolded)).toBe(false);
  });
});

describe('buildPreview', () => {
  it('outlines headings, text, lists and images', () => {
    const doc: DocNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'elum-asset:abc' } }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] }] },
      ],
    };
    expect(buildPreview(doc)).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'image' },
      { kind: 'list', text: 'One' },
    ]);
    expect([...collectAssetIds(doc)]).toEqual(['abc']);
  });
});
