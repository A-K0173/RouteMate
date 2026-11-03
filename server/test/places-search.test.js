const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const { createPlacesRouter } = require('../src/routes/places');

const nominatimSensoji = [
  {
    name: 'Sensō-ji',
    display_name: 'Sensō-ji, 2, Asakusa, Taito, Tokyo, Japan',
    lat: '35.7147651',
    lon: '139.7966553',
  },
  { name: '', display_name: 'Asakusa Shrine, Taito, Tokyo, Japan', lat: '35.7156', lon: '139.7975' },
  { name: 'Broken', display_name: 'Nowhere', lat: 'abc', lon: '1' },
];

function jsonResponse(data, status = 200) {
  return { ok: status < 400, status, json: async () => data };
}

async function createFixture(t, options = {}) {
  const calls = [];
  const fetchImpl =
    options.fetchImpl ||
    (async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, at: Date.now() });
      return jsonResponse(nominatimSensoji);
    });

  const app = express();
  app.use(
    '/api',
    createPlacesRouter({
      database: new Database(':memory:'),
      authenticate: (req, res, next) => {
        req.user = { id: 1 };
        next();
      },
      fetchImpl,
      minIntervalMs: options.minIntervalMs ?? 0,
      userAgent: 'RouteMate-test/1.0 (test@example.com)',
    }),
  );

  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, calls };
}

async function search(server, q) {
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/places/search?q=${encodeURIComponent(q)}`,
  );
  return { status: response.status, body: await response.json() };
}

test('search proxies Nominatim and returns name, address, lat and lng', async (t) => {
  const { server, calls } = await createFixture(t);
  const result = await search(server, 'Senso-ji');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, [
    {
      name: 'Sensō-ji',
      address: 'Sensō-ji, 2, Asakusa, Taito, Tokyo, Japan',
      lat: 35.7147651,
      lng: 139.7966553,
    },
    {
      name: 'Asakusa Shrine',
      address: 'Asakusa Shrine, Taito, Tokyo, Japan',
      lat: 35.7156,
      lng: 139.7975,
    },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get('q'), 'Senso-ji');
  assert.equal(calls[0].headers['User-Agent'], 'RouteMate-test/1.0 (test@example.com)');
});

test('concurrent searches are spaced out to respect the rate limit', async (t) => {
  const { server, calls } = await createFixture(t, { minIntervalMs: 150 });
  await Promise.all([search(server, 'Tokyo Tower'), search(server, 'Ueno Park'), search(server, 'Skytree')]);

  assert.equal(calls.length, 3);
  const times = calls.map((call) => call.at).sort((a, b) => a - b);
  // Allow a few ms of timer slack.
  assert.ok(times[1] - times[0] >= 145, `gap was ${times[1] - times[0]}ms`);
  assert.ok(times[2] - times[1] >= 145, `gap was ${times[2] - times[1]}ms`);
});

test('repeated searches are answered from the cache', async (t) => {
  const { server, calls } = await createFixture(t);
  await search(server, 'Meiji Shrine');
  await search(server, '  meiji shrine ');

  assert.equal(calls.length, 1);
});

test('short or missing search text is rejected without calling Nominatim', async (t) => {
  const { server, calls } = await createFixture(t);

  assert.equal((await search(server, '')).status, 400);
  assert.equal((await search(server, 'a')).status, 400);
  assert.equal(calls.length, 0);
});

test('an upstream failure becomes a 502', async (t) => {
  const { server } = await createFixture(t, {
    fetchImpl: async () => jsonResponse({}, 503),
  });
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalError;
  });

  assert.equal((await search(server, 'Kyoto Station')).status, 502);
});
