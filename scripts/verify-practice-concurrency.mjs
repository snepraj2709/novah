import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const TEST_USER_ID = '00000000-0000-4000-8000-00000000000a';

function userToken(secret) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1_000) + 300,
    role: 'authenticated',
    sub: TEST_USER_ID,
  });
  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function localConfiguration() {
  const output = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const values = new Map();
  for (const line of output.split('\n')) {
    const match = line.match(/^([A-Z_]+)="([^"]*)"$/u);
    if (match) values.set(match[1], match[2]);
  }
  const url = values.get('API_URL');
  const publishableKey = values.get('ANON_KEY');
  const serviceRoleKey = values.get('SERVICE_ROLE_KEY');
  const jwtSecret = values.get('JWT_SECRET');
  assert.ok(
    url && publishableKey && serviceRoleKey && jwtSecret,
    'local Supabase is unavailable',
  );
  return { url, publishableKey, serviceRoleKey, jwtSecret };
}

const configuration = localConfiguration();
const service = createClient(configuration.url, configuration.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const browser = createClient(configuration.url, configuration.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: `Bearer ${userToken(configuration.jwtSecret)}` },
  },
});

const noteIds = [];

try {
  const notes = Array.from({ length: 4 }, (_, index) => ({
    id: randomUUID(),
    user_id: TEST_USER_ID,
    client_request_id: randomUUID(),
    original_text: `Local concurrent Practice fixture ${index + 1}.`,
    personal_context: null,
    note_type: 'lesson',
    summary: null,
    tags: [],
    recall_prompt: null,
    source_title: null,
    source_url: null,
    capture_channel: 'web',
  }));
  noteIds.push(...notes.map((note) => note.id));
  const inserted = await service.from('notes').insert(notes);
  assert.ifError(inserted.error);

  const results = await Promise.all(
    notes.map((note) =>
      browser.rpc('manage_practice', {
        input_action: 'activate',
        input_note_id: note.id,
      }),
    ),
  );
  const succeeded = results.filter((result) => !result.error);
  const rejected = results.filter((result) => result.error);
  assert.equal(
    succeeded.length,
    3,
    'exactly three concurrent activations succeed',
  );
  assert.equal(
    rejected.length,
    1,
    'the fourth concurrent activation is rejected',
  );
  assert.match(
    rejected[0].error.message,
    /practice_slots_full/u,
    'the rejected activation uses the locked slot-full code',
  );

  const practices = await service
    .from('note_practices')
    .select('note_id, status')
    .eq('user_id', TEST_USER_ID)
    .in('note_id', noteIds)
    .eq('status', 'active');
  assert.ifError(practices.error);
  assert.equal(
    practices.data.length,
    3,
    'the database stores only three active rows',
  );

  process.stdout.write(
    'Practice concurrency verification passed (3 active, fourth rejected).\n',
  );
} finally {
  if (noteIds.length > 0) {
    const removed = await service.from('notes').delete().in('id', noteIds);
    assert.ifError(removed.error);
  }
}
