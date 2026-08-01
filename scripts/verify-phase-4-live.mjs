import { execFileSync } from 'node:child_process';

const EXPECTED_PROJECT_REF = 'fqinppulljqefbvukcpg';
const LOOKBACK_MILLISECONDS = 60 * 60 * 1000;
const REPLAY_PROBE_UPDATE_ID = 8_000_000_000_001;
const UNKNOWN_CHAT_PROBE_UPDATE_ID = 8_000_000_000_002;
const verifySignedProbes =
  process.env.NOVAH_VERIFY_SIGNED_TELEGRAM_PROBES === '1';

const keys = loadProjectKeys();
const serviceRoleKey = findServiceRoleKey(keys);
const supabaseUrl = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const restUrl = `${supabaseUrl}/rest/v1`;
const since = new Date(Date.now() - LOOKBACK_MILLISECONDS).toISOString();

function loadProjectKeys() {
  try {
    const output = execFileSync(
      'pnpm',
      [
        'exec',
        'supabase',
        'projects',
        'api-keys',
        '--project-ref',
        EXPECTED_PROJECT_REF,
        '--output',
        'json',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(output);
  } catch {
    throw new Error(
      'Unable to load hosted verification credentials from the authenticated Supabase CLI',
    );
  }
}

function findServiceRoleKey(projectKeys) {
  const match = projectKeys.find((key) => key.name === 'service_role');
  if (!match?.api_key) throw new Error('Service-role key is unavailable');
  return match.api_key;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function serviceHeaders() {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

async function restJson(path) {
  const response = await fetch(`${restUrl}${path}`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      `GET ${new URL(response.url).pathname} returned HTTP ${response.status}`,
    );
  }
  return response.json();
}

async function deleteRestRows(path) {
  const response = await fetch(`${restUrl}${path}`, {
    method: 'DELETE',
    headers: serviceHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      `DELETE ${new URL(response.url).pathname} returned HTTP ${response.status}`,
    );
  }
}

const notes = await restJson(
  `/notes?capture_channel=in.(telegram_text,telegram_voice)&captured_at=gte.${encodeURIComponent(since)}&select=id,user_id,capture_channel,client_request_id,captured_at&order=captured_at.desc&limit=20`,
);

const byUser = new Map();
for (const note of notes) {
  const channels = byUser.get(note.user_id) ?? new Set();
  channels.add(note.capture_channel);
  byUser.set(note.user_id, channels);
}
const candidate = [...byUser.entries()].find(
  ([, channels]) =>
    channels.has('telegram_text') && channels.has('telegram_voice'),
);
assert(candidate, 'No recent profile has both Telegram capture channels');
const [userId] = candidate;

const selectedNotes = [];
for (const channel of ['telegram_text', 'telegram_voice']) {
  const note = notes.find(
    (candidateNote) =>
      candidateNote.user_id === userId &&
      candidateNote.capture_channel === channel,
  );
  assert(note, `Recent ${channel} note is missing`);
  selectedNotes.push(note);
}
assert(
  new Set(selectedNotes.map((note) => note.client_request_id)).size === 2,
  'Telegram captures reused a client request ID',
);

const profiles = await restJson(
  `/profiles?user_id=eq.${userId}&telegram_chat_id=not.is.null&select=user_id`,
);
assert(
  profiles.length === 1,
  'Telegram captures do not belong to a linked user',
);

const noteFilter = selectedNotes.map((note) => note.id).join(',');
const reviews = await restJson(
  `/review_events?note_id=in.(${noteFilter})&select=note_id,stage,status`,
);
for (const note of selectedNotes) {
  const noteReviews = reviews.filter((review) => review.note_id === note.id);
  assert(
    noteReviews.length === 5,
    `A ${note.capture_channel} note does not have exactly five reviews`,
  );
  assert(
    noteReviews
      .map((review) => review.stage)
      .sort((left, right) => left - right)
      .join(',') === '1,2,3,4,5',
    `A ${note.capture_channel} note has incorrect review stages`,
  );
}

const updates = await restJson(
  `/processed_telegram_updates?processed_at=gte.${encodeURIComponent(since)}&select=update_id,processed_at`,
);
assert(
  updates.length >= 8,
  'The live journey did not claim all Telegram updates',
);

let signedProbeEvidence = {};
if (verifySignedProbes) {
  const probeRows = await restJson(
    `/processed_telegram_updates?update_id=in.(${REPLAY_PROBE_UPDATE_ID},${UNKNOWN_CHAT_PROBE_UPDATE_ID})&select=update_id,processed_at`,
  );
  const unknownProbe = probeRows.find(
    (row) => row.update_id === UNKNOWN_CHAT_PROBE_UPDATE_ID,
  );
  const notesAfterUnknownProbe = unknownProbe
    ? await restJson(
        `/notes?captured_at=gte.${encodeURIComponent(unknownProbe.processed_at)}&select=id`,
      )
    : [];

  await deleteRestRows(
    `/processed_telegram_updates?update_id=in.(${REPLAY_PROBE_UPDATE_ID},${UNKNOWN_CHAT_PROBE_UPDATE_ID})`,
  );
  const remainingProbeRows = await restJson(
    `/processed_telegram_updates?update_id=in.(${REPLAY_PROBE_UPDATE_ID},${UNKNOWN_CHAT_PROBE_UPDATE_ID})&select=update_id`,
  );

  assert(probeRows.length === 2, 'Signed webhook probes were not both claimed');
  assert(unknownProbe, 'Unknown-chat probe was not claimed');
  assert(
    notesAfterUnknownProbe.length === 0,
    'Unknown-chat probe created a note',
  );
  assert(remainingProbeRows.length === 0, 'Synthetic webhook probes remain');
  signedProbeEvidence = {
    hostedReplayProbe: 'passed',
    unknownChatIsolation: 'passed',
    syntheticProbeCleanup: 'passed',
  };
}

console.log(
  JSON.stringify({
    project: 'Novah',
    linkedProfile: 'passed',
    telegramTextCapture: 'passed',
    telegramVoiceCapture: 'passed',
    distinctIdempotencyKeys: 'passed',
    exactReviewStagesPerNote: 5,
    claimedLiveUpdates: updates.length,
    ...signedProbeEvidence,
    noteBodiesRead: false,
    identifiersPrinted: false,
  }),
);
