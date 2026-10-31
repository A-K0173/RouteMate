const test = require('node:test');
const assert = require('node:assert/strict');
const requireAuth = require('../src/middleware/auth');

test('temporary auth stub rejects requests unless explicitly enabled for development', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableStub = process.env.ENABLE_INSECURE_AUTH_STUB;
  let statusCode;
  let responseBody;
  let nextCalled = false;
  const req = {};
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  try {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_INSECURE_AUTH_STUB = 'true';
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    assert.equal(statusCode, 401);
    assert.deepEqual(responseBody, { error: 'Authentication is not configured' });
    assert.equal(nextCalled, false);

    process.env.NODE_ENV = 'development';
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    assert.equal(req.user.id, 1);
    assert.equal(nextCalled, true);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalEnableStub === undefined) delete process.env.ENABLE_INSECURE_AUTH_STUB;
    else process.env.ENABLE_INSECURE_AUTH_STUB = originalEnableStub;
  }
});
