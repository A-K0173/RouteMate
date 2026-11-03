process.env.JWT_SECRET = 'test-secret-for-trip-flow-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { createAuthRouter } = require('../src/routes/auth');
const { createTripsRouter } = require('../src/routes/trips');
const { createPlacesRouter } = require('../src/routes/places');
const { createItineraryRouter } = require('../src/routes/itinerary');

const tokyoPlaces = [
  { name: 'Senso-ji', lat: 35.7148, lng: 139.7967 },
  { name: 'Tokyo Skytree', lat: 35.7101, lng: 139.8107 },
  { name: 'Ueno Park', lat: 35.7156, lng: 139.7745 },
  { name: 'Meiji Shrine', lat: 35.6764, lng: 139.6993 },
  { name: 'Shibuya Crossing', lat: 35.6595, lng: 139.7005 },
  { name: 'Shinjuku Gyoen', lat: 35.6852, lng: 139.71 },
];

async function createFixture(t) {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));

  // Nominatim is stubbed: any query returns Senso-ji.
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => [
      { name: 'Senso-ji', display_name: 'Senso-ji, Asakusa, Tokyo, Japan', lat: '35.7148', lon: '139.7967' },
    ],
  });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter({ database }));
  app.use('/api', createTripsRouter({ database }));
  app.use('/api', createPlacesRouter({ database, fetchImpl, minIntervalMs: 0 }));
  app.use('/api', createItineraryRouter({ database }));

  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    database.close();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  return { server };
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

test('create a trip, search Senso-ji, add six places, then generate an itinerary', async (t) => {
  const { server } = await createFixture(t);

  await call(server, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Flow User', email: 'flow@example.com', password: 'password123' },
  });
  const login = await call(server, '/api/auth/login', {
    method: 'POST',
    body: { email: 'flow@example.com', password: 'password123' },
  });
  const token = login.body.token;

  const trip = await call(server, '/api/trips', {
    method: 'POST',
    token,
    body: {
      title: 'Tokyo Adventure',
      destination: 'Tokyo, Japan',
      startDate: '2026-12-01',
      endDate: '2026-12-03',
    },
  });
  assert.equal(trip.status, 201);

  const found = await call(server, '/api/places/search?q=Senso-ji', { token });
  assert.equal(found.status, 200);
  assert.equal(found.body[0].name, 'Senso-ji');

  // The first place comes straight from the search result, the rest are added as given.
  const toAdd = [found.body[0], ...tokyoPlaces.slice(1)];
  for (const place of toAdd) {
    const added = await call(server, `/api/trips/${trip.body.id}/places`, {
      method: 'POST',
      token,
      body: place,
    });
    assert.equal(added.status, 201);
  }

  const detail = await call(server, `/api/trips/${trip.body.id}`, { token });
  assert.equal(detail.body.places.length, 6);
  assert.equal(detail.body.itineraryId, null);

  const itinerary = await call(server, `/api/trips/${trip.body.id}/itinerary`, {
    method: 'POST',
    token,
  });
  assert.equal(itinerary.status, 201);
  assert.equal(itinerary.body.days.length, 3);

  const stops = itinerary.body.days.flatMap((day) => day.stops);
  assert.equal(stops.length, 6);
  assert.deepEqual(
    stops.map((stop) => stop.placeId).sort((a, b) => a - b),
    detail.body.places.map((place) => place.id),
  );
  for (const stop of stops) {
    assert.equal(typeof stop.name, 'string');
    assert.ok(Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  }

  const reloaded = await call(server, `/api/trips/${trip.body.id}`, { token });
  assert.equal(reloaded.body.itineraryId, itinerary.body.id);
});
