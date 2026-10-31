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

function loadItinerary(database, itineraryId, userId) {
  const rows = database
    .prepare(
      `SELECT
        itineraries.id AS itinerary_id,
        itineraries.trip_id,
        day_plans.day_number,
        stops.place_id,
        places.name,
        places.lat,
        places.lng,
        stops.stop_order,
        stops.travel_min_from_prev
      FROM itineraries
      JOIN trips ON trips.id = itineraries.trip_id
      LEFT JOIN day_plans ON day_plans.itinerary_id = itineraries.id
      LEFT JOIN stops ON stops.day_plan_id = day_plans.id
      LEFT JOIN places ON places.id = stops.place_id
      WHERE itineraries.id = ? AND trips.user_id = ?
      ORDER BY day_plans.day_number, stops.stop_order`,
    )
    .all(itineraryId, userId);

  if (rows.length === 0) return null;

  const itinerary = {
    id: rows[0].itinerary_id,
    tripId: rows[0].trip_id,
    days: [],
  };
  const daysByNumber = new Map();

  for (const row of rows) {
    if (row.day_number === null) continue;

    let day = daysByNumber.get(row.day_number);
    if (!day) {
      day = { dayNumber: row.day_number, stops: [] };
      daysByNumber.set(row.day_number, day);
      itinerary.days.push(day);
    }

    if (row.place_id !== null) {
      day.stops.push({
        placeId: row.place_id,
        name: row.name,
        lat: row.lat,
        lng: row.lng,
        order: row.stop_order,
        travelMinFromPrevious: row.travel_min_from_prev,
      });
    }
  }

  return itinerary;
}

function validateEditedDays(days, numDays, places) {
  if (!Array.isArray(days) || days.length !== numDays) {
    return 'Days must contain one entry for each day of the trip';
  }

  const availablePlaceIds = new Set(places.map((place) => place.id));
  const scheduledPlaceIds = new Set();
  const dayNumbers = new Set();

  for (const day of days) {
    if (
      !day ||
      !Number.isInteger(day.dayNumber) ||
      day.dayNumber < 1 ||
      day.dayNumber > numDays ||
      dayNumbers.has(day.dayNumber) ||
      !Array.isArray(day.stops) ||
      day.stops.length > 6
    ) {
      return 'Each trip day must have a unique valid day number and no more than 6 stops';
    }
    dayNumbers.add(day.dayNumber);

    const orders = new Set();
    for (const stop of day.stops) {
      if (
        !stop ||
        !Number.isSafeInteger(stop.placeId) ||
        !availablePlaceIds.has(stop.placeId) ||
        scheduledPlaceIds.has(stop.placeId) ||
        !Number.isInteger(stop.order) ||
        stop.order < 1 ||
        stop.order > day.stops.length ||
        orders.has(stop.order) ||
        !Number.isInteger(stop.travelMinFromPrevious) ||
        stop.travelMinFromPrevious < 0
      ) {
        return 'Stops must use places from this trip and have unique valid order and travel times';
      }

      scheduledPlaceIds.add(stop.placeId);
      orders.add(stop.order);
    }

    if (day.stops.length && !day.stops.some(
      (stop) => stop.order === 1 && stop.travelMinFromPrevious === 0,
    )) {
      return 'The first stop of each day must have order 1 and zero travel time';
    }
    for (let order = 1; order <= day.stops.length; order++) {
      if (!orders.has(order)) {
        return 'Stop order must be sequential within each day';
      }
    }
  }

  if (dayNumbers.size !== numDays) {
    return 'Days must contain one entry for each day of the trip';
  }

  return null;
}

function createItineraryRouter({ database = require('../db'), authenticate = requireAuth } = {}) {
  const router = express.Router();

  router.get('/itineraries/:id', authenticate, (req, res) => {
    const itineraryId = Number(req.params.id);
    if (!Number.isSafeInteger(itineraryId) || itineraryId < 1) {
      return res.status(400).json({ error: 'Itinerary id must be a positive integer' });
    }

    const itinerary = loadItinerary(database, itineraryId, req.user.id);
    if (!itinerary) {
      return res.status(404).json({ error: 'Itinerary not found' });
    }
    return res.json(itinerary);
  });

  router.put('/itineraries/:id', authenticate, (req, res) => {
    const itineraryId = Number(req.params.id);
    if (!Number.isSafeInteger(itineraryId) || itineraryId < 1) {
      return res.status(400).json({ error: 'Itinerary id must be a positive integer' });
    }

    const itinerary = database
      .prepare(
        `SELECT itineraries.id, itineraries.trip_id, trips.start_date, trips.end_date
        FROM itineraries
        JOIN trips ON trips.id = itineraries.trip_id
        WHERE itineraries.id = ? AND trips.user_id = ?`,
      )
      .get(itineraryId, req.user.id);
    if (!itinerary) {
      return res.status(404).json({ error: 'Itinerary not found' });
    }

    const numDays = tripDurationDays(itinerary.start_date, itinerary.end_date);
    if (numDays === null) {
      return res.status(400).json({ error: 'Trip dates are invalid' });
    }

    const places = database
      .prepare('SELECT id FROM places WHERE trip_id = ?')
      .all(itinerary.trip_id);
    const validationError = validateEditedDays(req.body?.days, numDays, places);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const replaceItinerary = database.transaction(() => {
      database
        .prepare(
          `DELETE FROM stops
          WHERE day_plan_id IN (
            SELECT id FROM day_plans WHERE itinerary_id = ?
          )`,
        )
        .run(itineraryId);
      database.prepare('DELETE FROM day_plans WHERE itinerary_id = ?').run(itineraryId);

      const insertDay = database.prepare(
        'INSERT INTO day_plans (itinerary_id, day_number) VALUES (?, ?)',
      );
      const insertStop = database.prepare(
        'INSERT INTO stops (day_plan_id, place_id, stop_order, travel_min_from_prev) VALUES (?, ?, ?, ?)',
      );

      for (const day of req.body.days) {
        const dayPlan = insertDay.run(itineraryId, day.dayNumber);
        for (const stop of day.stops) {
          insertStop.run(
            dayPlan.lastInsertRowid,
            stop.placeId,
            stop.order,
            stop.travelMinFromPrevious,
          );
        }
      }
    });

    replaceItinerary();
    return res.json(loadItinerary(database, itineraryId, req.user.id));
  });

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
