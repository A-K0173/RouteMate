const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');

function createSeededDatabase() {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  database.exec(fs.readFileSync(path.join(__dirname, '../database/seed.sql'), 'utf8'));
  return database;
}

test('seed creates a demo user with a Tokyo trip and seven places', () => {
  const database = createSeededDatabase();
  const user = database.prepare("SELECT * FROM users WHERE email = 'demo@example.com'").get();
  const trip = database.prepare('SELECT * FROM trips WHERE user_id = ?').get(user.id);
  const places = database.prepare('SELECT name FROM places WHERE trip_id = ?').all(trip.id);

  assert.equal(trip.title, 'Tokyo Adventure');
  assert.equal(places.length, 7);
  assert.ok(places.some((place) => place.name === 'Senso-ji'));
  assert.ok(bcrypt.compareSync('demo12345', user.password_hash));
});

test('running the seed twice does not duplicate anything', () => {
  const database = createSeededDatabase();
  database.exec(fs.readFileSync(path.join(__dirname, '../database/seed.sql'), 'utf8'));

  for (const table of ['users', 'trips', 'places']) {
    const { n } = database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
    assert.equal(n, table === 'places' ? 7 : 1, table);
  }
});
