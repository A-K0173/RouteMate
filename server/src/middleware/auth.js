const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server authentication is not configured' });
  }

  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    const id = Number(payload.sub);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid subject');
    req.user = { id };
    return next();
  } catch (error) {
    const message = error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: message });
  }
}

module.exports = requireAuth;
