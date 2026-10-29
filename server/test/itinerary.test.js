const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineKm } = require('../src/itinerary/distance');
const { generateItinerary } = require('../src/itinerary/generate');

const tokyo = [
  { id: 1, name: 'Senso-ji', lat: 35.7148, lng: 139.7967 },
  { id: 2, name: 'Ueno Park', lat: 35.7141, lng: 139.7774 },
  { id: 3, name: 'Shibuya Crossing', lat: 35.6595, lng: 139.7005 },
  { id: 4, name: 'Meiji Shrine', lat: 35.6764, lng: 139.6993 },
  { id: 5, name: 'Tokyo Skytree', lat: 35.7101, lng: 139.8107 },
  { id: 6, name: 'Shinjuku Gyoen', lat: 35.6852, lng: 139.71 },
];

test('distance between Senso-ji and Shibuya is about 10.6 km', () => {
  const distance = haversineKm(tokyo[0], tokyo[2]);
  assert.ok(Math.abs(distance - 10.6) < 0.5, `got ${distance}`);
});

test('distance remains finite for antipodal coordinates', () => {
  const distance = haversineKm(
    { lat: 0, lng: 0 },
    { lat: 0, lng: 180 },
  );
  assert.ok(Number.isFinite(distance));
  assert.ok(Math.abs(distance - 20015) < 10, `got ${distance}`);
});

test('every place is scheduled exactly once', () => {
  const days = generateItinerary(tokyo, { numDays: 2, maxStopsPerDay: 4 });
  const ids = days.flatMap((day) => day.stops.map((stop) => stop.placeId)).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 2, 3, 4, 5, 6]);
});

test('no day exceeds the stop cap and day numbering is sequential', () => {
  const days = generateItinerary(tokyo, { numDays: 2, maxStopsPerDay: 4 });
  assert.deepEqual(days.map((day) => day.dayNumber), [1, 2]);
  days.forEach((day) => assert.ok(day.stops.length <= 4));
});

test('the Tokyo example groups eastern and western attractions by day', () => {
  const days = generateItinerary(tokyo, { numDays: 2, maxStopsPerDay: 4 });
  const groups = days.map((day) => new Set(day.stops.map((stop) => stop.placeId)));
  const easternIds = [1, 2, 5];
  const westernIds = [3, 4, 6];
  const eastGroup = groups.find((group) => easternIds.every((id) => group.has(id)));
  const westGroup = groups.find((group) => westernIds.every((id) => group.has(id)));
  assert.ok(eastGroup, 'expected Senso-ji, Ueno Park, and Skytree together');
  assert.ok(westGroup, 'expected Shibuya, Meiji Shrine, and Shinjuku together');
});

test('throws when there are too many places for the trip', () => {
  assert.throws(
    () => generateItinerary(tokyo, { numDays: 1, maxStopsPerDay: 3 }),
    /Too many places/,
  );
});

test('returns empty days when the trip has no places', () => {
  const days = generateItinerary([], { numDays: 2 });
  assert.deepEqual(days, [
    { dayNumber: 1, stops: [] },
    { dayNumber: 2, stops: [] },
  ]);
});

test('rejects invalid coordinates and travel configuration', () => {
  assert.throws(
    () => generateItinerary([{ ...tokyo[0], lat: 91 }], { numDays: 1 }),
    /invalid itinerary data/,
  );
  assert.throws(() => generateItinerary(tokyo, { numDays: 0 }), /positive integer/);
  assert.throws(() => generateItinerary(tokyo, { numDays: 2, speedKmh: 0 }), /positive number/);
});
