// Formats numeric values into the peso-style currency display used by the UI.
function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Formats timestamps into a readable date and time string for dashboard views.
function formatDateTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleString("en-PH", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

// Formats transaction IDs into the invoice number pattern used in reports.
function formatInvoice(id) {
  return `INV-${String(id).padStart(6, "0")}`;
}

// Normalizes text input before saving it in uppercase database fields.
function toUppercaseText(value) {
  return String(value || "").trim().toUpperCase();
}

// Stores a one-time flash message in the current session.
function flash(req, payload) {
  req.session.flash = payload;
}

// Maps common database startup errors to user-friendly troubleshooting text.
function getDatabaseErrorMessage(error) {
  if (error?.code === "ER_ACCESS_DENIED_ERROR") {
    return "Database connection failed. Check DB_USER and DB_PASSWORD in .env.";
  }

  if (error?.code === "ER_BAD_DB_ERROR") {
    return "Database not found. Check DB_NAME in .env.";
  }

  return "";
}

module.exports = {
  flash,
  formatCurrency,
  formatDateTime,
  formatInvoice,
  getDatabaseErrorMessage,
  toUppercaseText
};