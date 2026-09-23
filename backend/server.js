import express from "express";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { parseCookies, protectWrites, rateLimit } from "./security.js";
import { migrateTrustSchema } from "./migrations.js";
import { notificationConfiguration, notifyEnquiry } from "./notifications.js";
import { registerTrips } from "./trips.js";

const backendDir = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(backendDir);
const frontendDir = join(projectDir, "frontend");
const defaultDbPath = join(backendDir, "data", "explore-india.db");
const dbPath = process.env.EXPLORE_INDIA_DB || defaultDbPath;
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath, { timeout: 5000 });
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec(readFileSync(join(backendDir, "schema.sql"), "utf8"));
migrateTrustSchema(db);

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

const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || "");
if ((adminEmail || adminPassword || process.env.NODE_ENV === "production") && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminEmail.length > 160 || adminPassword.length < 10 || adminPassword.length > 128)) {
  throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 10 characters before starting in production.");
}
const derivePassword = promisify(scrypt);
const passwordHash = password => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};
const passwordMatches = (password, stored) => {
  const [salt, hash] = String(stored).split(":");
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const derived = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
};
const hashToken = token => createHash("sha256").update(token).digest("hex");
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role });
if (adminEmail && adminPassword) {
  db.exec("BEGIN IMMEDIATE");
  try {
    // The privately configured owner is the only administrator. Keep old accounts and their data.
    db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'admin' AND email != ?)").run(adminEmail);
    db.prepare("UPDATE users SET role = 'traveller' WHERE role = 'admin' AND email != ?").run(adminEmail);
    const owner = db.prepare("SELECT * FROM users WHERE email = ?").get(adminEmail);
    if (!owner) db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')").run("Explore India Administrator", adminEmail, passwordHash(adminPassword));
    else if (owner.role !== "admin" || !passwordMatches(adminPassword, owner.password_hash)) {
      db.prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?").run(passwordHash(adminPassword), owner.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(owner.id);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
const dummyHash = passwordHash(randomBytes(32).toString("hex"));
db.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();

export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1" || process.env.RENDER === "true") app.set("trust proxy", 1);
app.use((_request, response, next) => {
  response.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" });
  response.set("Content-Security-Policy", "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self'; connect-src 'self' https://api.open-meteo.com https://overpass-api.de; frame-src https://www.openstreetmap.org; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === "production") response.set("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.use("/api", (_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
app.use("/api", protectWrites);
app.use(express.json({ limit: "128kb" }));
app.use("/api/auth", rateLimit({ limit: 120, windowMs: 15 * 60 * 1000 }));
const authAttempts = rateLimit({ limit: 30, windowMs: 15 * 60 * 1000 });
const accountAttempts = rateLimit({ limit: 10, windowMs: 15 * 60 * 1000, key: request => String(request.body?.email || "").trim().toLowerCase() });
const enquiryAttempts = rateLimit({ limit: 5, windowMs: 15 * 60 * 1000 });
const reviewAttempts = rateLimit({ limit: 15, windowMs: 15 * 60 * 1000, key: request => request.user?.id || request.ip });
app.use((request, _response, next) => {
  const token = parseCookies(request).explore_india_session;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) request.user = db.prepare(`SELECT users.id, users.name, users.email, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP`).get(hashToken(token));
  next();
});
const requireAuth = (request, response, next) => request.user ? next() : response.status(401).json({ error: "Sign in is required." });
const requireAdmin = (request, response, next) => request.user?.role === "admin" && request.user.email === adminEmail ? next() : response.status(request.user ? 403 : 401).json({ error: "Administrator access is required." });
const writeAudit = (actor, action, targetType, targetId) => db.prepare("INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)").run(actor?.id || null, action, targetType, String(targetId));
const createSession = (user, response) => {
  const token = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM sessions WHERE user_id = ? ORDER BY id DESC LIMIT 4)").run(user.id, user.id);
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
app.post("/api/auth/register", authAttempts, async (request, response) => {
  const name = String(request.body?.name || "").trim(), email = String(request.body?.email || "").trim().toLowerCase(), password = String(request.body?.password || "");
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160 || password.length < 10 || password.length > 128) return response.status(422).json({ error: "Enter a name, valid email and password of 10–128 characters." });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return response.status(409).json({ error: "An account with this email already exists." });
  const salt = randomBytes(16).toString("hex"), derived = await derivePassword(password, salt, 64);
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return response.status(409).json({ error: "An account with this email already exists." });
  const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(name, email, `${salt}:${derived.toString("hex")}`);
  const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(result.lastInsertRowid);
  createSession(user, response); writeAudit(user, "registered", "user", user.id); response.status(201).json({ data: publicUser(user) });
});
app.post("/api/auth/login", authAttempts, accountAttempts, async (request, response) => {
  const email = String(request.body?.email || "").trim().toLowerCase(), password = String(request.body?.password || "");
  if (email.length > 160 || password.length > 128 || password.length < 1) return response.status(401).json({ error: "Email or password is incorrect." });
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  const [salt, expected] = (user?.password_hash || dummyHash).split(":");
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expected)) return response.status(401).json({ error: "Email or password is incorrect." });
  const derived = await derivePassword(password, salt, 64);
  if (!user || !timingSafeEqual(Buffer.from(expected, "hex"), derived)) return response.status(401).json({ error: "Email or password is incorrect." });
  const previousToken = parseCookies(request).explore_india_session;
  if (previousToken) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(previousToken));
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
    WHERE destination_reviews.destination_id = ? AND destination_reviews.status = 'approved' ORDER BY destination_reviews.updated_at DESC LIMIT 30`).all(destination.id);
  const summary = db.prepare("SELECT COUNT(*) AS count, ROUND(AVG(rating), 1) AS averageRating FROM destination_reviews WHERE destination_id = ? AND status = 'approved'").get(destination.id);
  const ownReview = request.user ? db.prepare("SELECT id, rating, comment, status, moderation_note AS moderationNote FROM destination_reviews WHERE destination_id = ? AND user_id = ?").get(destination.id, request.user.id) : null;
  response.json({ data: reviews, ownReview: ownReview || null, summary: { count: summary.count, averageRating: summary.averageRating } });
});
app.post("/api/destinations/:slug/reviews", requireAuth, reviewAttempts, (request, response) => {
  const destination = db.prepare("SELECT id FROM destinations WHERE slug = ? AND published = 1").get(request.params.slug);
  if (!destination) return response.status(404).json({ error: "Destination not found." });
  const rating = Number(request.body?.rating), comment = String(request.body?.comment || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 20 || comment.length > 600) return response.status(422).json({ error: "Choose a 1–5 rating and write 20–600 characters." });
  const result = db.prepare(`INSERT INTO destination_reviews (user_id, destination_id, rating, comment)
    VALUES (?, ?, ?, ?) ON CONFLICT(user_id, destination_id) DO UPDATE SET rating = excluded.rating,
    comment = excluded.comment, status = 'pending', moderation_note = '', moderated_at = NULL,
    revision = destination_reviews.revision + 1, updated_at = CURRENT_TIMESTAMP`).run(request.user.id, destination.id, rating, comment);
  writeAudit(request.user, "reviewed_destination", "destination", destination.id);
  response.status(result.changes ? 201 : 200).json({ data: { destinationId: destination.id, rating, comment, status: "pending" }, message: "Your review is saved and awaiting moderation. It will appear publicly after approval." });
});
app.post("/api/reviews/:id/reports", requireAuth, reviewAttempts, (request, response) => {
  const id = Number(request.params.id), reason = String(request.body?.reason || ""), detail = String(request.body?.detail || "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !["spam", "offensive", "misleading", "privacy", "other"].includes(reason) || detail.length > 500) return response.status(422).json({ error: "Choose a report reason and keep additional details under 500 characters." });
  if (!db.prepare("SELECT id FROM destination_reviews WHERE id = ? AND status = 'approved'").get(id)) return response.status(404).json({ error: "Review not found." });
  const result = db.prepare("INSERT OR IGNORE INTO review_reports (review_id, reporter_id, reason, detail) VALUES (?, ?, ?, ?)").run(id, request.user.id, reason, detail);
  if (result.changes) writeAudit(request.user, "reported_review", "review", id);
  response.status(result.changes ? 201 : 200).json({ message: "Your report has been received for moderation." });
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

registerTrips({ app, db, requireAuth, writeAudit });

app.post("/api/enquiries", enquiryAttempts, async (request, response) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const name = String(body.name || "").trim(), email = String(body.email || "").trim().toLowerCase();
  const subject = String(body.subject || "").trim(), message = String(body.message || "").trim();
  const errors = {};
  if (name.length < 2 || name.length > 80) errors.name = "Name must contain 2–80 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) errors.email = "Enter a valid email address.";
  if (subject.length < 3 || subject.length > 80) errors.subject = "Select a valid subject.";
  if (message.length < 10 || message.length > 2000) errors.message = "Message must contain 10–2000 characters.";
  if (Object.keys(errors).length) return response.status(422).json({ error: "Please correct the highlighted information.", fields: errors });
  const key = request.get("Idempotency-Key");
  if (key && !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) return response.status(422).json({ error: "Invalid submission reference." });
  const bodyHash = hashToken(JSON.stringify({ name, email, subject, message }));
  const previous = key && db.prepare("SELECT * FROM enquiry_submissions WHERE submission_key = ?").get(key);
  if (previous) {
    if (previous.body_hash !== bodyHash) return response.status(409).json({ error: "This submission reference was already used. Please start a new enquiry." });
    return response.json({ data: { id: previous.enquiry_id, status: "new" }, message: "Your enquiry was already received. No duplicate was created." });
  }
  db.exec("BEGIN IMMEDIATE");
  let id;
  try {
    id = Number(db.prepare("INSERT INTO enquiries (name, email, subject, message) VALUES (?, ?, ?, ?)").run(name, email, subject, message).lastInsertRowid);
    if (key) db.prepare("INSERT INTO enquiry_submissions (submission_key, body_hash, enquiry_id) VALUES (?, ?, ?)").run(key, bodyHash, id);
    db.prepare("INSERT INTO enquiry_notifications (enquiry_id, status) VALUES (?, ?)").run(id, notificationConfiguration().enabled ? "pending" : "disabled");
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  const notification = await notifyEnquiry({ id, name, email, subject, message });
  db.prepare("UPDATE enquiry_notifications SET status = ?, provider_id = ?, error = ?, attempts = attempts + ?, updated_at = CURRENT_TIMESTAMP WHERE enquiry_id = ?").run(notification.status, notification.providerId || null, notification.error || null, Number(notification.status !== "disabled"), id);
  response.status(201).json({ data: { id, status: "new", notificationStatus: notification.status }, message: "Your enquiry has been saved for the team. Keep this reference for any follow-up." });
});

app.get("/api/admin/summary", requireAdmin, (request, response) => {
  const destinations = db.prepare("SELECT COUNT(*) AS count FROM destinations").get().count;
  const enquiries = db.prepare("SELECT COUNT(*) AS count FROM enquiries WHERE status = 'new'").get().count;
  const users = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  const pendingReviews = db.prepare("SELECT COUNT(*) AS count FROM destination_reviews WHERE status = 'pending'").get().count;
  const openReports = db.prepare("SELECT COUNT(*) AS count FROM review_reports WHERE status = 'open'").get().count;
  response.json({ data: { destinations, newEnquiries: enquiries, users, pendingReviews, openReports,
    notifications: notificationConfiguration(),
    storage: { type: dbPath === ":memory:" ? "memory" : "sqlite-file", persistenceConfigured: process.env.PERSISTENT_STORAGE_CONFIRMED === "true" }
  } });
});
app.get("/api/admin/enquiries", requireAdmin, (_request, response) => {
  response.json({ data: db.prepare(`SELECT enquiries.id, name, email, subject, message, enquiries.status, created_at AS createdAt,
    COALESCE(enquiry_notifications.status, 'disabled') AS notificationStatus, enquiry_notifications.error AS notificationError
    FROM enquiries LEFT JOIN enquiry_notifications ON enquiry_notifications.enquiry_id = enquiries.id
    ORDER BY created_at DESC LIMIT 100`).all() });
});
app.post("/api/admin/enquiries/:id/notify", requireAdmin, async (request, response) => {
  const id = Number(request.params.id), enquiry = Number.isSafeInteger(id) && db.prepare("SELECT * FROM enquiries WHERE id = ?").get(id);
  if (!enquiry) return response.status(404).json({ error: "Enquiry not found." });
  if (!notificationConfiguration().enabled) return response.status(409).json({ error: "Configure the enquiry email provider before sending notifications." });
  db.prepare("INSERT OR IGNORE INTO enquiry_notifications (enquiry_id) VALUES (?)").run(id);
  const claim = db.prepare("UPDATE enquiry_notifications SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE enquiry_id = ? AND (status IN ('failed', 'disabled') OR (status = 'pending' AND updated_at < datetime('now', '-5 minutes')))").run(id);
  if (!claim.changes) return response.status(409).json({ error: "This notification is already accepted or being processed." });
  const result = await notifyEnquiry(enquiry);
  db.prepare("UPDATE enquiry_notifications SET status = ?, provider_id = ?, error = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE enquiry_id = ?").run(result.status, result.providerId || null, result.error || null, id);
  writeAudit(request.user, "retried_enquiry_notification", "enquiry", id);
  response.json({ data: { status: result.status }, message: result.status === "accepted" ? "The provider accepted the notification. Delivery is not yet confirmed." : result.error });
});
app.patch("/api/admin/enquiries/:id", requireAdmin, (request, response) => {
  const status = String(request.body?.status || "");
  if (!new Set(["new", "read", "resolved"]).has(status)) return response.status(422).json({ error: "Invalid enquiry status." });
  const result = db.prepare("UPDATE enquiries SET status = ? WHERE id = ?").run(status, request.params.id);
  if (!result.changes) return response.status(404).json({ error: "Enquiry not found." });
  writeAudit(request.user, "updated_status", "enquiry", request.params.id); response.json({ data: { id: Number(request.params.id), status } });
});
app.get("/api/admin/reviews", requireAdmin, (request, response) => {
  const status = String(request.query.status || "pending");
  if (!["pending", "approved", "rejected", "all"].includes(status)) return response.status(422).json({ error: "Invalid moderation filter." });
  const values = status === "all" ? [] : [status];
  const data = db.prepare(`SELECT r.id, r.rating, r.comment, r.status, r.revision, r.moderation_note AS moderationNote,
    r.created_at AS createdAt, r.updated_at AS updatedAt, u.name AS author, d.name AS destination
    FROM destination_reviews r JOIN users u ON u.id = r.user_id JOIN destinations d ON d.id = r.destination_id
    ${status === "all" ? "" : "WHERE r.status = ?"} ORDER BY r.updated_at DESC LIMIT 100`).all(...values);
  response.json({ data });
});
app.patch("/api/admin/reviews/:id", requireAdmin, (request, response) => {
  const id = Number(request.params.id), revision = Number(request.body?.revision), status = String(request.body?.status || ""), note = String(request.body?.note || "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(revision) || !["approved", "rejected", "pending"].includes(status) || note.length > 300) return response.status(422).json({ error: "Choose a valid moderation decision and keep the note under 300 characters." });
  const result = db.prepare("UPDATE destination_reviews SET status = ?, moderation_note = ?, moderated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?").run(status, note, id, revision);
  if (!result.changes) return response.status(409).json({ error: "This review changed or no longer exists. Reload it before moderating." });
  writeAudit(request.user, `review_${status}`, "review", id);
  response.json({ data: { id, status } });
});
app.get("/api/admin/reports", requireAdmin, (_request, response) => {
  response.json({ data: db.prepare(`SELECT p.id, p.review_id AS reviewId, p.reason, p.detail, p.status, p.created_at AS createdAt,
    r.comment, r.status AS reviewStatus, r.revision, d.name AS destination
    FROM review_reports p JOIN destination_reviews r ON r.id = p.review_id
    JOIN destinations d ON d.id = r.destination_id WHERE p.status = 'open' ORDER BY p.created_at LIMIT 100`).all() });
});
app.patch("/api/admin/reports/:id", requireAdmin, (request, response) => {
  const id = Number(request.params.id), status = String(request.body?.status || "");
  if (!Number.isSafeInteger(id) || id < 1 || !["resolved", "dismissed"].includes(status)) return response.status(422).json({ error: "Invalid report decision." });
  const result = db.prepare("UPDATE review_reports SET status = ? WHERE id = ?").run(status, id);
  if (!result.changes) return response.status(404).json({ error: "Report not found." });
  writeAudit(request.user, `report_${status}`, "review_report", id);
  response.json({ data: { id, status } });
});
app.get("/api/admin/destinations", requireAdmin, (_request, response) => response.json({ data: db.prepare("SELECT id, slug, name, region, published, featured FROM destinations ORDER BY name").all() }));
app.patch("/api/admin/destinations/:id", requireAdmin, (request, response) => {
  const published = request.body?.published;
  if (typeof published !== "boolean") return response.status(422).json({ error: "Published must be true or false." });
  const result = db.prepare("UPDATE destinations SET published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(published), request.params.id);
  if (!result.changes) return response.status(404).json({ error: "Destination not found." });
  writeAudit(request.user, published ? "published" : "unpublished", "destination", request.params.id); response.json({ data: { id: Number(request.params.id), published } });
});

app.use(express.static(frontendDir, { extensions: ["html"], dotfiles: "deny" }));
app.use("/api", (_request, response) => response.status(404).json({ error: "API route not found." }));
app.use((_request, response) => response.status(404).sendFile(join(frontendDir, "404.html")));
app.use((error, _request, response, _next) => {
  if (error.type === "entity.parse.failed") return response.status(400).json({ error: "The submitted data is not valid JSON." });
  if (error.type === "entity.too.large") return response.status(413).json({ error: "The submitted data is too large." });
  // Avoid logging request bodies, password values, SQL bindings or provider responses.
  console.error("Request failed", error.code || error.name || "UnknownError");
  response.status(500).json({ error: "An unexpected server error occurred. Please try again." });
});

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const port = Number(process.env.PORT || 4173);
  app.listen(port, () => console.log(`Explore India is running at http://127.0.0.1:${port}`));
}
