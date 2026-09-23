# Explore India

An India destination discovery and trip planning project built with vanilla HTML, CSS and JavaScript, Node.js 24, Express 5, and SQLite. It covers all 28 states and 8 union territories.

## What works locally

- Searchable destination pages combine a curated place list, regional food, traditions, festivals, map search, and practical links. The place list currently has 202 distinct entries across 36 destinations, with 5 to 22 per destination. The regional culture entries are still uneven and require item-specific research.
- A reviewed catalogue supplies 75 subject-matched photographs with attribution and licence links at [image credits](frontend/credits.html). All 36 destination overview cards and 24 of 25 culture-page cards now have reviewed photos. Individual destination stories still have substantial image gaps; the site shows an explicit illustration instead of an unrelated photograph.
- Travellers can register, sign in, save destinations, build and edit day-by-day trip plans, share a revocable itinerary snapshot, and print plans. Transfer days are conservative planning buffers, **not** calculated routes or confirmed times/prices.
- Reviews are private until an administrator approves them. Signed-in users can report published reviews. Enquiries are stored for the administrator, with optional email notifications through Resend when privately configured.
- Weather uses Open-Meteo and maps use OpenStreetMap. Hotel and transport links open third-party searches; Explore India does not book either service.

## Run and test

Install Node.js 24 or newer, then run:

```bash
npm ci
npm test
npm run audit:media
npm start
```

Open `http://127.0.0.1:10000` unless `PORT` is set. For the browser smoke test, set `PLAYWRIGHT_MODULE` to a local Playwright package path and optionally `CHROME_BIN`, then run `node test/browser-smoke.mjs`. The smoke test uses an in-memory database and synthetic accounts.

## Data and deployment

The database defaults to `backend/data/explore-india.db`; override it with `EXPLORE_INDIA_DB`. The application migrates existing review and trip tables in place. **Back up the SQLite database before updating a deployment.** Keep the app stopped during a file-level backup and include its WAL sidecars if present, or use SQLite's online backup API. Restore the backup only after stopping the service, then restart on the previous application commit to roll back.

`render.yaml` is the existing free Render deployment. Its filesystem is ephemeral: accounts, reviews, plans and enquiries can disappear after a restart or redeploy. Do not present that setup as durable storage. `render-persistent.yaml` provisions a paid disk and must only be selected after reviewing Render's current price. Alternatively migrate to a durable external database with a tested backup and restore path before relying on real user records. A GitHub push may trigger Render auto-deploy; check the Render deployment and health endpoint after publication.

Set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` only in private host environment variables before starting in production. Do not commit either value. Optional email notifications require `ENQUIRY_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `ENQUIRY_EMAIL_FROM`, and `ENQUIRY_EMAIL_TO`; they are disabled otherwise. Provider charges or quotas must be checked before enabling. The free maps/weather services may impose usage or attribution rules; check current terms before high traffic.

Static-only GitHub Pages cannot run the API or SQLite features. Source code goes to GitHub; the Render web service hosts the application.

## Remaining work

See [content audit](CONTENT_AUDIT.md). Culture stories for most destinations are short overviews; the site does not claim 10 fully researched items in every category. More item-specific sources and images, accessibility review, a durable production database, provider email verification, and broader end-to-end browser coverage remain before treating it as a business-ready service.
