import { PrivateIcon } from '../components/icons/ElumIcons';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, errorMessage, isApiError, type CommentThread, type DocumentRecord } from '../api';
import { canComment } from '../api/roles';
import { useUser } from '../auth/AuthProvider';
import { DocIcon } from '../components/Brand';
import { FullPageLoader } from '../components/Loader';
import { DocWorkspace } from './DocWorkspace';
import './editor.css';
import { useFavicon } from '../lib/favicon';
import { SupportLinks } from '../components/SupportLink';

type State =
  | { status: 'loading' }
  | { status: 'ready'; doc: DocumentRecord; comments: CommentThread[] }
  | { status: 'error'; kind: 'forbidden' | 'not_found' | 'other'; message: string };

export default function EditorPage() {
  const { docId = '' } = useParams();
  useFavicon('/favicons/doc.svg');
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    (async () => {
      try {
        const doc = await api.getDocument(docId);
        const comments = canComment(doc.role) ? await api.listComments(docId) : [];
        if (alive) setState({ status: 'ready', doc, comments });
      } catch (e) {
        if (!alive) return;
        const kind = isApiError(e, 'forbidden') ? 'forbidden' : isApiError(e, 'not_found') ? 'not_found' : 'other';
        setState({ status: 'error', kind, message: errorMessage(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [docId]);

  if (state.status === 'loading') return <FullPageLoader label="Opening document" />;
  if (state.status === 'error') return <DocumentProblem kind={state.kind} message={state.message} />;
  return <DocWorkspace key={state.doc.id} initialDoc={state.doc} initialComments={state.comments} />;
}

export function DocumentProblem({ kind, message }: { kind: 'forbidden' | 'not_found' | 'other'; message: string }) {
  const me = useUser();
  return (
    <div className="doc-problem">
      <div className="empty-state">
        {kind === 'forbidden' ? <PrivateIcon size={44} strokeWidth={1.5} color="var(--write-deep)" /> : <DocIcon size={72} />}
        <h2>{kind === 'forbidden' ? 'You need access' : kind === 'not_found' ? 'This document is not here' : 'We could not open this document'}</h2>
        <p>{message}</p>
        {kind === 'forbidden' && <p className="muted">You are signed in as {me.email}.</p>}
        <Link to="/" className="elum-btn elum-btn--primary">
          Go to your documents
        </Link>
        {kind === 'other' && <SupportLinks app="write" code="open-failed" message={message} />}
      </div>
    </div>
  );
}
