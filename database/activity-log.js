const pool = require("./pool");

// Serializes metadata safely for storage in the activity log table.
function serializeMetadata(metadata) {
  if (metadata === undefined) {
    return null;
  }

  try {
    return JSON.stringify(metadata);
  } catch (error) {
    return JSON.stringify({ serialization_error: "Unable to serialize activity metadata." });
  }
}

// Persists a single activity-log entry using either a transaction connection or the shared pool.
async function logActivity(entry, connection = pool) {
  const actorId = Number(entry?.actorId) || null;
  const username = String(entry?.username || "").trim() || null;
  const role = String(entry?.role || "").trim().toLowerCase() || null;
  const action = String(entry?.action || "").trim().toLowerCase();
  const entityType = String(entry?.entityType || "").trim().toLowerCase() || null;
  const rawEntityId = entry?.entityId;
  const entityId = rawEntityId === undefined || rawEntityId === null || rawEntityId === ""
    ? null
    : String(rawEntityId);
  const description = String(entry?.description || "").trim();
  const metadata = serializeMetadata(entry?.metadata);

  if (!action || !description) {
    return;
  }

  await connection.query(
    `INSERT INTO activity_logs (
      user_id,
      username_snapshot,
      role_snapshot,
      action,
      entity_type,
      entity_id,
      description,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [actorId, username, role, action, entityType, entityId, description, metadata]
  );
}

module.exports = {
  logActivity
};
