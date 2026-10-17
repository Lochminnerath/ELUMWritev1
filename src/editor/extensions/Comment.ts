import { Mark, mergeAttributes } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { COMMENT_MARK } from '../../api/content';
import { ALLOW_META } from './Permissions';

/**
 * Anchors comment threads to text. The thread itself lives in the API; the
 * document only holds the anchor (a mark with the thread id).
 */

export interface Range {
  from: number;
  to: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      addCommentAnchor: (commentId: string, range: Range) => ReturnType;
      removeCommentAnchor: (commentId: string) => ReturnType;
      /** Highlights the text a new comment is being written about. */
      setCommentDraft: (range: Range | null) => ReturnType;
    };
  }
}

export const commentDraftKey = new PluginKey<DecorationSet>('commentDraft');

/** The range of a comment draft, mapped through any edits made while writing it. */
export function getCommentDraft(state: Parameters<typeof commentDraftKey.getState>[0]): Range | null {
  const found = commentDraftKey.getState(state)?.find();
  return found?.length ? { from: found[0].from, to: found[0].to } : null;
}

/** Where each comment's anchor currently sits in the document. */
export function findCommentRanges(doc: PMNode): Map<string, Range> {
  const ranges = new Map<string, Range>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== COMMENT_MARK) continue;
      const id = mark.attrs.commentId as string;
      const range = ranges.get(id);
      const end = pos + node.nodeSize;
      if (range) {
        range.from = Math.min(range.from, pos);
        range.to = Math.max(range.to, end);
      } else {
        ranges.set(id, { from: pos, to: end });
      }
    }
    return false;
  });
  return ranges;
}

export const CommentMark = Mark.create({
  name: COMMENT_MARK,
  // Typing at the edge of commented text does not extend the comment.
  inclusive: false,
  // Comments can overlap.
  excludes: '',

  addAttributes() {
    return {
      commentId: {
        default: null,
        renderHTML: (attrs) => ({ 'data-comment-id': attrs.commentId }),
      },
    };
  },

  // Never parse comment anchors from pasted HTML: a pasted copy is not the commented text.
  parseHTML() {
    return [];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'elum-comment' }), 0];
  },

  addCommands() {
    return {
      addCommentAnchor:
        (commentId, { from, to }) =>
        ({ tr, dispatch }) => {
          if (from >= to) return false;
          if (dispatch) {
            tr.addMark(from, to, this.type.create({ commentId }));
            tr.setMeta(ALLOW_META, true);
            tr.setMeta(commentDraftKey, null);
          }
          return true;
        },
      removeCommentAnchor:
        (commentId) =>
        ({ tr, state, dispatch }) => {
          let found = false;
          state.doc.descendants((node, pos) => {
            if (!node.isText) return true;
            const mark = node.marks.find((m) => m.type === this.type && m.attrs.commentId === commentId);
            if (mark) {
              found = true;
              if (dispatch) tr.removeMark(pos, pos + node.nodeSize, mark);
            }
            return false;
          });
          if (found && dispatch) tr.setMeta(ALLOW_META, true);
          return found;
        },
      setCommentDraft:
        (range) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(commentDraftKey, range);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: commentDraftKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(commentDraftKey) as Range | null | undefined;
            if (meta === null) return DecorationSet.empty;
            if (meta) {
              return DecorationSet.create(tr.doc, [Decoration.inline(meta.from, meta.to, { class: 'elum-comment-draft' })]);
            }
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return commentDraftKey.getState(state);
          },
        },
      }),
    ];
  },
});
