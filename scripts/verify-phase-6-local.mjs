import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const EMAIL_A = 'phase6-browser-a@example.test';
const EMAIL_B = 'phase6-browser-b@example.test';
const PASSWORD = 'Synthetic-phase6-password!';

function localConfiguration() {
  const output = execFileSync(
    'pnpm',
    ['exec', 'supabase', 'status', '--output', 'json'],
    {
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const start = output.indexOf('{');
  if (start < 0) throw new Error('Local Supabase status was not JSON.');
  return JSON.parse(output.slice(start));
}

async function deleteFixtureUsers(admin) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1_000 });
  if (error) throw error;
  const fixtureUsers = data.users.filter(
    (user) => user.email === EMAIL_A || user.email === EMAIL_B,
  );
  for (const user of fixtureUsers) {
    const result = await admin.auth.admin.deleteUser(user.id, false);
    if (result.error) throw result.error;
  }
}

async function createUser(admin, email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Fixture user missing.');
  return data.user;
}

async function main() {
  const configuration = localConfiguration();
  const admin = createClient(
    configuration.API_URL,
    configuration.SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  if (process.argv.includes('--assert-account-delete')) {
    const { data: users, error: usersError } = await admin.auth.admin.listUsers(
      { perPage: 1_000 },
    );
    if (usersError) throw usersError;
    if (users.users.some((user) => user.email === EMAIL_A)) {
      throw new Error('Deleted fixture account A still exists.');
    }
    const clientA = createClient(
      configuration.API_URL,
      configuration.ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const clientB = createClient(
      configuration.API_URL,
      configuration.ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const [signInA, signInB] = await Promise.all([
      clientA.auth.signInWithPassword({ email: EMAIL_A, password: PASSWORD }),
      clientB.auth.signInWithPassword({ email: EMAIL_B, password: PASSWORD }),
    ]);
    if (!signInA.error)
      throw new Error('Deleted fixture account A can still sign in.');
    if (signInB.error) throw signInB.error;
    const { data: notesB, error: notesBError } = await clientB
      .from('notes')
      .select('summary');
    if (
      notesBError ||
      notesB.length !== 1 ||
      notesB[0]?.summary !== 'USER B PRIVATE SENTINEL'
    ) {
      throw notesBError ?? new Error('Account deletion affected user B.');
    }
    const { count: userARows, error: cascadeError } = await admin
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('summary', 'User A owns this visible dashboard note.');
    if (cascadeError || userARows !== 0) {
      throw cascadeError ?? new Error('Deleted account rows did not cascade.');
    }
    console.log(JSON.stringify({ accountDeletionIsolation: true }));
    return;
  }
  if (process.argv.includes('--assert-owned-delete')) {
    const clientA = createClient(
      configuration.API_URL,
      configuration.ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const clientB = createClient(
      configuration.API_URL,
      configuration.ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const [signInA, signInB] = await Promise.all([
      clientA.auth.signInWithPassword({ email: EMAIL_A, password: PASSWORD }),
      clientB.auth.signInWithPassword({ email: EMAIL_B, password: PASSWORD }),
    ]);
    if (signInA.error) throw signInA.error;
    if (signInB.error) throw signInB.error;
    const [notesA, reviewsA, notesB] = await Promise.all([
      clientA.from('notes').select('summary'),
      clientA.from('review_events').select('id'),
      clientB.from('notes').select('summary'),
    ]);
    if (notesA.error || reviewsA.error || notesB.error) {
      throw notesA.error ?? reviewsA.error ?? notesB.error;
    }
    if (
      notesA.data.length !== 0 ||
      reviewsA.data.length !== 0 ||
      notesB.data.length !== 1 ||
      notesB.data[0]?.summary !== 'USER B PRIVATE SENTINEL'
    ) {
      throw new Error('Owned delete isolation verification failed.');
    }
    console.log(JSON.stringify({ ownedDeleteIsolation: true }));
    return;
  }
  await deleteFixtureUsers(admin);
  if (process.argv.includes('--cleanup')) {
    console.log(JSON.stringify({ cleaned: true }));
    return;
  }

  const [userA, userB] = await Promise.all([
    createUser(admin, EMAIL_A),
    createUser(admin, EMAIL_B),
  ]);
  const now = new Date();
  const capturedAt = now.toISOString();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const { data: notes, error: notesError } = await admin
    .from('notes')
    .insert([
      {
        user_id: userA.id,
        client_request_id: crypto.randomUUID(),
        original_text: 'Only user A should see this browser-network fixture.',
        personal_context: 'Verifies the Phase 6 personal dashboard boundary.',
        note_type: 'lesson',
        summary: 'User A owns this visible dashboard note.',
        tags: ['phase6', 'ownership'],
        recall_prompt: 'Who owns the visible fixture?',
        source_title: 'Phase 6 browser fixture A',
        source_url: 'https://example.invalid/phase6/a',
        capture_channel: 'web',
        captured_at: capturedAt,
      },
      {
        user_id: userB.id,
        client_request_id: crypto.randomUUID(),
        original_text: 'User B secret must never appear for user A.',
        personal_context: 'Negative isolation fixture.',
        note_type: 'observation',
        summary: 'USER B PRIVATE SENTINEL',
        tags: ['phase6', 'private-b'],
        recall_prompt: 'What is private to user B?',
        source_title: 'Phase 6 browser fixture B',
        source_url: 'https://example.invalid/phase6/b',
        capture_channel: 'web',
        captured_at: capturedAt,
      },
    ])
    .select('id,user_id');
  if (notesError || !notes)
    throw notesError ?? new Error('Fixture notes missing.');
  const noteA = notes.find((note) => note.user_id === userA.id);
  if (!noteA) throw new Error('User A fixture note missing.');

  const { error: reviewError } = await admin.from('review_events').insert({
    user_id: userA.id,
    note_id: noteA.id,
    stage: 1,
    due_on: today,
    status: 'pending',
  });
  if (reviewError) throw reviewError;

  const { error: digestError } = await admin.from('daily_digests').insert({
    user_id: userA.id,
    digest_date: today,
    note_ids: [noteA.id],
    content: {
      captureCount: 1,
      sourceCount: 1,
      themes: [],
      connection: null,
      reflectionQuestion: 'How will you apply the ownership boundary tomorrow?',
    },
  });
  if (digestError) throw digestError;

  const userAClient = createClient(
    configuration.API_URL,
    configuration.ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const signIn = await userAClient.auth.signInWithPassword({
    email: EMAIL_A,
    password: PASSWORD,
  });
  if (signIn.error) throw signIn.error;
  const { data: visibleNotes, error: visibleError } = await userAClient
    .from('notes')
    .select('id,user_id,summary');
  if (visibleError) throw visibleError;
  if (visibleNotes.length !== 1 || visibleNotes[0]?.user_id !== userA.id) {
    throw new Error('Authenticated network isolation verification failed.');
  }

  console.log(
    JSON.stringify({
      email: EMAIL_A,
      password: PASSWORD,
      expectedSummary: 'User A owns this visible dashboard note.',
      forbiddenSummary: 'USER B PRIVATE SENTINEL',
      userAId: userA.id,
      noteAId: noteA.id,
      networkIsolation: true,
    }),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Phase 6 local verifier failed.',
  );
  process.exitCode = 1;
});
