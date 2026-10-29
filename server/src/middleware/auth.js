function requireAuth(req, res, next) {
  const allowDevelopmentStub =
    process.env.NODE_ENV === 'development' &&
    process.env.ENABLE_INSECURE_AUTH_STUB === 'true';

  if (!allowDevelopmentStub) {
    return res.status(401).json({ error: 'Authentication is not configured' });
  }

  req.user = { id: 1 };
  return next();
}

module.exports = requireAuth;
