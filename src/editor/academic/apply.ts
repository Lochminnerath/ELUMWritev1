import type { Editor } from '@tiptap/core';
import type { DocNode } from '../../api';
import { docAttrs, docSettings, LIST_TITLE, type DocSettings } from './AcademicDocument';
import { formatInText, formatReference, sortKey, type CitationStyle, type Run, type Source } from './citations';
import { findStyle, frontMatter, surname, type FrontMatter } from './styles';

export function readSettings(editor: Editor): DocSettings {
  return docSettings(editor.state.doc.attrs);
}

/** Changes document settings in one undoable step. */
export function updateSettings(editor: Editor, settings: Partial<DocSettings>, rebuild = true) {
  const attrs = docAttrs(settings);
  editor
    .chain()
    .command(({ tr }) => {
      Object.entries(attrs).forEach(([k, v]) => tr.setDocAttribute(k, v));
      return true;
    })
    .run();
  if (rebuild && ('sources' in settings || 'docStyle' in settings)) rebuildSourceList(editor);
}

/** Switches the document to an academic style (or back to Write's own, with `null`). */
export function applyStyle(editor: Editor, style: CitationStyle | null, writerName = '') {
  const def = findStyle(style);
  const current = readSettings(editor);
  updateSettings(editor, {
    docStyle: style,
    pageNumbers: !!def,
    header: def?.header === 'surname' ? current.header || surname(writerName) : null,
  });
}

/** Places the style's heading block or title page at the top of the document. */
export function insertFrontMatter(editor: Editor, style: CitationStyle, details: FrontMatter) {
  const nodes = frontMatter(style, details);
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      // Inserted as whole blocks, so the first paragraph keeps its own formatting.
      tr.insert(0, nodes.map((n) => editor.schema.nodeFromJSON(n)));
      return true;
    })
    .run();
  if (findStyle(style)?.header === 'surname' && details.name.trim()) updateSettings(editor, { header: surname(details.name) }, false);
}

/** Inserts an in-text citation, such as (Rivera 42), at the cursor. */
export function citeSource(editor: Editor, source: Source, page = '') {
  const s = readSettings(editor);
  const style = s.docStyle ?? 'mla';
  const n = s.sources.findIndex((x) => x.id === source.id) + 1;
  const citation = formatInText(style, source, page, n || 1);
  const { $from } = editor.state.selection;
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset);
  editor
    .chain()
    .focus()
    .insertContent(`${before && !/\s/.test(before) ? ' ' : ''}${citation}`)
    .run();
}

const runsToContent = (runs: Run[]): DocNode[] =>
  runs.map((r) => ({ type: 'text', text: r.text, ...(r.italic ? { marks: [{ type: 'italic' }] } : {}) }));

/** The sources in the order their style lists them. */
export function orderedSources(style: CitationStyle, sources: Source[]): Source[] {
  return findStyle(style)?.alphabetical ? [...sources].sort((a, b) => sortKey(a).localeCompare(sortKey(b))) : sources;
}

/**
 * Rebuilds the works cited or reference list from the document's sources, in the
 * document's style. The list is generated: its paragraphs carry `citation`, and
 * people change an entry by editing its source.
 */
export function rebuildSourceList(editor: Editor) {
  const { docStyle, sources } = readSettings(editor);
  const style = findStyle(docStyle);
  const doc = editor.state.doc;
  const old: { from: number; to: number }[] = [];
  doc.forEach((node, pos) => {
    if (node.attrs.citation) old.push({ from: pos, to: pos + node.nodeSize });
  });
  const at = old.length ? old[0].from : doc.content.size;

  const nodes: DocNode[] = [];
  if (style && sources.length) {
    if (style.listOnNewPage) nodes.push({ type: 'pageBreak', attrs: { citation: LIST_TITLE } });
    nodes.push({
      type: 'paragraph',
      attrs: { citation: LIST_TITLE, textAlign: 'center', textIndent: 'none' },
      content: [{ type: 'text', text: style.listTitle, ...(style.listTitleBold ? { marks: [{ type: 'bold' }] } : {}) }],
    });
    orderedSources(style.id, sources).forEach((source) => {
      const n = sources.indexOf(source) + 1;
      nodes.push({
        type: 'paragraph',
        attrs: { citation: source.id, textIndent: 'hanging' },
        content: runsToContent(formatReference(style.id, source, n)),
      });
    });
  }
  if (!old.length && !nodes.length) return;

  editor
    .chain()
    .command(({ tr }) => {
      for (let k = old.length - 1; k >= 0; k--) tr.delete(old[k].from, old[k].to);
      const pos = Math.min(at, tr.doc.content.size);
      if (nodes.length) tr.insert(pos, nodes.map((n) => editor.schema.nodeFromJSON(n)));
      return true;
    })
    .run();
}
