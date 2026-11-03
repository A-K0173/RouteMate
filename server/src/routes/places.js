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

  return router;
}

module.exports = createPlacesRouter();
module.exports.createPlacesRouter = createPlacesRouter;
