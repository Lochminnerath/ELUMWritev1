import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { CloudCheck, CloudOff, LoaderCircle, MessageSquare, Share2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage, isApiError, type CommentThread, type DocNode, type DocumentRecord } from '../api';
import { ACCEPTED_IMAGE_TYPES } from '../api/client';
import { emptyDocument } from '../api/content';
import { canComment, canEdit } from '../api/roles';
import { useUser } from '../auth/AuthProvider';
import { DocIcon } from '../components/Brand';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { UserMenu } from '../components/UserMenu';
import { useMediaQuery, usePersistedState } from '../lib/hooks';
import { ThemeToggle } from '../theme/ThemeToggle';
import { ConflictDialog, ShortcutsDialog, WordCountDialog } from './EditorDialogs';
import { DocumentProblem } from './EditorPage';
import { CommentsPanel } from './CommentsPanel';
import { findCommentRanges, getCommentDraft } from './extensions/Comment';
import { buildExtensions } from './extensions/index';
import { ALLOW_META } from './extensions/Permissions';
import { downloadHtml, downloadText } from './exporters';
import { loadFonts } from './fonts';
import { clearFormatting, ZOOMS } from './format';
import { hasMod } from './keys';
import { MenuBar, type PageMode } from './MenuBar';
import { ShareDialog } from './ShareDialog';
import { Toolbar } from './toolbar/Toolbar';
import { useAutosave, type SaveStatus } from './useAutosave';

const POLL_MS = 15_000;
const isZoom = (v: unknown): v is number => typeof v === 'number' && ZOOMS.includes(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isPageMode = (v: unknown): v is PageMode => v === 'theme' || v === 'paper';

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
}

async function naturalWidth(file: File): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    bitmap.close();
    return width;
  } catch {
    return null;
  }
}

interface Props {
  initialDoc: DocumentRecord;
  initialComments: CommentThread[];
}

export function DocWorkspace({ initialDoc, initialComments }: Props) {
  const me = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const [doc, setDoc] = useState(initialDoc);
  const [title, setTitle] = useState(initialDoc.title);
  const [comments, setComments] = useState(initialComments);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [lostAccess, setLostAccess] = useState<string | null>(null);

  // The side panel's open state is remembered on wide screens; the drawer on small screens opens on demand.
  const [panelOpen, setPanelOpen] = usePersistedState('elum.editor.comments', true, isBool);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [zoom, setZoom] = usePersistedState('elum.editor.zoom', 100, isZoom);
  const [pageMode, setPageMode] = usePersistedState<PageMode>('elum.editor.page', 'theme', isPageMode);
  const [shareOpen, setShareOpen] = useState(false);
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [uploads, setUploads] = useState(0);

  const fileInput = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const insertFiles = useRef<(files: File[], pos?: number) => void>(() => undefined);
  const wide = useMediaQuery('(min-width: 1180px)');
  const narrow = useMediaQuery('(max-width: 860px)');
  const commentsOpen = wide ? panelOpen : drawerOpen;
  const setCommentsOpen = useCallback((open: boolean) => (wide ? setPanelOpen(open) : setDrawerOpen(open)), [wide, setPanelOpen]);

  const role = doc.role;
  const editable = canEdit(role);
  const commentable = canComment(role);

  useEffect(() => loadFonts(), []);

  const extensions = useMemo(
    () => buildExtensions({ resolveImageSrc: (src) => api.resolveAssetUrl(src), placeholder: 'Start writing' }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: initialDoc.content,
    editable: initialDoc.role !== 'viewer',
    editorProps: {
      attributes: {
        class: 'doc-content',
        'aria-label': 'Document text',
        spellcheck: 'true',
      },
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length) return false;
        event.preventDefault();
        insertFiles.current(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = imageFiles(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        insertFiles.current(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
        return true;
      },
      handleClick: (view, _pos, event) => {
        const link = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
        if (!link) return false;
        // Links open on Ctrl/Cmd+click while editing, and on a plain click otherwise.
        if (hasMod(event) || !view.editable || !editorRef.current?.storage.permissions.canEdit) {
          window.open(link.href, '_blank', 'noopener,noreferrer');
          return true;
        }
        return false;
      },
    },
  });
  const editorRef = useRef<Editor | null>(editor);
  editorRef.current = editor;

  // Handy for debugging and browser tests; never included in production builds.
  if (import.meta.env.DEV) (window as unknown as { __elumEditor?: Editor | null }).__elumEditor = editor;

  // Keep the editor's permissions in step with the role, which can change while the document is open.
  useEffect(() => {
    if (!editor) return;
    editor.storage.permissions.canEdit = editable;
    editor.storage.permissions.canComment = commentable;
    if (editor.isEditable !== (role !== 'viewer')) editor.setEditable(role !== 'viewer', false);
  }, [editor, role, editable, commentable]);

  const autosave = useAutosave(editor, doc.id, initialDoc.version);

  // ---------------------------------------------------------------- title

  useEffect(() => {
    document.title = `${title.trim() || 'Untitled document'} - ELUM Write`;
  }, [title]);

  const commitTitle = async () => {
    const next = title.trim();
    if (next === doc.title) return;
    try {
      const summary = await api.renameDocument(doc.id, next);
      setDoc((d) => ({ ...d, title: summary.title }));
      setTitle(summary.title);
    } catch (e) {
      setTitle(doc.title);
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  // --------------------------------------------------------------- images

  insertFiles.current = async (files: File[], pos?: number) => {
    if (!editor || !editable) return;
    let at = pos;
    setUploads((n) => n + files.length);
    for (const file of files) {
      try {
        const asset = await api.uploadAsset(doc.id, file);
        const natural = await naturalWidth(file);
        const line = parseFloat(getComputedStyle(editor.view.dom).width) || 624;
        editor
          .chain()
          .focus()
          .insertImage({ src: asset.url, width: natural ? Math.min(natural, Math.round(line)) : null, wrap: 'inline', align: 'left' }, at)
          .run();
        if (at !== undefined) at += 1;
      } catch (e) {
        toast(errorMessage(e), { tone: 'error' });
      } finally {
        setUploads((n) => n - 1);
      }
    }
  };

  // ------------------------------------------------------------- comments

  const openIds = useMemo(() => comments.filter((c) => !c.resolved).map((c) => c.id), [comments]);

  // The comment under the cursor becomes the active one.
  useEffect(() => {
    if (!editor) return;
    const onSelection = () => {
      const { $from } = editor.state.selection;
      const marks = [...$from.marks(), ...($from.nodeAfter?.marks ?? [])];
      const id = marks.filter((m) => m.type.name === 'comment').map((m) => m.attrs.commentId as string).find((c) => openIds.includes(c));
      setActiveComment(id ?? null);
    };
    editor.on('selectionUpdate', onSelection);
    return () => {
      editor.off('selectionUpdate', onSelection);
    };
  }, [editor, openIds]);

  const startComment = useCallback(() => {
    if (!editor || !commentable) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      toast('Select the text you want to comment on first.');
      return;
    }
    editor.commands.setCommentDraft({ from, to });
    setActiveComment(null);
    setCommentsOpen(true);
  }, [editor, commentable, toast, setCommentsOpen]);

  const submitDraft = async (body: string) => {
    if (!editor) return;
    const range = getCommentDraft(editor.state);
    if (!range) return;
    const id = crypto.randomUUID();
    try {
      const quote = editor.state.doc.textBetween(range.from, range.to, ' ').slice(0, 500);
      const thread = await api.addComment(doc.id, { id, body, quote });
      editor.commands.addCommentAnchor(id, getCommentDraft(editor.state) ?? range);
      setComments((list) => [...list, thread]);
      setActiveComment(id);
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const replaceThread = (thread: CommentThread) => setComments((list) => list.map((c) => (c.id === thread.id ? thread : c)));

  const activateComment = (id: string) => {
    setActiveComment(id);
    if (!editor) return;
    const range = findCommentRanges(editor.state.doc).get(id);
    if (range) editor.chain().setTextSelection(Math.min(range.from + 1, range.to)).scrollIntoView().run();
  };

  const commentRules = useMemo(() => {
    const sel = (id: string) => `.doc-content .elum-comment[data-comment-id="${CSS.escape(id)}"]`;
    const rules: string[] = [];
    if (openIds.length) rules.push(`${openIds.map(sel).join(',')}{background:var(--comment-ground)}`);
    if (activeComment) rules.push(`${sel(activeComment)}{background:var(--comment-ground-active)}`);
    return rules.join('\n');
  }, [openIds, activeComment]);

  // ------------------------------------------------- staying in step with others

  const applyRemote = useCallback(
    (content: DocNode) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      editor.chain().setMeta(ALLOW_META, true).setMeta('addToHistory', false).setContent(content, { emitUpdate: false }).run();
      const size = editor.state.doc.content.size;
      editor.chain().setMeta(ALLOW_META, true).setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) }).run();
    },
    [editor],
  );

  const refresh = useCallback(async () => {
    try {
      const latest = await api.getDocument(doc.id);
      setDoc((d) => ({ ...d, ...latest, content: d.content }));
      if (document.activeElement !== titleInput.current) setTitle(latest.title);
      if (canComment(latest.role)) setComments(await api.listComments(doc.id));
      if (latest.version > autosave.version() && !autosave.hasUnsaved()) {
        applyRemote(latest.content);
        autosave.acceptVersion(latest.version);
      }
      return latest;
    } catch (e) {
      if (isApiError(e, 'forbidden') || isApiError(e, 'not_found')) setLostAccess(errorMessage(e));
      return null;
    }
  }, [doc.id, autosave, applyRemote]);

  useEffect(() => {
    const tick = () => document.visibilityState === 'visible' && void refresh();
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  // ------------------------------------------------------------- actions

  const newDocument = async () => {
    try {
      const created = await api.createDocument({ content: emptyDocument() });
      navigate(`/d/${created.id}`);
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const duplicate = async () => {
    try {
      await autosave.saveNow();
      const copy = await api.duplicateDocument(doc.id);
      toast(`Made “${copy.title}”`, { tone: 'success', action: { label: 'Open', onClick: () => navigate(`/d/${copy.id}`) } });
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const remove = async () => {
    try {
      if (role === 'owner') await api.deleteDocument(doc.id);
      else await api.leaveDocument(doc.id);
      navigate('/', { replace: true });
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  // Shortcuts that live outside the editor's own keymap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hasMod(e) || !editor) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void autosave.saveNow();
        toast('Write saves your changes as you go.');
      } else if (key === '/') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        setWordCountOpen(true);
      } else if (editor.isFocused) {
        if (key === 'k' && editable) {
          e.preventDefault();
          setLinkOpen(true);
        } else if (e.altKey && e.code === 'KeyM') {
          e.preventDefault();
          startComment();
        } else if (key === '\\' && editable) {
          e.preventDefault();
          clearFormatting(editor);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, editable, autosave, startComment, toast]);

  const words = useEditorState({ editor, selector: ({ editor: e }) => e?.storage.characterCount.words() ?? 0 });

  if (lostAccess) return <DocumentProblem kind="forbidden" message={lostAccess} />;
  if (!editor) return null;

  const showComments = commentable && commentsOpen;
  const effectiveZoom = narrow ? 100 : zoom;

  return (
    <div className="workspace">
      <header className="doc-header">
        <Link to="/" className="doc-header__home" aria-label="Your documents" data-tip="Your documents">
          <DocIcon size={40} />
        </Link>
        <div className="doc-header__main">
          <div className="doc-header__titlebar">
            <input
              ref={titleInput}
              className="doc-title"
              value={title}
              readOnly={!editable}
              aria-label="Document title"
              maxLength={200}
              size={Math.max(12, title.length + 1)}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => editable && e.currentTarget.select()}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editor.commands.focus();
                } else if (e.key === 'Escape') {
                  setTitle(doc.title);
                  editor.commands.focus();
                }
              }}
            />
            {editable ? (
              <SaveIndicator status={autosave.status} uploads={uploads} onConflict={() => setConflictDismissed(false)} />
            ) : (
              <span className="role-badge">{commentable ? 'Commenting' : 'View only'}</span>
            )}
            {role !== 'owner' && <span className="doc-header__owner muted">Owned by {doc.owner.name}</span>}
          </div>
          <MenuBar
            editor={editor}
            role={role}
            actions={{
              newDocument: () => void newDocument(),
              openDocuments: () => navigate('/'),
              duplicate: () => void duplicate(),
              share: () => setShareOpen(true),
              downloadHtml: () => void downloadHtml(editor, title, api),
              downloadText: () => downloadText(editor, title),
              print: () => window.print(),
              rename: () => titleInput.current?.focus(),
              remove: () => (role === 'owner' ? setConfirmRemove(true) : void remove()),
              insertImage: () => fileInput.current?.click(),
              insertLink: () => setLinkOpen(true),
              addComment: startComment,
              wordCount: () => setWordCountOpen(true),
              shortcuts: () => setShortcutsOpen(true),
              zoom,
              setZoom,
              commentsOpen: showComments,
              toggleComments: () => setCommentsOpen(!commentsOpen),
              pageMode,
              setPageMode,
            }}
          />
        </div>
        <div className="doc-header__end">
          {commentable && (
            <button
              type="button"
              className="icon-btn icon-btn--round comments-toggle"
              aria-label={showComments ? 'Hide comments' : 'Show comments'}
              aria-pressed={showComments}
              data-tip="Comments"
              onClick={() => setCommentsOpen(!commentsOpen)}
            >
              <MessageSquare size={18} strokeWidth={1.75} />
              {openIds.length > 0 && <span className="comments-toggle__count">{openIds.length}</span>}
            </button>
          )}
          <button type="button" className="elum-btn elum-btn--primary share-btn" onClick={() => setShareOpen(true)}>
            <Share2 size={16} strokeWidth={2} />
            <span>Share</span>
          </button>
          <ThemeToggle className="icon-btn icon-btn--round hide-narrow" />
          <UserMenu />
        </div>
      </header>

      {editable && (
        <div className="toolbar-row">
          <Toolbar
            editor={editor}
            zoom={zoom}
            onZoom={setZoom}
            onInsertImage={() => fileInput.current?.click()}
            onComment={startComment}
            linkOpen={linkOpen}
            onLinkOpenChange={setLinkOpen}
          />
        </div>
      )}

      <div className="canvas-wrap">
        <div className="canvas">
          <div className="canvas__inner" data-comments={showComments && wide ? 'aligned' : undefined}>
            <div
              className="page"
              data-theme={pageMode === 'paper' ? 'light' : undefined}
              data-hide-comments={!commentable || undefined}
              style={{ zoom: effectiveZoom / 100 }}
            >
              <EditorContent editor={editor} />
            </div>
            {showComments && !wide && <div className="comments-scrim" onClick={() => setCommentsOpen(false)} aria-hidden="true" />}
            {showComments && (
              <CommentsPanel
                editor={editor}
                threads={comments}
                me={me}
                isOwner={role === 'owner'}
                canComment={commentable}
                activeId={activeComment}
                onActivate={activateComment}
                onSubmitDraft={submitDraft}
                onCancelDraft={() => editor.commands.setCommentDraft(null)}
                onReply={async (id, body) => {
                  try {
                    replaceThread(await api.replyToComment(doc.id, id, body));
                  } catch (e) {
                    toast(errorMessage(e), { tone: 'error' });
                    throw e;
                  }
                }}
                onResolve={async (id, resolved) => {
                  try {
                    replaceThread(await api.setCommentResolved(doc.id, id, resolved));
                    if (resolved && activeComment === id) setActiveComment(null);
                  } catch (e) {
                    toast(errorMessage(e), { tone: 'error' });
                  }
                }}
                onDelete={async (id) => {
                  try {
                    await api.deleteComment(doc.id, id);
                    setComments((list) => list.filter((c) => c.id !== id));
                    editor.commands.removeCommentAnchor(id);
                  } catch (e) {
                    toast(errorMessage(e), { tone: 'error' });
                  }
                }}
                onClose={() => setCommentsOpen(false)}
                aligned={wide}
                layoutKey={`${effectiveZoom}-${pageMode}`}
              />
            )}
          </div>
        </div>
        <button type="button" className="status-pill" onClick={() => setWordCountOpen(true)} data-tip="Word count">
          {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
        </button>
      </div>

      <style>{commentRules}</style>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        hidden
        onChange={(e) => {
          insertFiles.current(imageFiles(e.target.files));
          e.target.value = '';
        }}
      />

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        doc={doc}
        title={title}
        onSharesChanged={(count) => setDoc((d) => ({ ...d, sharedWithCount: count }))}
      />
      <WordCountDialog open={wordCountOpen} onClose={() => setWordCountOpen(false)} editor={editor} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ConflictDialog
        open={autosave.status === 'conflict' && !conflictDismissed}
        onClose={() => setConflictDismissed(true)}
        onKeepMine={() => void autosave.keepMine()}
        onLoadLatest={async () => {
          const latest = await api.getDocument(doc.id).catch(() => null);
          if (!latest) return;
          applyRemote(latest.content);
          autosave.acceptVersion(latest.version);
        }}
      />
      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Delete this document?"
        description={`“${title}” will be deleted for you${doc.sharedWithCount ? ' and everyone you shared it with' : ''}. This cannot be undone.`}
        width={440}
        footer={
          <>
            <button type="button" className="elum-btn elum-btn--secondary" onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
            <button type="button" className="elum-btn elum-btn--danger" onClick={() => void remove()}>
              Delete
            </button>
          </>
        }
      />
    </div>
  );
}

function SaveIndicator({ status, uploads, onConflict }: { status: SaveStatus; uploads: number; onConflict: () => void }) {
  if (uploads > 0) {
    return (
      <span className="save-status" role="status">
        <LoaderCircle className="spin" size={16} strokeWidth={1.75} /> <span className="save-status__label">Adding image</span>
      </span>
    );
  }
  switch (status) {
    case 'pending':
    case 'saving':
      return (
        <span className="save-status" role="status">
          <LoaderCircle className="spin" size={16} strokeWidth={1.75} /> <span className="save-status__label">Saving</span>
        </span>
      );
    case 'error':
      return (
        <span className="save-status" data-tone="error" role="status">
          <CloudOff size={16} strokeWidth={1.75} /> <span className="save-status__label">Not saved yet. Trying again</span>
        </span>
      );
    case 'conflict':
      return (
        <button type="button" className="save-status save-status--button" data-tone="error" onClick={onConflict}>
          <TriangleAlert size={16} strokeWidth={1.75} /> <span className="save-status__label">Changed elsewhere</span>
        </button>
      );
    default:
      return (
        <span className="save-status" role="status" data-tip="Every change is saved as you go">
          <CloudCheck size={16} strokeWidth={1.75} /> <span className="save-status__label">Saved</span>
        </span>
      );
  }
}
