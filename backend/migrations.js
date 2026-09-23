export function migrateTrustSchema(db) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const columns = new Set(db.prepare("PRAGMA table_info(destination_reviews)").all().map(column => column.name));
    if (!columns.has("status")) db.exec("ALTER TABLE destination_reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))");
    if (!columns.has("revision")) db.exec("ALTER TABLE destination_reviews ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
    if (!columns.has("moderation_note")) db.exec("ALTER TABLE destination_reviews ADD COLUMN moderation_note TEXT NOT NULL DEFAULT ''");
    if (!columns.has("moderated_at")) db.exec("ALTER TABLE destination_reviews ADD COLUMN moderated_at TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_reviews_status_destination ON destination_reviews(status, destination_id)");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
