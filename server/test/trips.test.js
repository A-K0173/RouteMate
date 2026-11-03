const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { createTripsRouter } = require('../src/routes/trips');

async function createFixture(t) {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  const insertUser = database.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  insertUser.run('First User', 'first@example.com', 'unused');
  insertUser.run('Second User', 'second@example.com', 'unused');

  // The test authenticates as the user named in the x-test-user header.
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createTripsRouter({
      database,
      authenticate: (req, res, next) => {
        req.user = { id: Number(req.headers['x-test-user'] || 1) };
        next();
      },
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
  return { database, server };
}

async function call(server, urlPath, { method = 'GET', body, user = 1 } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${urlPath}`, {
    method,
    headers: {
      'x-test-user': String(user),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

const tokyo = {
  title: 'Tokyo Adventure',
  destination: 'Tokyo, Japan',
  startDate: '2026-12-01',
  endDate: '2026-12-03',
};

test('creating a trip returns it in the camelCase shape the client expects', async (t) => {
  const { server } = await createFixture(t);
  const created = await call(server, '/api/trips', { method: 'POST', body: tokyo });

  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { id: 1, ...tokyo, itineraryId: null });
});

test('listing trips only returns the signed-in user\'s trips', async (t) => {
  const { server } = await createFixture(t);
  await call(server, '/api/trips', { method: 'POST', body: tokyo });
  await call(server, '/api/trips', { method: 'POST', body: { ...tokyo, title: 'Other' }, user: 2 });

  const first = await call(server, '/api/trips');
  const second = await call(server, '/api/trips', { user: 2 });

  assert.deepEqual(first.body.map((trip) => trip.title), ['Tokyo Adventure']);
  assert.deepEqual(second.body.map((trip) => trip.title), ['Other']);
});

test('trip detail includes places and the latest itinerary id', async (t) => {
  const { database, server } = await createFixture(t);
  await call(server, '/api/trips', { method: 'POST', body: tokyo });
  database
    .prepare('INSERT INTO places (trip_id, name, address, lat, lng) VALUES (1, ?, ?, ?, ?)')
    .run('Senso-ji', 'Asakusa, Tokyo', 35.7148, 139.7967);
  database.prepare('INSERT INTO itineraries (trip_id) VALUES (1)').run();
  database.prepare('INSERT INTO itineraries (trip_id) VALUES (1)').run();

  const detail = await call(server, '/api/trips/1');

  assert.equal(detail.status, 200);
  assert.equal(detail.body.itineraryId, 2);
  assert.deepEqual(detail.body.places, [
    { id: 1, name: 'Senso-ji', address: 'Asakusa, Tokyo', lat: 35.7148, lng: 139.7967 },
  ]);
});

test('another user gets 404 when reading, editing or deleting a trip', async (t) => {
  const { database, server } = await createFixture(t);
  await call(server, '/api/trips', { method: 'POST', body: tokyo });

  assert.equal((await call(server, '/api/trips/1', { user: 2 })).status, 404);
  assert.equal(
    (await call(server, '/api/trips/1', { method: 'PUT', body: tokyo, user: 2 })).status,
    404,
  );
  assert.equal((await call(server, '/api/trips/1', { method: 'DELETE', user: 2 })).status, 404);

  const stored = database.prepare('SELECT title FROM trips WHERE id = 1').get();
  assert.equal(stored.title, 'Tokyo Adventure');
});

test('updating a trip replaces its fields', async (t) => {
  const { server } = await createFixture(t);
  await call(server, '/api/trips', { method: 'POST', body: tokyo });

  const updated = await call(server, '/api/trips/1', {
    method: 'PUT',
    body: { ...tokyo, title: '  Tokyo Revised ', endDate: '2026-12-05' },
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.title, 'Tokyo Revised');
  assert.equal(updated.body.endDate, '2026-12-05');
});

test('deleting a trip removes its places and itineraries', async (t) => {
  const { database, server } = await createFixture(t);
  await call(server, '/api/trips', { method: 'POST', body: tokyo });
  database.prepare('INSERT INTO places (trip_id, name, lat, lng) VALUES (1, ?, 0, 0)').run('A');
  database.prepare('INSERT INTO itineraries (trip_id) VALUES (1)').run();

  const deleted = await call(server, '/api/trips/1', { method: 'DELETE' });

  assert.equal(deleted.status, 200);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM places').get().n, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM itineraries').get().n, 0);
  assert.equal((await call(server, '/api/trips/1')).status, 404);
});

test('invalid trips are rejected with 400', async (t) => {
  const { server } = await createFixture(t);
  const bad = [
    { ...tokyo, title: '   ' },
    { ...tokyo, destination: undefined },
    { ...tokyo, startDate: '12/01/2026' },
    { ...tokyo, endDate: '2026-02-30' },
    { ...tokyo, startDate: '2026-12-05', endDate: '2026-12-01' },
    { ...tokyo, startDate: '2026-01-01', endDate: '2026-12-31' },
  ];

  for (const body of bad) {
    const result = await call(server, '/api/trips', { method: 'POST', body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }
  assert.equal((await call(server, '/api/trips/abc')).status, 400);
});
