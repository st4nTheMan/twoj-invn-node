const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../database/pool");
const { logActivity } = require("../database/activity-log");
const { requireAdmin, normalizeUserRole } = require("../middleware/auth");
const { flash, normalizeText } = require("../includes/helpers");

// Defines admin-only pages for managing dashboard users.
const router = express.Router();

// Loads the admin dashboard with the current list of application users.
router.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, username, role, created_at
       FROM users
       ORDER BY created_at DESC, id DESC`
    );

    const summary = {
      totalUsers: users.length,
      adminCount: users.filter((user) => normalizeUserRole(user.role) === "admin").length,
      cashierCount: users.filter((user) => normalizeUserRole(user.role) === "cashier").length
    };

    return res.render("dashboard/admin", {
      title: "Admin Panel",
      users,
      summary
    });
  } catch (error) {
    console.error("Failed to load admin panel:", error);
    flash(req, { type: "error", message: "Unable to load the admin panel right now." });
    return res.render("dashboard/admin", {
      title: "Admin Panel",
      users: [],
      summary: {
        totalUsers: 0,
        adminCount: 0,
        cashierCount: 0
      }
    });
  }
});

// Loads the audit trail page with the newest app activities first.
router.get("/admin/activity-logs", requireAdmin, async (req, res) => {
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
router.post("/admin/users", requireAdmin, async (req, res) => {
  const username = normalizeText(req.body.username);
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirm_password || "");
  const requestedRole = String(req.body.role || "").trim().toLowerCase();
  const role = ["admin", "cashier"].includes(requestedRole)
    ? requestedRole
    : "";

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
      description: `${req.session.user?.username || "Admin"} added user ${username} as ${role}.`,
      metadata: {
        username,
        role
      }
    });

    flash(req, {
      type: "success",
      message: `User ${username} added successfully as ${role}.`
    });
    return res.redirect("/admin");
  } catch (error) {
    console.error("Failed to create user:", error);
    flash(req, { type: "error", message: "Unable to add the user right now." });
    return res.redirect("/admin");
  }
});

// Resets a selected user's password from the admin panel.
router.post("/admin/users/:id/password", requireAdmin, async (req, res) => {
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
