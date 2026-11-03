const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const {
  createVideoImportRouter,
  parseVideoId,
  extractCandidates,
} = require('../src/routes/videoImport');

const description = [
  'My 3 days in Tokyo! Subscribe for more.',
  '',
  '0:00 Intro',
  '0:45 Senso-ji Temple',
  '03:10 - Tokyo Skytree',
  '(1:02:30) Meiji Shrine https://example.com/meiji',
  '',
  'Places we visited:',
  '- Shibuya Crossing',
  '2) Ueno Park',
  '• senso-ji temple',
  '12:00 Outro',
  'Follow me on instagram',
].join('\n');

test('parseVideoId accepts the common YouTube link formats', () => {
  const id = 'dQw4w9WgXcQ';
  for (const link of [
    `https://www.youtube.com/watch?v=${id}&t=30s`,
    `https://youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
  ]) {
    assert.equal(parseVideoId(link), id, link);
  }
});

test('parseVideoId rejects other sites, bad ids and non-links', () => {
  for (const link of [
    'https://vimeo.com/dQw4w9WgXcQ',
    'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch',
    'javascript:alert(1)',
    'dQw4w9WgXcQ',
    '',
    undefined,
    42,
  ]) {
    assert.equal(parseVideoId(link), null, String(link));
  }
});

test('extractCandidates pulls place names from chapters and lists', () => {
  assert.deepEqual(extractCandidates(description), [
    'Senso-ji Temple',
    'Tokyo Skytree',
    'Meiji Shrine',
    'Shibuya Crossing',
    'Ueno Park',
  ]);
});

test('extractCandidates handles empty input', () => {
  assert.deepEqual(extractCandidates(''), []);
  assert.deepEqual(extractCandidates(undefined), []);
});

async function createFixture(t, options = {}) {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  const insertUser = database.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  insertUser.run('First User', 'first@example.com', 'unused');
  insertUser.run('Second User', 'second@example.com', 'unused');
  const insertTrip = database.prepare(
    'INSERT INTO trips (user_id, title, destination, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
  );
  insertTrip.run(1, 'Tokyo', 'Tokyo', '2026-12-01', '2026-12-03');
  insertTrip.run(2, 'Osaka', 'Osaka', '2026-12-01', '2026-12-02');

  const calls = [];
  const fetchImpl =
    options.fetchImpl ||
    (async (url, init) => {
      calls.push({ url: String(url), headers: init.headers });
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [{ snippet: { title: 'Tokyo in 3 days', description } }] }),
      };
    });

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createVideoImportRouter({
      database,
      authenticate: (req, res, next) => {
        req.user = { id: 1 };
        next();
      },
      fetchImpl,
      getApiKey: () => ('apiKey' in options ? options.apiKey : 'test-key'),
    }),
  );

  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    database.close();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  return { database, server, calls };
}

async function importVideo(server, tripId, body) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/trips/${tripId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('import returns candidate names and does not add any places', async (t) => {
  const { database, server, calls } = await createFixture(t);
  const result = await importVideo(server, 1, { url: 'https://youtu.be/dQw4w9WgXcQ' });

  assert.equal(result.status, 200);
  assert.equal(result.body.videoId, 'dQw4w9WgXcQ');
  assert.equal(result.body.title, 'Tokyo in 3 days');
  assert.ok(result.body.candidates.includes('Tokyo Skytree'));
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM places').get().n, 0);

  // The key goes in a header, not the URL, so it does not end up in logs.
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get('id'), 'dQw4w9WgXcQ');
  assert.ok(!calls[0].url.includes('test-key'));
  assert.equal(calls[0].headers['x-goog-api-key'], 'test-key');
});

test('import rejects bad links, other users\' trips and a missing API key', async (t) => {
  const { server, calls } = await createFixture(t);
  assert.equal((await importVideo(server, 1, { url: 'https://vimeo.com/123' })).status, 400);
  assert.equal((await importVideo(server, 2, { url: 'https://youtu.be/dQw4w9WgXcQ' })).status, 404);
  assert.equal((await importVideo(server, 1, {})).status, 400);
  assert.equal(calls.length, 0);

  const unconfigured = await createFixture(t, { apiKey: '' });
  const result = await importVideo(unconfigured.server, 1, { url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(result.status, 503);
});

test('import reports unknown videos and upstream failures', async (t) => {
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalError;
  });

  const empty = await createFixture(t, {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }),
  });
  assert.equal((await importVideo(empty.server, 1, { url: 'https://youtu.be/dQw4w9WgXcQ' })).status, 404);

  const failing = await createFixture(t, {
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
  });
  assert.equal((await importVideo(failing.server, 1, { url: 'https://youtu.be/dQw4w9WgXcQ' })).status, 502);
});
