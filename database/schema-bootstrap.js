const pool = require("./pool");

// Reads the live column type for a table column so new foreign keys match older schemas.
async function getColumnType(tableName, columnName, fallback = "int") {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );

  return rows[0]?.COLUMN_TYPE || fallback;
}

// Adds role tracking to users so admin and cashier permissions can be enforced.
async function ensureUserRolesSchema() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'role'`
  );

  if (Number(rows[0]?.count || 0) === 0) {
    await pool.query(
      `ALTER TABLE users
       ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin' AFTER password`
    );
  }

  await pool.query(
    `UPDATE users
     SET role = 'admin'
     WHERE role IS NULL
        OR TRIM(role) = ''
        OR LOWER(role) NOT IN ('admin', 'cashier')`
  );
}

// Adds the central activity log table used by admin audit views.
async function ensureActivityLogSchema() {
  const [tableRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'activity_logs'`
  );

  if (Number(tableRows[0]?.count || 0) > 0) {
    return;
  }

  const userIdType = await getColumnType("users", "id");

  await pool.query(
    `CREATE TABLE activity_logs (
       id INT UNSIGNED NOT NULL AUTO_INCREMENT,
       user_id ${userIdType} NULL,
       username_snapshot VARCHAR(50) NULL,
       role_snapshot VARCHAR(20) NULL,
       action VARCHAR(100) NOT NULL,
       entity_type VARCHAR(100) NULL,
       entity_id VARCHAR(100) NULL,
       description VARCHAR(255) NOT NULL,
       metadata_json LONGTEXT NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       KEY idx_activity_logs_user_id (user_id),
       KEY idx_activity_logs_action (action),
       KEY idx_activity_logs_entity (entity_type, entity_id),
       KEY idx_activity_logs_created_at (created_at),
       CONSTRAINT fk_activity_logs_user
         FOREIGN KEY (user_id) REFERENCES users (id)
         ON UPDATE CASCADE
         ON DELETE SET NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

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
  const userIdType = await getColumnType("users", "id");
  const auditTargets = [
    { table: "cost_adjustments", afterColumn: "adjustment_note", keyName: "idx_cost_adjustments_adjusted_by", foreignKey: "fk_cost_adjustments_user" },
    { table: "qty_adjustments", afterColumn: "adjustment_note", keyName: "idx_qty_adjustments_adjusted_by", foreignKey: "fk_qty_adjustments_user" },
    { table: "min_max_adjustments", afterColumn: "adjustment_note", keyName: "idx_min_max_adjustments_adjusted_by", foreignKey: "fk_min_max_adjustments_user" },
    { table: "price_adjustments", afterColumn: "adjustment_note", keyName: "idx_price_adjustments_adjusted_by", foreignKey: "fk_price_adjustments_user" },
    { table: "category_adjustments", afterColumn: "adjustment_note", keyName: "idx_category_adjustments_adjusted_by", foreignKey: "fk_category_adjustments_user" }
  ];

  for (const target of auditTargets) {
    const [tableRows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?`,
      [target.table]
    );

    if (Number(tableRows[0]?.count || 0) === 0) {
      continue;
    }

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

// Adds created-by user tracking columns to record tables when needed.
async function ensureCreatedBySchema() {
  const userIdType = await getColumnType("users", "id");
  const createdByTargets = [
    { table: "items", afterColumn: "category_id", keyName: "idx_items_created_by", foreignKey: "fk_items_created_by_user" },
    { table: "categories", afterColumn: "category_name", keyName: "idx_categories_created_by", foreignKey: "fk_categories_created_by_user" },
    { table: "transactions", afterColumn: "customer_phone", keyName: "idx_transactions_created_by", foreignKey: "fk_transactions_created_by_user" },
    { table: "credit_ledger", afterColumn: "balance_due", keyName: "idx_credit_ledger_created_by", foreignKey: "fk_credit_ledger_created_by_user" }
  ];

  for (const target of createdByTargets) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = 'created_by'`,
      [target.table]
    );

    if (Number(rows[0]?.count || 0) > 0) {
      continue;
    }

    await pool.query(
      `ALTER TABLE ${target.table}
       ADD COLUMN created_by ${userIdType} NULL AFTER ${target.afterColumn},
       ADD KEY ${target.keyName} (created_by),
       ADD CONSTRAINT ${target.foreignKey}
         FOREIGN KEY (created_by) REFERENCES users (id)
         ON UPDATE CASCADE
         ON DELETE SET NULL`
    );
  }
}

// Adds updated-by user tracking columns to record tables when needed.
async function ensureUpdatedBySchema() {
  const userIdType = await getColumnType("users", "id");
  const updatedByTargets = [
    { table: "items", afterColumn: "created_by", keyName: "idx_items_updated_by", foreignKey: "fk_items_updated_by_user" },
    { table: "categories", afterColumn: "created_by", keyName: "idx_categories_updated_by", foreignKey: "fk_categories_updated_by_user" },
    { table: "transactions", afterColumn: "created_by", keyName: "idx_transactions_updated_by", foreignKey: "fk_transactions_updated_by_user" },
    { table: "credit_ledger", afterColumn: "created_by", keyName: "idx_credit_ledger_updated_by", foreignKey: "fk_credit_ledger_updated_by_user" }
  ];

  for (const target of updatedByTargets) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = 'updated_by'`,
      [target.table]
    );

    if (Number(rows[0]?.count || 0) > 0) {
      continue;
    }

    await pool.query(
      `ALTER TABLE ${target.table}
       ADD COLUMN updated_by ${userIdType} NULL AFTER ${target.afterColumn},
       ADD KEY ${target.keyName} (updated_by),
       ADD CONSTRAINT ${target.foreignKey}
         FOREIGN KEY (updated_by) REFERENCES users (id)
         ON UPDATE CASCADE
         ON DELETE SET NULL`
    );
  }
}

// Adds credit-ledger tables and transaction payment columns for existing databases.
async function ensureCreditLedgerSchema() {
  const transactionColumns = [
    {
      name: "payment_method",
      alter: "ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'cash' AFTER total_amount"
    },
    {
      name: "customer_name",
      alter: "ADD COLUMN customer_name VARCHAR(150) NULL AFTER payment_method"
    },
    {
      name: "customer_phone",
      alter: "ADD COLUMN customer_phone VARCHAR(50) NULL AFTER customer_name"
    }
  ];

  for (const column of transactionColumns) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'transactions'
         AND COLUMN_NAME = ?`,
      [column.name]
    );

    if (Number(rows[0]?.count || 0) > 0) {
      continue;
    }

    await pool.query(`ALTER TABLE transactions ${column.alter}`);
  }

  const [ledgerRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'credit_ledger'`
  );

  if (Number(ledgerRows[0]?.count || 0) === 0) {
    const transactionIdType = await getColumnType("transactions", "id");

    await pool.query(
      `CREATE TABLE credit_ledger (
         id INT NOT NULL AUTO_INCREMENT,
         transaction_id ${transactionIdType} NULL,
         customer_name VARCHAR(150) NOT NULL,
         customer_phone VARCHAR(50) NOT NULL,
         item_summary TEXT NULL,
         total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         balance_due DECIMAL(12,2) NOT NULL DEFAULT 0.00,
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_credit_ledger_transaction_id (transaction_id),
         KEY idx_credit_ledger_customer_name (customer_name),
         KEY idx_credit_ledger_created_at (created_at),
         CONSTRAINT fk_credit_ledger_transaction
           FOREIGN KEY (transaction_id) REFERENCES transactions (id)
           ON UPDATE CASCADE
           ON DELETE SET NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    return;
  }

  const transactionIdType = await getColumnType("transactions", "id");
  const ledgerColumns = [
    {
      name: "transaction_id",
      alter: `ADD COLUMN transaction_id ${transactionIdType} NULL AFTER id`
    },
    {
      name: "customer_name",
      alter: "ADD COLUMN customer_name VARCHAR(150) NOT NULL AFTER transaction_id"
    },
    {
      name: "customer_phone",
      alter: "ADD COLUMN customer_phone VARCHAR(50) NOT NULL AFTER customer_name"
    },
    {
      name: "item_summary",
      alter: "ADD COLUMN item_summary TEXT NULL AFTER customer_phone"
    },
    {
      name: "total_amount",
      alter: "ADD COLUMN total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER item_summary"
    },
    {
      name: "balance_due",
      alter: "ADD COLUMN balance_due DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER total_amount"
    }
  ];

  for (const column of ledgerColumns) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'credit_ledger'
         AND COLUMN_NAME = ?`,
      [column.name]
    );

    if (Number(rows[0]?.count || 0) > 0) {
      continue;
    }

    await pool.query(`ALTER TABLE credit_ledger ${column.alter}`);
  }
}

// Adds the category adjustment history table for older databases.
async function ensureCategoryAdjustmentSchema() {
  const [tableRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'category_adjustments'`
  );

  if (Number(tableRows[0]?.count || 0) === 0) {
    const itemIdType = await getColumnType("items", "id");
    const categoryIdType = await getColumnType("categories", "id");
    const userIdType = await getColumnType("users", "id");

    await pool.query(
      `CREATE TABLE category_adjustments (
         id INT UNSIGNED NOT NULL AUTO_INCREMENT,
         item_id ${itemIdType} NOT NULL,
         old_category_id ${categoryIdType} NULL,
         new_category_id ${categoryIdType} NULL,
         adjustment_note VARCHAR(255) NULL,
         adjusted_by ${userIdType} NULL,
         adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_category_adjustments_item_id (item_id),
         KEY idx_category_adjustments_old_category_id (old_category_id),
         KEY idx_category_adjustments_new_category_id (new_category_id),
         KEY idx_category_adjustments_adjusted_by (adjusted_by),
         CONSTRAINT fk_category_adjustments_item
           FOREIGN KEY (item_id) REFERENCES items (id)
           ON UPDATE CASCADE
           ON DELETE CASCADE,
         CONSTRAINT fk_category_adjustments_old_category
           FOREIGN KEY (old_category_id) REFERENCES categories (id)
           ON UPDATE CASCADE
           ON DELETE SET NULL,
         CONSTRAINT fk_category_adjustments_new_category
           FOREIGN KEY (new_category_id) REFERENCES categories (id)
           ON UPDATE CASCADE
           ON DELETE SET NULL,
         CONSTRAINT fk_category_adjustments_user
           FOREIGN KEY (adjusted_by) REFERENCES users (id)
           ON UPDATE CASCADE
           ON DELETE SET NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    return;
  }
}

module.exports = {
  ensureActivityLogSchema,
  ensureUserRolesSchema,
  ensureArchiveSchema,
  ensureAdjustmentNotesSchema,
  ensureAdjustmentAuditSchema,
  ensureCreatedBySchema,
  ensureUpdatedBySchema,
  ensureCreditLedgerSchema,
  ensureCategoryAdjustmentSchema
};
