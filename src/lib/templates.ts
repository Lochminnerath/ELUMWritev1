import type { DocNode } from '../api';

export interface Template {
  id: string;
  name: string;
  title: string;
  content: () => DocNode;
}

const t = (text: string, bold = false): DocNode => (bold ? { type: 'text', text, marks: [{ type: 'bold' }] } : { type: 'text', text });
const p = (...content: DocNode[]): DocNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });
const h = (level: number, text: string): DocNode => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const bullets = (...items: string[]): DocNode => ({
  type: 'bulletList',
  content: items.map((text) => ({ type: 'listItem', content: [p(t(text))] })),
});
const tasks = (...items: string[]): DocNode => ({
  type: 'taskList',
  content: items.map((text) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(t(text))] })),
});

const today = () => new Date().toLocaleDateString(undefined, { dateStyle: 'long' });

export const TEMPLATES: Template[] = [
  {
    id: 'notes',
    name: 'Meeting notes',
    title: 'Meeting notes',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Meeting notes'),
        p(t('Date: ', true), t(today())),
        p(t('People: ', true), t('Add who was there')),
        h(2, 'Agenda'),
        bullets('First topic', 'Second topic'),
        h(2, 'Notes'),
        p(t('What was said and decided.')),
        h(2, 'Next steps'),
        tasks('Something to do, and who will do it', 'Another follow-up'),
      ],
    }),
  },
  {
    id: 'letter',
    name: 'Letter',
    title: 'Letter',
    content: () => ({
      type: 'doc',
      content: [
        p(t('Your name')),
        p(t('Street and number')),
        p(t('Town and postcode')),
        p(),
        p(t(today())),
        p(),
        p(t('Dear name,')),
        p(t('Start with why you are writing. Keep each paragraph to one idea, and say plainly what you would like to happen next.')),
        p(t('Add any detail the reader needs, then close warmly.')),
        p(),
        p(t('Kind regards,')),
        p(t('Your name')),
      ],
    }),
  },
  {
    id: 'brief',
    name: 'Project brief',
    title: 'Project brief',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Project brief'),
        p(t('One sentence on what this project is and why it matters.')),
        h(2, 'Goal'),
        p(t('What will be true when we are done?')),
        h(2, 'Scope'),
        bullets('In scope', 'Out of scope'),
        h(2, 'Timeline'),
        bullets('Start', 'First review', 'Finish'),
        h(2, 'People'),
        p(t('Who is involved, and who decides.')),
      ],
    }),
  },
];
