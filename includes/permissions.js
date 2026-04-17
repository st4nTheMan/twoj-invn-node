// Defines every permission key that can be granted to a custom role.
const PERMISSION_GROUPS = [
  {
    key: "inventory",
    label: "Inventory",
    permissions: [
      { key: "inventory.view", label: "View inventory", description: "Open the inventory page and item details." },
      { key: "inventory.create", label: "Add items and categories", description: "Create inventory items and categories." },
      { key: "inventory.archive_restore", label: "Archive and restore items", description: "Hide and restore inventory records." },
      { key: "inventory.adjust", label: "Adjust inventory", description: "Update quantity, cost, price, and category adjustments." },
      { key: "inventory.export", label: "Export inventory", description: "Download CSV or XLS inventory exports." }
    ]
  },
  {
    key: "history",
    label: "History",
    permissions: [
      { key: "history.view", label: "View item history", description: "Open item history and historical adjustment pages." }
    ]
  },
  {
    key: "sales",
    label: "Sales And Ledger",
    permissions: [
      { key: "price_lookup.view", label: "Use price lookup", description: "Search product prices without inventory access." },
      { key: "transaction.create", label: "Create transactions", description: "Open checkout and complete sales." },
      { key: "credit_ledger.view", label: "View credit ledger", description: "Open the credit ledger page." },
      { key: "credit_ledger.create", label: "Add credit entries", description: "Create manual credit ledger balances." },
      { key: "reports.view", label: "View reports", description: "Open reports and transaction details." }
    ]
  },
  {
    key: "admin",
    label: "Admin Panel",
    permissions: [
      { key: "admin.users.view", label: "View users", description: "Open the user management section." },
      { key: "admin.users.create", label: "Add users", description: "Create dashboard users." },
      { key: "admin.users.reset_password", label: "Reset user passwords", description: "Change another user's password." },
      { key: "admin.roles.view", label: "View roles", description: "Open the role management section." },
      { key: "admin.roles.create", label: "Add roles", description: "Create custom roles with permissions." },
      { key: "admin.data.manage", label: "Manage backups", description: "Export and import the full application dataset." },
      { key: "activity_logs.view", label: "View activity logs", description: "Open the audit trail page." }
    ]
  }
];

const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.key));

const SYSTEM_ROLE_DEFINITIONS = [
  {
    name: "admin",
    displayName: "Admin",
    isSystem: true,
    permissions: ALL_PERMISSION_KEYS
  },
  {
    name: "cashier",
    displayName: "Cashier",
    isSystem: true,
    permissions: [
      "price_lookup.view",
      "transaction.create",
      "credit_ledger.view",
      "credit_ledger.create"
    ]
  }
];

// Normalizes custom role names into stable lowercase keys for storage.
function normalizeRoleName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

// Returns a safe deduplicated list of valid permission keys.
function normalizePermissionList(values) {
  const allowed = new Set(ALL_PERMISSION_KEYS);
  const list = Array.isArray(values) ? values : values ? [values] : [];

  return [...new Set(
    list
      .map((value) => String(value || "").trim())
      .filter((value) => allowed.has(value))
  )];
}

// Chooses the best landing page for a signed-in user based on granted permissions.
function getDefaultDashboardPathForPermissions(permissions) {
  const granted = new Set(normalizePermissionList(permissions));

  if (granted.has("inventory.view")) return "/inventory";
  if (granted.has("transaction.create")) return "/transaction";
  if (granted.has("credit_ledger.view")) return "/credit-ledger";
  if (granted.has("price_lookup.view")) return "/price-lookup";
  if (granted.has("reports.view")) return "/reports";
  if (granted.has("admin.users.view") || granted.has("admin.roles.view") || granted.has("admin.data.manage")) return "/admin";
  if (granted.has("activity_logs.view")) return "/admin/activity-logs";

  return "/login";
}

module.exports = {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  SYSTEM_ROLE_DEFINITIONS,
  getDefaultDashboardPathForPermissions,
  normalizePermissionList,
  normalizeRoleName
};
