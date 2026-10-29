const express = require('express');
const requireAuth = require('../middleware/auth');
const { generateItinerary } = require('../itinerary/generate');

const router = express.Router();

function tripDurationDays(startDate, endDate) {
  const parseDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }

    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().slice(0, 10) === value
      ? timestamp
      : null;
  };
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start === null || end === null || end < start) {
    return null;
  }
  return Math.floor((end - start) / 86400000) + 1;
}

function createItineraryRouter({ database = require('../db'), authenticate = requireAuth } = {}) {
  const router = express.Router();
  router.post('/trips/:id/itinerary', authenticate, (req, res) => {
    const tripId = Number(req.params.id);
    if (!Number.isSafeInteger(tripId) || tripId < 1) {
      return res.status(400).json({ error: 'Trip id must be a positive integer' });
    }

    const trip = database
      .prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
      .get(tripId, req.user.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const numDays = tripDurationDays(trip.start_date, trip.end_date);
    if (numDays === null) {
      return res.status(400).json({ error: 'Trip dates are invalid' });
    }

    const places = database
      .prepare('SELECT id, name, lat, lng FROM places WHERE trip_id = ? ORDER BY id')
      .all(trip.id);
    if (places.length === 0) {
      return res.status(400).json({ error: 'Add places to the trip first' });
    }

    let days;
    try {
      days = generateItinerary(places, { numDays, maxStopsPerDay: 6 });
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    const save = database.transaction(() => {
      const itinerary = database
        .prepare('INSERT INTO itineraries (trip_id) VALUES (?)')
        .run(trip.id);
      const insertDay = database.prepare(
        'INSERT INTO day_plans (itinerary_id, day_number) VALUES (?, ?)',
      );
      const insertStop = database.prepare(
        'INSERT INTO stops (day_plan_id, place_id, stop_order, travel_min_from_prev) VALUES (?, ?, ?, ?)',
      );

      for (const day of days) {
        const dayPlan = insertDay.run(itinerary.lastInsertRowid, day.dayNumber);
        for (const stop of day.stops) {
          insertStop.run(
            dayPlan.lastInsertRowid,
            stop.placeId,
            stop.order,
            stop.travelMinFromPrevious,
          );
        }
      }

      return itinerary.lastInsertRowid;
    });

    const itineraryId = save();
    return res.status(201).json({ id: itineraryId, tripId: trip.id, days });
  });
  return router;
}

module.exports = createItineraryRouter();
module.exports.createItineraryRouter = createItineraryRouter;
