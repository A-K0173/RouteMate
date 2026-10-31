# RouteMate

RouteMate is a travel-planning application built with React, Express, and SQLite.

## Project setup

### Requirements

- Node.js and npm
- Git

### Install dependencies

From the repository root, install each app's dependencies:

```bash
cd client
npm install
cd ../server
npm install
cd ..
```

The client uses React (Vite), React Router, Leaflet, and React Leaflet. The server uses Express, `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `dotenv`, and `cors`; `nodemon` is used for development.

### Environment variables

Copy `.env.example` to `server/.env` if you need to set local server configuration. The server defaults to port `3001`. Do not commit `.env` or put real credentials in `.env.example`.

### Run the apps

Open two terminals from the repository root:

```bash
cd server
npm run dev
```

```bash
cd client
npm run dev
```

Open <http://localhost:5173>. To verify the Vite proxy and backend health route, open <http://localhost:5173/api/health>; it should return:

```json
{"ok":true}
```

The SQLite database is created at `server/routemate.db` when the backend starts. Its tables are initialized from `server/database/schema.sql`.

## Stack and project ownership

| Member | Owns | Main folders/files |
|---|---|---|
| Owen | Itinerary generation engine, itinerary endpoints, and tests | `server/src/itinerary/`, `server/src/routes/itinerary.js` |
| Isaac W. | React UI: login, trips, place search, itinerary map, and drag-and-drop | `client/src/` |
| Jerome | Registration/login, JWT middleware, share links, and shared read-only page | `server/src/routes/auth.js`, `server/src/middleware/auth.js`, `server/src/routes/share.js` |
| Aareez K. | Schema, trip/place endpoints, Nominatim search, and video import | `server/database/`, `server/src/routes/trips.js`, `server/src/routes/places.js` |

Owen will offer to help Isaac with the map after the itinerary algorithm is done. Team members should help one another when someone is blocked.

## API contract

| Method and path | Owner | Purpose |
|---|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | Jerome | Register and log in; login returns a JWT |
| `GET /api/trips`, `POST /api/trips` | Aareez | List and create trips |
| `GET/PUT/DELETE /api/trips/:id` | Aareez | Read, edit, and delete a trip |
| `GET /api/places/search?q=` | Aareez | Search destinations using Nominatim |
| `POST /api/trips/:id/places`, `DELETE /api/places/:id` | Aareez | Add and remove places |
| `POST /api/trips/:id/itinerary` | Owen | Generate and save an itinerary |
| `GET /api/itineraries/:id`, `PUT /api/itineraries/:id` | Owen | Read an itinerary and replace its day plans/stops after edits |
| `POST /api/itineraries/:id/share` | Jerome | Create a share link |
| `GET /api/shared/:token` | Jerome | Read a shared itinerary |
| `POST /api/trips/:id/import` | Aareez | Import a video link (last) |

The agreed itinerary response shape is:

```json
{
  "id": 1,
  "tripId": 4,
  "days": [
    {
      "dayNumber": 1,
      "stops": [
        {
          "placeId": 3,
          "name": "Senso-ji",
          "lat": 35.7148,
          "lng": 139.7967,
          "order": 1,
          "travelMinFromPrevious": 0
        }
      ]
    }
  ]
}
```

## Itinerary generation

The itinerary generator is implemented as plain functions so the core logic can be tested without an API server or database:

1. **Distance:** Haversine distance estimates straight-line distance between coordinates on Earth.
2. **Clustering:** deterministic k-means groups places into one geographic cluster per trip day. It starts with the first place coordinates and runs at most 20 passes.
3. **Capacity balancing:** if a cluster exceeds the per-day stop limit, excess places move to the nearest day that still has room.
4. **Stop ordering:** nearest-neighbour ordering repeatedly chooses the closest unvisited place.
5. **Travel estimate:** distance between consecutive stops is converted into minutes using an assumed walking speed of 4.5 km/h. The first stop of each day has zero travel time from the previous stop.

```text
places + trip days
        |
        v
Haversine distances -> k-means day clusters -> enforce daily stop cap
                                                    |
                                                    v
                         response <- travel estimates <- nearest-neighbour order
```

The algorithm is explainable and fast for trip-sized input, but its distances are straight-line estimates rather than real routes. It does not account for opening hours, traffic, or transit options, and k-means can settle on a local optimum depending on its starting centres. The fixed iteration limit guarantees termination. Do not claim challenges that did not occur; document actual issues encountered by the team.

Run the itinerary unit tests from `server/`:

```bash
npm test
```

They verify distance, one-time place assignment, day capacity, the Tokyo east/west grouping example, empty days, and invalid input handling.

### Itinerary API endpoint

`POST /api/trips/:id/itinerary` reads the trip and its places, generates days, and saves the itinerary, day plans, and stops in a SQLite transaction. `GET /api/itineraries/:id` returns the agreed itinerary shape. `PUT /api/itineraries/:id` accepts `{ "days": [...] }` using that shape and replaces all day plans and stops in a transaction. It validates that the days match the trip duration, each day has no more than six stops, stop places belong to the trip and are not duplicated, and stop order/travel times are valid. All three endpoints check trip ownership through the authenticated user and return `404` when the itinerary or trip is not available to that user.

The itinerary API tests use an in-memory SQLite database. Run `npm test` from `server/` to verify generation, reading, editing, ownership, and invalid-edit behavior.

Until Jerome's JWT middleware is integrated, the local auth placeholder only accepts requests when both `NODE_ENV=development` and `ENABLE_INSECURE_AUTH_STUB=true` are set. It assigns test user ID `1`; never enable this outside local development and replace the placeholder before merging. The endpoint otherwise rejects requests until real authentication is added. The example environment file leaves this switch disabled.

## Team workflow

- Work on feature branches; suggested names are `feature/itinerary-engine`, `feature/auth`, `feature/frontend`, and `feature/trips-places`.
- All changes go through a pull request. Get one teammate's approval before merging; do not push directly to `main`.
- Pull `main` every morning and merge work at least daily.
- Never commit `.env`, `node_modules/`, or `*.db`. Keep `.env.example` free of real values.
- Hold a 10-minute stand-up twice a week.
- **Meeting times:** [TBD — agree as a group]
- **Progress report writer:** [TBD — assign as a group]
- **Professor Sheth stakeholder-meeting lead:** [TBD — assign as a group]

## Kickoff and GitHub checklist

- [ ] Confirm the stack, team workflow, meeting schedule, progress report writer, and stakeholder-meeting lead.
- [ ] Confirm all other three group members have repository collaborator access.
- [ ] Protect `main` in GitHub Settings → Branches and require pull requests before merging.
- [ ] Each member starts both apps and confirms the client and `/api/health` check work.

## Data model note

`TripMember` is represented by `user_id` on `trips` instead. This is a deliberate simplification and should be noted as such in the progress report.
