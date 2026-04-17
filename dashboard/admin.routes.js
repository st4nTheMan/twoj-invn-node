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

// Loads the admin dashboard with user accounts, custom roles, and permission metadata.
router.get("/admin", requireAnyPermission(["admin.users.view", "admin.roles.view", "activity_logs.view"]), async (req, res) => {
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
      summary
    });
  } catch (error) {
    console.error("Failed to load admin panel:", error);
    flash(req, { type: "error", message: "Unable to load the admin panel right now." });
    return res.render("dashboard/admin", {
      title: "Admin Panel",
      users: [],
      roles: [],
      permissionGroups: PERMISSION_GROUPS,
      summary: {
        totalUsers: 0,
        totalRoles: 0,
        customRoles: 0
      }
    });
  }
});

// Loads the audit trail page with the newest app activities first.
router.get("/admin/activity-logs", requirePermission("activity_logs.view"), async (req, res) => {
  try {
    const search = normalizeText(req.query.search);
    const action = normalizeText(req.query.action).toLowerCase();
    const username = normalizeText(req.query.username);
    const filters = [];
    const params = [];

    if (search) {
      filters.push("(description LIKE ? OR entity_type LIKE ? OR entity_id LIKE ?)");
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
    flash(req, { type: "error", message: "Unable to load activity logs right now." });
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
});

// Creates a new dashboard user and assigns an application role.
router.post("/admin/users", requirePermission("admin.users.create"), async (req, res) => {
  const username = normalizeText(req.body.username);
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirm_password || "");
  const role = normalizeUserRole(req.body.role);

  if (!username || !password || !confirmPassword) {
    flash(req, { type: "error", message: "Username, password, and confirmation are required." });
    return res.redirect("/admin");
  }

  if (!role) {
    flash(req, { type: "error", message: "Choose a valid role for the new user." });
    return res.redirect("/admin");
  }

  if (password.length < 6) {
    flash(req, { type: "error", message: "Password must be at least 6 characters long." });
    return res.redirect("/admin");
  }

  if (password !== confirmPassword) {
    flash(req, { type: "error", message: "Password confirmation does not match." });
    return res.redirect("/admin");
  }

  try {
    const [roleRows] = await pool.query(
      "SELECT name, display_name FROM roles WHERE name = ? LIMIT 1",
      [role]
    );
    const selectedRole = roleRows[0];

    if (!selectedRole) {
      flash(req, { type: "error", message: "Choose a valid role for the new user." });
      return res.redirect("/admin");
    }

    const [existingUsers] = await pool.query(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username]
    );

    if (existingUsers.length) {
      flash(req, { type: "error", message: "That username is already in use." });
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
    flash(req, { type: "error", message: "Unable to add the user right now." });
    return res.redirect("/admin");
  }
});

// Creates a new custom role with a chosen permission set.
router.post("/admin/roles", requirePermission("admin.roles.create"), async (req, res) => {
  const displayName = normalizeText(req.body.display_name);
  const roleName = normalizeRoleName(req.body.display_name);
  const permissions = normalizePermissionList(req.body.permissions);

  if (!displayName || !roleName) {
    flash(req, { type: "error", message: "Role name is required." });
    return res.redirect("/admin");
  }

  if (!permissions.length) {
    flash(req, { type: "error", message: "Choose at least one permission for the new role." });
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
    flash(req, { type: "error", message: "Unable to create the role right now." });
    return res.redirect("/admin");
  }
});

// Resets a selected user's password from the admin panel.
router.post("/admin/users/:id/password", requirePermission("admin.users.reset_password"), async (req, res) => {
  const userId = Number(req.params.id);
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirm_password || "");

  if (!userId) {
    flash(req, { type: "error", message: "User not found." });
    return res.redirect("/admin");
  }

  if (!password || !confirmPassword) {
    flash(req, { type: "error", message: "New password and confirmation are required." });
    return res.redirect("/admin");
  }

  if (password.length < 6) {
    flash(req, { type: "error", message: "Password must be at least 6 characters long." });
    return res.redirect("/admin");
  }

  if (password !== confirmPassword) {
    flash(req, { type: "error", message: "Password confirmation does not match." });
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

    await pool.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [passwordHash, userId]
    );

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
    flash(req, { type: "error", message: "Unable to update the password right now." });
    return res.redirect("/admin");
  }
});

module.exports = router;
