const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { createItineraryRouter } = require('../src/routes/itinerary');

test('itinerary endpoint saves and returns the generated plan', async (t) => {
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

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/trips/${tripId}/itinerary`,
    { method: 'POST' },
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.tripId, tripId);
  assert.equal(body.days.length, 2);
  assert.deepEqual(body.days.flatMap((day) => day.stops.map((stop) => stop.placeId)).sort(), [1, 2]);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM itineraries').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM day_plans').get().count, 2);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM stops').get().count, 2);
});
