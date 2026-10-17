import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';

beforeEach(() => {
  globalThis.localStorage?.clear();
});
