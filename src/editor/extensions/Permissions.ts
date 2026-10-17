import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/** Transactions carrying this meta are allowed for people who cannot edit (comment anchors, remote updates). */
export const ALLOW_META = 'elumAllow';

export interface PermissionsStorage {
  canEdit: boolean;
  canComment: boolean;
}

declare module '@tiptap/core' {
  interface Storage {
    permissions: PermissionsStorage;
  }
}

/**
 * Keeps commenters from changing the text while still letting them select,
 * navigate and anchor comments. Viewers get a read-only editor instead.
 */
export const Permissions = Extension.create<object, PermissionsStorage>({
  name: 'permissions',

  addStorage() {
    return { canEdit: true, canComment: true };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: new PluginKey('elumPermissions'),
        filterTransaction: (tr) => storage.canEdit || !tr.docChanged || tr.getMeta(ALLOW_META) === true,
      }),
    ];
  },
});
