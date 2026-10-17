// @vitest-environment node
/// <reference types="node" />
/**
 * Runs SupabaseApi against a real database with the migration applied, behind
 * PostgREST (the same REST layer Supabase uses). Start it with
 * supabase/tests/integration.sh; without it, these tests are skipped.
 * Auth and Storage are Supabase services that are not part of this setup, so
 * sign-in and images are covered by the app's own checks instead.
 */
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isApiError } from '../errors';
import type { DocNode } from '../types';
import { SupabaseApi } from './SupabaseApi';

const URL = process.env.ELUM_IT_POSTGREST_URL;
const SECRET = process.env.ELUM_IT_JWT_SECRET;

// Seeded by integration.sh.
const PEOPLE = {
  owner: '00000000-0000-0000-0000-0000000000a1',
  viewer: '00000000-0000-0000-0000-0000000000a2',
  commenter: '00000000-0000-0000-0000-0000000000a3',
  editor: '00000000-0000-0000-0000-0000000000a4',
  stranger: '00000000-0000-0000-0000-0000000000a5',
};

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(sub: string) {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac('sha256', SECRET!).update(body).digest('base64url')}`;
}

/** An API signed in as `who`. PostgREST serves at the root, Supabase at /rest/v1. */
function as(who: keyof typeof PEOPLE): SupabaseApi {
  const client = createClient('http://supabase.test', 'anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${jwt(PEOPLE[who])}` },
      fetch: (input, init) => fetch(String(input).replace('http://supabase.test/rest/v1', URL!), init),
    },
  });
  const api = new SupabaseApi('http://supabase.test', 'anon-key', client);
  // Sessions come from Supabase Auth, which is not running here.
  (api as unknown as { me: () => Promise<string> }).me = async () => PEOPLE[who];
  return api;
}

const text = (t: string, marks?: DocNode['marks']): DocNode => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: t, ...(marks ? { marks } : {}) }] }],
});

async function code(p: Promise<unknown>) {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return isApiError(e) ? e.code : `unexpected: ${String(e)}`;
  }
}

describe.skipIf(!URL || !SECRET)('SupabaseApi against Postgres and PostgREST', () => {
  it('runs documents, sharing, comments and permissions end to end', async () => {
    const owner = as('owner');
    const viewer = as('viewer');
    const commenter = as('commenter');
    const editor = as('editor');
    const stranger = as('stranger');

    // Create, list, rename
    const doc = await owner.createDocument({ title: '  Field   notes ', content: text('Hello world') });
    expect(doc.title).toBe('Field notes');
    expect(doc.role).toBe('owner');
    expect(doc.version).toBe(1);
    expect(doc.owner.name).toBe('Olu Owner');
    expect(doc.lastOpenedAt).toBeNull();
    const reopened = await owner.getDocument(doc.id);
    expect(reopened.lastOpenedAt).not.toBeNull();
    expect((await owner.renameDocument(doc.id, 'Spring notes')).title).toBe('Spring notes');
    expect((await owner.listDocuments('owned')).map((d) => d.id)).toContain(doc.id);

    // Search and share
    expect((await owner.searchUsers('vee')).map((u) => u.name)).toEqual(['Vee Viewer']);
    expect(await owner.searchUsers('olu')).toEqual([]);
    await owner.setShare(doc.id, PEOPLE.viewer, 'viewer');
    await owner.setShare(doc.id, PEOPLE.commenter, 'viewer');
    const changed = await owner.setShare(doc.id, PEOPLE.commenter, 'commenter');
    expect(changed.role).toBe('commenter');
    await owner.setShare(doc.id, PEOPLE.editor, 'editor');
    const shares = await owner.listShares(doc.id);
    expect(shares.map((s) => [s.user.name, s.role])).toEqual([
      ['Vee Viewer', 'viewer'],
      ['Cam Commenter', 'commenter'],
      ['Eda Editor', 'editor'],
    ]);
    expect(shares[0].addedBy?.name).toBe('Olu Owner');
    expect(await code(owner.setShare(doc.id, PEOPLE.owner, 'editor'))).toBe('forbidden');

    // Sharing by email: accounts directly, everyone else by invite
    const byEmail = await owner.shareByEmail(doc.id, ' STAN@example.org ', 'viewer');
    expect(byEmail.kind === 'share' && byEmail.share.user.name).toBe('Stan Stranger');
    await owner.removeShare(doc.id, PEOPLE.stranger);
    const invite = await owner.shareByEmail(doc.id, 'New.Person@Example.org', 'commenter');
    expect(invite).toMatchObject({ kind: 'invite', invite: { email: 'new.person@example.org', role: 'commenter' } });
    expect(invite.kind === 'invite' && invite.invite.invitedBy?.name).toBe('Olu Owner');
    expect((await viewer.listInvites(doc.id)).map((i) => i.email)).toEqual(['new.person@example.org']);
    expect(await code(viewer.shareByEmail(doc.id, 'x@example.org', 'viewer'))).toBe('forbidden');
    expect(await code(viewer.removeInvite(doc.id, 'new.person@example.org'))).toBe('forbidden');
    expect(await code(owner.shareByEmail(doc.id, 'nope', 'viewer'))).toBe('invalid');
    await owner.removeInvite(doc.id, 'NEW.person@example.org');
    expect(await owner.listInvites(doc.id)).toEqual([]);

    // Stranger
    expect(await code(stranger.getDocument(doc.id))).toBe('forbidden');
    expect(await code(stranger.getDocument('10000000-0000-0000-0000-0000000000ff'))).toBe('not_found');
    expect(await code(stranger.getDocument('not-a-uuid'))).toBe('not_found');
    expect(await stranger.listDocuments()).toEqual([]);

    // Viewer
    const asViewer = await viewer.getDocument(doc.id);
    expect(asViewer.role).toBe('viewer');
    expect((await viewer.listDocuments('shared')).map((d) => d.id)).toEqual([doc.id]);
    expect(await code(viewer.saveDocument(doc.id, { content: text('Nope'), baseVersion: 1 }))).toBe('forbidden');
    expect(await code(viewer.renameDocument(doc.id, 'Nope'))).toBe('forbidden');
    expect(await code(viewer.setShare(doc.id, PEOPLE.stranger, 'viewer'))).toBe('forbidden');
    expect(await code(viewer.addComment(doc.id, { id: 'comment-v0001', body: 'Hi', quote: '' }))).toBe('forbidden');

    // Commenter: anchors only, then a thread
    expect(await code(commenter.saveDocument(doc.id, { content: text('Edited'), baseVersion: 1 }))).toBe('forbidden');
    const anchored: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null, indent: null },
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world', marks: [{ type: 'comment', attrs: { commentId: 'comment-c0001' } }] },
          ],
        },
      ],
    };
    const thread = await commenter.addComment(doc.id, { id: 'comment-c0001', body: 'Lovely', quote: 'world' });
    expect(thread.author.name).toBe('Cam Commenter');
    expect((await commenter.saveDocument(doc.id, { content: anchored, baseVersion: 1 })).version).toBe(2);
    const resolved = await commenter.setCommentResolved(doc.id, thread.id, true);
    expect(resolved.resolvedBy?.name).toBe('Cam Commenter');
    const replied = await owner.replyToComment(doc.id, thread.id, 'Thanks');
    expect(replied.resolved).toBe(false);
    expect(replied.replies.map((r) => [r.author.name, r.body])).toEqual([['Olu Owner', 'Thanks']]);
    expect(await viewer.listComments(doc.id)).toEqual([]);
    expect(await code(commenter.deleteComment(doc.id, 'comment-missing'))).toBe('forbidden');

    // Editor: saves, conflicts, forced saves, cannot delete
    const saved = await editor.saveDocument(doc.id, { content: text('Edited by Eda'), baseVersion: 2 });
    expect(saved.version).toBe(3);
    const conflict = await editor.saveDocument(doc.id, { content: text('Stale'), baseVersion: 2 }).catch((e) => e);
    expect(isApiError(conflict, 'conflict') && conflict.details?.version).toBe(3);
    expect((await editor.saveDocument(doc.id, { content: text('Mine'), baseVersion: 2, force: true })).version).toBe(4);
    const latest = await owner.getDocument(doc.id);
    expect(latest.updatedBy?.name).toBe('Eda Editor');
    expect(latest.preview).toEqual([{ kind: 'text', text: 'Mine' }]);
    expect(await code(editor.deleteDocument(doc.id))).toBe('forbidden');

    // Copy, leave, delete
    const copy = await viewer.duplicateDocument(doc.id);
    expect(copy.title).toBe('Copy of Spring notes');
    expect(copy.role).toBe('owner');
    await viewer.leaveDocument(doc.id);
    expect(await code(viewer.getDocument(doc.id))).toBe('forbidden');
    expect(await code(owner.leaveDocument(doc.id))).toBe('invalid');

    await owner.deleteComment(doc.id, thread.id);
    expect(await owner.listComments(doc.id)).toEqual([]);
    await owner.deleteDocument(doc.id);
    expect(await code(owner.getDocument(doc.id))).toBe('not_found');
    await viewer.deleteDocument(copy.id);
  });

  it('keeps preferences per person and merges changes', async () => {
    const owner = as('owner');
    const viewer = as('viewer');
    expect((await owner.getPreferences()).colors).toEqual([]);
    await owner.updatePreferences({ colors: ['#FF8800', 'not a colour'] });
    const merged = await owner.updatePreferences({ dictionary: ['ELUM'], spellLanguage: 'en-GB' });
    expect(merged.colors).toEqual(['#ff8800']);
    expect(merged.dictionary).toEqual(['ELUM']);
    expect((await owner.getPreferences()).spellLanguage).toBe('en-GB');
    expect((await viewer.getPreferences()).dictionary).toEqual([]);
  });
});
