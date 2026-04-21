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

// Trims outer whitespace and collapses repeated inner whitespace to a single space.
function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// Normalizes text input before saving it in uppercase database fields.
function toUppercaseText(value) {
  return normalizeText(value).toUpperCase();
}

// Normalizes item numbers and barcodes by removing extra spacing.
function normalizeBarcode(value) {
  return normalizeText(value);
}

// Normalizes decimal-style numeric input while preserving decimal points.
function normalizeDecimalInput(value) {
  return normalizeText(value).replace(/,/g, "");
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

// Builds pagination HTML string for AJAX JSON responses.
function buildPaginationHtml(pagination, baseUrl, search) {
  if (pagination.totalPages <= 1) return "";

  const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
  const windowSize = 2;
  const startPage = Math.max(1, pagination.page - windowSize);
  const endPage = Math.min(pagination.totalPages, pagination.page + windowSize);

  const disabledSpan = (label) =>
    `<span class="rounded-xl border border-slate-200 px-3 py-2 font-medium text-slate-300 cursor-not-allowed">${label}</span>`;

  const pageLink = (page, label) =>
    `<a href="${baseUrl}?page=${page}${searchParam}" data-page="${page}" class="pagination-link rounded-xl border border-slate-300 px-3 py-2 font-medium hover:bg-slate-50">${label}</a>`;

  const prevFirst = pagination.hasPrev
    ? `${pageLink(1, "«")}${pageLink(pagination.page - 1, "‹")}`
    : `${disabledSpan("«")}${disabledSpan("‹")}`;

  const nextLast = pagination.hasNext
    ? `${pageLink(pagination.page + 1, "›")}${pageLink(pagination.totalPages, "»")}`
    : `${disabledSpan("›")}${disabledSpan("»")}`;

  const startEllipsis = startPage > 1 ? `<span class="px-2 text-slate-400">…</span>` : "";
  const endEllipsis = endPage < pagination.totalPages ? `<span class="px-2 text-slate-400">…</span>` : "";

  let pageButtons = "";
  for (let p = startPage; p <= endPage; p++) {
    pageButtons += p === pagination.page
      ? `<span class="rounded-xl bg-sky-600 px-3 py-2 font-semibold text-white">${p}</span>`
      : pageLink(p, p);
  }

  const from = (pagination.page - 1) * pagination.perPage + 1;
  const to = Math.min(pagination.page * pagination.perPage, pagination.total);

  return `
    <div class="flex items-center justify-between px-4 py-3 text-sm text-slate-600">
      <p>Showing <span class="font-semibold">${from}</span>–<span class="font-semibold">${to}</span> of <span class="font-semibold">${pagination.total}</span> items</p>
      <div class="flex items-center gap-1">
        ${prevFirst}${startEllipsis}${pageButtons}${endEllipsis}${nextLast}
      </div>
    </div>`;
}

// Builds a pagination metadata object from query params and a total count.
function buildPagination(query, total, perPage = 25) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const totalPages = Math.ceil(total / perPage);
  return {
    page,
    totalPages,
    total,
    perPage,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    offset: (page - 1) * perPage
  };
}

module.exports = {
  buildPagination,
  buildPaginationHtml,
  flash,
  formatCurrency,
  formatDateTime,
  formatInvoice,
  getDatabaseErrorMessage,
  normalizeBarcode,
  normalizeDecimalInput,
  normalizeText,
  toUppercaseText
};