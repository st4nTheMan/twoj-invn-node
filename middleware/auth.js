const { flash } = require("../includes/helpers");
const {
  getDefaultDashboardPathForPermissions,
  normalizePermissionList,
  normalizeRoleName
} = require("../includes/permissions");

// Normalizes user roles so older or malformed records fall back safely.
function normalizeUserRole(role) {
  return normalizeRoleName(role) || "admin";
}

// Checks whether the current session user has one of the allowed roles.
function userHasRole(user, allowedRoles) {
  if (!user) {
    return false;
  }

  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return allowed.map(normalizeUserRole).includes(normalizeUserRole(user.role));
}

// Checks whether the current session user has one specific permission.
function hasPermission(user, permission) {
  if (!user || !permission) {
    return false;
  }

  return normalizePermissionList(user.permissions).includes(String(permission));
}

// Checks whether the current session user has any permission from a list.
function hasAnyPermission(user, permissions) {
  const requested = Array.isArray(permissions) ? permissions : [permissions];
  return requested.some((permission) => hasPermission(user, permission));
}

// Chooses the best dashboard landing page for the current user role.
function getDefaultDashboardPath(user) {
  return getDefaultDashboardPathForPermissions(user?.permissions || []);
}

// Blocks protected routes until a valid session user is present.
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  return next();
}

// Sends a consistent permission-denied response for HTML and JSON routes.
function denyForMissingPermission(req, res) {
  const message = "You do not have permission to access that page.";

  if (String(req.get("accept") || "").includes("application/json") || req.xhr) {
    return res.status(403).json({
      ok: false,
      message
    });
  }

  flash(req, { type: "error", message });
  return res.redirect(getDefaultDashboardPath(req.session.user));
}

// Restricts access to a single required permission.
function requirePermission(permission) {
  return function requirePermissionMiddleware(req, res, next) {
    if (!req.session.user) {
      if (String(req.get("accept") || "").includes("application/json") || req.xhr) {
        return res.status(401).json({
          ok: false,
          message: "You need to sign in first."
        });
      }

      return res.redirect("/login");
    }

    if (hasPermission(req.session.user, permission)) {
      return next();
    }

    return denyForMissingPermission(req, res);
  };
}

// Restricts access to any one permission from a list.
function requireAnyPermission(permissions) {
  return function requireAnyPermissionMiddleware(req, res, next) {
    if (!req.session.user) {
      if (String(req.get("accept") || "").includes("application/json") || req.xhr) {
        return res.status(401).json({
          ok: false,
          message: "You need to sign in first."
        });
      }

      return res.redirect("/login");
    }

    if (hasAnyPermission(req.session.user, permissions)) {
      return next();
    }

    return denyForMissingPermission(req, res);
  };
}

module.exports = {
  getDefaultDashboardPath,
  hasAnyPermission,
  hasPermission,
  normalizeUserRole,
  userHasRole,
  requireLogin,
  requirePermission,
  requireAnyPermission
};
