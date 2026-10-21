import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Check, EllipsisVertical, MessageSquare, X } from 'lucide-react';
import { DeleteIcon, RestoreIcon } from '../components/icons/ElumIcons';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { CommentThread, PublicUser } from '../api';
import { Avatar } from '../components/Avatar';
import { Menu } from '../components/Menu';
import { formatFull, formatWhen } from '../lib/time';
import { findCommentRanges, getCommentDraft, type Range } from './extensions/Comment';
import { hasMod, keyLabel } from './keys';

const GAP = 10;
const DRAFT = '__draft__';

interface CommentsPanelProps {
  editor: Editor;
  threads: CommentThread[];
  me: PublicUser;
  isOwner: boolean;
  canComment: boolean;
  activeId: string | null;
  onActivate: (id: string) => void;
  onSubmitDraft: (body: string) => Promise<void>;
  onCancelDraft: () => void;
  onReply: (id: string, body: string) => Promise<void>;
  onResolve: (id: string, resolved: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  /** Line cards up beside the text they belong to (wide screens). */
  aligned: boolean;
  /** Changes when the page layout changes (zoom), so positions are measured again. */
  layoutKey: string;
}

export function CommentsPanel(props: CommentsPanelProps) {
  const { editor, threads, activeId, aligned, layoutKey } = props;
  const [tab, setTab] = useState<'open' | 'resolved'>('open');

  // Anchor positions and the draft range, recomputed only when they change.
  const anchorKey = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const parts = [...findCommentRanges(e.state.doc)].map(([id, r]) => `${id}:${r.from}:${r.to}`);
      const draft = getCommentDraft(e.state);
      return `${parts.join('|')}#${draft ? `${draft.from}:${draft.to}` : ''}`;
    },
  });
  const { ranges, draft } = useMemo(() => {
    const [list, d] = anchorKey.split('#');
    const map = new Map<string, Range>();
    if (list) {
      for (const part of list.split('|')) {
        const [id, from, to] = part.split(':');
        map.set(id, { from: Number(from), to: Number(to) });
      }
    }
    const [df, dt] = d ? d.split(':').map(Number) : [];
    return { ranges: map, draft: d ? { from: df, to: dt } : null };
  }, [anchorKey]);

  const open = threads.filter((t) => !t.resolved);
  const resolved = threads.filter((t) => t.resolved);
  // Anchored threads in document order, then any whose text was deleted.
  const ordered = [...open].sort((a, b) => (ranges.get(a.id)?.from ?? Infinity) - (ranges.get(b.id)?.from ?? Infinity));

  useEffect(() => {
    if (draft) setTab('open');
  }, [draft]);

  // ---- Alignment beside the text ----
  const panelRef = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [tops, setTops] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const resizeObserver = useMemo(() => new ResizeObserver(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    resizeObserver.observe(editor.view.dom);
    return () => resizeObserver.disconnect();
  }, [editor, resizeObserver]);

  const cardRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      const prev = cards.current.get(key);
      if (prev && prev !== el) resizeObserver.unobserve(prev);
      if (el) {
        cards.current.set(key, el);
        resizeObserver.observe(el);
      } else cards.current.delete(key);
    },
    [resizeObserver],
  );

  useLayoutEffect(() => {
    if (!aligned || tab !== 'open' || !panelRef.current) return;
    const base = panelRef.current.getBoundingClientRect().top;
    const anchorTop = (pos: number) => {
      try {
        return editor.view.coordsAtPos(Math.min(pos, editor.state.doc.content.size)).top - base;
      } catch {
        return 0;
      }
    };
    const items: { key: string; anchor: number; height: number }[] = [];
    if (draft) items.push({ key: DRAFT, anchor: anchorTop(draft.from), height: cards.current.get(DRAFT)?.offsetHeight ?? 140 });
    let lastAnchor = 0;
    for (const t of ordered) {
      const range = ranges.get(t.id);
      const anchor = range ? anchorTop(range.from) : lastAnchor;
      lastAnchor = Math.max(lastAnchor, anchor);
      items.push({ key: t.id, anchor, height: cards.current.get(t.id)?.offsetHeight ?? 96 });
    }
    items.sort((a, b) => a.anchor - b.anchor);

    const next: Record<string, number> = {};
    const focus = items.findIndex((i) => i.key === (draft ? DRAFT : activeId));
    if (focus >= 0) {
      // The active card sits level with its text; the rest make room around it.
      const a = items[focus];
      next[a.key] = a.anchor;
      let limit = a.anchor - GAP;
      for (let i = focus - 1; i >= 0; i--) {
        const top = Math.min(items[i].anchor, limit - items[i].height);
        next[items[i].key] = top;
        limit = top - GAP;
      }
      let floor = a.anchor + a.height + GAP;
      for (let i = focus + 1; i < items.length; i++) {
        const top = Math.max(items[i].anchor, floor);
        next[items[i].key] = top;
        floor = top + items[i].height + GAP;
      }
    } else {
      let floor = 0;
      for (const item of items) {
        const top = Math.max(item.anchor, floor);
        next[item.key] = top;
        floor = top + item.height + GAP;
      }
    }
    setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [aligned, tab, anchorKey, threads, activeId, tick, layoutKey]);

  const height = aligned ? Math.max(0, ...Object.entries(tops).map(([k, top]) => top + (cards.current.get(k)?.offsetHeight ?? 0))) : undefined;
  const place = (key: string) => (aligned && tab === 'open' ? { position: 'absolute' as const, top: tops[key] ?? 0, opacity: key in tops ? 1 : 0 } : undefined);

  return (
    <aside className={`comments ${aligned ? 'comments--aligned' : 'comments--drawer'}`} aria-label="Comments">
      <header className="comments__header">
        <MessageSquare size={18} strokeWidth={1.75} aria-hidden="true" />
        <h2 className="comments__title">Comments</h2>
        <div className="segmented" role="group" aria-label="Show comments">
          <button type="button" aria-pressed={tab === 'open'} onClick={() => setTab('open')}>
            Open {open.length > 0 && <span className="comments__count">{open.length}</span>}
          </button>
          <button type="button" aria-pressed={tab === 'resolved'} onClick={() => setTab('resolved')}>
            Resolved
          </button>
        </div>
        <button type="button" className="icon-btn" aria-label="Close comments" onClick={props.onClose}>
          <X size={18} strokeWidth={1.75} />
        </button>
      </header>

      <div ref={panelRef} className="comments__list" style={{ minHeight: height }}>
        {tab === 'open' && draft && props.canComment && (
          <DraftCard me={props.me} cardRef={cardRef(DRAFT)} style={place(DRAFT)} onSubmit={props.onSubmitDraft} onCancel={props.onCancelDraft} />
        )}
        {tab === 'open' &&
          ordered.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              {...props}
              orphan={!ranges.has(t.id)}
              showQuote={!aligned || !ranges.has(t.id)}
              active={t.id === activeId}
              cardRef={cardRef(t.id)}
              style={place(t.id)}
            />
          ))}
        {tab === 'resolved' &&
          resolved.map((t) => (
            <ThreadCard key={t.id} thread={t} {...props} orphan={!ranges.has(t.id)} showQuote active={t.id === activeId} />
          ))}
        {tab === 'open' && !draft && open.length === 0 && (
          <p className="comments__empty muted">
            {props.canComment ? `No comments yet. Select some text and choose Add comment (${keyLabel('Mod+Alt+M')}).` : 'No comments yet.'}
          </p>
        )}
        {tab === 'resolved' && resolved.length === 0 && <p className="comments__empty muted">Nothing resolved yet.</p>}
      </div>
    </aside>
  );
}

function submitOnModEnter(submit: () => void, cancel?: () => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && hasMod(e)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && cancel) {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };
}

function DraftCard({
  me,
  cardRef,
  style,
  onSubmit,
  onCancel,
}: {
  me: PublicUser;
  cardRef: (el: HTMLElement | null) => void;
  style?: CSSProperties;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(body);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article ref={cardRef} className="thread thread--draft" data-active="true" style={style}>
      <header className="thread__head">
        <Avatar user={me} size={28} />
        <span className="thread__name">{me.name}</span>
      </header>
      <textarea
        className="input textarea thread__input"
        autoFocus
        rows={3}
        value={body}
        placeholder="Add a comment"
        aria-label="New comment"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={submitOnModEnter(() => void submit(), onCancel)}
      />
      <div className="thread__actions">
        <button type="button" className="elum-btn elum-btn--quiet elum-btn--sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="elum-btn elum-btn--primary elum-btn--sm" disabled={!body.trim() || busy} onClick={() => void submit()}>
          Comment
        </button>
      </div>
    </article>
  );
}

interface ThreadCardProps extends CommentsPanelProps {
  thread: CommentThread;
  active: boolean;
  orphan: boolean;
  showQuote: boolean;
  cardRef?: (el: HTMLElement | null) => void;
  style?: CSSProperties;
}

function ThreadCard({ thread, active, orphan, showQuote, cardRef, style, me, isOwner, canComment, onActivate, onReply, onResolve, onDelete }: ThreadCardProps) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const canDelete = canComment && (thread.author.id === me.id || isOwner);

  const sendReply = async () => {
    if (!reply.trim() || busy) return;
    setBusy(true);
    try {
      await onReply(thread.id, reply);
      setReply('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      ref={cardRef}
      className="thread"
      data-active={active}
      data-resolved={thread.resolved || undefined}
      style={style}
      tabIndex={0}
      aria-label={`Comment by ${thread.author.name}`}
      onClick={() => onActivate(thread.id)}
      onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onActivate(thread.id)}
    >
      <header className="thread__head">
        <Avatar user={thread.author} size={28} />
        <span className="thread__meta">
          <span className="thread__name">{thread.author.name}</span>
          <time className="thread__time" dateTime={thread.createdAt} title={formatFull(thread.createdAt)}>
            {formatWhen(thread.createdAt)}
          </time>
        </span>
        {canComment && !thread.resolved && (
          <button
            type="button"
            className="icon-btn thread__resolve"
            aria-label="Resolve"
            data-tip="Resolve"
            onClick={(e) => {
              e.stopPropagation();
              void onResolve(thread.id, true);
            }}
          >
            <Check size={18} strokeWidth={2} />
          </button>
        )}
        {canDelete && (
          <Menu
            label="Comment actions"
            placement="bottom-end"
            items={[{ label: 'Delete thread', icon: <DeleteIcon size={16} strokeWidth={1.75} />, danger: true, onSelect: () => void onDelete(thread.id) }]}
            trigger={(p) => (
              <button type="button" className="icon-btn" aria-label="More comment actions" {...p} onClick={(e) => (e.stopPropagation(), p.onClick())}>
                <EllipsisVertical size={18} strokeWidth={1.75} />
              </button>
            )}
          />
        )}
      </header>

      {showQuote && thread.quote && (
        <blockquote className="thread__quote" data-orphan={orphan || undefined}>
          {orphan && <span className="thread__orphan">The text for this comment was removed.</span>}
          {thread.quote}
        </blockquote>
      )}
      <p className="thread__body">{thread.body}</p>

      {thread.replies.map((r) => (
        <div key={r.id} className="thread__reply">
          <header className="thread__head">
            <Avatar user={r.author} size={24} />
            <span className="thread__meta">
              <span className="thread__name">{r.author.name}</span>
              <time className="thread__time" dateTime={r.createdAt} title={formatFull(r.createdAt)}>
                {formatWhen(r.createdAt)}
              </time>
            </span>
          </header>
          <p className="thread__body">{r.body}</p>
        </div>
      ))}

      {thread.resolved ? (
        <footer className="thread__resolved">
          <span className="muted">Resolved{thread.resolvedBy ? ` by ${thread.resolvedBy.name}` : ''}</span>
          {canComment && (
            <button
              type="button"
              className="elum-btn elum-btn--quiet elum-btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                void onResolve(thread.id, false);
              }}
            >
              <RestoreIcon size={14} strokeWidth={1.75} /> Reopen
            </button>
          )}
        </footer>
      ) : (
        active &&
        canComment && (
          <div className="thread__reply-box" onClick={(e) => e.stopPropagation()}>
            <textarea
              className="input textarea thread__input"
              rows={1}
              value={reply}
              placeholder="Reply"
              aria-label="Reply"
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={submitOnModEnter(() => void sendReply(), () => setReply(''))}
            />
            {reply.trim() && (
              <div className="thread__actions">
                <button type="button" className="elum-btn elum-btn--quiet elum-btn--sm" onClick={() => setReply('')}>
                  Cancel
                </button>
                <button type="button" className="elum-btn elum-btn--primary elum-btn--sm" disabled={busy} onClick={() => void sendReply()}>
                  Reply
                </button>
              </div>
            )}
          </div>
        )
      )}
    </article>
  );
}
