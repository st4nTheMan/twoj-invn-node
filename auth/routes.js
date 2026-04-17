const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../database/pool");
const { logActivity } = require("../database/activity-log");
const { getDefaultDashboardPath, normalizeUserRole } = require("../middleware/auth");
const { flash, getDatabaseErrorMessage } = require("../includes/helpers");

// Defines authentication-related page routes and session actions.
const router = express.Router();

// Redirects visitors to the correct landing page based on login state.
router.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect(getDefaultDashboardPath(req.session.user));
  }

  return res.redirect("/login");
});

// Renders the login page for guests and skips it for active sessions.
router.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect(getDefaultDashboardPath(req.session.user));
  }

  return res.render("auth/login", { title: "Login" });
});

// Validates submitted credentials and creates the authenticated session.
router.post("/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!username || !password) {
    flash(req, { type: "error", message: "Username and password are required." });
    return res.redirect("/login");
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    const user = rows[0];

    if (!user) {
      flash(req, { type: "error", message: "Incorrect username or password." });
      return res.redirect("/login");
    }

    const passwordHash = String(user.password || "");
    const legacyMd5 = crypto.createHash("md5").update(password).digest("hex");
    const isBcryptHash = passwordHash.startsWith("$2");

    const isValidPassword = isBcryptHash
      ? await bcrypt.compare(password, passwordHash)
      : passwordHash === legacyMd5;

    if (!isValidPassword) {
      flash(req, { type: "error", message: "Incorrect username or password." });
      return res.redirect("/login");
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: normalizeUserRole(user.role)
    };

    await logActivity({
      actorId: user.id,
      username: user.username,
      role: normalizeUserRole(user.role),
      action: "login",
      entityType: "session",
      entityId: user.id,
      description: `${user.username} signed in.`,
      metadata: {
        ip_address: req.ip
      }
    });

    return res.redirect(getDefaultDashboardPath(req.session.user));
  } catch (error) {
    console.error("Login failed:", error);
    flash(req, {
      type: "error",
      message: getDatabaseErrorMessage(error) || "Unable to sign in right now."
    });
    return res.redirect("/login");
  }
});

// Destroys the current session and returns the user to the login screen.
router.get("/logout", (req, res) => {
  const sessionUser = req.session.user || null;

  const finalizeLogout = async () => {
    if (!sessionUser) {
      return;
    }

    try {
      await logActivity({
        actorId: sessionUser.id,
        username: sessionUser.username,
        role: sessionUser.role,
        action: "logout",
        entityType: "session",
        entityId: sessionUser.id,
        description: `${sessionUser.username} signed out.`,
        metadata: {
          ip_address: req.ip
        }
      });
    } catch (error) {
      console.error("Failed to log logout activity:", error);
    }
  };

  req.session.destroy(() => {
    finalizeLogout().finally(() => {
    res.redirect("/login");
    });
  });
});

module.exports = router;
