import type { Extensions } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import type { SpellChecker } from '../spelling/checker';
import { Spellcheck } from '../spelling/Spellcheck';
import { CommentMark } from './Comment';
import { ElumImage } from './ElumImage';
import { LetterSpacing } from './LetterSpacing';
import { ParagraphFormat } from './ParagraphFormat';
import { Permissions } from './Permissions';
import { TabKeys } from './TabKeys';
import { TextCaseCommands } from './TextCaseCommands';

export interface ExtensionOptions {
  resolveImageSrc?: (src: string) => Promise<string>;
  placeholder?: string;
  /** Spell checking; left out in tests and wherever text cannot be edited. */
  spellChecker?: SpellChecker | null;
}

/** Every extension a Write document uses. The schema they define is the document format. */
export function buildExtensions({ resolveImageSrc, placeholder = 'Start writing', spellChecker = null }: ExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['mailto', 'tel'],
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    LetterSpacing,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Subscript,
    Superscript,
    TaskList,
    TaskItem.configure({ nested: true }),
    ParagraphFormat,
    TextCaseCommands,
    TabKeys,
    CommentMark,
    ElumImage.configure(resolveImageSrc ? { resolveSrc: resolveImageSrc } : {}),
    Permissions,
    CharacterCount,
    Spellcheck.configure({ checker: spellChecker }),
    Placeholder.configure({
      // Only on an empty document, not on every empty line.
      placeholder: ({ editor }) => (editor.isEmpty ? placeholder : ''),
    }),
  ];
}
