const pool = require("./pool");

// Ensures the archive column exists so archived items can be hidden from active flows.
async function ensureArchiveSchema() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'items'
       AND COLUMN_NAME = 'archived_at'`
  );

  if (Number(rows[0]?.count || 0) > 0) {
    return;
  }

  await pool.query(
    `ALTER TABLE items
     ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER category_id,
     ADD KEY idx_items_archived_at (archived_at)`
  );
}

// Adds note columns to existing adjustment-history tables when needed.
async function ensureAdjustmentNotesSchema() {
  const noteTargets = [
    { table: "cost_adjustments", column: "adjustment_note" },
    { table: "quantity_adjustments", column: "adjustment_note" },
    { table: "min_max_adjustments", column: "adjustment_note" },
    { table: "price_adjustments", column: "adjustment_note" }
  ];

  for (const target of noteTargets) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [target.table, target.column]
    );

    if (Number(rows[0]?.count || 0) > 0) {
      continue;
    }

    await pool.query(
      `ALTER TABLE ${target.table}
       ADD COLUMN adjustment_note VARCHAR(255) NULL AFTER ${
         target.table === "min_max_adjustments" ? "new_max_quantity" : target.table === "quantity_adjustments" ? "new_quantity" : target.table === "cost_adjustments" ? "new_cost" : "new_price"
       }`
    );
  }
}

module.exports = {
  ensureArchiveSchema,
  ensureAdjustmentNotesSchema
};
