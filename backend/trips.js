import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const paces = new Set(["slow", "balanced", "active"]);
const transports = new Set(["flexible", "road", "train", "flight"]);
const interests = new Set(["heritage", "food", "nature", "art", "relaxation"]);
const text = (value, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const digest = value => createHash("sha256").update(value).digest("hex");
const validDate = value => /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const addDays = (value, days) => new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const loadReviewedPlaces = () => { try { return JSON.parse(readFileSync(new URL("../frontend/data/places.json", import.meta.url), "utf8")); } catch { return {}; } };
const fail = message => Object.assign(new Error(message), { status: 422 });
const island = place => ["andaman-nicobar", "andaman-and-nicobar-islands", "lakshadweep"].includes(place.slug);
const transferDays = (a, b, transport) => island(a) || island(b) ? 2 : ["road", "train"].includes(transport) ? 2 : 1;
export const minimumDays = (places, pace, transport) => places.length * (pace === "slow" ? 3 : 2) + places.slice(1).reduce((sum, place, i) => sum + transferDays(places[i], place, transport), 0);

export function validateTrip(input, db, legacy = false) {
  const title = text(input.title, 81), days = Number(input.days), budget = Number(input.budget);
  const travelMonth = text(input.travelMonth, 8), startDate = text(input.startDate, 11) || `${travelMonth}-01`;
  const origin = text(input.origin, 161), pace = text(input.pace), transport = text(input.transport) || "flexible";
  if (!validDate(startDate)) throw fail("Choose a valid travel start date.");
  if (title.length < 3 || title.length > 80) throw fail("Give your trip a name between 3 and 80 characters.");
  if (!Number.isInteger(days) || days < 2 || days > 30) throw fail("Choose between 2 and 30 days.");
  if (!Number.isInteger(budget) || budget < 10000 || budget > 500000) throw fail("Enter a total budget between ₹10,000 and ₹5,00,000.");
  if (!paces.has(pace) || !transports.has(transport)) throw fail("Choose a listed pace and transport preference.");
  if (origin.length > 160) throw fail("Keep the starting location below 160 characters.");
  const destinationIds = [...new Set(Array.isArray(input.destinationIds) ? input.destinationIds.map(Number) : [])];
  if (destinationIds.length < 1 || destinationIds.length > 6 || destinationIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw fail("Choose between one and six destinations.");
  const places = destinationIds.map(id => db.prepare("SELECT id, slug, name, region, published FROM destinations WHERE id = ?").get(id));
  if (places.some(place => !place || (!legacy && !place.published))) throw fail("One or more destinations are unavailable. Choose another destination.");
  const selectedInterests = [...new Set(Array.isArray(input.interests) ? input.interests : [])];
  if (selectedInterests.some(value => !interests.has(value))) throw fail("Choose interests from the listed options.");
  const required = minimumDays(places, pace, transport);
  if (!legacy && days < required) throw fail(`This route needs at least ${required} days with the selected pace and transfer buffers. Add days or remove destinations.`);
  return { title, days, budget, startDate, travelMonth: startDate.slice(0, 7), origin, pace, transport, interests: selectedInterests, destinationIds, places, dateIsApproximate: !input.startDate };
}

// Stop suggestions must be supplied by the reviewed catalogue. A name alone is not evidence.
export function buildItinerary(plan, reviewedPlaces = {}) {
  const minimum = minimumDays(plan.places, plan.pace, plan.transport);
  if (plan.days < minimum) return { itinerary: [], warnings: [`Your older plan is preserved. Allow at least ${minimum} days to generate a route with transfer time.`] };
  const buffers = plan.places.slice(1).map((place, index) => transferDays(plan.places[index], place, plan.transport));
  const stayDays = plan.days - buffers.reduce((sum, days) => sum + days, 0);
  const base = Math.floor(stayDays / plan.places.length), remainder = stayDays % plan.places.length;
  const itinerary = [], warnings = ["Travel buffers are planning allowances, not calculated journey times or confirmed connections. Check the actual route, operating dates and arrival times before booking.", "Budget per day is your own spending target; it is not a price quote and includes no confirmed bookings."];
  if (plan.dateIsApproximate) warnings.push("This older plan records a month only. Dates start on the first of that month until you choose an exact start date.");
  const focus = plan.interests.length ? plan.interests.join(", ") : "local neighbourhoods and culture";
  plan.places.forEach((place, placeIndex) => {
    if (placeIndex > 0) for (let index = 0; index < buffers[placeIndex - 1]; index++) {
      itinerary.push({ type: "transfer", destinationId: place.id, destination: place.name, title: `Travel to ${place.name}`, morning: `Travel from ${plan.places[placeIndex - 1].name} towards ${place.name}.`, afternoon: "Keep this day free for the journey, connections and check-in. Confirm the route with your operator.", evening: "Rest on arrival. Move the next day's activities if the connection needs more time.", notes: "Transfer day reserved; no sightseeing scheduled.", planningAllowanceHours: 24, sources: [] });
    }
    const stops = (reviewedPlaces[place.slug] || []).filter(stop => stop.name && stop.description && /^https:\/\//.test(stop.sourceUrl));
    const count = base + Number(placeIndex < remainder);
    for (let index = 0; index < count; index++) {
      const arriving = placeIndex === 0 && index === 0, departing = placeIndex === plan.places.length - 1 && index === count - 1;
      const stop = stops[index];
      itinerary.push({ type: arriving ? "arrival" : departing ? "departure" : "local", destinationId: place.id, destination: place.name,
        title: arriving ? `Arrive in ${place.name}` : departing ? `Leave room for your return` : stop ? `Consider ${stop.name}` : `A local day in ${place.name}`,
        morning: arriving ? `Travel from ${plan.origin || "your starting point"} and settle in. Leave arrival day free until your journey is confirmed.` : departing ? "Pack, check out and confirm your return connection. Keep activities close to your departure point." : stop ? `${stop.name}: ${stop.description}` : `Choose one nearby experience around ${focus}. Select the town or base first; this is an editable planning slot.`,
        afternoon: arriving || departing ? "Add a short nearby stop only if arrival or departure timings allow." : "Check distance from your accommodation and opening times before adding this stop. Allow time for meals and local travel.",
        evening: plan.pace === "active" ? "Optional nearby walk or meal if time and energy allow." : "An unhurried meal and time to rest.", notes: stop && !arriving && !departing ? "A researched option, not a confirmed booking or calculated route. Change it to suit your base." : "Add your confirmed places, timings and notes here.", planningAllowanceHours: arriving || departing ? 12 : plan.pace === "slow" ? 4 : plan.pace === "active" ? 7 : 6,
        mapQuery: stop && !arriving && !departing ? `${stop.name}, ${place.name}, India` : `${place.name}, India`, sources: stop && !arriving && !departing ? [{ title: stop.name, url: stop.sourceUrl }] : [] });
    }
  });
  return { itinerary: itinerary.map((day, index) => ({ ...day, day: index + 1, date: addDays(plan.startDate, index) })), warnings };
}

function validateEdits(input, expected) {
  if (!Array.isArray(input) || input.length !== expected.length) throw fail("Keep one itinerary entry for every trip day.");
  return input.map((day, index) => {
    const original = expected[index];
    if (!day || typeof day !== "object" || day.destinationId !== original.destinationId || day.type !== original.type) throw fail("Destination order and travel days must remain intact. Rebuild the route to change destinations.");
    const output = { ...original };
    for (const field of ["title", "morning", "afternoon", "evening", "notes"]) {
      if (typeof day[field] !== "string" || day[field].length > (field === "title" ? 160 : 700)) throw fail("Use a short title and keep each activity or note below 700 characters.");
      output[field] = day[field].trim();
    }
    if (!output.title || !output.morning) throw fail("Every day needs a title and morning plan.");
    // User edits are text, not new verified map coordinates or third-party links.
    return { ...output, edited: true };
  });
}

export function registerTrips({ app, db, requireAuth, writeAudit, getReviewedPlaces = loadReviewedPlaces }) {
  const columns = new Set(db.prepare("PRAGMA table_info(trip_plans)").all().map(column => column.name));
  for (const [name, sql] of Object.entries({ start_date: "TEXT", origin: "TEXT NOT NULL DEFAULT ''", transport: "TEXT NOT NULL DEFAULT 'flexible'", interests_json: "TEXT NOT NULL DEFAULT '[]'", itinerary_json: "TEXT", updated_at: "TEXT" })) {
    if (!columns.has(name)) db.exec(`ALTER TABLE trip_plans ADD COLUMN ${name} ${sql}`);
  }
  db.exec("CREATE TABLE IF NOT EXISTS trip_shares (token_hash TEXT PRIMARY KEY, trip_id INTEGER NOT NULL UNIQUE REFERENCES trip_plans(id) ON DELETE CASCADE, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const select = "SELECT * FROM trip_plans WHERE id = ? AND user_id = ?";
  const hydrate = row => {
    const plan = { id: row.id, title: row.title, days: row.days, budget: row.budget, travelMonth: row.travel_month, startDate: row.start_date, origin: row.origin, pace: row.pace, transport: row.transport, destinationIds: parse(row.destination_ids, []), interests: parse(row.interests_json, []), createdAt: row.created_at, updatedAt: row.updated_at, dateIsApproximate: !row.start_date };
    const places = plan.destinationIds.map(id => db.prepare("SELECT id, slug, name, region FROM destinations WHERE id = ?").get(id)).filter(Boolean);
    const generated = buildItinerary({ ...plan, startDate: plan.startDate || `${plan.travelMonth}-01`, places }, getReviewedPlaces());
    return { ...plan, destinationNames: places.map(place => place.name), itinerary: parse(row.itinerary_json, null) || generated.itinerary, warnings: generated.warnings, dailyBudgetTarget: Math.floor(plan.budget / plan.days), sharingEnabled: Boolean(db.prepare("SELECT 1 FROM trip_shares WHERE trip_id = ?").get(row.id)) };
  };
  const owned = request => {
    const id = Number(request.params.id);
    const row = Number.isSafeInteger(id) && id > 0 ? db.prepare(select).get(id, request.user.id) : null;
    if (!row) throw Object.assign(new Error("Trip plan not found."), { status: 404 });
    return row;
  };
  const handle = fn => (request, response, next) => { try { fn(request, response); } catch (error) { if (error.status) response.status(error.status).json({ error: error.message }); else next(error); } };
  app.get("/api/trip-plans", requireAuth, handle((request, response) => response.json({ data: db.prepare("SELECT * FROM trip_plans WHERE user_id = ? ORDER BY created_at DESC, id DESC").all(request.user.id).map(hydrate) })));
  app.post("/api/trip-plans/preview", requireAuth, handle((request, response) => {
    const plan = validateTrip(request.body || {}, db); response.json({ data: { ...plan, ...buildItinerary(plan, getReviewedPlaces()), dailyBudgetTarget: Math.floor(plan.budget / plan.days) } });
  }));
  app.post("/api/trip-plans", requireAuth, handle((request, response) => {
    const plan = validateTrip(request.body || {}, db), generated = buildItinerary(plan, getReviewedPlaces());
    const itinerary = request.body.itinerary ? validateEdits(request.body.itinerary, generated.itinerary) : generated.itinerary;
    const result = db.prepare("INSERT INTO trip_plans (user_id,title,destination_ids,days,budget,travel_month,pace,start_date,origin,transport,interests_json,itinerary_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").run(request.user.id, plan.title, JSON.stringify(plan.destinationIds), plan.days, plan.budget, plan.travelMonth, plan.pace, plan.dateIsApproximate ? null : plan.startDate, plan.origin, plan.transport, JSON.stringify(plan.interests), JSON.stringify(itinerary));
    writeAudit(request.user, "created_trip_plan", "trip_plan", result.lastInsertRowid);
    response.status(201).json({ data: hydrate(db.prepare(select).get(result.lastInsertRowid, request.user.id)) });
  }));
  app.get("/api/trip-plans/:id/itinerary", requireAuth, handle((request, response) => response.json({ data: hydrate(owned(request)) })));
  app.patch("/api/trip-plans/:id", requireAuth, handle((request, response) => {
    const row = owned(request), current = hydrate(row), input = { ...current, ...request.body }, plan = validateTrip(input, db);
    const generated = buildItinerary(plan, getReviewedPlaces());
    const changedRoute = ["days", "startDate", "pace", "transport", "origin", "interests", "destinationIds"].some(key => JSON.stringify(input[key]) !== JSON.stringify(current[key]));
    const itinerary = request.body.itinerary ? validateEdits(request.body.itinerary, generated.itinerary) : changedRoute ? generated.itinerary : current.itinerary;
    db.prepare("UPDATE trip_plans SET title=?,destination_ids=?,days=?,budget=?,travel_month=?,pace=?,start_date=?,origin=?,transport=?,interests_json=?,itinerary_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(plan.title, JSON.stringify(plan.destinationIds), plan.days, plan.budget, plan.travelMonth, plan.pace, plan.dateIsApproximate ? null : plan.startDate, plan.origin, plan.transport, JSON.stringify(plan.interests), JSON.stringify(itinerary), row.id, request.user.id);
    writeAudit(request.user, "updated_trip_plan", "trip_plan", row.id); response.json({ data: hydrate(owned(request)) });
  }));
  app.post("/api/trip-plans/:id/share", requireAuth, handle((request, response) => {
    const plan = hydrate(owned(request));
    if (request.body?.confirmPublic !== true) throw fail("Confirm that anyone with the link may read this itinerary and its notes.");
    if (!plan.itinerary.length) throw fail("Build an itinerary before sharing it.");
    const token = randomBytes(32).toString("base64url");
    // Publish an explicit snapshot. Exclude origin, user information, budget and private account data.
    const snapshot = { title: plan.title, days: plan.days, startDate: plan.startDate, dateIsApproximate: plan.dateIsApproximate, destinationNames: plan.destinationNames, pace: plan.pace, transport: plan.transport, itinerary: plan.itinerary, warnings: plan.warnings };
    db.prepare("INSERT INTO trip_shares (token_hash,trip_id,snapshot_json) VALUES (?,?,?) ON CONFLICT(trip_id) DO UPDATE SET token_hash=excluded.token_hash,snapshot_json=excluded.snapshot_json,created_at=CURRENT_TIMESTAMP").run(digest(token), plan.id, JSON.stringify(snapshot));
    writeAudit(request.user, "shared_trip_plan", "trip_plan", plan.id); response.status(201).json({ data: { path: `/planner.html?share=${token}` } });
  }));
  app.delete("/api/trip-plans/:id/share", requireAuth, handle((request, response) => { const row = owned(request); db.prepare("DELETE FROM trip_shares WHERE trip_id = ?").run(row.id); writeAudit(request.user, "unshared_trip_plan", "trip_plan", row.id); response.status(204).end(); }));
  app.get("/api/shared-trips/:token", handle((request, response) => {
    response.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
    const row = /^[A-Za-z0-9_-]{43}$/.test(request.params.token) ? db.prepare("SELECT snapshot_json FROM trip_shares WHERE token_hash = ?").get(digest(request.params.token)) : null;
    if (!row) return response.status(404).json({ error: "This shared trip is unavailable or its link has been revoked." });
    response.json({ data: parse(row.snapshot_json, {}) });
  }));
  app.delete("/api/trip-plans/:id", requireAuth, handle((request, response) => { const row = owned(request); db.prepare("DELETE FROM trip_plans WHERE id=? AND user_id=?").run(row.id, request.user.id); writeAudit(request.user, "deleted_trip_plan", "trip_plan", row.id); response.status(204).end(); }));
}
