import type { DocMark, DocNode, PreviewBlock } from './types';

/** The mark type that anchors a comment thread to a range of text. */
export const COMMENT_MARK = 'comment';
/** Images uploaded through the local API are stored as `elum-asset:<id>`. */
export const LOCAL_ASSET_PREFIX = 'elum-asset:';
/** Images in Supabase Storage are stored as `sb-asset:<path>` and turned into signed URLs to show. */
export const SUPABASE_ASSET_PREFIX = 'sb-asset:';

/** True for image sources that point at Write's own storage rather than a web address. */
export function isAssetRef(src: unknown): src is string {
  return typeof src === 'string' && (src.startsWith(LOCAL_ASSET_PREFIX) || src.startsWith(SUPABASE_ASSET_PREFIX));
}

export function emptyDocument(): DocNode {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function sameMarks(a: DocMark[] | undefined, b: DocMark[] | undefined): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Removes every mark of `markType`, then merges neighbouring text that ends up with identical marks. */
export function stripMarks(node: DocNode, markType: string): DocNode {
  const out: DocNode = { ...node };
  if (node.marks) {
    const kept = node.marks.filter((m) => m.type !== markType);
    if (kept.length) out.marks = kept;
    else delete out.marks;
  }
  if (node.content) {
    const children: DocNode[] = [];
    for (const child of node.content.map((c) => stripMarks(c, markType))) {
      const prev = children[children.length - 1];
      if (prev && prev.type === 'text' && child.type === 'text' && sameMarks(prev.marks, child.marks)) {
        children[children.length - 1] = { ...prev, text: (prev.text ?? '') + (child.text ?? '') };
      } else {
        children.push(child);
      }
    }
    out.content = children;
  }
  return out;
}

function canonicalAttrs(attrs: Record<string, unknown> | undefined) {
  if (!attrs) return undefined;
  const keys = Object.keys(attrs)
    .filter((k) => attrs[k] !== null && attrs[k] !== undefined)
    .sort();
  return keys.length ? Object.fromEntries(keys.map((k) => [k, attrs[k]])) : undefined;
}

/**
 * A form of the document where unset (null) attributes and attribute order do
 * not matter, so stored JSON and the editor's JSON compare equal.
 */
function canonical(node: DocNode): unknown {
  return {
    type: node.type,
    attrs: canonicalAttrs(node.attrs),
    text: node.text,
    marks: node.marks?.length ? node.marks.map((m) => ({ type: m.type, attrs: canonicalAttrs(m.attrs) })) : undefined,
    content: node.content?.length ? node.content.map(canonical) : undefined,
  };
}

/**
 * True when two documents differ only in their comment anchors. The API uses
 * this to let commenters save a document they cannot otherwise change.
 */
export function sameIgnoringComments(a: DocNode, b: DocNode): boolean {
  return (
    JSON.stringify(canonical(stripMarks(a, COMMENT_MARK))) === JSON.stringify(canonical(stripMarks(b, COMMENT_MARK)))
  );
}

export function plainText(node: DocNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(plainText).join('');
}

const MAX_PREVIEW_BLOCKS = 10;
const MAX_PREVIEW_TEXT = 140;

/** A short outline of the first blocks, enough to draw a recognisable thumbnail. */
export function buildPreview(doc: DocNode): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  const clip = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW_TEXT);

  const visit = (node: DocNode, inList: boolean) => {
    if (blocks.length >= MAX_PREVIEW_BLOCKS) return;
    switch (node.type) {
      case 'heading':
        blocks.push({ kind: 'heading', level: Number(node.attrs?.level ?? 1), text: clip(plainText(node)) });
        break;
      case 'paragraph': {
        const hasImage = (node.content ?? []).some((c) => c.type === 'image');
        if (hasImage) blocks.push({ kind: 'image' });
        const text = clip(plainText(node));
        if (text || !hasImage) blocks.push({ kind: inList ? 'list' : 'text', text });
        break;
      }
      case 'horizontalRule':
        blocks.push({ kind: 'rule' });
        break;
      case 'blockquote':
        blocks.push({ kind: 'quote', text: clip(plainText(node)) });
        break;
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        (node.content ?? []).forEach((item) => (item.content ?? []).forEach((c) => visit(c, true)));
        break;
      default:
        (node.content ?? []).forEach((c) => visit(c, inList));
    }
  };

  visit(doc, false);
  return blocks;
}

/** Local asset ids referenced by image nodes in a document. */
export function collectAssetIds(node: DocNode, into: Set<string> = new Set()): Set<string> {
  const src = node.type === 'image' ? node.attrs?.src : undefined;
  if (typeof src === 'string' && src.startsWith(LOCAL_ASSET_PREFIX)) {
    into.add(src.slice(LOCAL_ASSET_PREFIX.length));
  }
  node.content?.forEach((c) => collectAssetIds(c, into));
  return into;
}
