-- Demo data so a fresh database has something to show.
-- Run with `npm run seed` from server/. Safe to run more than once.
-- Demo login: demo@example.com / demo12345

INSERT OR IGNORE INTO users (name, email, password_hash)
VALUES (
  'Demo Traveller',
  'demo@example.com',
  '$2b$10$.LZvq4pvrep4f4jNjbTMYeRjvu8UwRvkPMDETWRlpduZiZmD.Jpw2'
);

INSERT INTO trips (user_id, title, destination, start_date, end_date)
SELECT id, 'Tokyo Adventure', 'Tokyo, Japan', '2026-12-01', '2026-12-03'
FROM users
WHERE email = 'demo@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM trips WHERE trips.user_id = users.id AND trips.title = 'Tokyo Adventure'
  );

WITH demo_trip AS (
  SELECT trips.id AS trip_id
  FROM trips JOIN users ON users.id = trips.user_id
  WHERE users.email = 'demo@example.com' AND trips.title = 'Tokyo Adventure'
),
seed_places(name, address, lat, lng) AS (
  VALUES
    ('Senso-ji',         'Asakusa, Taito, Tokyo',     35.7148, 139.7967),
    ('Tokyo Skytree',    'Sumida, Tokyo',             35.7101, 139.8107),
    ('Ueno Park',        'Ueno, Taito, Tokyo',        35.7156, 139.7745),
    ('Meiji Shrine',     'Yoyogi, Shibuya, Tokyo',    35.6764, 139.6993),
    ('Shibuya Crossing', 'Shibuya, Tokyo',            35.6595, 139.7005),
    ('Shinjuku Gyoen',   'Shinjuku, Tokyo',           35.6852, 139.7100),
    ('Tokyo Tower',      'Minato, Tokyo',             35.6586, 139.7454)
)
INSERT INTO places (trip_id, name, address, lat, lng)
SELECT demo_trip.trip_id, seed_places.name, seed_places.address, seed_places.lat, seed_places.lng
FROM demo_trip, seed_places
WHERE NOT EXISTS (
  SELECT 1 FROM places
  WHERE places.trip_id = demo_trip.trip_id AND places.name = seed_places.name
);
