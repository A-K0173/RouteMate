const express = require('express');
const requireAuth = require('../middleware/auth');

const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_CANDIDATES = 30;
const MAX_NAME_LENGTH = 80;

const TIMESTAMP_LINE_RE = /^\(?\d{1,2}:\d{2}(?::\d{2})?\)?\s*[-–—:.)]*\s*(.+)$/;
const LIST_LINE_RE = /^(?:[-*•]|\d+[.)])\s+(.+)$/;
const URL_RE = /https?:\/\/\S+/g;
// Chapter titles that describe the video rather than a place.
const NOT_A_PLACE_RE =
  /^(intro|introduction|outro|conclusion|recap|summary|overview|welcome|thanks|thank you|subscribe|final thoughts|ending|start|beginning|tips|budget|links?|music|credits)\b/i;

// Accepts watch, youtu.be, shorts, embed and live links. Returns the 11-character id or null.
function parseVideoId(value) {
  if (typeof value !== 'string') return null;

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname)) return null;

  let id;
  if (url.hostname === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v');
  } else {
    const [, kind, rest] = url.pathname.split('/');
    id = ['shorts', 'embed', 'live'].includes(kind) ? rest : null;
  }
  return VIDEO_ID_RE.test(id || '') ? id : null;
}

function cleanName(text) {
  const name = text
    .replace(URL_RE, '')
    .replace(/^[\s\-–—:.)•*]+|[\s\-–—:.,;!]+$/g, '')
    .replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= MAX_NAME_LENGTH && !NOT_A_PLACE_RE.test(name)
    ? name
    : null;
}

// Guesses place names from chapter timestamps and bullet or numbered lists in the
// description. This is a heuristic: the user confirms every name before it is used.
function extractCandidates(description) {
  const seen = new Set();
  const candidates = [];

  for (const rawLine of String(description || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(TIMESTAMP_LINE_RE) || line.match(LIST_LINE_RE);
    const name = match && cleanName(match[1]);
    if (!name || seen.has(name.toLowerCase())) continue;

    seen.add(name.toLowerCase());
    candidates.push(name);
    if (candidates.length === MAX_CANDIDATES) break;
  }
  return candidates;
}

function createVideoImportRouter({
  database = require('../db'),
  authenticate = requireAuth,
  fetchImpl = fetch,
  getApiKey = () => process.env.YOUTUBE_API_KEY,
} = {}) {
  const router = express.Router();

  // Suggests place names only. Nothing is saved: the user confirms and adds places
  // through POST /api/trips/:id/places.
  router.post('/trips/:id/import', authenticate, async (req, res) => {
    const tripId = Number(req.params.id);
    if (!Number.isSafeInteger(tripId) || tripId < 1) {
      return res.status(400).json({ error: 'Trip id must be a positive integer' });
    }

    const trip = database
      .prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?')
      .get(tripId, req.user.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const videoId = parseVideoId(req.body && req.body.url);
    if (!videoId) {
      return res.status(400).json({ error: 'Enter a valid YouTube video link' });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'Video import is not configured on this server' });
    }

    try {
      const url = new URL(YOUTUBE_VIDEOS_URL);
      url.search = new URLSearchParams({ part: 'snippet', id: videoId }).toString();
      const response = await fetchImpl(url, {
        headers: { 'x-goog-api-key': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`YouTube responded with ${response.status}`);

      const { items } = await response.json();
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(404).json({ error: 'Video not found' });
      }

      const { title = '', description = '' } = items[0].snippet || {};
      return res.json({ videoId, title, candidates: extractCandidates(description) });
    } catch (error) {
      console.error('Video import failed:', error.message);
      return res.status(502).json({ error: 'Could not read that video right now' });
    }
  });

  return router;
}

module.exports = createVideoImportRouter();
module.exports.createVideoImportRouter = createVideoImportRouter;
module.exports.parseVideoId = parseVideoId;
module.exports.extractCandidates = extractCandidates;
