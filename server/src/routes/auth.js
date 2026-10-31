const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const requireAuth = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function createAuthRouter({ database = require('../db'), authenticate = requireAuth } = {}) {
  const router = express.Router();


  router.post('/register', (req, res) => {
    const { name, email, password } = req.body || {};

    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: 'Name is required (max 100 characters)' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password.length > 72) {

      return res.status(400).json({ error: 'Password must be at most 72 characters' });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    try {
      const info = database
        .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
        .run(cleanName, cleanEmail, bcrypt.hashSync(password, BCRYPT_ROUNDS));
      return res.status(201).json({
        user: { id: Number(info.lastInsertRowid), name: cleanName, email: cleanEmail },
      });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Email already registered' });
      }
      throw error;
    }
  });

  router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = database
      .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
      .get(email.trim().toLowerCase());

    const matches = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !matches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json({
      token: signToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

  router.get('/me', authenticate, (req, res) => {
    const user = database
      .prepare('SELECT id, name, email, user_type FROM users WHERE id = ?')
      .get(req.user.id);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    return res.json({ user });
  });

  return router;
}

module.exports = createAuthRouter();
module.exports.createAuthRouter = createAuthRouter;
