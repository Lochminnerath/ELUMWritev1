import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { caseStateAfter, changeCase, nextCase, type TextCase } from '../textCase';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textCase: {
      /** Changes the case of the selection, or of the word at the cursor. Formatting is kept. */
      setTextCase: (mode: TextCase) => ReturnType;
      /** Shift+F3: lowercase → UPPERCASE → Title Case. */
      cycleTextCase: () => ReturnType;
    };
  }
}

const WORD_CHAR = /[\p{L}\p{N}'’]/u;

export const TextCaseCommands = Extension.create({
  name: 'textCase',

  addCommands() {
    return {
      setTextCase:
        (mode) =>
        ({ state, tr, dispatch }) => {
          let { from, to } = state.selection;

          // No selection: use the word around the cursor.
          if (from === to) {
            const $pos = state.selection.$from;
            const text = $pos.parent.textContent;
            let start = $pos.parentOffset;
            let end = start;
            while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
            while (end < text.length && WORD_CHAR.test(text[end])) end++;
            if (start === end) return false;
            from = $pos.start() + start;
            to = $pos.start() + end;
          }

          let changed = false;
          state.doc.nodesBetween(from, to, (block, blockPos) => {
            if (!block.isTextblock) return true;
            const blockStart = blockPos + 1;
            const segStart = Math.max(from, blockStart);
            const before = block.textBetween(0, segStart - blockStart, undefined, '￼');
            const caseState = caseStateAfter(before);

            block.forEach((child, offset) => {
              const childStart = blockStart + offset;
              const childEnd = childStart + child.nodeSize;
              if (!child.isText || childEnd <= from || childStart >= to) return;
              const a = Math.max(from, childStart);
              const b = Math.min(to, childEnd);
              const original = child.text!.slice(a - childStart, b - childStart);
              const updated = changeCase(original, mode, caseState);
              if (updated !== original) {
                changed = true;
                // Same length, so positions stay valid across replacements.
                tr.replaceWith(a, b, state.schema.text(updated, child.marks));
              }
            });
            return false;
          });

          if (!changed) return false;
          if (dispatch) {
            tr.setSelection(TextSelection.create(tr.doc, state.selection.from, state.selection.to));
          }
          return true;
        },

      cycleTextCase:
        () =>
        ({ state, commands }) => {
          const { from, to, $from } = state.selection;
          const text = from === to ? $from.parent.textContent : state.doc.textBetween(from, to, ' ');
          return commands.setTextCase(nextCase(text));
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Shift-F3': () => this.editor.storage.permissions?.canEdit !== false && this.editor.commands.cycleTextCase(),
    };
  },
});
