const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { createPlacesRouter } = require('../src/routes/places');

async function createFixture(t) {
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

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createPlacesRouter({
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

const sensoji = { name: 'Senso-ji', address: 'Asakusa, Tokyo', lat: 35.7148, lng: 139.7967 };

test('adding a place stores name, address, lat and lng and returns the new place', async (t) => {
  const { database, server } = await createFixture(t);
  const added = await call(server, '/api/trips/1/places', { method: 'POST', body: sensoji });

  assert.equal(added.status, 201);
  assert.deepEqual(added.body, { id: 1, ...sensoji });
  assert.deepEqual(
    database.prepare('SELECT trip_id, name, address, lat, lng FROM places').get(),
    { trip_id: 1, ...sensoji },
  );
});

test('the address is optional', async (t) => {
  const { server } = await createFixture(t);
  const added = await call(server, '/api/trips/1/places', {
    method: 'POST',
    body: { name: 'Ueno Park', lat: 35.7156, lng: 139.7745 },
  });

  assert.equal(added.status, 201);
  assert.equal(added.body.address, null);
});

test('places cannot be added to a trip owned by someone else or one that does not exist', async (t) => {
  const { database, server } = await createFixture(t);

  assert.equal((await call(server, '/api/trips/2/places', { method: 'POST', body: sensoji })).status, 404);
  assert.equal((await call(server, '/api/trips/99/places', { method: 'POST', body: sensoji })).status, 404);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM places').get().n, 0);
});

test('invalid places are rejected with 400', async (t) => {
  const { database, server } = await createFixture(t);
  const bad = [
    { ...sensoji, name: '  ' },
    { ...sensoji, name: undefined },
    { ...sensoji, lat: '35.7' },
    { ...sensoji, lat: 91 },
    { ...sensoji, lng: -181 },
    { ...sensoji, lng: undefined },
    { ...sensoji, address: 42 },
  ];

  for (const body of bad) {
    const result = await call(server, '/api/trips/1/places', { method: 'POST', body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }
  assert.equal((await call(server, '/api/trips/abc/places', { method: 'POST', body: sensoji })).status, 400);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM places').get().n, 0);
});

test('deleting a place removes it', async (t) => {
  const { database, server } = await createFixture(t);
  await call(server, '/api/trips/1/places', { method: 'POST', body: sensoji });

  const deleted = await call(server, '/api/places/1', { method: 'DELETE' });

  assert.equal(deleted.status, 200);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM places').get().n, 0);
});

test('a place cannot be deleted by another user', async (t) => {
  const { database, server } = await createFixture(t);
  await call(server, '/api/trips/1/places', { method: 'POST', body: sensoji });

  assert.equal((await call(server, '/api/places/1', { method: 'DELETE', user: 2 })).status, 404);
  assert.equal((await call(server, '/api/places/99', { method: 'DELETE' })).status, 404);
  assert.equal((await call(server, '/api/places/x', { method: 'DELETE' })).status, 400);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM places').get().n, 1);
});
