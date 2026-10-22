import { EllipsisVertical, Files, LayoutGrid, LayoutList, Plus, Search, User, Users, X, type LucideIcon } from 'lucide-react';
import { OpenIcon, RenameIcon } from '../components/icons/ElumIcons';
import { DeleteIcon, DuplicateIcon, SignOutIcon } from '../components/icons/ElumIcons';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage, type DocumentFilter, type DocumentSummary } from '../api';
import { buildPreview, emptyDocument } from '../api/content';
import { canEdit } from '../api/roles';
import { useUser } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { DocIcon, WriteLockup } from '../components/Brand';
import { Dialog } from '../components/Dialog';
import { Loader } from '../components/Loader';
import { Menu } from '../components/Menu';
import { useToast } from '../components/Toast';
import { NotificationBell } from '../components/NotificationBell';
import { UserMenu } from '../components/UserMenu';
import { TEMPLATES, type Template } from '../lib/templates';
import { formatFull, formatWhen, formatWhenInline } from '../lib/time';
import { ThemeToggle } from '../theme/ThemeToggle';
import { DocThumbnail } from './DocThumbnail';
import './HomePage.css';
import { ElumLauncher } from '../components/ElumLauncher';

type Sort = 'recent' | 'modified' | 'title';
type View = 'grid' | 'list';

const ICON = { size: 16, strokeWidth: 1.75 };
const VIEW_KEY = 'elum.home.view';

const FILTERS: { value: DocumentFilter; label: string; title: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'All documents', title: 'All documents', icon: Files },
  { value: 'owned', label: 'Mine', title: 'Your documents', icon: User },
  { value: 'shared', label: 'Shared with me', title: 'Shared with you', icon: Users },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Last opened by me' },
  { value: 'modified', label: 'Last edited' },
  { value: 'title', label: 'Title' },
];

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function HomePage() {
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DocumentFilter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [view, setView] = useState<View>(readView);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<DocumentSummary | null>(null);
  const [deleting, setDeleting] = useState<DocumentSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      // Everything at once: filters switch instantly and show their counts.
      setDocs(await api.listDocuments('all'));
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Pick up changes made in other tabs when coming back.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  useEffect(() => {
    document.title = 'Documents - ELUM Write';
  }, []);

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Remembered for this visit only.
    }
  };

  const create = async (template?: Template) => {
    if (creating) return;
    setCreating(true);
    try {
      const doc = await api.createDocument(template ? { title: template.title, content: template.content() } : { content: emptyDocument() });
      navigate(`/d/${doc.id}`);
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
      setCreating(false);
    }
  };

  const duplicate = async (doc: DocumentSummary) => {
    try {
      const copy = await api.duplicateDocument(doc.id);
      toast(`Made a copy of “${doc.title}”`, { tone: 'success', action: { label: 'Open', onClick: () => navigate(`/d/${copy.id}`) } });
      void load();
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const leave = async (doc: DocumentSummary) => {
    try {
      await api.leaveDocument(doc.id);
      toast(`Removed “${doc.title}” from your documents`);
      void load();
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const visible = useMemo(() => {
    if (!docs) return null;
    const q = query.trim().toLowerCase();
    const inFilter = docs.filter((d) => filter === 'all' || (filter === 'owned' ? d.role === 'owner' : d.role !== 'owner'));
    const matches = q
      ? inFilter.filter((d) => d.title.toLowerCase().includes(q) || d.preview.some((b) => b.text?.toLowerCase().includes(q)))
      : inFilter;
    const time = (d: DocumentSummary) => Date.parse(sort === 'recent' ? (d.lastOpenedAt ?? d.updatedAt) : d.updatedAt);
    return [...matches].sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : time(b) - time(a)));
  }, [docs, query, sort, filter]);

  const counts = useMemo(() => {
    if (!docs) return null;
    const owned = docs.filter((d) => d.role === 'owner').length;
    return { all: docs.length, owned, shared: docs.length - owned } satisfies Record<DocumentFilter, number>;
  }, [docs]);

  const whenLabel = (d: DocumentSummary) =>
    sort !== 'modified' && d.lastOpenedAt ? `Opened ${formatWhenInline(d.lastOpenedAt)}` : `Edited ${formatWhenInline(d.updatedAt)}`;

  const docMenu = (doc: DocumentSummary) => [
    { label: 'Open in new tab', icon: <OpenIcon {...ICON} />, onSelect: () => window.open(`/d/${doc.id}`, '_blank', 'noopener') },
    { label: 'Rename', icon: <RenameIcon {...ICON} />, disabled: !canEdit(doc.role), onSelect: () => setRenaming(doc) },
    { label: 'Make a copy', icon: <DuplicateIcon {...ICON} />, onSelect: () => void duplicate(doc) },
    'separator' as const,
    doc.role === 'owner'
      ? { label: 'Delete', icon: <DeleteIcon {...ICON} />, danger: true, onSelect: () => setDeleting(doc) }
      : { label: 'Remove from my documents', icon: <SignOutIcon {...ICON} />, onSelect: () => void leave(doc) },
  ];

  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="home">
      <header className="app-header">
        <Link to="/" className="brand-link" aria-label="ELUM Write home">
          <WriteLockup height={30} />
        </Link>
        <label className="home__search">
          <Search size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden">Search documents</span>
          <input type="search" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={16} strokeWidth={1.75} />
            </button>
          )}
        </label>
        <div className="app-header__end">
          <ElumLauncher />
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <div className="home__layout">
        <aside className="home__side" aria-label="Start and filter">
          <button type="button" className="new-doc-btn" onClick={() => void create()} disabled={creating}>
            {creating ? <Loader size={20} label="Creating document" /> : <Plus size={20} strokeWidth={2} />}
            New document
          </button>

          <nav className="home__nav" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" className="home__nav-item" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                <f.icon size={18} strokeWidth={1.75} />
                <span>{f.label}</span>
                {counts && <span className="home__nav-count">{counts[f.value]}</span>}
              </button>
            ))}
          </nav>

          <section className="home__start" aria-labelledby="start-heading">
            <h2 id="start-heading" className="home__side-label">
              Start from
            </h2>
            <ul className="home__templates">
              {TEMPLATES.map((tpl) => (
                <li key={tpl.id}>
                  <button type="button" className="template" onClick={() => void create(tpl)} disabled={creating}>
                    <span className="template__page">
                      <DocThumbnail blocks={buildPreview(tpl.content())} />
                    </span>
                    <span className="template__text">
                      <span className="template__name">{tpl.name}</span>
                      <span className="template__description">{tpl.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>

      <main className="home__docs" aria-labelledby="docs-heading">
        <div className="home__toolbar">
          <div className="home__hero">
            <p className="home__hello">Hello, {firstName}</p>
            <h1 id="docs-heading" className="home__heading">
              {FILTERS.find((f) => f.value === filter)!.title}
            </h1>
          </div>
          <div className="home__toolbar-end">
            <label className="visually-hidden" htmlFor="sort">
              Sort by
            </label>
            <select id="sort" className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="segmented segmented--icons" role="group" aria-label="Layout">
              <button type="button" aria-pressed={view === 'grid'} aria-label="Grid" onClick={() => changeView('grid')}>
                <LayoutGrid size={16} strokeWidth={1.75} />
              </button>
              <button type="button" aria-pressed={view === 'list'} aria-label="List" onClick={() => changeView('list')}>
                <LayoutList size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>

        {loadError ? (
          <div className="empty-state">
            <p>{loadError}</p>
            <button type="button" className="elum-btn elum-btn--secondary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : !visible ? (
          <ul className="doc-grid doc-grid--loading" role="status" aria-label="Loading your documents">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="doc-card doc-card--skeleton" aria-hidden="true">
                <span className="skeleton skeleton--thumb" />
                <span className="doc-card__body">
                  <span className="skeleton skeleton--line" />
                  <span className="skeleton skeleton--line skeleton--short" />
                </span>
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <DocIcon size={72} />
            {query ? (
              <>
                <h2>Nothing matches “{query}”</h2>
                <p>Try another word, or clear the search.</p>
              </>
            ) : filter === 'shared' ? (
              <>
                <h2>Nothing shared yet</h2>
                <p>When someone shares a document with you, it shows up here.</p>
              </>
            ) : (
              <>
                <h2>No documents yet</h2>
                <p>Your first page is one click away.</p>
                <button type="button" className="elum-btn elum-btn--primary" onClick={() => void create()}>
                  <Plus size={18} strokeWidth={2} /> New document
                </button>
              </>
            )}
          </div>
        ) : view === 'grid' ? (
          <ul className="doc-grid">
            {visible.map((doc, i) => (
              <li key={doc.id} className="doc-card" style={{ '--i': Math.min(i, 12) } as CSSProperties}>
                <Link to={`/d/${doc.id}`} className="doc-card__link">
                  <DocThumbnail blocks={doc.preview} />
                  <span className="doc-card__body">
                    <span className="doc-card__title">{doc.title}</span>
                    <span className="doc-card__meta">
                      <DocIcon size={18} />
                      {doc.role !== 'owner' ? (
                        <Avatar user={doc.owner} size={18} title={`Owned by ${doc.owner.name}`} />
                      ) : doc.sharedWithCount > 0 ? (
                        <Users size={14} strokeWidth={1.75} aria-label="Shared" />
                      ) : null}
                      <span title={formatFull(doc.lastOpenedAt ?? doc.updatedAt)}>{whenLabel(doc)}</span>
                    </span>
                  </span>
                </Link>
                <DocMenu doc={doc} items={docMenu(doc)} />
              </li>
            ))}
          </ul>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Owner</th>
                <th scope="col">{sort === 'modified' ? 'Last edited' : 'Last opened by me'}</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <Link to={`/d/${doc.id}`} className="doc-table__name">
                      <DocIcon size={24} />
                      <span>{doc.title}</span>
                      {doc.sharedWithCount > 0 && doc.role === 'owner' && <Users size={14} strokeWidth={1.75} aria-label="Shared" />}
                    </Link>
                  </td>
                  <td className="doc-table__owner">
                    <Avatar user={doc.owner} size={22} />
                    {doc.role === 'owner' ? 'Me' : doc.owner.name}
                  </td>
                  <td className="muted" title={formatFull(doc.lastOpenedAt ?? doc.updatedAt)}>
                    {sort === 'modified' || !doc.lastOpenedAt ? formatWhen(doc.updatedAt) : formatWhen(doc.lastOpenedAt)}
                  </td>
                  <td className="doc-table__actions">
                    <DocMenu doc={doc} items={docMenu(doc)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
      </div>

      <RenameDialog
        doc={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={() => {
          setRenaming(null);
          void load();
        }}
      />

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this document?"
        description={
          deleting && (
            <>
              “{deleting.title}” will be deleted for you
              {deleting.sharedWithCount > 0 ? ` and the ${deleting.sharedWithCount} people you shared it with` : ''}. This cannot be undone.
            </>
          )
        }
        width={440}
        footer={
          <>
            <button type="button" className="elum-btn elum-btn--secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="elum-btn elum-btn--danger"
              onClick={async () => {
                if (!deleting) return;
                const doc = deleting;
                setDeleting(null);
                try {
                  await api.deleteDocument(doc.id);
                  toast(`Deleted “${doc.title}”`);
                  void load();
                } catch (e) {
                  toast(errorMessage(e), { tone: 'error' });
                }
              }}
            >
              Delete
            </button>
          </>
        }
      />
    </div>
  );
}

function DocMenu({ doc, items }: { doc: DocumentSummary; items: Parameters<typeof Menu>[0]['items'] }) {
  return (
    <Menu
      label={`Actions for ${doc.title}`}
      placement="bottom-end"
      items={items}
      trigger={(props) => (
        <button type="button" className="icon-btn doc-more" aria-label={`More actions for ${doc.title}`} {...props}>
          <EllipsisVertical size={18} strokeWidth={1.75} />
        </button>
      )}
    />
  );
}

function RenameDialog({ doc, onClose, onRenamed }: { doc: DocumentSummary | null; onClose: () => void; onRenamed: () => void }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (doc) {
      setTitle(doc.title);
      setError(null);
    }
  }, [doc]);

  return (
    <Dialog
      open={!!doc}
      onClose={onClose}
      title="Rename document"
      width={440}
      footer={
        <>
          <button type="button" className="elum-btn elum-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="rename-doc" className="elum-btn elum-btn--primary">
            Rename
          </button>
        </>
      }
    >
      <form
        id="rename-doc"
        className="field"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!doc) return;
          try {
            await api.renameDocument(doc.id, title);
            onRenamed();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <label htmlFor="rename-input">Title</label>
        <input
          id="rename-input"
          className="input"
          value={title}
          maxLength={200}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setTitle(e.target.value)}
        />
        {error && <span className="field-error">{error}</span>}
      </form>
    </Dialog>
  );
}
