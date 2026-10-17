import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { sameIgnoringComments } from '../api/content';
import type { DocNode } from '../api/types';
import { welcomeDocument } from '../api/welcome';
import { TEMPLATES } from '../lib/templates';
import { buildExtensions } from './extensions';

let editor: Editor | null = null;

function makeEditor(content: DocNode) {
  editor = new Editor({ element: document.createElement('div'), extensions: buildExtensions(), content });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const para = (text: string, marks?: DocNode['marks']): DocNode => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] }],
});

describe('document format', () => {
  it('keeps the welcome document and every template exactly as written', () => {
    for (const doc of [welcomeDocument('Sam Rivera'), ...TEMPLATES.map((t) => t.content())]) {
      const e = makeEditor(doc);
      expect(sameIgnoringComments(doc, e.getJSON() as DocNode)).toBe(true);
      e.destroy();
    }
  });

  it('writes local images without a fetchable src', () => {
    const e = makeEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'elum-asset:abc', width: 200, wrap: 'wrap', align: 'right' } }] }],
    });
    const html = e.getHTML();
    expect(html).toContain('data-elum-src="elum-asset:abc"');
    expect(html).not.toMatch(/\ssrc="elum-asset/);
    expect(html).toContain('data-wrap="wrap"');
  });
});

describe('commenter guard', () => {
  it('blocks edits but allows comment anchors', () => {
    const e = makeEditor(para('Hello world'));
    e.storage.permissions.canEdit = false;
    const before = JSON.stringify(e.getJSON());

    e.commands.insertContentAt(1, 'Nope ');
    e.commands.setTextSelection({ from: 1, to: 6 });
    e.commands.toggleBold();
    expect(JSON.stringify(e.getJSON())).toBe(before);

    expect(e.commands.addCommentAnchor('comment-abc123', { from: 7, to: 12 })).toBe(true);
    const after = e.getJSON() as DocNode;
    expect(JSON.stringify(after)).toContain('comment-abc123');
    expect(sameIgnoringComments(JSON.parse(before), after)).toBe(true);
  });
});

describe('formatting commands', () => {
  it('changes case without losing formatting', () => {
    const e = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'make ' },
            { type: 'text', text: 'this', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' loud' },
          ],
        },
      ],
    });
    e.commands.setTextSelection({ from: 1, to: 15 });
    e.commands.setTextCase('upper');
    expect(e.getText()).toBe('MAKE THIS LOUD');
    expect(e.getHTML()).toContain('<strong>THIS</strong>');

    e.commands.setTextSelection({ from: 1, to: 15 });
    e.commands.cycleTextCase();
    expect(e.getText()).toBe('Make This Loud');
  });

  it('indents, outdents and sets paragraph spacing', () => {
    const e = makeEditor(para('Indent me'));
    e.commands.setTextSelection(2);
    e.commands.indent();
    e.commands.indent();
    expect(e.getHTML()).toContain('margin-left: 1in');
    e.commands.outdent();
    e.commands.setLineSpacing('2');
    e.commands.setSpaceBefore(12);
    const html = e.getHTML();
    expect(html).toContain('margin-left: 0.5in');
    expect(html).toContain('line-height: 2');
    expect(html).toContain('margin-top: 12pt');
  });

  it('sets letter spacing, font, size, colour and highlight on text', () => {
    const e = makeEditor(para('Styled'));
    e.chain()
      .setTextSelection({ from: 1, to: 7 })
      .setLetterSpacing('0.1em')
      .setFontFamily('Lora, Georgia, serif')
      .setFontSize('20pt')
      .setColor('#a84d17')
      .setHighlight({ color: '#c8f0e3' })
      .run();
    const html = e.getHTML();
    expect(html).toContain('letter-spacing: 0.1em');
    expect(html).toContain('font-family: Lora');
    expect(html).toContain('font-size: 20pt');
    expect(html).toMatch(/color: (#a84d17|rgb\(168, 77, 23\))/);
    expect(html).toContain('<mark');
  });
});
