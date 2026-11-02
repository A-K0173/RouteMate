## Frontend and Map (Isaac)

**Status:** Built on `feature/frontend`. The pages run on mock data for trips and places until the trips and places endpoints are merged. Login, register, itinerary save and share links already work with the real backend code.

### What was built

- **Login and register pages.** Register sends the name, email and password to `POST /api/auth/register`, then sends the user to the login page because register does not return a token. Login calls `POST /api/auth/login` and stores the returned JWT and user in `localStorage`. The nav bar shows the user's name and a log out button.
- **Auth handling.** Every API call goes through one function, `apiFetch` in `client/src/api.js`. It adds `Authorization: Bearer <token>` to the request, turns error responses into messages, and on a 401 clears the token and sends the user back to `/login`. Pages that need a login (`/trips`, `/trips/:id`, `/itineraries/:id`) redirect to `/login` when there is no token.
- **Trips list** (`/trips`). Shows the user's trips and has a form to create a trip with a title, destination, start date and end date. The end date cannot be before the start date.
- **Trip detail** (`/trips/:id`). A search box for places, results with an Add button, the list of places on the trip with Remove buttons, and a Generate itinerary button. The page blocks generating when there are no places or more than 6 places per day, which is the server's daily limit.
- **Itinerary view** (`/itineraries/:id`). Each day is listed next to a Leaflet map. Every stop has a numbered marker in its day's colour, and each day's stops are joined by a line in the same colour. The map zooms to fit all the stops. Each day shows its number of stops and total walking minutes.
- **Editing.** Stops can be dragged up and down inside a day using `@dnd-kit/sortable`, or moved to another day with a dropdown. After every change the stops are renumbered 1, 2, 3 and the walking minutes are recalculated. Save sends the days to `PUT /api/itineraries/:id`. Undo returns to the last saved version.
- **Share link.** Copy share link calls `POST /api/itineraries/:id/share`, copies the returned URL to the clipboard and also shows it in a box in case the browser blocks copying. The page asks the user to save first so the link shows their latest changes.
- **Mock data.** `client/src/tripsApi.js` holds every data call. While `USE_MOCK` in `client/src/api.js` is `true`, trips, places, search and itineraries come from `client/src/mockData.js` and are stored in `localStorage`. Setting it to `false` switches every page to the real API without changing the pages.

### Design decisions

- **One file for data calls.** Pages never call `fetch` directly. This kept the mock and the real API in one place, so the switch is a single line.
- **Travel times match the server.** `client/src/travel.js` copies the Haversine formula and the 4.5 km/h walking speed from `server/src/itinerary/`, and rounds to whole minutes the same way, so edited itineraries show the same numbers the generator would.
- **Numbered markers.** Markers are drawn with `L.divIcon` and CSS instead of Leaflet's default image markers. This shows the stop order on the map and avoids the default marker images, which Vite does not bundle without extra setup.
- **Moving between days uses a dropdown.** Reordering inside a day is drag and drop. Moving to another day is a dropdown, which was simpler to build and also works on touch screens and with a keyboard.
- **The map only re-zooms when places change.** Reordering a stop does not move the map, so the user does not lose their view while editing.

### Testing

- Ran the full flow in a browser on mock data: redirect to login when logged out, register, log in, create a trip, search and add places, generate, drag a stop, move a stop to another day, save, reload the page, and copy the share link. There were no console errors.
- Checked the save and share requests against the real server: generated an itinerary with `POST /api/trips/:id/itinerary`, reordered and moved stops the same way the page does, saved with `PUT /api/itineraries/:id` (200), created a share link (201) and opened it with no login (200).
- `npm run lint` and `npm run build` in `client/` pass.

### Challenges and solutions

- **Trips and places endpoints were not ready.** The pages were built against mock data behind the `USE_MOCK` switch so frontend work did not have to wait for the backend.
- **The itinerary PUT is strict.** It rejects days where stop orders are not 1, 2, 3 in a row, where the first stop has travel time, or where minutes are not whole numbers. Every edit now goes through `renumberStops()`, which fixes the order and recalculates rounded minutes before saving.
- **Mock data was lost on refresh.** At first the mock data was kept in memory, so refreshing the page lost new trips. It is now saved in `localStorage`.

### Waiting on the backend

- `GET /api/trips/:id` should return the trip's `places` and its `itineraryId` (or `null`), so the trip page can link to the existing itinerary.
- The pages expect trips as `{ id, title, destination, startDate, endDate }` and search results as `{ name, address, lat, lng }`. Adjust `tripsApi.js` if the final shapes differ.
- Once those routes are merged, set `USE_MOCK` to `false` and run the full flow again.

### Limitations and future work

- Stops can only be moved between days with the dropdown, not by dragging across days.
- Walking times are straight-line estimates, the same as the generator, not real routes.
- With mock data on, share links point to a fake token, so the shared page only works with the real backend.

### Screenshots

| Page | File |
|---|---|
| Log in | `docs/screenshots/login.png` |
| My trips | `docs/screenshots/trips.png` |
| Trip detail with place search | `docs/screenshots/trip-detail.png` |
| Itinerary map | `docs/screenshots/itinerary.png` |
| Itinerary with unsaved changes | `docs/screenshots/itinerary-editing.png` |
