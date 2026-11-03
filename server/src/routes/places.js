const express = require('express');
const requireAuth = require('../middleware/auth');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT = 'RouteMate/1.0 (student project; n01730789@humber.ca)';
// Nominatim's usage policy allows at most one request per second.
const MIN_INTERVAL_MS = 1100;
const MAX_QUEUED_SEARCHES = 10;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const RESULT_LIMIT = 8;
const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_PLACES_PER_TRIP = 100;

// Spaces calls to `task` at least `intervalMs` apart, however many users search at once.
function createThrottle(intervalMs, maxQueued) {
  let chain = Promise.resolve();
  let lastStart = 0;
  let queued = 0;

  return function schedule(task) {
    if (queued >= maxQueued) {
      const error = new Error('Search is busy, try again in a moment');
      error.status = 429;
      return Promise.reject(error);
    }

    queued += 1;
    const run = chain.then(async () => {
      const wait = lastStart + intervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      queued -= 1;
      return task();
    });
    chain = run.catch(() => {});
    return run;
  };
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

// Returns { value } with cleaned fields, or { error } describing the first problem.
function validatePlace(body) {
  const { name, address, lat, lng } = body || {};

  if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_NAME_LENGTH) {
    return { error: `Name is required (max ${MAX_NAME_LENGTH} characters)` };
  }
  if (address !== undefined && address !== null &&
      (typeof address !== 'string' || address.length > MAX_ADDRESS_LENGTH)) {
    return { error: `Address must be text of at most ${MAX_ADDRESS_LENGTH} characters` };
  }
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { error: 'Latitude must be a number between -90 and 90' };
  }
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { error: 'Longitude must be a number between -180 and 180' };
  }

  return { value: { name: name.trim(), address: address ? address.trim() : null, lat, lng } };
}

function toPlaceResult(item) {
  const address = typeof item.display_name === 'string' ? item.display_name : '';
  const name = (typeof item.name === 'string' && item.name.trim()) || address.split(',')[0].trim();
  return { name, address, lat: Number(item.lat), lng: Number(item.lon) };
}

function createPlacesRouter({
  database = require('../db'),
  authenticate = requireAuth,
  fetchImpl = fetch,
  userAgent = process.env.NOMINATIM_USER_AGENT || DEFAULT_USER_AGENT,
  minIntervalMs = MIN_INTERVAL_MS,
} = {}) {
  const router = express.Router();
  const throttle = createThrottle(minIntervalMs, MAX_QUEUED_SEARCHES);
  const cache = new Map();

  async function searchNominatim(query) {
    const url = new URL(NOMINATIM_URL);
    url.search = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: String(RESULT_LIMIT),
      'accept-language': 'en',
    }).toString();

    const response = await fetchImpl(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Nominatim responded with ${response.status}`);

    const items = await response.json();
    return items
      .map(toPlaceResult)
      .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng) && place.name);
  }

  router.get('/places/search', authenticate, async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length < 2 || query.length > 200) {
      return res.status(400).json({ error: 'Search text must be 2 to 200 characters' });
    }

    const cacheKey = query.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return res.json(cached.results);

    try {
      const results = await throttle(() => searchNominatim(query));
      if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { results, expires: Date.now() + CACHE_TTL_MS });
      return res.json(results);
    } catch (error) {
      if (error.status === 429) return res.status(429).json({ error: error.message });
      console.error('Place search failed:', error.message);
      return res.status(502).json({ error: 'Place search is unavailable right now' });
    }
  });

  router.post('/trips/:id/places', authenticate, (req, res) => {
    const tripId = parseId(req.params.id);
    if (tripId === null) {
      return res.status(400).json({ error: 'Trip id must be a positive integer' });
    }

    const trip = database
      .prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?')
      .get(tripId, req.user.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const { value, error } = validatePlace(req.body);
    if (error) return res.status(400).json({ error });

    const { count } = database
      .prepare('SELECT COUNT(*) AS count FROM places WHERE trip_id = ?')
      .get(tripId);
    if (count >= MAX_PLACES_PER_TRIP) {
      return res
        .status(400)
        .json({ error: `A trip can have at most ${MAX_PLACES_PER_TRIP} places` });
    }

    const info = database
      .prepare('INSERT INTO places (trip_id, name, address, lat, lng) VALUES (?, ?, ?, ?, ?)')
      .run(tripId, value.name, value.address, value.lat, value.lng);
    return res.status(201).json({ id: Number(info.lastInsertRowid), ...value });
  });

  router.delete('/places/:id', authenticate, (req, res) => {
    const placeId = parseId(req.params.id);
    if (placeId === null) {
      return res.status(400).json({ error: 'Place id must be a positive integer' });
    }

    // Ownership is checked through the place's trip.
    const info = database
      .prepare(
        `DELETE FROM places
         WHERE id = ? AND trip_id IN (SELECT id FROM trips WHERE user_id = ?)`,
      )
      .run(placeId, req.user.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Place not found' });

    return res.json({});
  });

  return router;
}

module.exports = createPlacesRouter();
module.exports.createPlacesRouter = createPlacesRouter;
