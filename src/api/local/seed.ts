import type { LocalDb } from './db';
import { DEFAULT_ITERATIONS } from './passwords';

/** Avatar colours come from the product family. */
export const AVATAR_COLORS = ['#f59a52', '#3fc4a0', '#9b84ee', '#ec7fa9', '#e9b949', '#7093f8'];

export const DEMO_PASSWORD = 'write-demo';

/**
 * Demo people so sharing can be tried before the ELUM API exists. They are
 * only created by the local API. Sign in as any of them with DEMO_PASSWORD.
 * Hashes are precomputed so seeding costs nothing at start-up.
 */
const DEMO_PEOPLE = [
  { id: 'demo-ada', name: 'Ada Okafor', email: 'ada@example.com', salt: '7e11da41fc7a1b817cdfa9117d2c32b5', hash: '71cea78ae92a575dbcf5ea06de81aad82dd97601409145836daf77c05d2d7ab4' },
  { id: 'demo-jonah', name: 'Jonah Reyes', email: 'jonah@example.com', salt: 'd44e2344e50b3336b48fdf3e577182dc', hash: '1b3215d79d554ecd24360be18a651bb9cb0067d53c04bbd70d8426ff82c15ed6' },
  { id: 'demo-mira', name: 'Mira Lindqvist', email: 'mira@example.com', salt: 'c3c5c0268de7f32550e337786018cde1', hash: '90464b74e2e87a8d11807364c2c9229422f53eb27acd33d109d75792a1b5ea9f' },
  { id: 'demo-theo', name: 'Theo Park', email: 'theo@example.com', salt: '0610b67dac57fc7b489928f8de8ab26d', hash: '9958b4012984ce362e72d7c1650a4a1e7ddefcabde62dfd2ddbd73e39bbf419a' },
];

export function seedDemoPeople(db: LocalDb) {
  const users = db.read('users');
  if (DEMO_PEOPLE.every((p) => users[p.id])) return;
  const credentials = db.read('credentials');
  const createdAt = new Date(0).toISOString();
  DEMO_PEOPLE.forEach((p, i) => {
    if (users[p.id]) return;
    users[p.id] = {
      id: p.id,
      name: p.name,
      email: p.email,
      emailLower: p.email,
      color: AVATAR_COLORS[(i + 1) % AVATAR_COLORS.length],
      createdAt,
    };
    credentials[p.id] = { salt: p.salt, hash: p.hash, iterations: DEFAULT_ITERATIONS };
  });
  db.write('users', users);
  db.write('credentials', credentials);
}
