process.env.JWT_SECRET = 'test-secret-for-auth-share-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { createAuthRouter } = require('../src/routes/auth');
const { createShareRouter } = require('../src/routes/share');
const { createItineraryRouter } = require('../src/routes/itinerary');

async function createFixture(t) {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));

  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter({ database }));
  app.use('/api', createShareRouter({ database }));
  app.use('/api', createItineraryRouter({ database })); // default authenticate = real middleware

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

async function call(server, urlPath, { method = 'GET', body, token } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${urlPath}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

async function signUp(server, name, email) {
  const registered = await call(server, '/api/auth/register', {
    method: 'POST',
    body: { name, email, password: 'password123' },
  });
  const loggedIn = await call(server, '/api/auth/login', {
    method: 'POST',
    body: { email, password: 'password123' },
  });
  return { id: registered.body.user.id, token: loggedIn.body.token };
}

function addTripWithPlaces(database, userId) {
  const tripId = Number(
    database
      .prepare(
        'INSERT INTO trips (user_id, title, destination, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, 'Tokyo', 'Tokyo', '2026-10-01', '2026-10-02').lastInsertRowid,
  );
  const insertPlace = database.prepare(
    'INSERT INTO places (trip_id, name, lat, lng) VALUES (?, ?, ?, ?)',
  );
  insertPlace.run(tripId, 'Senso-ji', 35.7148, 139.7967);
  insertPlace.run(tripId, 'Ueno Park', 35.7141, 139.7774);
  return tripId;
}

test('register validates input and rejects duplicates; login rejects bad credentials', async (t) => {
  const { server } = await createFixture(t);

  const ok = await call(server, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Ann', email: 'ann@example.com', password: 'password123' },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.email, 'ann@example.com');
  assert.equal(ok.body.user.password_hash, undefined);

  const duplicate = await call(server, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Ann', email: 'ANN@example.com', password: 'password123' },
  });
  assert.equal(duplicate.status, 409);

  const weak = await call(server, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Bob', email: 'bob@example.com', password: 'short' },
  });
  assert.equal(weak.status, 400);

  const noName = await call(server, '/api/auth/register', {
    method: 'POST',
    body: { email: 'bob@example.com', password: 'password123' },
  });
  assert.equal(noName.status, 400);

  const wrong = await call(server, '/api/auth/login', {
    method: 'POST',
    body: { email: 'ann@example.com', password: 'wrong-password' },
  });
  assert.equal(wrong.status, 401);

  const unknown = await call(server, '/api/auth/login', {
    method: 'POST',
    body: { email: 'nobody@example.com', password: 'password123' },
  });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, wrong.body.error);
});

test('middleware rejects missing/invalid tokens and accepts a valid one', async (t) => {
  const { server } = await createFixture(t);
  const { token } = await signUp(server, 'Ann', 'ann@example.com');

  assert.equal((await call(server, '/api/auth/me')).status, 401);
  assert.equal((await call(server, '/api/auth/me', { token: 'garbage' })).status, 401);

  const me = await call(server, '/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'ann@example.com');
});

test('done criteria: register, log in, then POST /api/trips/:id/itinerary with the token', async (t) => {
  const { database, server } = await createFixture(t);
  const { id, token } = await signUp(server, 'Ann', 'ann@example.com');
  const tripId = addTripWithPlaces(database, id);

  const noToken = await call(server, `/api/trips/${tripId}/itinerary`, { method: 'POST' });
  assert.equal(noToken.status, 401);

  const created = await call(server, `/api/trips/${tripId}/itinerary`, { method: 'POST', token });
  assert.equal(created.status, 201);
  assert.equal(created.body.tripId, tripId);
  assert.equal(created.body.days.length, 2);

  const other = await signUp(server, 'Bob', 'bob@example.com');
  const forbidden = await call(server, `/api/trips/${tripId}/itinerary`, {
    method: 'POST',
    token: other.token,
  });
  assert.equal(forbidden.status, 404);
});

test('share link: owner creates it, anyone reads it logged out, expiry and ownership enforced', async (t) => {
  const { database, server } = await createFixture(t);
  const owner = await signUp(server, 'Ann', 'ann@example.com');
  const other = await signUp(server, 'Bob', 'bob@example.com');
  const tripId = addTripWithPlaces(database, owner.id);
  const created = await call(server, `/api/trips/${tripId}/itinerary`, {
    method: 'POST',
    token: owner.token,
  });
  const itineraryId = created.body.id;

  assert.equal(
    (await call(server, `/api/itineraries/${itineraryId}/share`, { method: 'POST' })).status,
    401,
  );
  assert.equal(
    (
      await call(server, `/api/itineraries/${itineraryId}/share`, {
        method: 'POST',
        token: other.token,
      })
    ).status,
    404,
  );

  const share = await call(server, `/api/itineraries/${itineraryId}/share`, {
    method: 'POST',
    token: owner.token,
  });
  assert.equal(share.status, 201);
  assert.match(share.body.token, /^[0-9a-f]{64}$/);
  assert.ok(share.body.url.endsWith(`/shared/${share.body.token}`));
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM share_links').get().count,
    1,
  );

  const shared = await call(server, `/api/shared/${share.body.token}`);
  assert.equal(shared.status, 200);
  assert.equal(shared.body.readOnly, true);
  assert.equal(shared.body.title, 'Tokyo');
  assert.equal(shared.body.days.length, 2);
  assert.equal(shared.body.tripId, undefined);
  assert.equal(shared.body.user_id, undefined);
  assert.deepEqual(
    shared.body.days.flatMap((day) => day.stops.map((stop) => stop.name)).sort(),
    ['Senso-ji', 'Ueno Park'],
  );

  const write = await call(server, `/api/shared/${share.body.token}`, { method: 'PUT', body: {} });
  assert.equal(write.status, 404);

  assert.equal((await call(server, `/api/shared/${'0'.repeat(64)}`)).status, 404);
  assert.equal((await call(server, '/api/shared/not-a-token')).status, 404);

  database
    .prepare('UPDATE share_links SET expires_at = ? WHERE token = ?')
    .run(new Date(Date.now() - 1000).toISOString(), share.body.token);
  assert.equal((await call(server, `/api/shared/${share.body.token}`)).status, 410);
});
