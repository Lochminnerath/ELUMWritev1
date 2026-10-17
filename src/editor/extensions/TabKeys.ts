import { Extension } from '@tiptap/core';

/**
 * Tab and Shift+Tab, as people expect from a word processor:
 * - in a list, nest or un-nest the item;
 * - across several paragraphs, indent or outdent them;
 * - otherwise insert a tab (Shift+Tab removes one right before the cursor, or outdents).
 * Ctrl/Cmd+] and Ctrl/Cmd+[ always indent and outdent.
 */
export const TabKeys = Extension.create({
  name: 'tabKeys',
  // Run before the list keymaps so behaviour is consistent.
  priority: 1000,

  addKeyboardShortcuts() {
    const canEdit = () => this.editor.storage.permissions?.canEdit !== false;
    const listItemType = () =>
      this.editor.isActive('taskItem') ? 'taskItem' : this.editor.isActive('listItem') ? 'listItem' : null;

    const indent = () => {
      const item = listItemType();
      if (item) return this.editor.commands.sinkListItem(item) || true;
      return this.editor.commands.indent();
    };
    const outdent = () => {
      const item = listItemType();
      if (item) return this.editor.commands.liftListItem(item) || true;
      return this.editor.commands.outdent();
    };

    return {
      Tab: () => {
        if (!canEdit()) return false;
        const { selection } = this.editor.state;
        if (listItemType()) return indent();
        if (!selection.empty && !selection.$from.sameParent(selection.$to)) return indent() || true;
        return this.editor.commands.insertContent({ type: 'text', text: '\t' });
      },
      'Shift-Tab': () => {
        if (!canEdit()) return false;
        if (listItemType()) return outdent();
        const { selection } = this.editor.state;
        const { $from, empty } = selection;
        if (empty && $from.parentOffset > 0 && $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset) === '\t') {
          return this.editor.commands.deleteRange({ from: $from.pos - 1, to: $from.pos });
        }
        return outdent() || true;
      },
      'Mod-]': () => canEdit() && indent(),
      'Mod-[': () => canEdit() && outdent(),
    };
  },
});
