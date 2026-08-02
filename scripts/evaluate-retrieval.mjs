import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const datasetUrl = new URL(
  '../evaluation/retrieval-evaluation.json',
  import.meta.url,
);
const dataset = JSON.parse(readFileSync(datasetUrl, 'utf8'));

export function validateDataset(value = dataset) {
  assert.equal(value.notes.length, 15, 'evaluation must contain 15 notes');
  assert.equal(value.queries.length, 30, 'evaluation must contain 30 queries');
  const ids = new Set(value.notes.map((note) => note.id));
  assert.equal(ids.size, value.notes.length, 'note IDs must be unique');
  for (const note of value.notes) {
    assert.match(note.id, /^[0-9a-f-]{36}$/u);
    assert.ok(note.text.trim().length > 0);
  }
  for (const item of value.queries) {
    assert.ok(item.query.trim().length > 0);
    assert.ok(item.expectedNoteIds.length > 0);
    for (const id of item.expectedNoteIds) {
      assert.ok(ids.has(id), `unknown expected note ID: ${id}`);
    }
  }
  return value;
}

export function cosine(left, right) {
  assert.equal(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function scoreEvaluation(value, embeddings) {
  const noteCount = value.notes.length;
  assert.equal(embeddings.length, noteCount + value.queries.length);
  const noteEmbeddings = embeddings.slice(0, noteCount);
  const queryEmbeddings = embeddings.slice(noteCount);
  const failures = [];
  let hits = 0;

  value.queries.forEach((item, queryIndex) => {
    const ranking = noteEmbeddings
      .map((embedding, noteIndex) => ({
        noteId: value.notes[noteIndex].id,
        similarity: cosine(queryEmbeddings[queryIndex], embedding),
      }))
      .sort((left, right) => right.similarity - left.similarity);
    const topFive = ranking.slice(0, 5);
    const hit = topFive.some((match) =>
      item.expectedNoteIds.includes(match.noteId),
    );
    if (hit) hits += 1;
    else {
      failures.push({
        queryNumber: queryIndex + 1,
        expectedNoteIds: item.expectedNoteIds,
        topFiveNoteIds: topFive.map((match) => match.noteId),
        taxonomy: 'unclassified',
      });
    }
  });

  return {
    queryCount: value.queries.length,
    topFiveHits: hits,
    topFiveHitRate: hits / value.queries.length,
    failures,
  };
}

async function liveEvaluation(value) {
  assert.equal(
    process.env.NOVAH_APPROVE_PHASE7_EVAL,
    'one-openai-embedding-call',
    'live evaluation requires the exact one-call approval guard',
  );
  const apiKey = process.env.OPENAI_API_KEY;
  assert.ok(apiKey, 'OPENAI_API_KEY is required only for the live evaluation');
  const inputs = [
    ...value.notes.map((note) => note.text),
    ...value.queries.map((item) => item.query),
  ];
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: value.model,
      dimensions: value.dimensions,
      encoding_format: 'float',
      input: inputs,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(
    response.ok,
    true,
    `OpenAI embedding request failed (${response.status})`,
  );
  const payload = await response.json();
  const embeddings = payload.data
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);
  const result = scoreEvaluation(value, embeddings);
  console.log(
    JSON.stringify(
      {
        evaluatedAt: new Date().toISOString(),
        providerCalls: 1,
        model: value.model,
        dimensions: value.dimensions,
        ...result,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const value = validateDataset();
  if (process.argv.includes('--live')) await liveEvaluation(value);
  else if (process.argv.includes('--validate')) {
    console.log(
      `Retrieval evaluation dataset passed (${value.notes.length} notes, ${value.queries.length} queries).`,
    );
  } else {
    throw new Error('Use --validate or --live.');
  }
}
