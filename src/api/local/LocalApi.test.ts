import { describe, expect, it } from 'vitest';
import { isApiError } from '../errors';
import { tokenStore } from '../tokenStore';
import type { DocNode } from '../types';
import { LocalApi } from './LocalApi';
import { DEMO_PASSWORD } from './seed';

const fastApi = () => new LocalApi({ passwordIterations: 1000 });

const docWith = (text: string, marks?: DocNode['marks']): DocNode => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] }],
});

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e: unknown) => isApiError(e) && e.code === code);
}

describe('accounts', () => {
  it('signs up, restores the session and signs out', async () => {
    const api = fastApi();
    const session = await api.signUp({ name: 'Sam Rivera', email: 'Sam@Example.org', password: 'correct horse' });
    expect(session.user.name).toBe('Sam Rivera');
    expect(tokenStore.get()).toBe(session.token);

    const restored = await api.restoreSession();
    expect(restored?.user.id).toBe(session.user.id);

    await api.signOut();
    expect(tokenStore.get()).toBeNull();
    expect(await api.restoreSession()).toBeNull();
  });

  it('never stores the password itself', async () => {
    const api = fastApi();
    await api.signUp({ name: 'Sam', email: 'sam@example.org', password: 'correct horse' });
    const everything = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k))
      .join('');
    expect(everything).not.toContain('correct horse');
  });

  it('rejects bad input, taken emails and wrong passwords', async () => {
    const api = fastApi();
    await expectCode(api.signUp({ name: '', email: 'a@b.co', password: 'longenough' }), 'invalid');
    await expectCode(api.signUp({ name: 'A', email: 'nope', password: 'longenough' }), 'invalid');
    await expectCode(api.signUp({ name: 'A', email: 'a@b.co', password: 'short' }), 'invalid');
    await api.signUp({ name: 'A', email: 'a@b.co', password: 'longenough' });
    await expectCode(api.signUp({ name: 'B', email: 'A@B.CO', password: 'longenough' }), 'email_taken');
    await expectCode(api.signIn({ email: 'a@b.co', password: 'wrong-password' }), 'invalid_credentials');
    await expectCode(api.signIn({ email: 'nobody@b.co', password: 'longenough' }), 'invalid_credentials');
    const ok = await api.signIn({ email: ' A@b.co ', password: 'longenough' });
    expect(ok.user.email).toBe('a@b.co');
  });

  it('lets demo people sign in with the demo password', async () => {
    const api = new LocalApi();
    const session = await api.signIn({ email: 'ada@example.com', password: DEMO_PASSWORD });
    expect(session.user.name).toBe('Ada Okafor');
  });

  it('requires a session for everything else', async () => {
    const api = fastApi();
    let fired = 0;
    api.onUnauthorized(() => fired++);
    await expectCode(api.listDocuments(), 'unauthorized');
    expect(fired).toBe(1);
  });

  it('gives every new account a welcome document', async () => {
    const api = fastApi();
    await api.signUp({ name: 'Sam', email: 'sam@example.org', password: 'correct horse' });
    const docs = await api.listDocuments();
    expect(docs.map((d) => d.title)).toEqual(['Welcome to Write']);
    expect(docs[0].preview[0]).toEqual({ kind: 'heading', level: 1, text: 'Welcome to Write' });
  });
});

describe('documents and sharing', () => {
  async function setup() {
    const api = fastApi();
    const owner = await api.signUp({ name: 'Owner', email: 'owner@example.org', password: 'password-1' });
    const doc = await api.createDocument({ title: '  Plans   for   spring ', content: docWith('Hello world') });
    return { api, owner, doc };
  }

  async function switchTo(api: LocalApi, email: string) {
    await api.signOut();
    await api.signIn({ email, password: DEMO_PASSWORD });
  }

  it('creates, renames, saves and lists documents', async () => {
    const { api, doc } = await setup();
    expect(doc.title).toBe('Plans for spring');
    expect(doc.role).toBe('owner');
    await api.renameDocument(doc.id, '');
    expect((await api.getDocument(doc.id)).title).toBe('Untitled document');

    const saved = await api.saveDocument(doc.id, { content: docWith('Changed'), baseVersion: doc.version });
    expect(saved.version).toBe(doc.version + 1);
    const owned = await api.listDocuments('owned');
    expect(owned.map((d) => d.id)).toContain(doc.id);
    expect(await api.listDocuments('shared')).toEqual([]);
  });

  it('detects conflicting saves unless forced', async () => {
    const { api, doc } = await setup();
    await api.saveDocument(doc.id, { content: docWith('First'), baseVersion: doc.version });
    await expectCode(api.saveDocument(doc.id, { content: docWith('Stale'), baseVersion: doc.version }), 'conflict');
    const forced = await api.saveDocument(doc.id, { content: docWith('Mine'), baseVersion: doc.version, force: true });
    expect(forced.version).toBe(doc.version + 2);
  });

  it('finds people by name or email, but not yourself', async () => {
    const { api } = await setup();
    expect((await api.searchUsers('ada')).map((u) => u.email)).toEqual(['ada@example.com']);
    expect((await api.searchUsers('EXAMPLE.COM')).length).toBe(4);
    expect(await api.searchUsers('owner')).toEqual([]);
    expect(await api.searchUsers('a')).toEqual([]);
  });

  it('enforces viewer, commenter and editor roles', async () => {
    const { api, doc } = await setup();
    await api.setShare(doc.id, 'demo-ada', 'viewer');
    await api.setShare(doc.id, 'demo-jonah', 'commenter');
    await api.setShare(doc.id, 'demo-mira', 'editor');
    expect((await api.listShares(doc.id)).map((s) => [s.user.id, s.role])).toEqual([
      ['demo-ada', 'viewer'],
      ['demo-jonah', 'commenter'],
      ['demo-mira', 'editor'],
    ]);

    // Viewer: can read, cannot comment or change anything.
    await switchTo(api, 'ada@example.com');
    const asViewer = await api.getDocument(doc.id);
    expect(asViewer.role).toBe('viewer');
    expect((await api.listDocuments('shared')).map((d) => d.id)).toEqual([doc.id]);
    await expectCode(api.saveDocument(doc.id, { content: docWith('Nope'), baseVersion: asViewer.version }), 'forbidden');
    await expectCode(api.addComment(doc.id, { id: 'comment-0001', body: 'Hi', quote: 'Hello' }), 'forbidden');
    await expectCode(api.setShare(doc.id, 'demo-theo', 'viewer'), 'forbidden');

    // Commenter: can comment and anchor comments, cannot edit text.
    await switchTo(api, 'jonah@example.com');
    const asCommenter = await api.getDocument(doc.id);
    await expectCode(api.saveDocument(doc.id, { content: docWith('Edited'), baseVersion: asCommenter.version }), 'forbidden');
    const anchored = docWith('Hello world', [{ type: 'comment', attrs: { commentId: 'comment-0001' } }]);
    await api.saveDocument(doc.id, { content: anchored, baseVersion: asCommenter.version });
    const thread = await api.addComment(doc.id, { id: 'comment-0001', body: 'Lovely', quote: 'Hello world' });
    expect(thread.author.name).toBe('Jonah Reyes');
    // Anchors are not edits.
    expect((await api.getDocument(doc.id)).updatedAt).toBe(asCommenter.updatedAt);

    // Editor: can edit and share, cannot delete.
    await switchTo(api, 'mira@example.com');
    const asEditor = await api.getDocument(doc.id);
    await api.saveDocument(doc.id, { content: docWith('Edited by Mira'), baseVersion: asEditor.version });
    await api.setShare(doc.id, 'demo-theo', 'commenter');
    await expectCode(api.deleteDocument(doc.id), 'forbidden');

    // Someone without access learns nothing beyond "ask for access".
    await api.removeShare(doc.id, 'demo-ada');
    await switchTo(api, 'ada@example.com');
    await expectCode(api.getDocument(doc.id), 'forbidden');
    expect(await api.listDocuments()).toEqual([]);
  });

  it('lets commenters anchor comments on documents saved without default attributes', async () => {
    const { api, doc } = await setup();
    await api.setShare(doc.id, 'demo-jonah', 'commenter');
    await switchTo(api, 'jonah@example.com');
    const current = await api.getDocument(doc.id);
    // What the editor sends back: null defaults spelled out, attribute keys in another order.
    const fromEditor: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null, indent: null },
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world', marks: [{ type: 'comment', attrs: { commentId: 'comment-0002' } }] },
          ],
        },
      ],
    };
    await expect(api.saveDocument(doc.id, { content: fromEditor, baseVersion: current.version })).resolves.toBeTruthy();
  });

  it('runs comment threads: reply, resolve, delete', async () => {
    const { api, doc } = await setup();
    await api.addComment(doc.id, { id: 'comment-0003', body: 'Check this', quote: 'Hello' });
    await api.setCommentResolved(doc.id, 'comment-0003', true);
    const reopened = await api.replyToComment(doc.id, 'comment-0003', 'Reopening');
    expect(reopened.resolved).toBe(false);
    expect(reopened.replies).toHaveLength(1);

    await api.setShare(doc.id, 'demo-jonah', 'commenter');
    await switchTo(api, 'jonah@example.com');
    await expectCode(api.deleteComment(doc.id, 'comment-0003'), 'forbidden');
    await api.signOut();
    await api.signIn({ email: 'owner@example.org', password: 'password-1' });
    await api.deleteComment(doc.id, 'comment-0003');
    expect(await api.listComments(doc.id)).toEqual([]);
  });

  it('duplicates without comments and deletes everything with the document', async () => {
    const { api, doc } = await setup();
    await api.saveDocument(doc.id, {
      content: docWith('Hello', [{ type: 'comment', attrs: { commentId: 'comment-0004' } }]),
      baseVersion: doc.version,
    });
    await api.addComment(doc.id, { id: 'comment-0004', body: 'Note', quote: 'Hello' });
    await api.setShare(doc.id, 'demo-ada', 'viewer');

    const copy = await api.duplicateDocument(doc.id);
    expect(copy.title).toBe('Copy of Plans for spring');
    expect(JSON.stringify(copy.content)).not.toContain('comment');

    await api.deleteDocument(doc.id);
    await expectCode(api.getDocument(doc.id), 'not_found');
    expect(await api.listComments(copy.id)).toEqual([]);
    expect(localStorage.getItem('elum.local.v1.shares')).toBe('{}');
  });

  it('stores uploaded images and checks their type', async () => {
    const { api, doc } = await setup();
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const asset = await api.uploadAsset(doc.id, png);
    expect(asset.url).toMatch(/^elum-asset:/);
    expect((await api.fetchAsset(asset.url)).size).toBe(4);
    await expectCode(api.uploadAsset(doc.id, new Blob(['x'], { type: 'text/html' })), 'invalid');
  });
});
