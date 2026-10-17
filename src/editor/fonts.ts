/**
 * The font catalogue for documents.
 *
 * Every font is an entry here. To add the ELUM typefaces later, give each one
 * `source: { kind: 'elum', css: '/fonts/elum/<file>.css' }` (a stylesheet of
 * @font-face rules, served from public/fonts/elum) and `collection: 'elum'`.
 * The picker groups them first, and nothing else needs to change.
 *
 * Documents store the CSS `stack`, so a document stays readable even if a
 * font is later removed from the catalogue.
 */

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting';

export type FontSource =
  | { kind: 'system' }
  /** Google Fonts family and axes, as in `css2?family=<family>:<axes>`. */
  | { kind: 'google'; family: string; axes: string }
  /** An ELUM font: a stylesheet with its @font-face rules. */
  | { kind: 'elum'; css: string };

export interface FontDef {
  id: string;
  name: string;
  category: FontCategory;
  /** CSS font-family value written into documents. */
  stack: string;
  source: FontSource;
  collection: 'elum' | 'library';
}

const ITAL = 'ital,wght@0,400;0,700;1,400;1,700';

const google = (id: string, name: string, category: FontCategory, fallback: string, axes = ITAL): FontDef => ({
  id,
  name,
  category,
  stack: `${/\s|\d/.test(name) ? `"${name}"` : name}, ${fallback}`,
  source: { kind: 'google', family: name, axes },
  collection: 'library',
});

const system = (id: string, name: string, category: FontCategory, stack: string): FontDef => ({
  id,
  name,
  category,
  stack,
  source: { kind: 'system' },
  collection: 'library',
});

const SANS = 'system-ui, sans-serif';
const SERIF = 'Georgia, serif';
const MONO = 'ui-monospace, monospace';

export const FONTS: FontDef[] = [
  // The ELUM brand faces come first: they are the house style.
  google('manrope', 'Manrope', 'sans', `"Helvetica Neue", ${SANS}`, 'wght@400;500;600;700'),
  google('sora', 'Sora', 'display', `"Avenir Next", ${SANS}`, 'wght@300;400;600;700'),
  google('ibm-plex-mono', 'IBM Plex Mono', 'mono', MONO),
  // Sans serif
  google('work-sans', 'Work Sans', 'sans', SANS),
  google('dm-sans', 'DM Sans', 'sans', SANS),
  google('figtree', 'Figtree', 'sans', SANS),
  google('nunito-sans', 'Nunito Sans', 'sans', SANS),
  google('source-sans-3', 'Source Sans 3', 'sans', SANS),
  // Serif
  google('lora', 'Lora', 'serif', SERIF),
  google('merriweather', 'Merriweather', 'serif', SERIF),
  google('source-serif-4', 'Source Serif 4', 'serif', SERIF),
  google('eb-garamond', 'EB Garamond', 'serif', SERIF),
  google('libre-baskerville', 'Libre Baskerville', 'serif', SERIF, 'ital,wght@0,400;0,700;1,400'),
  google('crimson-pro', 'Crimson Pro', 'serif', SERIF),
  google('playfair-display', 'Playfair Display', 'display', SERIF),
  // Mono and handwriting
  google('jetbrains-mono', 'JetBrains Mono', 'mono', MONO),
  google('caveat', 'Caveat', 'handwriting', 'cursive', 'wght@400;700'),
  // Fonts already on most computers
  system('arial', 'Arial', 'sans', 'Arial, Helvetica, sans-serif'),
  system('verdana', 'Verdana', 'sans', 'Verdana, Geneva, sans-serif'),
  system('georgia', 'Georgia', 'serif', 'Georgia, "Times New Roman", serif'),
  system('times-new-roman', 'Times New Roman', 'serif', '"Times New Roman", Times, serif'),
  system('courier-new', 'Courier New', 'mono', '"Courier New", Courier, monospace'),
];

/** The document's default font when no font is set. */
export const DEFAULT_FONT = FONTS[0];

export const CATEGORY_LABEL: Record<FontCategory, string> = {
  sans: 'Sans serif',
  serif: 'Serif',
  mono: 'Monospace',
  display: 'Display',
  handwriting: 'Handwriting',
};

/** The first family named in a CSS font-family value, without quotes. */
export function primaryFamily(stack: string): string {
  return stack.split(',')[0].trim().replace(/^["']|["']$/g, '');
}

/** Finds the catalogue entry for a stored font-family value. */
export function findFont(stack: string | null | undefined): FontDef | undefined {
  if (!stack) return undefined;
  const family = primaryFamily(stack).toLowerCase();
  return FONTS.find((f) => primaryFamily(f.stack).toLowerCase() === family);
}

/** Display name for a stored font-family value, even if it is not in the catalogue. */
export function fontLabel(stack: string | null | undefined): string {
  if (!stack) return DEFAULT_FONT.name;
  return findFont(stack)?.name ?? primaryFamily(stack);
}

const loaded = new Set<string>();

function addStylesheet(href: string) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Makes fonts available to the page. Stylesheets only declare @font-face
 * rules; browsers download a font file only once text actually uses it.
 */
export function loadFonts(fonts: FontDef[] = FONTS) {
  for (const font of fonts) {
    if (loaded.has(font.id)) continue;
    loaded.add(font.id);
    if (font.source.kind === 'google') {
      const family = font.source.family.replace(/ /g, '+');
      addStylesheet(`https://fonts.googleapis.com/css2?family=${family}:${font.source.axes}&display=swap`);
    } else if (font.source.kind === 'elum') {
      addStylesheet(font.source.css);
    }
  }
}
