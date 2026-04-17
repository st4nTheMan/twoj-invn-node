const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../database/pool");
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

module.exports = router;
