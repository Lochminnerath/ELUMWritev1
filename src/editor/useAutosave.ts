import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, isApiError, type DocNode } from '../api';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

const DEBOUNCE_MS = 700;
const RETRY_MS = 5000;

/**
 * Saves the document shortly after each change. Saves carry the version they
 * started from; if someone else saved in between, the status becomes
 * "conflict" and nothing is overwritten until the person decides.
 */
export function useAutosave(editor: Editor | null, docId: string, initialVersion: number) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const version = useRef(initialVersion);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const conflicted = useRef(false);

  const retrying = useRef(false);

  const save = useCallback(
    async (force = false): Promise<void> => {
      if (!editor || editor.isDestroyed) return;
      if (conflicted.current && !force) return;
      if (inFlight.current) {
        // Save again once the current request finishes.
        dirty.current = true;
        return inFlight.current;
      }
      window.clearTimeout(timer.current);
      dirty.current = false;
      retrying.current = false;
      setStatus('saving');
      const content = editor.getJSON() as DocNode;
      const request = api
        .saveDocument(docId, { content, baseVersion: version.current, force })
        .then((result) => {
          version.current = result.version;
          conflicted.current = false;
          setStatus(dirty.current ? 'pending' : 'saved');
        })
        .catch((error) => {
          dirty.current = true;
          if (isApiError(error, 'conflict')) {
            conflicted.current = true;
            setStatus('conflict');
          } else {
            retrying.current = true;
            setStatus('error');
            timer.current = window.setTimeout(() => void save(), RETRY_MS);
          }
        })
        .finally(() => {
          inFlight.current = null;
          if (dirty.current && !conflicted.current && !retrying.current) schedule();
        });
      inFlight.current = request;
      return request;
    },
    [editor, docId],
  );

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), DEBOUNCE_MS);
  }, [save]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      dirty.current = true;
      if (conflicted.current) return;
      setStatus('pending');
      schedule();
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, schedule]);

  // Save right away when leaving the page or the document.
  useEffect(() => {
    const flush = () => {
      if (dirty.current && !conflicted.current) void save();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        flush();
        e.preventDefault();
      }
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHide);
      window.clearTimeout(timer.current);
      flush();
    };
  }, [save]);

  return useMemo(
    () => ({
      status,
      /** True while there are changes not yet saved. */
      hasUnsaved: () => dirty.current || !!inFlight.current,
      version: () => version.current,
      /** Adopt a newer version from the server (after loading remote changes). */
      acceptVersion: (v: number) => {
        version.current = v;
        dirty.current = false;
        conflicted.current = false;
        setStatus('saved');
      },
      /** Overwrite whatever is on the server with this copy. */
      keepMine: () => save(true),
      saveNow: () => save(),
    }),
    [status, save],
  );
}
