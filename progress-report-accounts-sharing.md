## Accounts and Sharing (Jerome)

**Status:** Implemented on `feature/auth`; merge target Day 3 because other features depend on it.

### What was built

- **Registration and login.** `POST /api/auth/register` requires a name, a valid email, and a password of 8–72 characters. The password is hashed with bcryptjs (10 rounds) and stored in `users.password_hash`; emails are lower-cased and unique. `POST /api/auth/login` verifies the password and returns a JWT (HS256, 7-day expiry by default, signed with `JWT_SECRET`) plus the public user profile. Login failures use one generic message and take similar time whether or not the email exists. `GET /api/auth/me` was added so a token can be checked quickly.
- **Real auth middleware.** `server/src/middleware/auth.js` reads `Authorization: Bearer <token>`, verifies the signature and expiry, and sets `req.user = { id }`. This is the same shape as the temporary stub, so Owen's itinerary routes (including `POST /api/trips/:id/itinerary`) work without any changes.
- **Stub removed.** The `ENABLE_INSECURE_AUTH_STUB` code path and its test were deleted. Tests now register real users and use real tokens against an in-memory database. The server refuses to start without `JWT_SECRET`.
- **Share links.** `POST /api/itineraries/:id/share` (owner only) generates a 256-bit token with `crypto.randomBytes(32)`, saves it in `share_links` with an expiry (default 7 days, maximum 30) and returns the token and a `/shared/:token` URL. `GET /api/shared/:token` needs no login and returns a read-only copy of the itinerary: title, destination, dates, days and stops. User ids and trip ids are not exposed. Unknown tokens return 404 and expired tokens return 410. A public React page, `SharedItinerary.jsx`, displays it.

### Design decisions

- Share tokens are random and unguessable rather than derived from itinerary ids, and they expire.
- Requesting a share link for someone else's itinerary returns 404 (not 403), so the API does not reveal which ids exist.
- JWT verification pins the algorithm to HS256. Public share responses are sent with `Cache-Control: no-store`.
- No schema change was needed: the existing `users` and `share_links` tables were used as designed.

### Testing

`npm test` in `server/` runs `auth-share.test.js`, which covers registration validation and duplicates, bad credentials, missing/invalid/valid tokens, the full flow of register → log in → `POST /api/trips/:id/itinerary` with the token, share creation (owner only), reading a share link with no login, unknown tokens, and expired tokens. Manual check: open the returned share URL in a private/incognito window while logged out.

### Limitations and future work

- No rate limiting on login or share endpoints.
- Share links cannot be revoked before they expire, and there is no password reset or email verification.
- The JWT is held by the client; httpOnly cookies could be considered later.
- (Add any real issues the team hit while building this. Do not claim challenges that did not occur.)
