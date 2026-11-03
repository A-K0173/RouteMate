const fs = require('fs');
const path = require('path');
const db = require('./db');

db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'seed.sql'), 'utf8'));
console.log('Seeded demo data. Log in with demo@example.com / demo12345');
