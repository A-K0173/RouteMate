## Database, Trips and Places (Aareez)

**Status:** Built on `feature/apis`. Trips, place search, place management, seed data and video import are implemented and tested. The video import is covered by automated tests with a stubbed YouTube response, and was also run once against the live YouTube Data API.

### What was built

- **Schema** (`server/database/schema.sql`). SQLite tables for `users`, `trips`, `places`, `itineraries`, `day_plans`, `stops` and `share_links`. The schema is created when the backend starts and was kept unchanged while the rest of the team built on it. Foreign keys are switched on, and child tables use `ON DELETE CASCADE`, so deleting a trip also removes its places, itineraries, day plans, stops and share links.
- **Trips** (`server/src/routes/trips.js`). `GET/POST /api/trips` and `GET/PUT/DELETE /api/trips/:id`. Every query filters by `req.user.id`, so a user only sees their own trips, and another user's trip returns 404. Titles and destinations are required, dates must be real `YYYY-MM-DD` dates, the end date cannot be before the start date, and a trip can last at most 60 days. `GET /api/trips/:id` also returns the trip's `places` and its latest `itineraryId` (or `null`), which the trip page needs.
- **Place search** (`server/src/routes/places.js`). `GET /api/places/search?q=` sends the query to Nominatim and returns `{ name, address, lat, lng }` for each match. It sends a descriptive `User-Agent` with a contact address, which Nominatim's usage policy requires.
- **Place management.** `POST /api/trips/:id/places` stores `name`, `address`, `lat` and `lng` for a place on the user's own trip, and `DELETE /api/places/:id` removes a place only if it belongs to one of the user's trips. Names, coordinate ranges and a limit of 100 places per trip are validated.
- **Seed data** (`server/database/seed.sql`, run with `npm run seed`). Creates a demo user and a three-day Tokyo trip with seven places, so the app has data straight away. The demo login is `demo@example.com` with password `demo12345`. The seed can be run more than once without creating duplicates.
- **Video import** (`server/src/routes/videoImport.js`). `POST /api/trips/:id/import` takes a YouTube link, reads the video's title and description through the YouTube Data API and returns `{ videoId, title, candidates }`, a list of possible place names. It never adds places. The user confirms names and adds them through the normal place endpoint.

### Design decisions

- **`TripMember` is represented by `trips.user_id`.** The original design had a separate member table. A single owner column is simpler and is enough for this phase, where every trip belongs to one user. The cost is that a trip cannot be shared for editing between users. Share links (Jerome's work) give read-only sharing instead.
- **Ownership is checked in the SQL query.** Trips are looked up with `WHERE id = ? AND user_id = ?`, and places are deleted through their trip's owner. A missing record and someone else's record both return 404, so the API does not reveal which ids exist.
- **The API returns the shapes the frontend and the itinerary code already expect.** Trips use camelCase (`startDate`, `endDate`, `itineraryId`), and places keep `id`, `name`, `lat` and `lng`, which is what the itinerary generator reads. The database columns stay snake_case, and the routes convert between the two.
- **Nominatim rate limit.** Searches go through a single queue that starts requests at least 1.1 seconds apart, however many users search at once. Repeated searches are answered from a small in-memory cache for 10 minutes, and when more than 10 searches are waiting the server answers 429 instead of making users wait. Search requires a login so it cannot be used anonymously.
- **Video import is a suggestion step.** Names are guessed from chapter timestamps and bullet or numbered lines in the description. Nothing is saved, so a wrong guess costs the user one click. The API key is read from `YOUTUBE_API_KEY` and sent in a request header rather than the URL, so it does not appear in logs.
- **Routes are factories that take the database.** Each router is created with `createXRouter({ database, authenticate })`, the same pattern as the other routes, so tests can use an in-memory database and a fake login.

### Testing

`npm test` in `server/` includes these test files for this part of the project:

- `trips.test.js`: create, list, read, update and delete, other users getting 404, cascade delete, and invalid input.
- `places-search.test.js`: the Nominatim request and its `User-Agent`, result mapping, requests spaced apart, the cache, bad input and upstream errors. `fetch` is replaced with a stub, so the tests do not call the real service.
- `places-manage.test.js`: adding and deleting places, ownership, and validation.
- `seed.test.js`: the seed creates the expected rows, the demo password matches its hash, and running it twice adds nothing.
- `trip-flow.test.js`: the full flow from the project's done criteria. Register and log in, create a trip, search for Senso-ji, add six places, and generate an itinerary through Owen's endpoint with all six places scheduled.
- `video-import.test.js`: link parsing, name extraction, no places being added, and error responses.

I also ran the app in a browser with the real backend: logged in as the demo user, opened the Tokyo trip, searched "Senso-ji" (live Nominatim), added it, generated an itinerary and saw it on the map, with no console errors.

### Challenges and solutions

- **The frontend and the database use different shapes.** The pages were built on mock data with camelCase fields and a trip that includes its places, while the tables use snake_case and keep places separately. Isaac's report listed what the pages needed, and the routes now convert the data into exactly that shape, so switching `USE_MOCK` to `false` needed no page changes.
- **Nominatim allows one request per second.** Several users searching at once could break that limit. A queue that spaces requests, plus a cache for repeated searches, keeps the app within it. A test checks that concurrent searches are spaced apart by the configured interval.
- **The seed had to be safe to run twice.** The `trips` and `places` tables have no unique constraint, so a plain `INSERT` would duplicate the demo data each run. The seed checks for existing rows before inserting, and a test runs it twice.

### Limitations and future work

- Video import only reads the video description, so it works for videos that list places in chapters or lists, and not for videos that only mention places in speech. A live run on a Tokyo guide whose description lists chapters returned the neighbourhood names (Shibuya, Harajuku, Shinjuku, Tokyo Station and so on); other videos have not been tried.
- The same place can be added to a trip more than once.
- Changing a trip's dates does not update an itinerary that was already generated. The itinerary has to be generated again.
- Place search depends on Nominatim being available, and its results are only as good as OpenStreetMap's data.
- Deleting a place also removes it from any saved itinerary stops, because of the cascade.
- There is no import button in the React UI yet. The endpoint is ready for it.
