import express from "express";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const backendDir = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(backendDir);
const frontendDir = join(projectDir, "frontend");
const defaultDbPath = join(backendDir, "data", "explore-india.db");
const dbPath = process.env.EXPLORE_INDIA_DB || defaultDbPath;
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec(readFileSync(join(backendDir, "schema.sql"), "utf8"));

const destinations = JSON.parse(readFileSync(join(backendDir, "data", "destinations.json"), "utf8"));
const upsertDestination = db.prepare(`INSERT INTO destinations
  (slug, name, region, summary, image_path, image_alt, featured)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(slug) DO UPDATE SET name = excluded.name, region = excluded.region,
  summary = excluded.summary, image_path = excluded.image_path,
  image_alt = excluded.image_alt, featured = excluded.featured,
  updated_at = CURRENT_TIMESTAMP`);
db.exec("BEGIN");
try {
  for (const item of destinations) upsertDestination.run(item.slug, item.name, item.region, item.summary, item.imagePath, item.imageAlt, Number(item.featured));
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
db.exec("PRAGMA optimize");

const demoAdminEmail = "admin@exploreindia.local";
const demoAdminPassword = process.env.ADMIN_PASSWORD || "ExploreIndia@2026";
const passwordHash = password => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};
const passwordMatches = (password, stored) => {
  const [salt, hash] = stored.split(":");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
};
const hashToken = token => createHash("sha256").update(token).digest("hex");
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role });
if (!db.prepare("SELECT 1 FROM users WHERE email = ?").get(demoAdminEmail)) {
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')").run("Explore India Admin", demoAdminEmail, passwordHash(demoAdminPassword));
}

export const app = express();
app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" });
  next();
});
app.use(express.json({ limit: "32kb" }));

const parseCookies = request => Object.fromEntries((request.headers.cookie || "").split(";").map(value => value.trim().split("=")).filter(([key]) => key).map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]));
app.use((request, _response, next) => {
  const token = parseCookies(request).explore_india_session;
  if (token) request.user = db.prepare(`SELECT users.id, users.name, users.email, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP`).get(hashToken(token));
  next();
});
const requireAuth = (request, response, next) => request.user ? next() : response.status(401).json({ error: "Sign in is required." });
const requireAdmin = (request, response, next) => request.user?.role === "admin" ? next() : response.status(request.user ? 403 : 401).json({ error: "Administrator access is required." });
const writeAudit = (actor, action, targetType, targetId) => db.prepare("INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)").run(actor?.id || null, action, targetType, String(targetId));
const createSession = (user, response) => {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+7 days'))").run(user.id, hashToken(token));
  response.cookie("explore_india_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
};

app.get("/api/health", (_request, response) => response.json({ status: "ok", service: "Explore India API" }));

app.get("/api/auth/me", (request, response) => response.json({ data: request.user ? publicUser(request.user) : null }));
app.patch("/api/auth/me", requireAuth, (request, response) => {
  const name = String(request.body?.name || "").trim();
  if (name.length < 2 || name.length > 80) return response.status(422).json({ error: "Your name must contain 2–80 characters." });
  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, request.user.id);
  const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(request.user.id);
  writeAudit(user, "updated_profile", "user", user.id); response.json({ data: publicUser(user) });
});
app.get("/api/profile", requireAuth, (request, response) => {
  const saved = db.prepare("SELECT COUNT(*) AS count FROM favourites WHERE user_id = ?").get(request.user.id).count;
  const trips = db.prepare("SELECT COUNT(*) AS count FROM trip_plans WHERE user_id = ?").get(request.user.id).count;
  const user = db.prepare("SELECT id, name, email, role, created_at AS createdAt FROM users WHERE id = ?").get(request.user.id);
  response.json({ data: { user: publicUser(user), createdAt: user.createdAt, saved, trips } });
});
app.post("/api/auth/register", (request, response) => {
  const name = String(request.body?.name || "").trim(), email = String(request.body?.email || "").trim().toLowerCase(), password = String(request.body?.password || "");
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 128) return response.status(422).json({ error: "Enter a name, valid email and password of at least 10 characters." });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return response.status(409).json({ error: "An account with this email already exists." });
  const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(name, email, passwordHash(password));
  const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(result.lastInsertRowid);
  createSession(user, response); writeAudit(user, "registered", "user", user.id); response.status(201).json({ data: publicUser(user) });
});
app.post("/api/auth/login", (request, response) => {
  const email = String(request.body?.email || "").trim().toLowerCase(), password = String(request.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !passwordMatches(password, user.password_hash)) return response.status(401).json({ error: "Email or password is incorrect." });
  createSession(user, response); writeAudit(user, "signed_in", "user", user.id); response.json({ data: publicUser(user) });
});
app.post("/api/auth/logout", requireAuth, (request, response) => { const token = parseCookies(request).explore_india_session; if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token)); response.clearCookie("explore_india_session", { path: "/" }); response.status(204).end(); });

app.get("/api/destinations", (request, response) => {
  const query = String(request.query.q || "").trim().slice(0, 100);
  const region = String(request.query.region || "all").toLowerCase();
  const allowedRegions = new Set(["all", "north", "south", "east", "west", "central", "northeast"]);
  if (!allowedRegions.has(region)) return response.status(400).json({ error: "Invalid region." });
  const conditions = ["published = 1"], values = [];
  if (query) { conditions.push("(name LIKE ? OR summary LIKE ?)"); values.push(`%${query}%`, `%${query}%`); }
  if (region !== "all") { conditions.push("region = ?"); values.push(region); }
  const rows = db.prepare(`SELECT id, slug, name, region, summary, image_path AS imagePath,
    image_alt AS imageAlt, featured FROM destinations WHERE ${conditions.join(" AND ")}
    ORDER BY featured DESC, name ASC`).all(...values);
  response.json({ data: rows.map(row => ({ ...row, featured: Boolean(row.featured) })), count: rows.length });
});

app.get("/api/destinations/:slug", (request, response) => {
  const row = db.prepare(`SELECT id, slug, name, region, summary, image_path AS imagePath,
    image_alt AS imageAlt, featured FROM destinations WHERE slug = ? AND published = 1`).get(request.params.slug);
  if (!row) return response.status(404).json({ error: "Destination not found." });
  response.json({ data: { ...row, featured: Boolean(row.featured) } });
});

app.get("/api/destinations/:slug/reviews", (request, response) => {
  const destination = db.prepare("SELECT id FROM destinations WHERE slug = ? AND published = 1").get(request.params.slug);
  if (!destination) return response.status(404).json({ error: "Destination not found." });
  const reviews = db.prepare(`SELECT destination_reviews.id, destination_reviews.rating, destination_reviews.comment,
    destination_reviews.created_at AS createdAt, destination_reviews.updated_at AS updatedAt, users.name AS author
    FROM destination_reviews JOIN users ON users.id = destination_reviews.user_id
    WHERE destination_reviews.destination_id = ? ORDER BY destination_reviews.updated_at DESC LIMIT 30`).all(destination.id);
  const summary = db.prepare("SELECT COUNT(*) AS count, ROUND(AVG(rating), 1) AS averageRating FROM destination_reviews WHERE destination_id = ?").get(destination.id);
  response.json({ data: reviews, summary: { count: summary.count, averageRating: summary.averageRating } });
});
app.post("/api/destinations/:slug/reviews", requireAuth, (request, response) => {
  const destination = db.prepare("SELECT id FROM destinations WHERE slug = ? AND published = 1").get(request.params.slug);
  if (!destination) return response.status(404).json({ error: "Destination not found." });
  const rating = Number(request.body?.rating), comment = String(request.body?.comment || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 20 || comment.length > 600) return response.status(422).json({ error: "Choose a 1–5 rating and write 20–600 characters." });
  const result = db.prepare(`INSERT INTO destination_reviews (user_id, destination_id, rating, comment)
    VALUES (?, ?, ?, ?) ON CONFLICT(user_id, destination_id) DO UPDATE SET rating = excluded.rating,
    comment = excluded.comment, updated_at = CURRENT_TIMESTAMP`).run(request.user.id, destination.id, rating, comment);
  writeAudit(request.user, "reviewed_destination", "destination", destination.id);
  response.status(result.changes ? 201 : 200).json({ data: { destinationId: destination.id, rating, comment }, message: "Your review has been saved." });
});

app.get("/api/favourites", requireAuth, (request, response) => {
  const rows = db.prepare(`SELECT destinations.id, destinations.slug, destinations.name, destinations.region,
    destinations.summary, destinations.image_path AS imagePath, destinations.image_alt AS imageAlt,
    favourites.created_at AS createdAt FROM favourites JOIN destinations ON destinations.id = favourites.destination_id
    WHERE favourites.user_id = ? AND destinations.published = 1 ORDER BY favourites.created_at DESC`).all(request.user.id);
  response.json({ data: rows, count: rows.length });
});
app.post("/api/favourites/:destinationId", requireAuth, (request, response) => {
  const destinationId = Number(request.params.destinationId);
  if (!Number.isSafeInteger(destinationId) || destinationId < 1) return response.status(422).json({ error: "Invalid destination." });
  const destination = db.prepare("SELECT id FROM destinations WHERE id = ? AND published = 1").get(destinationId);
  if (!destination) return response.status(404).json({ error: "Destination not found." });
  const result = db.prepare("INSERT OR IGNORE INTO favourites (user_id, destination_id) VALUES (?, ?)").run(request.user.id, destinationId);
  if (result.changes) writeAudit(request.user, "favourited", "destination", destinationId);
  response.status(result.changes ? 201 : 200).json({ data: { destinationId, favourited: true } });
});
app.delete("/api/favourites/:destinationId", requireAuth, (request, response) => {
  const destinationId = Number(request.params.destinationId);
  if (!Number.isSafeInteger(destinationId) || destinationId < 1) return response.status(422).json({ error: "Invalid destination." });
  const result = db.prepare("DELETE FROM favourites WHERE user_id = ? AND destination_id = ?").run(request.user.id, destinationId);
  if (result.changes) writeAudit(request.user, "unfavourited", "destination", destinationId);
  response.status(204).end();
});

const tripPlanRow = row => ({ ...row, destinationIds: JSON.parse(row.destinationIds) });
app.get("/api/trip-plans", requireAuth, (request, response) => {
  const rows = db.prepare(`SELECT id, title, destination_ids AS destinationIds, days, budget,
    travel_month AS travelMonth, pace, created_at AS createdAt FROM trip_plans WHERE user_id = ? ORDER BY created_at DESC`).all(request.user.id);
  response.json({ data: rows.map(tripPlanRow) });
});
app.post("/api/trip-plans", requireAuth, (request, response) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const title = String(body.title || "").trim(), days = Number(body.days), budget = Number(body.budget);
  const travelMonth = String(body.travelMonth || "").trim(), pace = String(body.pace || "");
  const destinationIds = [...new Set(Array.isArray(body.destinationIds) ? body.destinationIds.map(Number) : [])];
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(travelMonth)) return response.status(422).json({ error: "Choose a travel month and year, for example December 2026." });
  if (title.length < 3 || title.length > 80 || !Number.isInteger(days) || days < 2 || days > 30 || !Number.isInteger(budget) || budget < 10000 || budget > 500000 || !new Set(["slow", "balanced", "active"]).has(pace) || destinationIds.length < 1 || destinationIds.length > 6 || destinationIds.some(id => !Number.isSafeInteger(id) || id < 1)) return response.status(422).json({ error: "Choose 1–6 destinations and enter valid trip details." });
  const placeholders = destinationIds.map(() => "?").join(",");
  const available = db.prepare(`SELECT id FROM destinations WHERE published = 1 AND id IN (${placeholders})`).all(...destinationIds);
  if (available.length !== destinationIds.length) return response.status(422).json({ error: "One or more selected destinations are unavailable." });
  const result = db.prepare("INSERT INTO trip_plans (user_id, title, destination_ids, days, budget, travel_month, pace) VALUES (?, ?, ?, ?, ?, ?, ?)").run(request.user.id, title, JSON.stringify(destinationIds), days, budget, travelMonth, pace);
  const row = db.prepare("SELECT id, title, destination_ids AS destinationIds, days, budget, travel_month AS travelMonth, pace, created_at AS createdAt FROM trip_plans WHERE id = ?").get(result.lastInsertRowid);
  writeAudit(request.user, "created_trip_plan", "trip_plan", result.lastInsertRowid); response.status(201).json({ data: tripPlanRow(row) });
});
app.get("/api/trip-plans/:id/itinerary", requireAuth, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return response.status(422).json({ error: "Invalid trip plan." });
  const plan = db.prepare("SELECT id, title, destination_ids AS destinationIds, days, budget, travel_month AS travelMonth, pace FROM trip_plans WHERE id = ? AND user_id = ?").get(id, request.user.id);
  if (!plan) return response.status(404).json({ error: "Trip plan not found." });
  const destinationIds = JSON.parse(plan.destinationIds), placeholders = destinationIds.map(() => "?").join(",");
  const destinationsById = new Map(db.prepare(`SELECT id, name, region, summary FROM destinations WHERE id IN (${placeholders})`).all(...destinationIds).map(place => [place.id, place]));
  const places = destinationIds.map(destinationId => destinationsById.get(destinationId)).filter(Boolean);
  const paceNotes = { slow: "Leave room for unhurried neighbourhood walks and long meals.", balanced: "Pair a highlight with time to wander at your own pace.", active: "Start early and fit in an extra local experience." };
  const itinerary = Array.from({ length: plan.days }, (_, index) => {
    const place = places[index % places.length], visitNumber = Math.floor(index / places.length) + 1;
    const focus = visitNumber === 1 ? `Arrive and get a first feel for ${place.name}.` : `Discover another side of ${place.name}.`;
    return { day: index + 1, destination: place.name, region: place.region, title: `Day ${index + 1} · ${place.name}`, focus, morning: `Begin with a signature local sight or cultural stop.`, afternoon: `Explore at a comfortable pace: ${place.summary}`, evening: paceNotes[plan.pace] };
  });
  response.json({ data: { id: plan.id, title: plan.title, days: plan.days, travelMonth: plan.travelMonth, pace: plan.pace, itinerary } });
});
app.delete("/api/trip-plans/:id", requireAuth, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return response.status(422).json({ error: "Invalid trip plan." });
  const result = db.prepare("DELETE FROM trip_plans WHERE id = ? AND user_id = ?").run(id, request.user.id);
  if (!result.changes) return response.status(404).json({ error: "Trip plan not found." });
  writeAudit(request.user, "deleted_trip_plan", "trip_plan", id); response.status(204).end();
});

app.post("/api/enquiries", (request, response) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const name = String(body.name || "").trim(), email = String(body.email || "").trim().toLowerCase();
  const subject = String(body.subject || "").trim(), message = String(body.message || "").trim();
  const errors = {};
  if (name.length < 2 || name.length > 80) errors.name = "Name must contain 2–80 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) errors.email = "Enter a valid email address.";
  if (subject.length < 3 || subject.length > 80) errors.subject = "Select a valid subject.";
  if (message.length < 10 || message.length > 2000) errors.message = "Message must contain 10–2000 characters.";
  if (Object.keys(errors).length) return response.status(422).json({ error: "Please correct the highlighted information.", fields: errors });
  const result = db.prepare("INSERT INTO enquiries (name, email, subject, message) VALUES (?, ?, ?, ?)").run(name, email, subject, message);
  response.status(201).json({ data: { id: Number(result.lastInsertRowid), status: "new" }, message: "Your enquiry has been received." });
});

app.get("/api/admin/summary", requireAdmin, (request, response) => {
  const destinations = db.prepare("SELECT COUNT(*) AS count FROM destinations").get().count;
  const enquiries = db.prepare("SELECT COUNT(*) AS count FROM enquiries WHERE status = 'new'").get().count;
  const users = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  response.json({ data: { destinations, newEnquiries: enquiries, users } });
});
app.get("/api/admin/enquiries", requireAdmin, (_request, response) => {
  response.json({ data: db.prepare("SELECT id, name, email, subject, message, status, created_at AS createdAt FROM enquiries ORDER BY created_at DESC LIMIT 100").all() });
});
app.patch("/api/admin/enquiries/:id", requireAdmin, (request, response) => {
  const status = String(request.body?.status || "");
  if (!new Set(["new", "read", "resolved"]).has(status)) return response.status(422).json({ error: "Invalid enquiry status." });
  const result = db.prepare("UPDATE enquiries SET status = ? WHERE id = ?").run(status, request.params.id);
  if (!result.changes) return response.status(404).json({ error: "Enquiry not found." });
  writeAudit(request.user, "updated_status", "enquiry", request.params.id); response.json({ data: { id: Number(request.params.id), status } });
});
app.get("/api/admin/destinations", requireAdmin, (_request, response) => response.json({ data: db.prepare("SELECT id, slug, name, region, published, featured FROM destinations ORDER BY name").all() }));
app.patch("/api/admin/destinations/:id", requireAdmin, (request, response) => {
  const published = request.body?.published;
  if (typeof published !== "boolean") return response.status(422).json({ error: "Published must be true or false." });
  const result = db.prepare("UPDATE destinations SET published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(published), request.params.id);
  if (!result.changes) return response.status(404).json({ error: "Destination not found." });
  writeAudit(request.user, published ? "published" : "unpublished", "destination", request.params.id); response.json({ data: { id: Number(request.params.id), published } });
});

app.use(express.static(frontendDir, { extensions: ["html"] }));
app.use("/api", (_request, response) => response.status(404).json({ error: "API route not found." }));
app.use((error, _request, response, _next) => { console.error(error); response.status(500).json({ error: "An unexpected server error occurred." }); });

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const port = Number(process.env.PORT || 4173);
  app.listen(port, () => console.log(`Explore India is running at http://127.0.0.1:${port}`));
}
