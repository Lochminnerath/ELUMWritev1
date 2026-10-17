import { Link2, Mail, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { api, errorMessage, type DocumentRecord, type Invite, type PublicUser, type Share, type ShareRole } from '../api';
import { canShare, ROLE_LABEL, SHARE_ROLES } from '../api/roles';
import { useUser } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { DocIcon } from '../components/Brand';
import { Dialog } from '../components/Dialog';
import { Loader } from '../components/Loader';
import { useToast } from '../components/Toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Someone to share with: a person found by search, or an email address typed in full. */
type Recipient = { kind: 'user'; user: PublicUser } | { kind: 'email'; email: string };

const recipientKey = (r: Recipient) => (r.kind === 'user' ? `u:${r.user.id}` : `e:${r.email}`);

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  doc: DocumentRecord;
  title: string;
  onSharesChanged?: (count: number) => void;
}

export function ShareDialog({ open, onClose, doc, title, onSharesChanged }: ShareDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={`Share “${title}”`} icon={<DocIcon size={30} />} width={540}>
      <ShareBody doc={doc} onClose={onClose} onSharesChanged={onSharesChanged} />
    </Dialog>
  );
}

function MailAvatar({ size }: { size: number }) {
  return (
    <span className="share__mail-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <Mail size={Math.round(size * 0.5)} strokeWidth={1.75} />
    </span>
  );
}

function ShareBody({ doc, onClose, onSharesChanged }: { doc: DocumentRecord; onClose: () => void; onSharesChanged?: (count: number) => void }) {
  const me = useUser();
  const toast = useToast();
  const manage = canShare(doc.role);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Recipient[]>([]);
  const [role, setRole] = useState<ShareRole>('viewer');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const reload = async () => {
    try {
      const [list, pending] = await Promise.all([api.listShares(doc.id), api.listInvites(doc.id)]);
      setShares(list);
      setInvites(pending);
      onSharesChanged?.(list.length);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    void reload();
  }, [doc.id]);

  // Search as the person types, a moment after they pause.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const found = await api.searchUsers(q);
        if (!alive) return;
        setResults(found.filter((u) => u.id !== doc.owner.id));
        setActive(0);
      } catch (e) {
        if (alive) setError(errorMessage(e));
      } finally {
        if (alive) setSearching(false);
      }
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query, doc.owner.id]);

  const typedEmail = query.trim().toLowerCase();
  // A full email address that is not an account in the results can be invited directly.
  const canInviteTyped =
    EMAIL_RE.test(typedEmail) && !searching && !results.some((u) => u.email.toLowerCase() === typedEmail) && typedEmail !== doc.owner.email.toLowerCase();
  const options: Recipient[] = [
    ...results.map((user) => ({ kind: 'user' as const, user })),
    ...(canInviteTyped ? [{ kind: 'email' as const, email: typedEmail }] : []),
  ];

  const hasAccess = (id: string) => id === doc.owner.id || !!shares?.some((s) => s.user.id === id);

  const pick = (recipient: Recipient) => {
    if (!picked.some((p) => recipientKey(p) === recipientKey(recipient))) setPicked((list) => [...list, recipient]);
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  const verb = (r: ShareRole) => (r === 'viewer' ? 'view' : r === 'commenter' ? 'comment on' : 'edit');

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      const outcomes = await Promise.all(
        picked.map((r) => (r.kind === 'user' ? api.setShare(doc.id, r.user.id, role).then(() => 'share' as const) : api.shareByEmail(doc.id, r.email, role).then((o) => o.kind))),
      );
      const invited = outcomes.filter((o) => o === 'invite').length;
      if (picked.length === 1 && invited === 1) {
        toast(`Invited ${(picked[0] as { email: string }).email}. They can ${verb(role)} it once they sign up and confirm that address.`, { tone: 'success', duration: 7000 });
      } else if (picked.length === 1) {
        const r = picked[0];
        toast(`${r.kind === 'user' ? r.user.name : r.email} can now ${verb(role)} this document`, { tone: 'success' });
      } else {
        toast(invited ? `Shared with ${picked.length} people, ${invited} by invite` : `Shared with ${picked.length} people`, { tone: 'success' });
      }
      setPicked([]);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId: string, next: ShareRole | 'remove') => {
    setError(null);
    try {
      if (next === 'remove') await api.removeShare(doc.id, userId);
      else await api.setShare(doc.id, userId, next);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const changeInvite = async (email: string, next: ShareRole | 'remove') => {
    setError(null);
    try {
      if (next === 'remove') await api.removeInvite(doc.id, email);
      else await api.shareByEmail(doc.id, email, next);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/d/${doc.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied. Only people with access can open it.', { tone: 'success' });
    } catch {
      toast(url);
    }
  };

  const showList = query.trim().length >= 2;

  return (
    <div className="share">
      {manage ? (
        <div className="share__add">
          <div className="share__search">
            <Search size={18} strokeWidth={1.75} aria-hidden="true" />
            {picked.map((r) => (
              <span key={recipientKey(r)} className="share__chip">
                {r.kind === 'user' ? <Avatar user={r.user} size={20} /> : <MailAvatar size={20} />}
                {r.kind === 'user' ? r.user.name : r.email}
                <button
                  type="button"
                  aria-label={`Remove ${r.kind === 'user' ? r.user.name : r.email}`}
                  onClick={() => setPicked((list) => list.filter((p) => recipientKey(p) !== recipientKey(r)))}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              data-autofocus
              value={query}
              placeholder={picked.length ? 'Add more people' : 'Add people by name or email'}
              aria-label="Find people to share with, or type an email address"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(options.length - 1, i + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === 'Enter' && options[active]) {
                  e.preventDefault();
                  pick(options[active]);
                } else if (e.key === 'Backspace' && !query && picked.length) {
                  setPicked((list) => list.slice(0, -1));
                }
              }}
            />
          </div>

          {showList && (
            <div className="share__results" id={listId} role="listbox" aria-label="People">
              {searching && options.length === 0 ? (
                <div className="share__hint">
                  <Loader size={20} label="Searching" />
                </div>
              ) : options.length === 0 ? (
                <div className="share__hint muted">
                  No one matches “{query.trim()}”. Type their full email address to invite them.
                  {api.mode === 'local' && ' In preview mode you can also find the demo people, such as Ada or Jonah.'}
                </div>
              ) : (
                options.map((r, i) => (
                  <div
                    key={recipientKey(r)}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="share__result"
                    data-active={i === active}
                    onPointerEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(r)}
                  >
                    {r.kind === 'user' ? <Avatar user={r.user} size={32} /> : <MailAvatar size={32} />}
                    <span className="share__who">
                      <span className="share__name">{r.kind === 'user' ? r.user.name : `Invite ${r.email}`}</span>
                      <span className="share__email">
                        {r.kind === 'user' ? r.user.email : 'No account yet. They get access once they sign up and confirm this address.'}
                      </span>
                    </span>
                    {r.kind === 'user' && hasAccess(r.user.id) && <span className="share__badge">Has access</span>}
                    {r.kind === 'email' && invites.some((inv) => inv.email === r.email) && <span className="share__badge">Invited</span>}
                  </div>
                ))
              )}
            </div>
          )}

          {picked.length > 0 && (
            <div className="share__confirm">
              <label className="visually-hidden" htmlFor="share-role">
                Role
              </label>
              <select id="share-role" className="select" value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
                {SHARE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}: {r.hint.toLowerCase()}
                  </option>
                ))}
              </select>
              <button type="button" className="elum-btn elum-btn--primary elum-btn--sm" disabled={busy} onClick={() => void share()}>
                Share
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="share__note muted">You can see who has access. Only the owner and editors can add people.</p>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <h3 className="share__heading">People with access</h3>
      {!shares ? (
        <Loader size={24} label="Loading people with access" />
      ) : (
        <ul className="share__people">
          <li className="share__person">
            <Avatar user={doc.owner} size={36} />
            <span className="share__who">
              <span className="share__name">
                {doc.owner.name}
                {doc.owner.id === me.id && ' (you)'}
              </span>
              <span className="share__email">{doc.owner.email}</span>
            </span>
            <span className="share__role muted">Owner</span>
          </li>
          {shares.map((s) => (
            <li key={s.user.id} className="share__person">
              <Avatar user={s.user} size={36} />
              <span className="share__who">
                <span className="share__name">
                  {s.user.name}
                  {s.user.id === me.id && ' (you)'}
                </span>
                <span className="share__email">{s.user.email}</span>
              </span>
              {manage && s.user.id !== me.id ? (
                <select
                  className="select share__role-select"
                  aria-label={`Role for ${s.user.name}`}
                  value={s.role}
                  onChange={(e) => void changeRole(s.user.id, e.target.value as ShareRole | 'remove')}
                >
                  {SHARE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                  <option value="remove">Remove access</option>
                </select>
              ) : (
                <span className="share__role muted">{ROLE_LABEL[s.role]}</span>
              )}
            </li>
          ))}
          {invites.map((inv) => (
            <li key={inv.email} className="share__person">
              <MailAvatar size={36} />
              <span className="share__who">
                <span className="share__name">{inv.email}</span>
                <span className="share__email">Invited{inv.invitedBy ? ` by ${inv.invitedBy.name}` : ''}. Waiting for them to sign up.</span>
              </span>
              {manage ? (
                <select
                  className="select share__role-select"
                  aria-label={`Role for ${inv.email}`}
                  value={inv.role}
                  onChange={(e) => void changeInvite(inv.email, e.target.value as ShareRole | 'remove')}
                >
                  {SHARE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                  <option value="remove">Cancel invite</option>
                </select>
              ) : (
                <span className="share__role muted">{ROLE_LABEL[inv.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="share__footer">
        <button type="button" className="elum-btn elum-btn--secondary elum-btn--sm" onClick={() => void copyLink()}>
          <Link2 size={16} strokeWidth={1.75} /> Copy link
        </button>
        <button type="button" className="elum-btn elum-btn--primary elum-btn--sm" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
