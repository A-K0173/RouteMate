const express = require('express');
const requireAuth = require('../middleware/auth');

const MAX_TEXT_LENGTH = 200;
const MAX_TRIP_DAYS = 60;

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

// Returns { value } with cleaned fields, or { error } describing the first problem.
function validateTrip(body) {
  const { title, destination, startDate, endDate } = body || {};

  for (const [label, text] of [['Title', title], ['Destination', destination]]) {
    if (typeof text !== 'string' || !text.trim() || text.trim().length > MAX_TEXT_LENGTH) {
      return { error: `${label} is required (max ${MAX_TEXT_LENGTH} characters)` };
    }
  }

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start === null || end === null) {
    return { error: 'Start and end dates must be valid dates in YYYY-MM-DD format' };
  }
  if (end < start) {
    return { error: 'End date cannot be before start date' };
  }
  if (Math.floor((end - start) / 86400000) + 1 > MAX_TRIP_DAYS) {
    return { error: `A trip can last at most ${MAX_TRIP_DAYS} days` };
  }

  return {
    value: { title: title.trim(), destination: destination.trim(), startDate, endDate },
  };
}

// The newest itinerary is the one the trip page links to.
const TRIP_SELECT = `
  SELECT trips.id, trips.title, trips.destination, trips.start_date, trips.end_date,
         (SELECT MAX(itineraries.id) FROM itineraries
          WHERE itineraries.trip_id = trips.id) AS itinerary_id
  FROM trips`;

function toTrip(row) {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    itineraryId: row.itinerary_id,
  };
}

function createTripsRouter({ database = require('../db'), authenticate = requireAuth } = {}) {
  const router = express.Router();

  function findTrip(tripId, userId) {
    const row = database
      .prepare(`${TRIP_SELECT} WHERE trips.id = ? AND trips.user_id = ?`)
      .get(tripId, userId);
    return row ? toTrip(row) : null;
  }

  router.get('/trips', authenticate, (req, res) => {
    const rows = database
      .prepare(`${TRIP_SELECT} WHERE trips.user_id = ? ORDER BY trips.start_date, trips.id`)
      .all(req.user.id);
    return res.json(rows.map(toTrip));
  });

  router.post('/trips', authenticate, (req, res) => {
    const { value, error } = validateTrip(req.body);
    if (error) return res.status(400).json({ error });

    const info = database
      .prepare(
        'INSERT INTO trips (user_id, title, destination, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
      )
      .run(req.user.id, value.title, value.destination, value.startDate, value.endDate);
    return res.status(201).json(findTrip(Number(info.lastInsertRowid), req.user.id));
  });

  router.get('/trips/:id', authenticate, (req, res) => {
    const tripId = parseId(req.params.id);
    if (tripId === null) {
      return res.status(400).json({ error: 'Trip id must be a positive integer' });
    }

    const trip = findTrip(tripId, req.user.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const places = database
      .prepare('SELECT id, name, address, lat, lng FROM places WHERE trip_id = ? ORDER BY id')
      .all(trip.id);
    return res.json({ ...trip, places });
  });

  router.put('/trips/:id', authenticate, (req, res) => {
    const tripId = parseId(req.params.id);
    if (tripId === null) {
      return res.status(400).json({ error: 'Trip id must be a positive integer' });
    }
    const { value, error } = validateTrip(req.body);
    if (error) return res.status(400).json({ error });

    const info = database
      .prepare(
        `UPDATE trips SET title = ?, destination = ?, start_date = ?, end_date = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(value.title, value.destination, value.startDate, value.endDate, tripId, req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Trip not found' });

    return res.json(findTrip(tripId, req.user.id));
  });

  router.delete('/trips/:id', authenticate, (req, res) => {
    const tripId = parseId(req.params.id);
    if (tripId === null) {
      return res.status(400).json({ error: 'Trip id must be a positive integer' });
    }

    const info = database
      .prepare('DELETE FROM trips WHERE id = ? AND user_id = ?')
      .run(tripId, req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Trip not found' });

    return res.json({});
  });

  return router;
}

module.exports = createTripsRouter();
module.exports.createTripsRouter = createTripsRouter;
