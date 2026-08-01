import assert from 'node:assert/strict';
import test from 'node:test';

import { createBrowserStringStorage } from '../lib/browser-storage.ts';

test('Supabase auth adapter persists only the requested string values', async () => {
  const values = new Map<string, unknown>();
  const storage = createBrowserStringStorage({
    async get(key) {
      return { [key]: values.get(key) };
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) values.set(key, value);
    },
    async remove(key) {
      values.delete(key);
    },
  });

  assert.equal(await storage.getItem('session'), null);
  await storage.setItem('session', 'token-json');
  assert.equal(await storage.getItem('session'), 'token-json');
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
});
