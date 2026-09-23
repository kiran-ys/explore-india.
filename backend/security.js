import { createHash } from "node:crypto";

// Bounded, single-process limits. A shared store is needed before multiple instances.
export function rateLimit({ limit, windowMs, key = request => request.ip, now = Date.now }) {
  const buckets = new Map();
  return (request, response, next) => {
    const time = now();
    const identity = createHash("sha256").update(String(key(request))).digest("hex");
    if (buckets.size >= 10000) {
      for (const [id, bucket] of buckets) if (bucket.until <= time) buckets.delete(id);
      if (buckets.size >= 10000 && !buckets.has(identity)) return response.status(429).set("Retry-After", String(Math.ceil(windowMs / 1000))).json({ error: "Too many requests. Please try again later." });
    }
    let bucket = buckets.get(identity);
    if (!bucket || bucket.until <= time) {
      bucket = { count: 0, until: time + windowMs };
      buckets.set(identity, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) return response.status(429).set("Retry-After", String(Math.ceil((bucket.until - time) / 1000))).json({ error: "Too many attempts. Please wait before trying again." });
    next();
  };
}

export function protectWrites(request, response, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  if (request.get("Sec-Fetch-Site") === "cross-site") return response.status(403).json({ error: "Please submit this request from the Explore India website." });
  const origin = request.get("Origin");
  if (origin) {
    try {
      const expected = new URL(process.env.APP_ORIGIN || `${request.protocol}://${request.get("host")}`).origin;
      if (new URL(origin).origin !== expected || origin === "null") throw new Error("Cross-origin write");
    } catch {
      return response.status(403).json({ error: "Please submit this request from the Explore India website." });
    }
  }
  if (request.headers["content-length"] && request.headers["content-length"] !== "0" && !request.is("application/json")) return response.status(415).json({ error: "Send JSON data for this request." });
  next();
}

export function parseCookies(request) {
  const cookies = {};
  for (const field of (request.headers.cookie || "").split(";")) {
    const index = field.indexOf("=");
    if (index < 0) continue;
    try { cookies[field.slice(0, index).trim()] = decodeURIComponent(field.slice(index + 1)); } catch { /* Malformed unrelated cookies must not break the request. */ }
  }
  return cookies;
}
