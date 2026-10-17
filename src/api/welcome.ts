import type { DocMark, DocNode } from './types';

const t = (text: string, ...marks: DocMark[]): DocNode => (marks.length ? { type: 'text', text, marks } : { type: 'text', text });
const p = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const h = (level: number, text: string): DocNode => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const li = (...content: DocNode[]): DocNode => ({ type: 'listItem', content: [p(...content)] });

const bold: DocMark = { type: 'bold' };
const italic: DocMark = { type: 'italic' };
const underline: DocMark = { type: 'underline' };
const strike: DocMark = { type: 'strike' };
const highlight: DocMark = { type: 'highlight', attrs: { color: '#fde2c8' } };
const apricotText: DocMark = { type: 'textStyle', attrs: { color: '#a84d17' } };
const kbd = (text: string) => t(text, { type: 'code' });

/** The first document every new account gets. It doubles as a tour of the editor. */
export function welcomeDocument(name: string): DocNode {
  const first = name.trim().split(/\s+/)[0] || 'there';
  return {
    type: 'doc',
    content: [
      h(1, 'Welcome to Write'),
      p(
        t(`Hi ${first}. This is your first document. Change anything you like, or go back to your documents and start a fresh one.`),
      ),
      h(2, 'Make it yours'),
      {
        type: 'bulletList',
        content: [
          li(t('Bold', bold), t(', '), t('italic', italic), t(', '), t('underline', underline), t(' and '), t('strikethrough', strike), t(' are in the formatting dock at the bottom of the page.')),
          li(t('Highlight a phrase', highlight), t(', give a word '), t('its own shade', apricotText), t(', or change its case with '), kbd('Shift+F3'), t('.')),
          li(t('Pick a font and a size, then set line, paragraph and letter spacing from the dock.')),
          li(t('Press '), kbd('Tab'), t(' to indent a line and '), kbd('Shift+Tab'), t(' to step back.')),
        ],
      },
      h(2, 'Put things on the page'),
      p(
        t('Drop an image onto the page, paste one, or open '),
        t('Insert', bold),
        t(' on the left. Drag a corner to resize it, then choose how the text wraps around it.'),
      ),
      h(2, 'Spelling, everywhere'),
      p(
        t('Write checks your spelling itself, the same on every device. Right-click a word with a wavy line for suggestions, or open '),
        t('Spelling', bold),
        t(' on the left. Words you add to your dictionary are saved to your account.'),
      ),
      h(2, 'Work together'),
      p(
        t('Use '),
        t('Share', bold),
        t(' to find people by name or email. Viewers can read, commenters can also leave comments, and editors can change everything. To comment, select some text and press '),
        kbd('Ctrl+Alt+M'),
        t(' ('),
        kbd('Cmd+Option+M'),
        t(' on a Mac).'),
      ),
      p(t('Your words stay yours.', italic)),
    ],
  };
}
