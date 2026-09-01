# Explore India

Explore India is a portfolio-ready tourism discovery platform that helps travellers explore every Indian state and union territory.

## Current stage

The current build provides:

- a responsive multi-page frontend;
- an Express application server;
- a persistent SQLite database with a versioned schema;
- all 28 states and 8 union territories as database-managed destinations, each with a locally stored destination image;
- destination search and region filtering through the API;
- destination pages with five famous places, regional food, living culture and nearby inspiration;
- expanded festival, regional cuisine and classical dance coverage, including Karnataka cuisine and festivals;
- live weather from Open-Meteo and an interactive OpenStreetMap view on every destination page;
- map, weather, stay-search and share actions on every destination page without requiring an API key;
- persistent contact enquiries with client and server validation; and
- traveller ratings and written reviews, with one editable review per signed-in traveller; and
- automated API tests for the public, traveller and administrator flows.

It also provides registration, login/logout, seven-day secure sessions, traveller and administrator roles, audit logging, saved destinations, trip planning and an administrator workspace for enquiries and destination visibility.

Hotel bookings, transport bookings and enquiry-email delivery are intentionally external integrations. The interface opens trusted search and travel tools without collecting payment or booking data; production booking and notification integrations require the selected providers' API keys and policies.

## Run locally

Requires Node.js 24 or newer.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173`.

## Test

```bash
npm test
```

## Deploy

The project includes a production Docker configuration and a free Render Blueprint (`render.yaml`). It publishes the full application for demonstration, but the free service does not preserve SQLite data after restarts. `render-persistent.yaml` is available for a paid persistent disk mounted at `/app/data`; it keeps accounts, reviews, enquiries and trip plans. Set `ADMIN_PASSWORD` as a private environment variable in the hosting provider before the first start.

Do not deploy this full-stack version to static-only hosting such as GitHub Pages: the API and database are required for sign-in, saved destinations, reviews and enquiries.

## API routes

- `GET /api/health`
- `GET /api/destinations`
- `GET /api/destinations?region=south&q=kerala`
- `GET /api/destinations/:slug`
- `POST /api/enquiries`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/admin/summary`

For the local demonstration, the seeded administrator account is `admin@exploreindia.local` with password `ExploreIndia@2026`. Set `ADMIN_PASSWORD` before the first application start to use a different initial administrator password.

The local database is created at `backend/data/explore-india.db` and is intentionally excluded from version control.

Externally sourced image credits and reusable-license details are recorded in `IMAGE_ATTRIBUTIONS.md`.
