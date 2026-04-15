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
    { table: "qty_adjustments", column: "adjustment_note" },
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
         target.table === "min_max_adjustments" ? "new_max_quantity" : target.table === "qty_adjustments" ? "new_quantity" : target.table === "cost_adjustments" ? "new_cost" : "new_price"
       }`
    );
  }
}

// Adds adjusted-by user tracking columns to adjustment-history tables when needed.
async function ensureAdjustmentAuditSchema() {
  const [userIdTypeRows] = await pool.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'id'
     LIMIT 1`
  );
  const userIdType = userIdTypeRows[0]?.COLUMN_TYPE || "int";
  const auditTargets = [
    { table: "cost_adjustments", afterColumn: "adjustment_note", keyName: "idx_cost_adjustments_adjusted_by", foreignKey: "fk_cost_adjustments_user" },
    { table: "qty_adjustments", afterColumn: "adjustment_note", keyName: "idx_qty_adjustments_adjusted_by", foreignKey: "fk_qty_adjustments_user" },
    { table: "min_max_adjustments", afterColumn: "adjustment_note", keyName: "idx_min_max_adjustments_adjusted_by", foreignKey: "fk_min_max_adjustments_user" },
    { table: "price_adjustments", afterColumn: "adjustment_note", keyName: "idx_price_adjustments_adjusted_by", foreignKey: "fk_price_adjustments_user" },
    { table: "category_adjustments", afterColumn: "adjustment_note", keyName: "idx_category_adjustments_adjusted_by", foreignKey: "fk_category_adjustments_user" }
  ];

  for (const target of auditTargets) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = 'adjusted_by'`,
      [target.table]
    );

    if (Number(rows[0]?.count || 0) > 0) {
      continue;
    }

    await pool.query(
      `ALTER TABLE ${target.table}
       ADD COLUMN adjusted_by ${userIdType} NULL AFTER ${target.afterColumn},
       ADD KEY ${target.keyName} (adjusted_by),
       ADD CONSTRAINT ${target.foreignKey}
         FOREIGN KEY (adjusted_by) REFERENCES users (id)
         ON UPDATE CASCADE
         ON DELETE SET NULL`
    );
  }
}

module.exports = {
  ensureArchiveSchema,
  ensureAdjustmentNotesSchema,
  ensureAdjustmentAuditSchema
};
