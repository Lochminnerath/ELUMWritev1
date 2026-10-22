import type { DocNode } from '../api';

export interface Template {
  id: string;
  name: string;
  /** One line on what it is for. */
  description: string;
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
  content: items.map((text) => ({ type: 'taskItem', attrs: { checked: false }, content: [text ? p(t(text)) : p()] })),
});

const numbered = (...items: string[]): DocNode => ({
  type: 'orderedList',
  attrs: { start: 1, type: null },
  content: items.map((text) => ({ type: 'listItem', content: [p(t(text))] })),
});
const quote = (text: string): DocNode => ({ type: 'blockquote', content: [p(t(text))] });
const rule = (): DocNode => ({ type: 'horizontalRule' });

const today = () => new Date().toLocaleDateString(undefined, { dateStyle: 'long' });

export const TEMPLATES: Template[] = [
  {
    id: 'notes',
    name: 'Meeting notes',
    description: 'Agenda, notes and next steps',
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
    description: 'Addresses, date and a greeting',
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
    description: 'Goal, scope and timeline',
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
  {
    id: 'resume',
    name: 'Resume',
    description: 'Experience, skills and education',
    title: 'Resume',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Your name'),
        p(t('Email · Phone · Town · Website')),
        p(t('Two or three sentences on who you are and the work you are looking for.')),
        h(2, 'Experience'),
        h(3, 'Job title, Company'),
        p(t('Start month and year to end month and year')),
        bullets('Something you achieved, with a number if you have one', 'Something you were responsible for', 'Something you improved'),
        h(3, 'Job title, Company'),
        p(t('Start month and year to end month and year')),
        bullets('What you did and what came of it'),
        h(2, 'Skills'),
        bullets('A skill', 'Another skill', 'Languages you speak'),
        h(2, 'Education'),
        p(t('Qualification, School', true)),
        p(t('Year finished')),
      ],
    }),
  },
  {
    id: 'cover-letter',
    name: 'Cover letter',
    description: 'For a job you would love',
    title: 'Cover letter',
    content: () => ({
      type: 'doc',
      content: [
        p(t('Your name')),
        p(t('Email · Phone')),
        p(),
        p(t(today())),
        p(),
        p(t('Dear hiring manager,')),
        p(t('Say which role you are applying for and where you saw it, and one line on why it caught your eye.')),
        p(t('Pick two things you have done that show you can do this job well. Be specific: what you did, and what changed because of it.')),
        p(t('Say what draws you to this team in particular, and what you would bring to it.')),
        p(t('Thank them for their time, and say you would be glad to talk.')),
        p(),
        p(t('Kind regards,')),
        p(t('Your name')),
      ],
    }),
  },
  {
    id: 'agenda',
    name: 'Meeting agenda',
    description: 'Topics, times and who leads',
    title: 'Meeting agenda',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Meeting agenda'),
        p(t('When: ', true), t(today())),
        p(t('Where: ', true), t('Room or link')),
        p(t('Purpose: ', true), t('What we want to leave with')),
        h(2, 'Topics'),
        numbered('Welcome and updates · 5 minutes · Name', 'First topic · 15 minutes · Name', 'Second topic · 15 minutes · Name', 'Wrap up and next steps · 5 minutes'),
        h(2, 'To read before'),
        bullets('Link or document'),
      ],
    }),
  },
  {
    id: 'essay',
    name: 'Essay',
    description: 'Introduction, argument and conclusion',
    title: 'Essay',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Essay title'),
        p(t('Your name · ' + today())),
        h(2, 'Introduction'),
        p(t('Set the scene, then state your main argument in one clear sentence.')),
        h(2, 'First point'),
        p(t('Make one point, back it up with evidence, and explain why it matters.')),
        h(2, 'Second point'),
        p(t('Build on the first. Answer the strongest objection someone might raise.')),
        h(2, 'Conclusion'),
        p(t('Bring the threads together and say what follows from your argument.')),
        h(2, 'Sources'),
        numbered('Author, title, year'),
      ],
    }),
  },
  {
    id: 'lesson',
    name: 'Lesson plan',
    description: 'Aims, activities and checks',
    title: 'Lesson plan',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Lesson plan'),
        p(t('Subject and class: ', true), t('Add here')),
        p(t('Date: ', true), t(today())),
        h(2, 'By the end, everyone can'),
        bullets('First aim', 'Second aim'),
        h(2, 'You will need'),
        bullets('Materials and resources'),
        h(2, 'Activities'),
        numbered('Starter · 10 minutes', 'Main activity · 25 minutes', 'Plenary · 10 minutes'),
        h(2, 'Checking understanding'),
        p(t('How you will know it landed.')),
        h(2, 'Homework'),
        p(t('Optional follow-up.')),
      ],
    }),
  },
  {
    id: 'recipe',
    name: 'Recipe',
    description: 'Ingredients and method',
    title: 'Recipe',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Recipe name'),
        p(t('Serves 4 · 20 minutes to prepare · 30 minutes to cook')),
        quote('A line on where this recipe comes from, or why you love it.'),
        h(2, 'Ingredients'),
        bullets('200 g of something', '1 tablespoon of something else', 'A pinch of salt'),
        h(2, 'Method'),
        numbered('Get everything ready.', 'Cook the first part.', 'Bring it together and serve.'),
        h(2, 'Notes'),
        p(t('Swaps, storage and tips for next time.')),
      ],
    }),
  },
  {
    id: 'invoice',
    name: 'Invoice',
    description: 'Work done, amounts and payment',
    title: 'Invoice',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Invoice'),
        p(t('Invoice number: ', true), t('001')),
        p(t('Date: ', true), t(today())),
        p(t('From: ', true), t('Your name or business, address')),
        p(t('To: ', true), t('Client name, address')),
        h(2, 'Work'),
        bullets('Description of work · quantity · amount', 'Description of work · quantity · amount'),
        rule(),
        p(t('Total due: ', true), t('Amount')),
        h(2, 'Payment'),
        p(t('Please pay within 30 days to: account name, account number, reference.')),
        p(t('Thank you for your business.')),
      ],
    }),
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    description: 'News, highlights and dates',
    title: 'Newsletter',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Newsletter'),
        p(t(today())),
        p(t('A warm hello, and one line on what this issue is about.')),
        h(2, 'The main story'),
        p(t('The biggest piece of news, told simply.')),
        h(2, 'In brief'),
        bullets('A smaller update', 'Another one', 'A thank-you to someone'),
        h(2, 'Coming up'),
        bullets('Date · event'),
        rule(),
        p(t('Reply any time; we read every message.')),
      ],
    }),
  },
  {
    id: 'week',
    name: 'Weekly planner',
    description: 'Priorities and a day-by-day list',
    title: 'Weekly planner',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'This week'),
        h(2, 'Top three'),
        tasks('The one thing that matters most', 'Second priority', 'Third priority'),
        ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Weekend'].flatMap((day) => [h(3, day), tasks('')]),
        h(2, 'Notes'),
        p(t('Anything to remember for next week.')),
      ],
    }),
  },
  {
    id: 'trip',
    name: 'Trip itinerary',
    description: 'Travel, stays and plans by day',
    title: 'Trip itinerary',
    content: () => ({
      type: 'doc',
      content: [
        h(1, 'Trip to somewhere'),
        p(t('Dates: ', true), t('From and to')),
        h(2, 'Getting there'),
        p(t('Flights, trains and booking references.')),
        h(2, 'Where we are staying'),
        p(t('Address, check-in time, contact.')),
        h(2, 'Day by day'),
        h(3, 'Day 1'),
        bullets('Morning', 'Afternoon', 'Evening'),
        h(3, 'Day 2'),
        bullets('Morning', 'Afternoon', 'Evening'),
        h(2, 'To pack'),
        tasks('Passport', 'Chargers', 'Something warm'),
      ],
    }),
  },
  {
    id: 'thanks',
    name: 'Thank-you letter',
    description: 'A short, heartfelt note',
    title: 'Thank you',
    content: () => ({
      type: 'doc',
      content: [
        p(t(today())),
        p(),
        p(t('Dear name,')),
        p(t('Thank you so much for the specific thing they did.')),
        p(t('Say what it meant to you, or what difference it made.')),
        p(t('Add a line about looking forward to seeing them, or how you will use it.')),
        p(),
        p(t('With thanks,')),
        p(t('Your name')),
      ],
    }),
  },
];
