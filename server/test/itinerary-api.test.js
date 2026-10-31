const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { createItineraryRouter } = require('../src/routes/itinerary');

async function createApiFixture(t) {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(
    fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'),
  );
  database
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run('Test User', 'itinerary-test@example.com', 'unused');
  const tripId = Number(
    database
      .prepare(
        'INSERT INTO trips (user_id, title, destination, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
      )
      .run(1, 'Tokyo', 'Tokyo', '2026-10-01', '2026-10-02').lastInsertRowid,
  );
  const insertPlace = database.prepare(
    'INSERT INTO places (trip_id, name, lat, lng) VALUES (?, ?, ?, ?)',
  );
  insertPlace.run(tripId, 'Senso-ji', 35.7148, 139.7967);
  insertPlace.run(tripId, 'Ueno Park', 35.7141, 139.7774);

  database
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run('Other User', 'other-itinerary-test@example.com', 'unused');
  const otherTripId = Number(
    database
      .prepare(
        'INSERT INTO trips (user_id, title, destination, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
      )
      .run(2, 'Other Trip', 'Osaka', '2026-10-01', '2026-10-01').lastInsertRowid,
  );
  const otherItineraryId = Number(
    database
      .prepare('INSERT INTO itineraries (trip_id) VALUES (?)')
      .run(otherTripId).lastInsertRowid,
  );

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createItineraryRouter({
      database,
      authenticate: (req, res, next) => {
        req.user = { id: 1 };
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

  return { database, server, tripId, otherItineraryId };
}

async function request(server, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
  return { response, body: await response.json() };
}

test('itinerary endpoint saves and returns the generated plan', async (t) => {
  const { database, server, tripId } = await createApiFixture(t);
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/trips/${tripId}/itinerary`,
    { method: 'POST' },
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.tripId, tripId);
  assert.equal(body.days.length, 2);
  assert.deepEqual(body.days.flatMap((day) => day.stops.map((stop) => stop.placeId)).sort(), [1, 2]);
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM itineraries WHERE trip_id = ?').get(tripId).count,
    1,
  );
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM day_plans').get().count, 2);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM stops').get().count, 2);
});

test('GET returns itinerary details and hides itineraries belonging to other users', async (t) => {
  const { database, server, tripId, otherItineraryId } = await createApiFixture(t);
  const created = await request(server, `/api/trips/${tripId}/itinerary`, {
    method: 'POST',
  });

  const { response, body } = await request(
    server,
    `/api/itineraries/${created.body.id}`,
  );
  assert.equal(response.status, 200);
  assert.equal(body.id, created.body.id);
  assert.equal(body.tripId, tripId);
  assert.deepEqual(body.days, created.body.days);

  const hidden = await request(server, `/api/itineraries/${otherItineraryId}`);
  assert.equal(hidden.response.status, 404);
  assert.deepEqual(hidden.body, { error: 'Itinerary not found' });
});

test('PUT replaces day plans and stops and returns the updated itinerary', async (t) => {
  const { database, server, tripId } = await createApiFixture(t);
  const created = await request(server, `/api/trips/${tripId}/itinerary`, {
    method: 'POST',
  });
  const [firstStop, secondStop] = created.body.days.flatMap((day) => day.stops);
  const editedDays = [
    {
      dayNumber: 1,
      stops: [
        { placeId: secondStop.placeId, order: 1, travelMinFromPrevious: 0 },
        { placeId: firstStop.placeId, order: 2, travelMinFromPrevious: 12 },
      ],
    },
    { dayNumber: 2, stops: [] },
  ];

  const { response, body } = await request(
    server,
    `/api/itineraries/${created.body.id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: editedDays }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(body.days, [
    {
      dayNumber: 1,
      stops: [
        {
          placeId: secondStop.placeId,
          name: secondStop.name,
          lat: secondStop.lat,
          lng: secondStop.lng,
          order: 1,
          travelMinFromPrevious: 0,
        },
        {
          placeId: firstStop.placeId,
          name: firstStop.name,
          lat: firstStop.lat,
          lng: firstStop.lng,
          order: 2,
          travelMinFromPrevious: 12,
        },
      ],
    },
    { dayNumber: 2, stops: [] },
  ]);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM day_plans').get().count, 2);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM stops').get().count, 2);
});

test('PUT rejects invalid edits without changing the saved itinerary', async (t) => {
  const { database, server, tripId, otherItineraryId } = await createApiFixture(t);
  const created = await request(server, `/api/trips/${tripId}/itinerary`, {
    method: 'POST',
  });
  const initial = await request(server, `/api/itineraries/${created.body.id}`);
  const invalidDays = structuredClone(initial.body.days);
  invalidDays[0].stops[0].placeId = 99999;

  const { response, body } = await request(
    server,
    `/api/itineraries/${created.body.id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: invalidDays }),
    },
  );

  assert.equal(response.status, 400);
  assert.match(body.error, /places from this trip/);
  const unchanged = await request(server, `/api/itineraries/${created.body.id}`);
  assert.deepEqual(unchanged.body, initial.body);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM stops').get().count, 2);

  const unauthorized = await request(server, `/api/itineraries/${otherItineraryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days: initial.body.days }),
  });
  assert.equal(unauthorized.response.status, 404);
});
