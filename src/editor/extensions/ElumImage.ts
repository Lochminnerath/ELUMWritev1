import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { LOCAL_ASSET_PREFIX } from '../../api/content';
import { ImageView } from '../ImageView';

/**
 * Images placed on the page. They sit inline in a paragraph so text can flow
 * around them, and carry their own size and wrapping.
 *
 * - inline: sits on the line like a large character
 * - wrap:   floats left or right and text wraps around it
 * - break:  on its own line, aligned left, centre or right
 */
export type ImageWrap = 'inline' | 'wrap' | 'break';
export type ImageAlign = 'left' | 'center' | 'right';

export interface ImageAttrs {
  src: string;
  alt: string | null;
  width: number | null;
  wrap: ImageWrap;
  align: ImageAlign;
}

export interface ElumImageOptions {
  /** Turns a stored `src` into a URL an <img> can load. */
  resolveSrc: (src: string) => Promise<string>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    elumImage: {
      insertImage: (attrs: Partial<ImageAttrs> & { src: string }, position?: number) => ReturnType;
    };
  }
}

const SAFE_SRC = /^(https?:|data:image\/)/i;

export const ElumImage = Node.create<ElumImageOptions>({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { resolveSrc: async (src: string) => src };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        // Images stored in this browser have no URL the page can fetch, so they render as
        // data-elum-src. That avoids a failed request before the node view takes over, and
        // copy and paste inside Write still carries the image.
        parseHTML: (el) => el.getAttribute('data-elum-src') ?? el.getAttribute('src'),
        renderHTML: (attrs) =>
          typeof attrs.src === 'string' && attrs.src.startsWith(LOCAL_ASSET_PREFIX) ? { 'data-elum-src': attrs.src } : { src: attrs.src },
      },
      alt: { default: null },
      width: {
        default: null,
        parseHTML: (el) => {
          const value = parseInt(el.getAttribute('width') ?? el.style.width, 10);
          return Number.isFinite(value) && value > 0 ? value : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      wrap: {
        default: 'inline',
        parseHTML: (el) => (['inline', 'wrap', 'break'].includes(el.dataset.wrap ?? '') ? el.dataset.wrap : 'inline'),
        renderHTML: (attrs) => ({ 'data-wrap': attrs.wrap }),
      },
      align: {
        default: 'left',
        parseHTML: (el) => (['left', 'center', 'right'].includes(el.dataset.align ?? '') ? el.dataset.align : 'left'),
        renderHTML: (attrs) => ({ 'data-align': attrs.align }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-elum-src]',
        getAttrs: (el) => ((el as HTMLElement).getAttribute('data-elum-src')?.startsWith(LOCAL_ASSET_PREFIX) ? null : false),
      },
      {
        tag: 'img[src]',
        getAttrs: (el) => (SAFE_SRC.test((el as HTMLElement).getAttribute('src') ?? '') ? null : false),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'elum-image' })];
  },

  addCommands() {
    return {
      insertImage:
        (attrs, position) =>
        ({ commands }) => {
          const content = { type: this.name, attrs };
          return position === undefined ? commands.insertContent(content) : commands.insertContentAt(position, content);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView, {
      as: 'span',
      // The outer element carries the layout so floats and line breaks apply to the whole image.
      attrs: ({ node }) => ({
        class: `image-node image-node--${node.attrs.wrap} image-node--${node.attrs.align}`,
      }),
      // Let the toolbar and handles work without ProseMirror stealing the events.
      stopEvent: ({ event }) => !!(event.target as HTMLElement | null)?.closest?.('.image-toolbar, .image-handle'),
    });
  },
});
