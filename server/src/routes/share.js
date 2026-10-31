const crypto = require('crypto');
const express = require('express');
const requireAuth = require('../middleware/auth');

const DEFAULT_EXPIRY_HOURS = 24 * 7;
const MAX_EXPIRY_HOURS = 24 * 30;

// Read-only view of an itinerary for the public share page.
// Deliberately omits user ids and trip ids.
function loadSharedItinerary(database, itineraryId) {
  const header = database
    .prepare(
      `SELECT itineraries.id, trips.title, trips.destination, trips.start_date, trips.end_date
       FROM itineraries
       JOIN trips ON trips.id = itineraries.trip_id
       WHERE itineraries.id = ?`,
    )
    .get(itineraryId);
  if (!header) return null;

  const rows = database
    .prepare(
      `SELECT day_plans.day_number, places.name, places.lat, places.lng,
              stops.stop_order, stops.travel_min_from_prev
       FROM day_plans
       LEFT JOIN stops ON stops.day_plan_id = day_plans.id
       LEFT JOIN places ON places.id = stops.place_id
       WHERE day_plans.itinerary_id = ?
       ORDER BY day_plans.day_number, stops.stop_order`,
    )
    .all(itineraryId);

  const days = [];
  const byNumber = new Map();
  for (const row of rows) {
    let day = byNumber.get(row.day_number);
    if (!day) {
      day = { dayNumber: row.day_number, stops: [] };
      byNumber.set(row.day_number, day);
      days.push(day);
    }
    if (row.name !== null) {
      day.stops.push({
        name: row.name,
        lat: row.lat,
        lng: row.lng,
        order: row.stop_order,
        travelMinFromPrevious: row.travel_min_from_prev,
      });
    }
  }

  return {
    id: header.id,
    title: header.title,
    destination: header.destination,
    startDate: header.start_date,
    endDate: header.end_date,
    days,
  };
}

function createShareRouter({ database = require('../db'), authenticate = requireAuth } = {}) {
  const router = express.Router();

  // POST /api/itineraries/:id/share  (login required; owner only)
  router.post('/itineraries/:id/share', authenticate, (req, res) => {
    const itineraryId = Number(req.params.id);
    if (!Number.isSafeInteger(itineraryId) || itineraryId < 1) {
      return res.status(400).json({ error: 'Itinerary id must be a positive integer' });
    }

    const owned = database
      .prepare(
        `SELECT itineraries.id FROM itineraries
         JOIN trips ON trips.id = itineraries.trip_id
         WHERE itineraries.id = ? AND trips.user_id = ?`,
      )
      .get(itineraryId, req.user.id);
    if (!owned) {
      return res.status(404).json({ error: 'Itinerary not found' });
    }

    let hours = Number(req.body && req.body.expiresInHours);
    if (!Number.isFinite(hours) || hours <= 0) hours = DEFAULT_EXPIRY_HOURS;
    hours = Math.min(hours, MAX_EXPIRY_HOURS);

    const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars, 256 bits
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    database
      .prepare('INSERT INTO share_links (itinerary_id, token, expires_at) VALUES (?, ?, ?)')
      .run(itineraryId, token, expiresAt);

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
    return res.status(201).json({ token, expiresAt, url: `${clientUrl}/shared/${token}` });
  });

  // GET /api/shared/:token  (no login; read-only)
  router.get('/shared/:token', (req, res) => {
    const { token } = req.params;
    if (!/^[0-9a-f]{64}$/.test(token)) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    const link = database
      .prepare('SELECT itinerary_id, expires_at FROM share_links WHERE token = ?')
      .get(token);
    if (!link) {
      return res.status(404).json({ error: 'Share link not found' });
    }
    if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    const itinerary = loadSharedItinerary(database, link.itinerary_id);
    if (!itinerary) {
      return res.status(404).json({ error: 'Itinerary no longer exists' });
    }

    res.set('Cache-Control', 'no-store');
    return res.json({ ...itinerary, expiresAt: link.expires_at, readOnly: true });
  });

  return router;
}

module.exports = createShareRouter();
module.exports.createShareRouter = createShareRouter;
