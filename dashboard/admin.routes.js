const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../database/pool");
const { logActivity } = require("../database/activity-log");
const {
  requireAnyPermission,
  requirePermission,
  normalizeUserRole
} = require("../middleware/auth");
const {
  PERMISSION_GROUPS,
  normalizePermissionList,
  normalizeRoleName
} = require("../includes/permissions");
const { flash, normalizeText } = require("../includes/helpers");

// Defines admin-only pages for managing dashboard users, roles, and audit history.
const router = express.Router();
const BACKUP_TABLES = [
  { name: "roles", orderBy: "id ASC" },
  { name: "role_permissions", orderBy: "id ASC" },
  { name: "users", orderBy: "id ASC" },
  { name: "categories", orderBy: "id ASC" },
  { name: "items", orderBy: "id ASC" },
  { name: "customers", orderBy: "id ASC" },
  { name: "transactions", orderBy: "id ASC" },
  { name: "credit_ledger", orderBy: "id ASC" },
  { name: "transaction_items", orderBy: "id ASC" },
  { name: "cost_adjustments", orderBy: "id ASC" },
  { name: "qty_adjustments", orderBy: "id ASC" },
  { name: "min_max_adjustments", orderBy: "id ASC" },
  { name: "price_adjustments", orderBy: "id ASC" },
  { name: "category_adjustments", orderBy: "id ASC" },
  { name: "activity_logs", orderBy: "id ASC" }
];

function getBackupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function buildBackupSnapshot(connection = pool) {
  const tables = {};

  for (const table of BACKUP_TABLES) {
    const [rows] = await connection.query(
      `SELECT *
       FROM ${table.name}
       ORDER BY ${table.orderBy}`
    );
    tables[table.name] = rows;
  }

  return {
    app: "two-js-invn",
    format: "full-app-backup",
    version: 1,
    exported_at: new Date().toISOString(),
    tables
  };
}

function normalizeMysqlDateTime(value) {
  if (value === null || value === undefined || value === "") {
    return value ?? null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace("T", " ");
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

async function getTableColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [tableName]
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function restoreBackupSnapshot(connection, payload) {
  const tables =
    payload?.tables && typeof payload.tables === "object"
      ? payload.tables
      : null;

  if (!tables) {
    throw new Error("Backup file is missing the tables payload.");
  }

  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(tables[table.name])) {
      throw new Error(`Backup file is missing the ${table.name} table data.`);
    }
  }

  await connection.query("SET FOREIGN_KEY_CHECKS = 0");

  try {
    for (const table of [...BACKUP_TABLES].reverse()) {
      await connection.query(`DELETE FROM ${table.name}`);
    }

    for (const table of BACKUP_TABLES) {
      const rows = tables[table.name];

      if (!rows.length) {
        continue;
      }

      const tableColumns = await getTableColumns(connection, table.name);
      const columns = Object.keys(rows[0]).filter((column) =>
        tableColumns.has(column)
      );

      if (!columns.length) {
        continue;
      }

      const placeholders = columns.map(() => "?").join(", ");
      const sql = `INSERT INTO ${table.name} (${columns.join(", ")}) VALUES (${placeholders})`;

      for (const row of rows) {
        await connection.query(
          sql,
          columns.map((column) => {
            const value = row[column] === undefined ? null : row[column];
            if (/_at$/i.test(column)) {
              return normalizeMysqlDateTime(value);
            }

            return value;
          })
        );
      }
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

// Loads the admin dashboard with user accounts, custom roles, and permission metadata.
router.get(
  "/admin",
  requireAnyPermission([
    "admin.users.view",
    "admin.roles.view",
    "activity_logs.view",
    "admin.data.manage"
  ]),
  async (req, res) => {
    try {
      const [users] = await pool.query(
        `SELECT a.id,
              a.username,
              a.role,
              a.created_at,
              COALESCE(b.display_name, a.role) AS role_display_name
       FROM users a
       LEFT JOIN roles b
         ON a.role COLLATE utf8mb4_unicode_ci = b.name COLLATE utf8mb4_unicode_ci
       ORDER BY a.created_at DESC, a.id DESC`
      );
      const [roles] = await pool.query(
        `SELECT a.id,
              a.name,
              a.display_name,
              a.is_system,
              a.created_at,
              COUNT(DISTINCT b.id) AS user_count,
              COUNT(DISTINCT c.id) AS permission_count,
              GROUP_CONCAT(DISTINCT c.permission_key ORDER BY c.permission_key SEPARATOR '|') AS permission_keys
       FROM roles a
       LEFT JOIN users b
         ON a.name COLLATE utf8mb4_unicode_ci = b.role COLLATE utf8mb4_unicode_ci
       LEFT JOIN role_permissions c ON a.id = c.role_id
       GROUP BY a.id, a.name, a.display_name, a.is_system, a.created_at
       ORDER BY a.is_system DESC, a.display_name ASC`
      );

      const summary = {
        totalUsers: users.length,
        totalRoles: roles.length,
        customRoles: roles.filter((role) => !Number(role.is_system)).length
      };

      return res.render("dashboard/admin", {
        title: "Admin Panel",
        users,
        roles,
        permissionGroups: PERMISSION_GROUPS,
        summary,
        backupSummary: {
          tableCount: BACKUP_TABLES.length,
          tableNames: BACKUP_TABLES.map((table) => table.name)
        }
      });
    } catch (error) {
      console.error("Failed to load admin panel:", error);
      flash(req, {
        type: "error",
        message: "Unable to load the admin panel right now."
      });
      return res.render("dashboard/admin", {
        title: "Admin Panel",
        users: [],
        roles: [],
        permissionGroups: PERMISSION_GROUPS,
        backupSummary: {
          tableCount: BACKUP_TABLES.length,
          tableNames: BACKUP_TABLES.map((table) => table.name)
        },
        summary: {
          totalUsers: 0,
          totalRoles: 0,
          customRoles: 0
        }
      });
    }
  }
);

// Downloads a full JSON backup that includes all application tables.
router.get(
  "/admin/data/export",
  requirePermission("admin.data.manage"),
  async (req, res) => {
    try {
      const backup = await buildBackupSnapshot();
      const timestamp = getBackupTimestamp();
      const totalRowCount = Object.values(backup.tables).reduce(
        (sum, rows) => sum + rows.length,
        0
      );

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "app_data_exported",
        entityType: "admin_backup",
        entityId: "full_export",
        description: `${req.session.user?.username || "Admin"} exported a full application backup.`,
        metadata: {
          table_count: BACKUP_TABLES.length,
          row_count: totalRowCount,
          format: "json"
        }
      });

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="app-backup-${timestamp}.json"`
      );
      return res.send(JSON.stringify(backup, null, 2));
    } catch (error) {
      console.error("Failed to export app backup:", error);
      req.session.destroy(() => {
        flash(req, {
          type: "success",
          message:
            "Full application backup imported successfully. Please sign in again."
        });
        return res.redirect("/login");
      });
      return;
    }
  }
);

// Restores the full application dataset from a JSON backup created by the admin panel.
router.post(
  "/admin/data/import",
  requirePermission("admin.data.manage"),
  async (req, res) => {
    const rawBackupJson = String(req.body.backup_json || "").trim();

    if (!rawBackupJson) {
      flash(req, {
        type: "error",
        message: "Choose a backup file or paste a backup JSON before importing."
      });
      return res.redirect("/admin");
    }

    let parsedBackup = null;

    try {
      parsedBackup = JSON.parse(rawBackupJson);
    } catch (error) {
      flash(req, {
        type: "error",
        message: "The backup file is not valid JSON."
      });
      return res.redirect("/admin");
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      await restoreBackupSnapshot(connection, parsedBackup);
      await connection.commit();

      const importedRowCount = Object.values(parsedBackup.tables || {}).reduce(
        (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
        0
      );

      await logActivity({
        actorId: null,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "app_data_imported",
        entityType: "admin_backup",
        entityId: "full_import",
        description: `${req.session.user?.username || "Admin"} imported a full application backup.`,
        metadata: {
          table_count: BACKUP_TABLES.length,
          row_count: importedRowCount,
          imported_from: parsedBackup.exported_at || null,
          format: parsedBackup.format || null,
          version: parsedBackup.version || null
        }
      });

      flash(req, {
        type: "success",
        message: "Full application backup imported successfully."
      });
      return res.redirect("/admin");
    } catch (error) {
      await connection.rollback();
      console.error("Failed to import app backup:", error);
      flash(req, {
        type: "error",
        message:
          error.message || "Unable to import the full app backup right now."
      });
      return res.redirect("/admin");
    } finally {
      connection.release();
    }
  }
);

// Loads the audit trail page with the newest app activities first.
router.get(
  "/admin/activity-logs",
  requirePermission("activity_logs.view"),
  async (req, res) => {
    try {
      const search = normalizeText(req.query.search);
      const action = normalizeText(req.query.action).toLowerCase();
      const username = normalizeText(req.query.username);
      const filters = [];
      const params = [];

      if (search) {
        filters.push(
          "(description LIKE ? OR entity_type LIKE ? OR entity_id LIKE ?)"
        );
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (action) {
        filters.push("action = ?");
        params.push(action);
      }

      if (username) {
        filters.push("username_snapshot = ?");
        params.push(username);
      }

      const whereClause = filters.length
        ? `WHERE ${filters.join(" AND ")}`
        : "";

      const [activities] = await pool.query(
        `SELECT id, username_snapshot, role_snapshot, action, entity_type, entity_id, description, created_at
       FROM activity_logs
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT 300`,
        params
      );

      const [actionRows] = await pool.query(
        `SELECT DISTINCT action
       FROM activity_logs
       WHERE action IS NOT NULL
         AND action <> ''
       ORDER BY action ASC`
      );
      const [usernameRows] = await pool.query(
        `SELECT DISTINCT username_snapshot
       FROM activity_logs
       WHERE username_snapshot IS NOT NULL
         AND username_snapshot <> ''
       ORDER BY username_snapshot ASC`
      );

      return res.render("dashboard/activity-logs", {
        title: "Activity Logs",
        activities,
        availableActions: actionRows.map((row) => row.action),
        availableUsers: usernameRows.map((row) => row.username_snapshot),
        selectedFilters: {
          search,
          action,
          username
        }
      });
    } catch (error) {
      console.error("Failed to load activity logs:", error);
      flash(req, {
        type: "error",
        message: "Unable to load activity logs right now."
      });
      return res.render("dashboard/activity-logs", {
        title: "Activity Logs",
        activities: [],
        availableActions: [],
        availableUsers: [],
        selectedFilters: {
          search: "",
          action: "",
          username: ""
        }
      });
    }
  }
);

// Creates a new dashboard user and assigns an application role.
router.post(
  "/admin/users",
  requirePermission("admin.users.create"),
  async (req, res) => {
    const username = normalizeText(req.body.username);
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirm_password || "");
    const role = normalizeUserRole(req.body.role);

    if (!username || !password || !confirmPassword) {
      flash(req, {
        type: "error",
        message: "Username, password, and confirmation are required."
      });
      return res.redirect("/admin");
    }

    if (!role) {
      flash(req, {
        type: "error",
        message: "Choose a valid role for the new user."
      });
      return res.redirect("/admin");
    }

    if (password.length < 6) {
      flash(req, {
        type: "error",
        message: "Password must be at least 6 characters long."
      });
      return res.redirect("/admin");
    }

    if (password !== confirmPassword) {
      flash(req, {
        type: "error",
        message: "Password confirmation does not match."
      });
      return res.redirect("/admin");
    }

    try {
      const [roleRows] = await pool.query(
        "SELECT name, display_name FROM roles WHERE name = ? LIMIT 1",
        [role]
      );
      const selectedRole = roleRows[0];

      if (!selectedRole) {
        flash(req, {
          type: "error",
          message: "Choose a valid role for the new user."
        });
        return res.redirect("/admin");
      }

      const [existingUsers] = await pool.query(
        "SELECT id FROM users WHERE username = ? LIMIT 1",
        [username]
      );

      if (existingUsers.length) {
        flash(req, {
          type: "error",
          message: "That username is already in use."
        });
        return res.redirect("/admin");
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await pool.query(
        "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
        [username, passwordHash, role]
      );

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "user_created",
        entityType: "user",
        entityId: username,
        description: `${req.session.user?.username || "Admin"} added user ${username} as ${selectedRole.display_name}.`,
        metadata: {
          username,
          role
        }
      });

      flash(req, {
        type: "success",
        message: `User ${username} added successfully as ${selectedRole.display_name}.`
      });
      return res.redirect("/admin");
    } catch (error) {
      console.error("Failed to create user:", error);
      flash(req, {
        type: "error",
        message: "Unable to add the user right now."
      });
      return res.redirect("/admin");
    }
  }
);

// Creates a new custom role with a chosen permission set.
router.post(
  "/admin/roles",
  requirePermission("admin.roles.create"),
  async (req, res) => {
    const displayName = normalizeText(req.body.display_name);
    const roleName = normalizeRoleName(req.body.display_name);
    const permissions = normalizePermissionList(req.body.permissions);

    if (!displayName || !roleName) {
      flash(req, { type: "error", message: "Role name is required." });
      return res.redirect("/admin");
    }

    if (!permissions.length) {
      flash(req, {
        type: "error",
        message: "Choose at least one permission for the new role."
      });
      return res.redirect("/admin");
    }

    try {
      const [existingRows] = await pool.query(
        "SELECT id FROM roles WHERE name = ? LIMIT 1",
        [roleName]
      );

      if (existingRows.length) {
        flash(req, { type: "error", message: "That role already exists." });
        return res.redirect("/admin");
      }

      const [insertResult] = await pool.query(
        "INSERT INTO roles (name, display_name, is_system) VALUES (?, ?, 0)",
        [roleName, displayName]
      );

      for (const permissionKey of permissions) {
        await pool.query(
          "INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)",
          [insertResult.insertId, permissionKey]
        );
      }

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "role_created",
        entityType: "role",
        entityId: roleName,
        description: `${req.session.user?.username || "Admin"} created role ${displayName}.`,
        metadata: {
          role_name: roleName,
          display_name: displayName,
          permissions
        }
      });

      flash(req, {
        type: "success",
        message: `Role ${displayName} created successfully.`
      });
      return res.redirect("/admin");
    } catch (error) {
      console.error("Failed to create role:", error);
      flash(req, {
        type: "error",
        message: "Unable to create the role right now."
      });
      return res.redirect("/admin");
    }
  }
);

// Updates the permission set for an existing custom role.
router.post(
  "/admin/roles/:id/permissions",
  requirePermission("admin.roles.create"),
  async (req, res) => {
    const roleId = Number(req.params.id);
    const permissions = normalizePermissionList(req.body.permissions);
    const jsonResponse =
      req.xhr || String(req.get("accept") || "").includes("application/json");

    if (!roleId) {
      if (jsonResponse)
        return res.status(400).json({ ok: false, message: "Role not found." });
      flash(req, { type: "error", message: "Role not found." });
      return res.redirect("/admin");
    }

    try {
      const [rows] = await pool.query(
        "SELECT id, name, display_name, is_system FROM roles WHERE id = ? LIMIT 1",
        [roleId]
      );
      const role = rows[0];

      if (!role) {
        if (jsonResponse)
          return res
            .status(404)
            .json({ ok: false, message: "Role not found." });
        flash(req, { type: "error", message: "Role not found." });
        return res.redirect("/admin");
      }

      if (Number(role.is_system)) {
        if (jsonResponse)
          return res
            .status(403)
            .json({ ok: false, message: "System roles cannot be edited." });
        flash(req, {
          type: "error",
          message: "System roles cannot be edited."
        });
        return res.redirect("/admin");
      }

      if (!permissions.length) {
        if (jsonResponse)
          return res
            .status(400)
            .json({ ok: false, message: "Choose at least one permission." });
        flash(req, {
          type: "error",
          message: "Choose at least one permission."
        });
        return res.redirect("/admin");
      }

      // Replace all permissions for this role in a single transaction.
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query(
          "DELETE FROM role_permissions WHERE role_id = ?",
          [roleId]
        );
        for (const permissionKey of permissions) {
          await connection.query(
            "INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)",
            [roleId, permissionKey]
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "role_permissions_updated",
        entityType: "role",
        entityId: role.name,
        description: `${req.session.user?.username || "Admin"} updated permissions for ${role.display_name}.`,
        metadata: {
          role_name: role.name,
          display_name: role.display_name,
          permissions
        }
      });

      if (jsonResponse) {
        return res.json({
          ok: true,
          message: `Permissions for ${role.display_name} updated successfully.`,
          permissions
        });
      }

      flash(req, {
        type: "success",
        message: `Permissions for ${role.display_name} updated successfully.`
      });
      return res.redirect("/admin");
    } catch (error) {
      console.error("Failed to update role permissions:", error);
      if (jsonResponse)
        return res.status(500).json({
          ok: false,
          message: "Unable to update permissions right now."
        });
      flash(req, {
        type: "error",
        message: "Unable to update permissions right now."
      });
      return res.redirect("/admin");
    }
  }
);

// Resets a selected user's password from the admin panel.
router.post(
  "/admin/users/:id/password",
  requirePermission("admin.users.reset_password"),
  async (req, res) => {
    const userId = Number(req.params.id);
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirm_password || "");

    if (!userId) {
      flash(req, { type: "error", message: "User not found." });
      return res.redirect("/admin");
    }

    if (!password || !confirmPassword) {
      flash(req, {
        type: "error",
        message: "New password and confirmation are required."
      });
      return res.redirect("/admin");
    }

    if (password.length < 6) {
      flash(req, {
        type: "error",
        message: "Password must be at least 6 characters long."
      });
      return res.redirect("/admin");
    }

    if (password !== confirmPassword) {
      flash(req, {
        type: "error",
        message: "Password confirmation does not match."
      });
      return res.redirect("/admin");
    }

    try {
      const [rows] = await pool.query(
        "SELECT id, username, role FROM users WHERE id = ? LIMIT 1",
        [userId]
      );
      const managedUser = rows[0];

      if (!managedUser) {
        flash(req, { type: "error", message: "User not found." });
        return res.redirect("/admin");
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await pool.query("UPDATE users SET password = ? WHERE id = ?", [
        passwordHash,
        userId
      ]);

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "user_password_updated",
        entityType: "user",
        entityId: managedUser.id,
        description: `${req.session.user?.username || "Admin"} reset the password for ${managedUser.username}.`,
        metadata: {
          username: managedUser.username,
          role: managedUser.role
        }
      });

      flash(req, {
        type: "success",
        message: `Password updated for ${managedUser.username}.`
      });
      return res.redirect("/admin");
    } catch (error) {
      console.error("Failed to reset user password:", error);
      flash(req, {
        type: "error",
        message: "Unable to update the password right now."
      });
      return res.redirect("/admin");
    }
  }
);

// Updates the role for an existing user.
router.post(
  "/admin/users/:id/role",
  requirePermission("admin.users.create"),
  async (req, res) => {
    const userId = Number(req.params.id);
    const role = normalizeUserRole(req.body.role);
    const jsonResponse =
      req.xhr || String(req.get("accept") || "").includes("application/json");

    if (!userId) {
      if (jsonResponse)
        return res.status(400).json({ ok: false, message: "User not found." });
      flash(req, { type: "error", message: "User not found." });
      return res.redirect("/admin");
    }

    if (!role) {
      if (jsonResponse)
        return res
          .status(400)
          .json({ ok: false, message: "Choose a valid role." });
      flash(req, { type: "error", message: "Choose a valid role." });
      return res.redirect("/admin");
    }

    try {
      const [rows] = await pool.query(
        "SELECT id, username, role FROM users WHERE id = ? LIMIT 1",
        [userId]
      );
      const managedUser = rows[0];

      if (!managedUser) {
        if (jsonResponse)
          return res
            .status(404)
            .json({ ok: false, message: "User not found." });
        flash(req, { type: "error", message: "User not found." });
        return res.redirect("/admin");
      }

      const [roleRows] = await pool.query(
        "SELECT name, display_name FROM roles WHERE name = ? LIMIT 1",
        [role]
      );
      const selectedRole = roleRows[0];

      if (!selectedRole) {
        if (jsonResponse)
          return res
            .status(400)
            .json({ ok: false, message: "Choose a valid role." });
        flash(req, { type: "error", message: "Choose a valid role." });
        return res.redirect("/admin");
      }

      await pool.query("UPDATE users SET role = ? WHERE id = ?", [
        role,
        userId
      ]);

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "user_role_updated",
        entityType: "user",
        entityId: managedUser.id,
        description: `${req.session.user?.username || "Admin"} changed ${managedUser.username}'s role to ${selectedRole.display_name}.`,
        metadata: {
          username: managedUser.username,
          old_role: managedUser.role,
          new_role: role
        }
      });

      if (jsonResponse) {
        return res.json({
          ok: true,
          message: `${managedUser.username}'s role updated to ${selectedRole.display_name}.`,
          role,
          roleDisplayName: selectedRole.display_name
        });
      }

      flash(req, {
        type: "success",
        message: `${managedUser.username}'s role updated to ${selectedRole.display_name}.`
      });
      return res.redirect("/admin");
    } catch (error) {
      console.error("Failed to update user role:", error);
      if (jsonResponse)
        return res
          .status(500)
          .json({ ok: false, message: "Unable to update role right now." });
      flash(req, {
        type: "error",
        message: "Unable to update role right now."
      });
      return res.redirect("/admin");
    }
  }
);

module.exports = router;
