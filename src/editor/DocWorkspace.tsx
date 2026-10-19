import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
  ChevronDown,
  CloudCheck,
  CloudOff,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  HardDrive,
  LogOut,
  MessageSquare,
  Minus,
  PenLine,
  Plus,
  Printer,
  TriangleAlert,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage, isApiError, type CommentThread, type DocNode, type DocumentRecord } from '../api';
import { ACCEPTED_IMAGE_TYPES } from '../api/client';
import { emptyDocument } from '../api/content';
import { canComment, canEdit } from '../api/roles';
import { useUser } from '../auth/AuthProvider';
import { DocIcon, WriteMark } from '../components/Brand';
import { ShareIcon } from '../components/ShareIcon';
import { Dialog } from '../components/Dialog';
import { Loader } from '../components/Loader';
import { Menu, type MenuEntry } from '../components/Menu';
import { useToast } from '../components/Toast';
import { NotificationBell } from '../components/NotificationBell';
import { UserMenu } from '../components/UserMenu';
import { useMediaQuery, usePersistedState } from '../lib/hooks';
import { ThemeToggle } from '../theme/ThemeToggle';
import { ConflictDialog, ShortcutsDialog, WordCountDialog } from './EditorDialogs';
import { DocumentProblem } from './EditorPage';
import { CommentsPanel } from './CommentsPanel';
import { findCommentRanges, getCommentDraft } from './extensions/Comment';
import { buildExtensions } from './extensions/index';
import { ALLOW_META } from './extensions/Permissions';
import { downloadHtml, downloadText, printDocument } from './exporters';
import { loadFonts } from './fonts';
import { clearFormatting, ZOOMS } from './format';
import { hasMod, keyLabel } from './keys';
import type { PageMode } from './pageMode';
import { ShareDialog } from './ShareDialog';
import { InsertPanel, OutlinePanel, PagePanel, Rail, SpellingPanel, type PanelId } from './SidePanels';
import { SpellMenu } from './spelling/SpellMenu';
import { docSettings } from './academic/AcademicDocument';
import { academicCss } from './academic/styles';
import { StylesPanel } from './academic/StylesPanel';
import { useSpellChecker, useSpelling } from './spelling/useSpelling';
import { Toolbar } from './toolbar/Toolbar';
import { useAutosave, type SaveStatus } from './useAutosave';

const POLL_MS = 15_000;
const MENU_ICON = { size: 16, strokeWidth: 1.75 };
const isZoom = (v: unknown): v is number => typeof v === 'number' && ZOOMS.includes(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isPageMode = (v: unknown): v is PageMode => v === 'theme' || v === 'paper';
const PANEL_IDS: PanelId[] = ['outline', 'insert', 'styles', 'spelling', 'page'];
const isPanel = (v: unknown): v is PanelId | null => v === null || PANEL_IDS.includes(v as PanelId);
// Each academic style's look, for the page on screen (the exported copy has its own scope).
const PAGE_ACADEMIC_CSS = academicCss((id) => `.page[data-doc-style="${id}"] .doc-content`);

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
  // The tool panel is remembered on wide screens; on small screens it opens as a drawer on demand.
  const [widePanel, setWidePanel] = usePersistedState<PanelId | null>('elum.editor.panel', null, isPanel);
  const [drawerPanel, setDrawerPanel] = useState<PanelId | null>(null);
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
  const panel = narrow ? drawerPanel : widePanel;
  const setPanel = narrow ? setDrawerPanel : setWidePanel;
  const setCommentsOpen = useCallback((open: boolean) => (wide ? setPanelOpen(open) : setDrawerOpen(open)), [wide, setPanelOpen]);

  const role = doc.role;
  const editable = canEdit(role);
  const commentable = canComment(role);

  useEffect(() => loadFonts(), []);

  const spellChecker = useSpellChecker();
  const extensions = useMemo(
    () => buildExtensions({ resolveImageSrc: (src) => api.resolveAssetUrl(src), placeholder: 'Start writing', spellChecker }),
    [spellChecker],
  );

  const editor = useEditor({
    extensions,
    content: initialDoc.content,
    editable: initialDoc.role !== 'viewer',
    editorProps: {
      attributes: {
        class: 'doc-content',
        'aria-label': 'Document text',
        // Write checks spelling itself, the same on every device (see spelling/).
        spellcheck: 'false',
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
  const spelling = useSpelling(editor, spellChecker, editable);
  const spellingCount = useEditorState({ editor, selector: ({ editor: e }) => e?.storage.spellcheck.issues.length ?? 0 }) ?? 0;

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

  const print = useCallback(
    (asPdf = false) => {
      if (!editor) return;
      if (asPdf) toast('In the print window, choose “Save as PDF” as the destination.');
      printDocument(editor, title, api).catch((e) => toast(errorMessage(e), { tone: 'error' }));
    },
    [editor, title, toast],
  );

  // Shortcuts that live outside the editor's own keymap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hasMod(e) || !editor) return;
      const key = e.key.toLowerCase();
      if (key === 'p') {
        // Print a clean copy rather than the editor page.
        e.preventDefault();
        print();
      } else if (key === 's') {
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
  }, [editor, editable, autosave, startComment, toast, print]);

  const settings = useEditorState({ editor, selector: ({ editor: e }) => (e ? docSettings(e.state.doc.attrs) : docSettings({})) });
  const words = useEditorState({ editor, selector: ({ editor: e }) => e?.storage.characterCount.words() ?? 0 });

  if (lostAccess) return <DocumentProblem kind="forbidden" message={lostAccess} />;
  if (!editor) return null;

  const showComments = commentable && commentsOpen;
  const effectiveZoom = narrow ? 100 : zoom;
  const openPanel = (id: PanelId) => setPanel(id);
  const toolPanel = panel && (editable || (panel !== 'insert' && panel !== 'spelling' && panel !== 'styles')) ? panel : null;

  const documentMenu = (): MenuEntry[] => [
    { label: 'New document', icon: <FilePlus2 {...MENU_ICON} />, onSelect: () => void newDocument() },
    { label: 'Your documents', icon: <FolderOpen {...MENU_ICON} />, onSelect: () => navigate('/') },
    { label: 'Make a copy', icon: <Copy {...MENU_ICON} />, onSelect: () => void duplicate() },
    { label: 'Rename', icon: <PenLine {...MENU_ICON} />, disabled: !editable, onSelect: () => titleInput.current?.focus() },
    'separator',
    { label: 'Share', icon: <ShareIcon size={MENU_ICON.size} strokeWidth={MENU_ICON.strokeWidth} />, onSelect: () => setShareOpen(true) },
    {
      label: 'Download',
      icon: <Download {...MENU_ICON} />,
      items: [
        { label: 'PDF (.pdf)', hint: 'Save as PDF', onSelect: () => print(true) },
        { label: 'Web page (.html)', onSelect: () => void downloadHtml(editor, title, api) },
        { label: 'Plain text (.txt)', onSelect: () => downloadText(editor, title) },
      ],
    },
    { label: 'Print', icon: <Printer {...MENU_ICON} />, shortcut: keyLabel('Mod+P'), onSelect: () => print() },
    ...(narrow
      ? ([
          'separator',
          { label: 'Outline', onSelect: () => openPanel('outline') },
          ...(editable
            ? [
                { label: 'Insert', onSelect: () => openPanel('insert') },
                { label: 'Styles and citations', onSelect: () => openPanel('styles') },
                { label: 'Spelling', onSelect: () => openPanel('spelling') },
              ]
            : []),
          { label: 'Page and view', onSelect: () => openPanel('page') },
        ] as MenuEntry[])
      : []),
    'separator',
    role === 'owner'
      ? { label: 'Delete', icon: <Trash2 {...MENU_ICON} />, danger: true, onSelect: () => setConfirmRemove(true) }
      : { label: 'Remove from my documents', icon: <LogOut {...MENU_ICON} />, onSelect: () => void remove() },
  ];

  return (
    <div className="workspace">
      <header className="ws-bar">
        <Link to="/" className="ws-bar__home" aria-label="Your documents" data-tip="Your documents">
          <WriteMark size={30} />
        </Link>
        <div className="ws-bar__doc">
          <DocIcon size={26} />
          <div className="ws-bar__titles">
            <div className="ws-bar__titleline">
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
              <Menu
                label="Document"
                items={documentMenu}
                trigger={(props) => (
                  <button type="button" className="doc-menu-btn" aria-label="Document menu" data-tip="Document menu" {...props}>
                    <ChevronDown size={16} strokeWidth={2} />
                  </button>
                )}
              />
            </div>
            <div className="ws-bar__meta">
              {editable ? (
                <SaveIndicator status={autosave.status} uploads={uploads} onConflict={() => setConflictDismissed(false)} />
              ) : (
                <span className="role-badge">{commentable ? 'Commenting' : 'View only'}</span>
              )}
              {role !== 'owner' && <span className="ws-bar__owner muted">Owned by {doc.owner.name}</span>}
            </div>
          </div>
        </div>
        <div className="ws-bar__end">
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
          <NotificationBell />
          <button type="button" className="share-btn" onClick={() => setShareOpen(true)}>
            <ShareIcon size={18} strokeWidth={1.9} />
            <span>Share</span>
          </button>
          <ThemeToggle className="icon-btn icon-btn--round hide-narrow" />
          <UserMenu />
        </div>
      </header>

      <div className="ws-body">
        {!narrow && (
          <Rail active={toolPanel} onSelect={setPanel} editable={editable} spellingCount={spelling.on ? spellingCount : 0} onShortcuts={() => setShortcutsOpen(true)} />
        )}
        {toolPanel && narrow && <div className="comments-scrim" onClick={() => setPanel(null)} aria-hidden="true" />}
        {toolPanel && (
          <div className="side-panel-wrap" data-drawer={narrow || undefined}>
            {toolPanel === 'outline' && <OutlinePanel editor={editor} onClose={() => setPanel(null)} />}
            {toolPanel === 'insert' && (
              <InsertPanel
                editor={editor}
                onClose={() => setPanel(null)}
                onImage={() => fileInput.current?.click()}
                onLink={() => setLinkOpen(true)}
                onComment={startComment}
              />
            )}
            {toolPanel === 'styles' && <StylesPanel editor={editor} onClose={() => setPanel(null)} />}
            {toolPanel === 'spelling' && <SpellingPanel editor={editor} spelling={spelling} onClose={() => setPanel(null)} />}
            {toolPanel === 'page' && (
              <PagePanel
                editor={editor}
                onClose={() => setPanel(null)}
                zoom={zoom}
                setZoom={setZoom}
                pageMode={pageMode}
                setPageMode={setPageMode}
                commentsOpen={showComments}
                canComment={commentable}
                toggleComments={() => setCommentsOpen(!commentsOpen)}
              />
            )}
          </div>
        )}

        <div className="canvas-wrap">
          <div className="canvas">
            <div className="canvas__inner" data-comments={showComments && wide ? 'aligned' : undefined} data-dock={editable || undefined}>
              <div
                className="page"
                data-theme={pageMode === 'paper' ? 'light' : undefined}
                data-hide-comments={!commentable || undefined}
                data-doc-style={settings.docStyle ?? undefined}
                style={{ zoom: effectiveZoom / 100 }}
              >
                {(settings.pageNumbers || settings.header) && (
                  <div className="page-header" aria-label="Page header">
                    {[settings.header, settings.pageNumbers ? '1' : null].filter(Boolean).join(' ')}
                  </div>
                )}
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
                  layoutKey={`${effectiveZoom}-${pageMode}-${toolPanel}`}
                />
              )}
            </div>
          </div>

          {editable && (
            <div className="dock">
              <Toolbar editor={editor} academic={settings.docStyle} onInsertImage={() => fileInput.current?.click()} onComment={startComment} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen} />
            </div>
          )}

          <div className="status-bar">
            <button type="button" className="status-bar__item" onClick={() => setWordCountOpen(true)} data-tip="Word count">
              {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
            </button>
            {!narrow && (
              <div className="status-bar__zoom" role="group" aria-label="Zoom">
                <button
                  type="button"
                  className="status-bar__step"
                  aria-label="Zoom out"
                  disabled={zoom === ZOOMS[0]}
                  onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}
                >
                  <Minus size={14} strokeWidth={2} />
                </button>
                <button type="button" className="status-bar__item mono" onClick={() => setZoom(100)} data-tip="Reset zoom">
                  {zoom}%
                </button>
                <button
                  type="button"
                  className="status-bar__step"
                  aria-label="Zoom in"
                  disabled={zoom === ZOOMS[ZOOMS.length - 1]}
                  onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}
                >
                  <Plus size={14} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {editable && <SpellMenu editor={editor} spelling={spelling} />}
      <style>{commentRules}</style>
      <style>{PAGE_ACADEMIC_CSS}</style>

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
  // Where documents live: the account (Supabase or the ELUM API), or only this browser when Write runs unconnected for development.
  const local = api.mode === 'local';
  if (uploads > 0 || status === 'pending' || status === 'saving') {
    return (
      <span className="save-status" role="status">
        <Loader size={18} label={uploads > 0 ? 'Adding image' : 'Saving'} />
        <span className="save-status__label">{uploads > 0 ? 'Adding image' : 'Saving'}</span>
      </span>
    );
  }
  switch (status) {
    case 'error':
      return (
        <span className="save-status" data-tone="error" role="status">
          <CloudOff size={15} strokeWidth={1.75} /> <span className="save-status__label">Not saved yet. Trying again</span>
        </span>
      );
    case 'conflict':
      return (
        <button type="button" className="save-status save-status--button" data-tone="error" onClick={onConflict}>
          <TriangleAlert size={15} strokeWidth={1.75} /> <span className="save-status__label">Changed elsewhere</span>
        </button>
      );
    default:
      return local ? (
        <span className="save-status" data-tone="local" role="status" data-tip="This copy of Write is not connected to ELUM, so documents stay in this browser">
          <HardDrive size={15} strokeWidth={1.75} /> <span className="save-status__label">Saved in this browser only</span>
        </span>
      ) : (
        <span className="save-status" role="status" data-tip="Saved to your ELUM account, so it is on every device you sign in to">
          <CloudCheck size={15} strokeWidth={1.75} /> <span className="save-status__label">Saved to your account</span>
        </span>
      );
  }
}
