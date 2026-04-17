const { flash } = require("../includes/helpers");

const VALID_ROLES = new Set(["admin", "cashier"]);

// Normalizes user roles so older or malformed records fall back safely.
function normalizeUserRole(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  return VALID_ROLES.has(normalizedRole) ? normalizedRole : "admin";
}

// Checks whether the current session user has one of the allowed roles.
function userHasRole(user, allowedRoles) {
  if (!user) {
    return false;
  }

  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return allowed.map(normalizeUserRole).includes(normalizeUserRole(user.role));
}

// Chooses the best dashboard landing page for the current user role.
function getDefaultDashboardPath(user) {
  return normalizeUserRole(user?.role) === "cashier"
    ? "/transaction"
    : "/inventory";
}

// Blocks protected routes until a valid session user is present.
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  return next();
}

// Restricts access to one or more allowed roles and returns a redirect or JSON error.
function requireRole(allowedRoles) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.session.user) {
      if (String(req.get("accept") || "").includes("application/json") || req.xhr) {
        return res.status(401).json({
          ok: false,
          message: "You need to sign in first."
        });
      }

      return res.redirect("/login");
    }

    if (userHasRole(req.session.user, allowedRoles)) {
      return next();
    }

    const message = "You do not have permission to access that page.";

    if (String(req.get("accept") || "").includes("application/json") || req.xhr) {
      return res.status(403).json({
        ok: false,
        message
      });
    }

    flash(req, { type: "error", message });
    return res.redirect(getDefaultDashboardPath(req.session.user));
  };
}

const requireAdmin = requireRole("admin");

module.exports = {
  getDefaultDashboardPath,
  normalizeUserRole,
  userHasRole,
  requireLogin,
  requireRole,
  requireAdmin
};
