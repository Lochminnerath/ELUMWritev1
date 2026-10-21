import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { SupabaseApi } from './SupabaseApi';

/** Just enough of a Supabase client to see what signing up and in with a Type address does. */
function fakeClient({ domain = 'type.elum.services', signupError }: { domain?: string | null; signupError?: { code: string; message: string } } = {}) {
  const calls = { signIn: [] as string[], invoked: [] as { name: string; body: Record<string, unknown> }[] };
  const client = {
    rpc: async (name: string, args?: { p_handle?: string }) => {
      if (name === 'type_domain') return domain ? { data: domain, error: null } : { data: null, error: { message: 'missing' } };
      if (name === 'elum_handle_available') return { data: args?.p_handle !== 'taken', error: null };
      return { data: null, error: { message: 'unexpected' } };
    },
    functions: {
      invoke: async (name: string, { body }: { body: Record<string, unknown> }) => {
        calls.invoked.push({ name, body });
        if (!signupError) return { data: { data: { address: `${body.handle}@${domain}` } }, error: null };
        const response = new Response(JSON.stringify({ error: { ...signupError, details: {} } }), { status: 409 });
        return { data: null, error: { context: response } };
      },
    },
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async ({ email }: { email: string }) => {
        calls.signIn.push(email);
        return { data: { session: null }, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('ELUM Type addresses in Write', () => {
  it('creates the account through type-signup, then signs in with it', async () => {
    const { client, calls } = fakeClient();
    const api = new SupabaseApi('https://x.supabase.co', 'anon', client);
    // The fake sign-in refuses, so signUp ends in an error; what matters is what was sent.
    await expect(
      api.signUp({ name: 'Fen Field', email: '', password: 'long-password', accountType: 'type', handle: 'Fen', recoveryEmail: 'fen@example.org' }),
    ).rejects.toThrow();
    expect(calls.invoked).toEqual([
      { name: 'type-signup', body: { handle: 'fen', name: 'Fen Field', password: 'long-password', recoveryEmail: 'fen@example.org' } },
    ]);
    expect(calls.signIn).toEqual(['fen@type.elum.services']);
  });

  it('shows the server\'s reason when the name is taken', async () => {
    const { client } = fakeClient({ signupError: { code: 'conflict', message: 'That name is taken.' } });
    const api = new SupabaseApi('https://x.supabase.co', 'anon', client);
    await expect(api.signUp({ name: 'Fen', email: '', password: 'long-password', accountType: 'type', handle: 'fen' })).rejects.toMatchObject({
      code: 'conflict',
      message: 'That name is taken.',
      details: { field: 'handle' },
    });
  });

  it('checks the name before asking the server', async () => {
    const { client, calls } = fakeClient();
    const api = new SupabaseApi('https://x.supabase.co', 'anon', client);
    await expect(api.signUp({ name: 'Fen', email: '', password: 'long-password', accountType: 'type', handle: 'admin' })).rejects.toMatchObject({
      details: { field: 'handle' },
    });
    expect(calls.invoked).toEqual([]);
  });

  it('signs in with just the name, on the domain the database reports', async () => {
    const { client, calls } = fakeClient({ domain: 'type.elum.example' });
    const api = new SupabaseApi('https://x.supabase.co', 'anon', client);
    await expect(api.signIn({ email: 'Fen', password: 'long-password' })).rejects.toThrow();
    await expect(api.signIn({ email: 'Ola@Example.org', password: 'long-password' })).rejects.toThrow();
    expect(calls.signIn).toEqual(['fen@type.elum.example', 'ola@example.org']);
  });

  it('says whether a name is free', async () => {
    const { client } = fakeClient();
    const api = new SupabaseApi('https://x.supabase.co', 'anon', client);
    expect(await api.handleAvailable('fen')).toBe(true);
    expect(await api.handleAvailable('taken')).toBe(false);
    expect(await api.handleAvailable('x')).toBe(false);
  });
});

describe('accounts without a profile', () => {
  function clientWithoutProfile({ ensureWorks = true } = {}) {
    let profile: Record<string, unknown> | null = null;
    const rpcs: string[] = [];
    const row = { id: 'u1', name: 'Lee', email: 'lee@example.org', color: '#3fc4a0', account_type: 'external', welcomed: true, created_at: '2026-10-18T00:00:00Z' };
    const client = {
      rpc: async (name: string) => {
        rpcs.push(name);
        if (name === 'elum_ensure_profile') {
          if (!ensureWorks) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
          profile = row;
        }
        return { data: null, error: null };
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }),
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithPassword: async () => ({
          data: { session: { access_token: 't', expires_at: 2000000000, user: { id: 'u1' } } },
          error: null,
        }),
      },
    };
    return { client: client as unknown as SupabaseClient, rpcs };
  }

  it('get one made when they sign in', async () => {
    const { client, rpcs } = clientWithoutProfile();
    const api = new SupabaseApi('https://x.supabase.co', 'anon', client);
    const session = await api.signIn({ email: 'lee@example.org', password: 'long-password' });
    expect(session.user).toMatchObject({ id: 'u1', name: 'Lee', email: 'lee@example.org' });
    expect(rpcs[0]).toBe('elum_ensure_profile');
  });

  it('are told what is wrong when the database cannot make one', async () => {
    const { client } = clientWithoutProfile({ ensureWorks: false });
    const api = new SupabaseApi('https://x.supabase.co', 'anon', client);
    await expect(api.signIn({ email: 'lee@example.org', password: 'long-password' })).rejects.toThrow(/missing its profile/);
  });
});
