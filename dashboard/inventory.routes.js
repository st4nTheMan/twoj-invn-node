const express = require("express");
const pool = require("../database/pool");
const { logActivity } = require("../database/activity-log");
const {
  requirePermission,
  requireAnyPermission
} = require("../middleware/auth");
const {
  flash,
  normalizeBarcode,
  normalizeDecimalInput,
  normalizeText,
  toUppercaseText,
  buildPagination,
  buildPaginationHtml,
  buildSortClause
} = require("../includes/helpers");

// Defines inventory pages and form actions for items and categories.
const router = express.Router();

// Parses a non-negative whole number and returns null for invalid values.
function parseWholeNumber(value) {
  const normalized = normalizeDecimalInput(value);

  if (normalized === "") {
    return null;
  }

  const parsedValue = Number(normalized);

  if (
    !Number.isFinite(parsedValue) ||
    parsedValue < 0 ||
    !Number.isInteger(parsedValue)
  ) {
    return null;
  }

  return parsedValue;
}

// Extracts submitted item field groups from nested or flattened form payloads.
function extractSubmittedItems(body) {
  const extractedItems = {};

  if (body?.items && typeof body.items === "object") {
    for (const [itemId, fields] of Object.entries(body.items)) {
      if (!fields || typeof fields !== "object") {
        continue;
      }

      extractedItems[itemId] = { ...fields };
    }
  }

  for (const [key, value] of Object.entries(body || {})) {
    const match = key.match(/^items\[(\d+)\]\[([a-z_]+)\]$/i);
    if (!match) continue;

    const [, itemId, fieldName] = match;
    if (!extractedItems[itemId]) {
      extractedItems[itemId] = {};
    }

    extractedItems[itemId][fieldName] = value;
  }

  return extractedItems;
}

// Resolves a submitted field value from JSON payloads, grouped items, or raw form keys.
function getSubmittedField({
  body,
  submittedItems,
  payloadItem,
  itemId,
  fieldName
}) {
  if (payloadItem && payloadItem[fieldName] !== undefined) {
    return payloadItem[fieldName];
  }

  const submittedItem = submittedItems[String(itemId)];
  if (submittedItem && submittedItem[fieldName] !== undefined) {
    return submittedItem[fieldName];
  }

  const literalKey = `items[${itemId}][${fieldName}]`;
  if (body && body[literalKey] !== undefined) {
    return body[literalKey];
  }

  return undefined;
}

// Detects whether the incoming request body was sent as JSON.
function isJsonRequest(req) {
  return String(req.get("content-type") || "").includes("application/json");
}

// Detects whether the caller expects a JSON response instead of a redirect.
function wantsJsonResponse(req) {
  return (
    req.xhr || String(req.get("accept") || "").includes("application/json")
  );
}

// Formats singular or plural labels based on a numeric count.
function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// Converts adjustment mode keys into user-friendly labels.
function getAdjustmentLabel(adjustmentType) {
  const labels = {
    quantity: "OH qty",
    min_max: "min/max qty",
    cost: "cost",
    price: "price",
    category: "category"
  };

  return labels[adjustmentType] || "selected field";
}

// Parses a non-negative decimal number and returns null for invalid values.
function parseNonNegativeDecimal(value) {
  const normalized = normalizeDecimalInput(value);

  if (normalized === "") {
    return null;
  }

  const parsedValue = Number(normalized);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null;
  }

  return parsedValue;
}

// Escapes CSV cell content and quotes values that need it.
function toCsvCell(value) {
  const normalized = String(value ?? "");
  if (!/[",\r\n]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
}

// Escapes XML entities for the Excel-compatible inventory export.
function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Builds a safe timestamp suffix for downloaded export filenames.
function getExportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// Converts inventory rows into CSV text.
function buildInventoryCsv(items) {
  const headers = [
    "Item Number",
    "Name",
    "Category",
    "Cost",
    "Price",
    "Qty",
    "Min Qty",
    "Max Qty",
    "Created At"
  ];
  const rows = items.map((item) => [
    item.barcode,
    item.name,
    item.category_name || "No Category",
    Number(item.cost || 0).toFixed(2),
    Number(item.price || 0).toFixed(2),
    item.quantity,
    item.min_quantity,
    item.max_quantity,
    item.created_at ? new Date(item.created_at).toISOString() : ""
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\r\n");
}

// Converts inventory rows into Excel 2003 XML that opens as .xls in spreadsheet apps.
function buildInventoryXls(items) {
  const headers = [
    "Item Number",
    "Name",
    "Category",
    "Cost",
    "Price",
    "OH Qty",
    "Min Qty",
    "Max Qty",
    "Created At"
  ];
  const rows = items.map((item) => [
    item.barcode,
    item.name,
    item.category_name || "No Category",
    Number(item.cost || 0).toFixed(2),
    Number(item.price || 0).toFixed(2),
    item.quantity,
    item.min_quantity,
    item.max_quantity,
    item.created_at ? new Date(item.created_at).toISOString() : ""
  ]);
  const xmlRows = [headers, ...rows]
    .map((row) => {
      const cells = row
        .map(
          (cell) =>
            `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`
        )
        .join("");

      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Inventory">
  <Table>${xmlRows}</Table>
 </Worksheet>
</Workbook>`;
}

// Sends a shared success or error result for bulk adjustment submissions.
function respondAdjustmentResult(req, res, type, message) {
  flash(req, { type, message });

  if (isJsonRequest(req) || wantsJsonResponse(req)) {
    return res.status(type === "success" ? 200 : 400).json({
      ok: type === "success",
      redirectUrl: "/inventory/adjustments"
    });
  }

  return res.redirect("/inventory/adjustments");
}

// Loads the inventory dashboard with paginated items and category list.
router.get(
  "/inventory",
  requirePermission("inventory.view"),
  async (req, res) => {
    const search = String(req.query.search || "").trim();
    const searchWildcard = search ? `%${search}%` : null;
    const categoryFilter = req.query.category
      ? Number(req.query.category)
      : null;
    const sort = String(req.query.sort || "newest");
    const isAjax =
      req.xhr || String(req.get("accept") || "").includes("application/json");

    const validSorts = {
      name_asc: "a.name ASC",
      name_desc: "a.name DESC",
      barcode_asc: "a.barcode ASC",
      barcode_desc: "a.barcode DESC",
      price_asc: "a.price ASC",
      price_desc: "a.price DESC",
      newest: "a.id DESC",
      oldest: "a.id ASC"
    };
    const orderBy = buildSortClause(sort, validSorts, "a.id DESC");

    const conditions = ["a.archived_at IS NULL"];
    const params = [];

    if (searchWildcard) {
      conditions.push(
        "(a.name LIKE ? OR a.barcode LIKE ? OR COALESCE(b.category_name, 'No Category') LIKE ?)"
      );
      params.push(searchWildcard, searchWildcard, searchWildcard);
    }
    if (categoryFilter) {
      conditions.push("a.category_id = ?");
      params.push(categoryFilter);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    try {
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       ${whereClause}`,
        params
      );

      const pagination = buildPagination(req.query, total);

      const [items] = await pool.query(
        `SELECT a.*, b.category_name, c.username AS created_by_username, d.username AS updated_by_username
       FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       LEFT JOIN users c ON a.created_by = c.id
       LEFT JOIN users d ON a.updated_by = d.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
        [...params, pagination.perPage, pagination.offset]
      );

      if (isAjax) {
        return res.json({
          ok: true,
          items,
          pagination,
          paginationHtml: buildPaginationHtml(
            pagination,
            "/inventory",
            search,
            { category: categoryFilter || "", sort }
          )
        });
      }

      const [categories] = await pool.query(
        `SELECT a.*, b.username AS created_by_username
       FROM categories a
       LEFT JOIN users b ON a.created_by = b.id
       ORDER BY a.category_name ASC`
      );
      const [archivedItems] = await pool.query(
        `SELECT a.*, b.category_name, c.username AS created_by_username, d.username AS updated_by_username
       FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       LEFT JOIN users c ON a.created_by = c.id
       LEFT JOIN users d ON a.updated_by = d.id
       WHERE a.archived_at IS NOT NULL
       ORDER BY a.archived_at DESC, a.id DESC`
      );

      return res.render("dashboard/inventory", {
        title: "Inventory",
        categories,
        items,
        archivedItems,
        pagination,
        search,
        selectedCategory: categoryFilter || "",
        selectedSort: sort
      });
    } catch (error) {
      console.error("Failed to load inventory:", error);
      flash(req, { type: "error", message: "Unable to load inventory." });

      if (isAjax) {
        return res
          .status(500)
          .json({ ok: false, message: "Unable to load inventory." });
      }

      return res.render("dashboard/inventory", {
        title: "Inventory",
        categories: [],
        items: [],
        archivedItems: [],
        pagination: buildPagination({}, 0),
        search: "",
        selectedCategory: "",
        selectedSort: "newest"
      });
    }
  }
);

// Downloads the inventory list in CSV or Excel-compatible XLS format.
router.get(
  "/inventory/export",
  requirePermission("inventory.export"),
  async (req, res) => {
    const format = String(req.query.format || "csv")
      .trim()
      .toLowerCase();
    const search = String(req.query.search || "").trim();
    const searchWildcard = search ? `%${search}%` : null;
    const categoryFilter = req.query.category
      ? Number(req.query.category)
      : null;
    const sort = String(req.query.sort || "newest");

    if (!["csv", "xls"].includes(format)) {
      flash(req, { type: "error", message: "Choose CSV or XLS for export." });
      return res.redirect("/inventory");
    }

    const validSorts = {
      name_asc: "a.name ASC",
      name_desc: "a.name DESC",
      barcode_asc: "a.barcode ASC",
      barcode_desc: "a.barcode DESC",
      price_asc: "a.price ASC",
      price_desc: "a.price DESC",
      newest: "a.id DESC",
      oldest: "a.id ASC"
    };
    const orderBy = buildSortClause(sort, validSorts, "a.id DESC");

    const conditions = ["a.archived_at IS NULL"];
    const params = [];

    if (searchWildcard) {
      conditions.push(
        "(a.name LIKE ? OR a.barcode LIKE ? OR COALESCE(b.category_name, 'No Category') LIKE ?)"
      );
      params.push(searchWildcard, searchWildcard, searchWildcard);
    }
    if (categoryFilter) {
      conditions.push("a.category_id = ?");
      params.push(categoryFilter);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    try {
      const [items] = await pool.query(
        `SELECT a.id, a.barcode, a.name, a.cost, a.price, a.quantity, a.min_quantity, a.max_quantity, a.created_at, b.category_name
       FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       ${whereClause}
       ORDER BY ${orderBy}`,
        params
      );

      const timestamp = getExportTimestamp();

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "inventory_exported",
        entityType: "inventory_export",
        entityId: format,
        description: `${req.session.user?.username || "Admin"} exported inventory as ${format.toUpperCase()}.`,
        metadata: {
          format,
          item_count: items.length,
          search: search || null,
          category: categoryFilter || null,
          sort
        }
      });

      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="inventory-${timestamp}.csv"`
        );
        return res.send(`\uFEFF${buildInventoryCsv(items)}`);
      }

      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="inventory-${timestamp}.xls"`
      );
      return res.send(buildInventoryXls(items));
    } catch (error) {
      console.error("Failed to export inventory:", error);
      flash(req, {
        type: "error",
        message: "Unable to export inventory right now."
      });
      return res.redirect("/inventory");
    }
  }
);

// Checks whether an item number is already present before the add-item form is submitted.
router.get(
  "/inventory/items/verify",
  requirePermission("inventory.create"),
  async (req, res) => {
    const barcode = normalizeBarcode(req.query.barcode);

    if (!barcode) {
      return res.status(400).json({
        ok: false,
        exists: false,
        message: "Enter an item number first."
      });
    }

    try {
      const [rows] = await pool.query(
        `SELECT a.id, a.barcode, a.name, b.category_name
       FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       WHERE a.barcode = ?
       LIMIT 1`,
        [barcode]
      );
      const item = rows[0] || null;

      return res.json({
        ok: true,
        exists: Boolean(item),
        message: item
          ? `Item number already exists for ${item.name}.`
          : "Item number is available.",
        item
      });
    } catch (error) {
      console.error("Failed to verify item number:", error);
      return res.status(500).json({
        ok: false,
        exists: false,
        message: "Unable to verify item number right now."
      });
    }
  }
);

// Loads the price lookup page with paginated items.
router.get(
  "/price-lookup",
  requirePermission("price_lookup.view"),
  async (req, res) => {
    const search = String(req.query.search || "").trim();
    const searchWildcard = search ? `%${search}%` : null;
    const sort = String(req.query.sort || "newest");
    const isAjax =
      req.xhr || String(req.get("accept") || "").includes("application/json");

    const validSorts = {
      name_asc: "name ASC",
      name_desc: "name DESC",
      barcode_asc: "barcode ASC",
      barcode_desc: "barcode DESC",
      price_asc: "price ASC",
      price_desc: "price DESC",
      newest: "id DESC",
      oldest: "id ASC"
    };
    const orderBy = buildSortClause(sort, validSorts, "id DESC");

    const conditions = ["archived_at IS NULL"];
    const params = [];

    if (searchWildcard) {
      conditions.push("(name LIKE ? OR barcode LIKE ?)");
      params.push(searchWildcard, searchWildcard);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    try {
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM items ${whereClause}`,
        params
      );

      const pagination = buildPagination(req.query, total);

      const [items] = await pool.query(
        `SELECT id, barcode, name, price FROM items
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
        searchWildcard
          ? [
              searchWildcard,
              searchWildcard,
              pagination.perPage,
              pagination.offset
            ]
          : [pagination.perPage, pagination.offset]
      );

      if (isAjax) {
        return res.json({
          ok: true,
          items,
          pagination,
          paginationHtml: buildPaginationHtml(
            pagination,
            "/price-lookup",
            search,
            { sort }
          )
        });
      }

      return res.render("dashboard/price-lookup", {
        title: "Price Lookup",
        items,
        pagination,
        search,
        selectedSort: sort
      });
    } catch (error) {
      console.error("Failed to load price lookup page:", error);
      flash(req, { type: "error", message: "Unable to load price lookup." });

      if (isAjax) {
        return res
          .status(500)
          .json({ ok: false, message: "Unable to load price lookup." });
      }

      return res.render("dashboard/price-lookup", {
        title: "Price Lookup",
        items: [],
        pagination: buildPagination({}, 0),
        search: "",
        selectedSort: "newest"
      });
    }
  }
);

// Loads the bulk adjustments page where a single field can be updated for many items.
router.get(
  "/inventory/adjustments",
  requirePermission("inventory.adjust"),
  async (req, res) => {
    try {
      const [categories] = await pool.query(
        "SELECT * FROM categories ORDER BY category_name ASC"
      );
      const [items] = await pool.query(
        `SELECT a.*, b.category_name
       FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       WHERE a.archived_at IS NULL
       ORDER BY a.id DESC`
      );

      return res.render("dashboard/adjustments", {
        title: "Adjustments",
        categories,
        items
      });
    } catch (error) {
      console.error("Failed to load adjustments page:", error);
      flash(req, { type: "error", message: "Unable to load adjustments." });
      return res.render("dashboard/adjustments", {
        title: "Adjustments",
        categories: [],
        items: []
      });
    }
  }
);

// Loads the global history page with paginated items.
router.get("/history", requirePermission("history.view"), async (req, res) => {
  const search = String(req.query.search || "").trim();
  const searchWildcard = search ? `%${search}%` : null;
  const sort = String(req.query.sort || "newest");
  const isAjax =
    req.xhr || String(req.get("accept") || "").includes("application/json");

  const validSorts = {
    name_asc: "a.name ASC",
    name_desc: "a.name DESC",
    barcode_asc: "a.barcode ASC",
    barcode_desc: "a.barcode DESC",
    newest: "a.id DESC",
    oldest: "a.id ASC"
  };
  const orderBy = buildSortClause(sort, validSorts, "a.id DESC");

  const conditions = ["a.archived_at IS NULL"];
  const params = [];

  if (searchWildcard) {
    conditions.push(
      "(a.name LIKE ? OR a.barcode LIKE ? OR COALESCE(b.category_name, 'No Category') LIKE ?)"
    );
    params.push(searchWildcard, searchWildcard, searchWildcard);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       ${whereClause}`,
      params
    );

    const pagination = buildPagination(req.query, total);

    const [items] = await pool.query(
      `SELECT a.*, b.category_name
       FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, pagination.perPage, pagination.offset]
    );

    if (isAjax) {
      return res.json({
        ok: true,
        items,
        pagination,
        paginationHtml: buildPaginationHtml(pagination, "/history", search, {
          sort
        })
      });
    }

    return res.render("dashboard/history", {
      title: "History",
      items,
      pagination,
      search,
      selectedSort: sort
    });
  } catch (error) {
    console.error("Failed to load history page:", error);
    flash(req, { type: "error", message: "Unable to load history." });

    if (isAjax) {
      return res
        .status(500)
        .json({ ok: false, message: "Unable to load history." });
    }

    return res.render("dashboard/history", {
      title: "History",
      items: [],
      pagination: buildPagination({}, 0),
      search: "",
      selectedSort: "newest"
    });
  }
});

router.get(
  "/price-lookup",
  requirePermission("price_lookup.view"),
  async (req, res) => {
    const search = String(req.query.search || "").trim();
    const searchWildcard = search ? `%${search}%` : null;
    const sort = String(req.query.sort || "newest");
    const isAjax =
      req.xhr || String(req.get("accept") || "").includes("application/json");

    const validSorts = {
      name_asc: "name ASC",
      name_desc: "name DESC",
      barcode_asc: "barcode ASC",
      barcode_desc: "barcode DESC",
      price_asc: "price ASC",
      price_desc: "price DESC",
      newest: "id DESC",
      oldest: "id ASC"
    };
    const orderBy = buildSortClause(sort, validSorts, "id DESC");

    const conditions = ["archived_at IS NULL"];
    const params = [];

    if (searchWildcard) {
      conditions.push("(name LIKE ? OR barcode LIKE ?)");
      params.push(searchWildcard, searchWildcard);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    try {
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM items ${whereClause}`,
        params
      );

      const pagination = buildPagination(req.query, total);

      const [items] = await pool.query(
        `SELECT id, barcode, name, price FROM items
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
        [...params, pagination.perPage, pagination.offset]
      );

      if (isAjax) {
        return res.json({
          ok: true,
          items,
          pagination,
          paginationHtml: buildPaginationHtml(
            pagination,
            "/price-lookup",
            search,
            { sort }
          )
        });
      }

      return res.render("dashboard/price-lookup", {
        title: "Price Lookup",
        items,
        pagination,
        search,
        selectedSort: sort
      });
    } catch (error) {
      console.error("Failed to load price lookup page:", error);
      flash(req, { type: "error", message: "Unable to load price lookup." });

      if (isAjax) {
        return res
          .status(500)
          .json({ ok: false, message: "Unable to load price lookup." });
      }

      return res.render("dashboard/price-lookup", {
        title: "Price Lookup",
        items: [],
        pagination: buildPagination({}, 0),
        search: "",
        selectedSort: "newest"
      });
    }
  }
);

// Creates a new inventory item and preserves form state on validation errors.
router.post(
  "/inventory/items",
  requirePermission("inventory.create"),
  async (req, res) => {
    const createdByUserId = Number(req.session.user?.id) || null;
    const barcode = normalizeBarcode(req.body.barcode);
    const name = toUppercaseText(req.body.name);
    const cost = normalizeDecimalInput(req.body.cost);
    const price = normalizeDecimalInput(req.body.price);
    const quantity = parseWholeNumber(req.body.quantity);
    const minQuantity = parseWholeNumber(req.body.min_quantity);
    const maxQuantity = parseWholeNumber(req.body.max_quantity);
    const categoryId = req.body.category_id
      ? Number(req.body.category_id)
      : null;
    const jsonResponse = wantsJsonResponse(req);

    if (!barcode || !name || !cost || !price) {
      if (jsonResponse) {
        return res.status(400).json({
          ok: false,
          message: "Item number, name, cost, and price are required."
        });
      }

      flash(req, {
        type: "error",
        message: "Item number, name, cost, and price are required."
      });
      return res.redirect("/inventory");
    }

    if (quantity === null || minQuantity === null || maxQuantity === null) {
      if (jsonResponse) {
        return res.status(400).json({
          ok: false,
          message:
            "Quantity, minimum quantity, and maximum quantity must be whole numbers 0 or higher."
        });
      }

      flash(req, {
        type: "error",
        message:
          "Quantity, minimum quantity, and maximum quantity must be whole numbers 0 or higher."
      });
      return res.redirect("/inventory");
    }

    const parsedCost = parseNonNegativeDecimal(cost);
    const parsedPrice = parseNonNegativeDecimal(price);

    if (parsedCost === null || parsedPrice === null) {
      if (jsonResponse) {
        return res.status(400).json({
          ok: false,
          message: "Cost and price must be valid numbers 0 or higher."
        });
      }

      flash(req, {
        type: "error",
        message: "Cost and price must be valid numbers 0 or higher."
      });
      return res.redirect("/inventory");
    }

    if (maxQuantity < minQuantity) {
      if (jsonResponse) {
        return res.status(400).json({
          ok: false,
          message:
            "Maximum quantity must be greater than or equal to minimum quantity."
        });
      }

      flash(req, {
        type: "error",
        message:
          "Maximum quantity must be greater than or equal to minimum quantity."
      });
      return res.redirect("/inventory");
    }

    try {
      const [existing] = await pool.query(
        "SELECT COUNT(*) AS count FROM items WHERE barcode = ?",
        [barcode]
      );

      if (existing[0].count > 0) {
        if (jsonResponse) {
          return res.status(400).json({
            ok: false,
            message: "Item number already exists."
          });
        }

        flash(req, { type: "error", message: "Item number already exists." });
        return res.redirect("/inventory");
      }

      const [insertResult] = await pool.query(
        `INSERT INTO items (barcode, name, cost, price, quantity, min_quantity, max_quantity, category_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          barcode,
          name,
          parsedCost,
          parsedPrice,
          quantity,
          minQuantity,
          maxQuantity,
          categoryId,
          createdByUserId
        ]
      );

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "item_created",
        entityType: "item",
        entityId: insertResult.insertId,
        description: `${req.session.user?.username || "Admin"} added item ${name}.`,
        metadata: {
          barcode,
          name,
          quantity,
          category_id: categoryId
        }
      });

      if (jsonResponse) {
        const [rows] = await pool.query(
          `SELECT a.*, b.category_name, c.username AS created_by_username, d.username AS updated_by_username
         FROM items a
         LEFT JOIN categories b ON a.category_id = b.id
         LEFT JOIN users c ON a.created_by = c.id
         LEFT JOIN users d ON a.updated_by = d.id
         WHERE a.id = ?
         LIMIT 1`,
          [insertResult.insertId]
        );

        return res.status(201).json({
          ok: true,
          message: `Item ${name} added successfully.`,
          item: rows[0] || null
        });
      }

      flash(req, {
        type: "success",
        message: `Item ${name} added successfully.`
      });
      return res.redirect("/inventory");
    } catch (error) {
      console.error("Failed to save item:", error);

      if (jsonResponse) {
        return res.status(500).json({
          ok: false,
          message: "Unable to save item right now."
        });
      }

      flash(req, { type: "error", message: "Unable to save item right now." });
      return res.redirect("/inventory");
    }
  }
);

// Updates an existing inventory item after validating the submitted values.
router.post(
  "/inventory/items/:id",
  requirePermission("inventory.adjust"),
  async (req, res) => {
    flash(req, {
      type: "error",
      message:
        "Item details are read-only here. Use the Adjustments page to update inventory fields."
    });
    return res.redirect(`/inventory/items/${Number(req.params.id) || ""}`);
  }
);

// Archives an item so it is hidden from active inventory screens without deleting history.
router.post(
  "/inventory/items/:id/archive",
  requirePermission("inventory.archive_restore"),
  async (req, res) => {
    const updatedByUserId = Number(req.session.user?.id) || null;
    const id = Number(req.params.id);

    if (!id) {
      flash(req, { type: "error", message: "Item not found." });
      return res.redirect("/inventory");
    }

    try {
      const [rows] = await pool.query(
        "SELECT id, name, archived_at FROM items WHERE id = ? LIMIT 1",
        [id]
      );
      const item = rows[0];

      if (!item) {
        flash(req, { type: "error", message: "Item not found." });
        return res.redirect("/inventory");
      }

      if (item.archived_at) {
        flash(req, {
          type: "error",
          message: `Item ${item.name} is already archived.`
        });
        return res.redirect("/inventory");
      }

      await pool.query(
        "UPDATE items SET archived_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?",
        [updatedByUserId, id]
      );

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "item_archived",
        entityType: "item",
        entityId: id,
        description: `${req.session.user?.username || "Admin"} archived item ${item.name}.`,
        metadata: {
          item_name: item.name
        }
      });

      flash(req, {
        type: "success",
        message: `Item ${item.name} archived successfully.`
      });
      return res.redirect("/inventory");
    } catch (error) {
      console.error("Failed to archive item:", error);
      flash(req, {
        type: "error",
        message: "Unable to archive item right now."
      });
      return res.redirect("/inventory");
    }
  }
);

// Restores an archived item back into active inventory screens.
router.post(
  "/inventory/items/:id/restore",
  requirePermission("inventory.archive_restore"),
  async (req, res) => {
    const updatedByUserId = Number(req.session.user?.id) || null;
    const id = Number(req.params.id);

    if (!id) {
      flash(req, { type: "error", message: "Item not found." });
      return res.redirect("/inventory");
    }

    try {
      const [rows] = await pool.query(
        "SELECT id, name, archived_at FROM items WHERE id = ? LIMIT 1",
        [id]
      );
      const item = rows[0];

      if (!item) {
        flash(req, { type: "error", message: "Item not found." });
        return res.redirect("/inventory");
      }

      if (!item.archived_at) {
        flash(req, {
          type: "error",
          message: `Item ${item.name} is already active.`
        });
        return res.redirect("/inventory");
      }

      await pool.query(
        "UPDATE items SET archived_at = NULL, updated_by = ? WHERE id = ?",
        [updatedByUserId, id]
      );

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "item_restored",
        entityType: "item",
        entityId: id,
        description: `${req.session.user?.username || "Admin"} restored item ${item.name}.`,
        metadata: {
          item_name: item.name
        }
      });

      flash(req, {
        type: "success",
        message: `Item ${item.name} restored successfully.`
      });
      return res.redirect("/inventory");
    } catch (error) {
      console.error("Failed to restore item:", error);
      flash(req, {
        type: "error",
        message: "Unable to restore item right now."
      });
      return res.redirect("/inventory");
    }
  }
);

// Creates a new category directly from the inventory page modal.
router.post(
  "/inventory/categories",
  requirePermission("inventory.create"),
  async (req, res) => {
    const createdByUserId = Number(req.session.user?.id) || null;
    const categoryName = toUppercaseText(req.body.category_name);
    const jsonResponse = wantsJsonResponse(req);

    if (!categoryName) {
      if (jsonResponse) {
        return res.status(400).json({
          ok: false,
          message: "Category name is required."
        });
      }

      flash(req, { type: "error", message: "Category name is required." });
      return res.redirect("/inventory");
    }

    try {
      const [existing] = await pool.query(
        "SELECT id FROM categories WHERE category_name = ? LIMIT 1",
        [categoryName]
      );

      if (existing.length) {
        if (jsonResponse) {
          return res.status(400).json({
            ok: false,
            message: "Category already exists."
          });
        }

        flash(req, { type: "error", message: "Category already exists." });
        return res.redirect("/inventory");
      }

      const [insertResult] = await pool.query(
        "INSERT INTO categories (category_name, created_by) VALUES (?, ?)",
        [categoryName, createdByUserId]
      );

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "category_created",
        entityType: "category",
        entityId: insertResult.insertId,
        description: `${req.session.user?.username || "Admin"} added category ${categoryName}.`,
        metadata: {
          category_name: categoryName
        }
      });

      if (jsonResponse) {
        return res.status(201).json({
          ok: true,
          message: `Category ${categoryName} saved successfully.`,
          category: {
            id: insertResult.insertId,
            category_name: categoryName,
            created_by_username: req.session.user?.username || ""
          }
        });
      }

      flash(req, {
        type: "success",
        message: `Category ${categoryName} saved successfully.`
      });
      return res.redirect("/inventory");
    } catch (error) {
      console.error("Failed to save category:", error);

      if (jsonResponse) {
        return res.status(500).json({
          ok: false,
          message: "Unable to save category right now."
        });
      }

      flash(req, {
        type: "error",
        message: "Unable to save category right now."
      });
      return res.redirect("/inventory");
    }
  }
);

// Redirects the old standalone item details page to inventory where details now open in a modal.
router.get(
  "/inventory/items/:id",
  requirePermission("inventory.view"),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!id) {
      flash(req, { type: "error", message: "Item not found." });
      return res.redirect("/inventory");
    }

    flash(req, {
      type: "success",
      message: "Item details now open from the Inventory page modal."
    });
    return res.redirect("/inventory");
  }
);

// Loads the history hub page for a single inventory item.
router.get(
  "/inventory/items/:id/history",
  requirePermission("history.view"),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!id) {
      flash(req, { type: "error", message: "Item not found." });
      return res.redirect("/inventory");
    }

    try {
      const [rows] = await pool.query(
        `SELECT a.*, b.category_name
       FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       WHERE a.id = ?
       LIMIT 1`,
        [id]
      );
      const item = rows[0];

      if (!item) {
        flash(req, { type: "error", message: "Item not found." });
        return res.redirect("/inventory");
      }

      return res.render("dashboard/item-history", {
        title: "History",
        item
      });
    } catch (error) {
      console.error("Failed to load item history hub:", error);
      flash(req, { type: "error", message: "Unable to load item history." });
      return res.redirect("/inventory");
    }
  }
);

// Loads the cost adjustment page and historical cost changes for one item.
router.get(
  "/inventory/items/:id/cost",
  requireAnyPermission(["history.view", "inventory.adjust"]),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!id) {
      return res.redirect("/inventory");
    }

    try {
      const itemPromise = pool.query(
        "SELECT * FROM items WHERE id = ? LIMIT 1",
        [id]
      );
      const historyPromise = pool.query(
        `SELECT a.*, b.username AS adjusted_by_username
       FROM cost_adjustments a
       LEFT JOIN users b ON a.adjusted_by = b.id
       WHERE a.item_id = ?
       ORDER BY a.adjusted_at DESC`,
        [id]
      );
      const [itemResult, historyResult] = await Promise.all([
        itemPromise,
        historyPromise
      ]);
      const item = itemResult[0][0];
      const historyList = historyResult[0];

      if (!item) {
        flash(req, { type: "error", message: "Item not found." });
        return res.redirect("/inventory");
      }

      return res.render("dashboard/adjust-cost", {
        title: "Adjust Cost",
        item,
        historyList
      });
    } catch (error) {
      console.error("Failed to load cost adjustment page:", error);
      flash(req, { type: "error", message: "Unable to load cost history." });
      return res.redirect("/inventory");
    }
  }
);

// Loads the quantity adjustment history page for one item.
router.get(
  "/inventory/items/:id/quantity",
  requireAnyPermission(["history.view", "inventory.adjust"]),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!id) {
      return res.redirect("/inventory");
    }

    try {
      const itemPromise = pool.query(
        "SELECT * FROM items WHERE id = ? LIMIT 1",
        [id]
      );
      const historyPromise = pool.query(
        `SELECT b.*, a.username AS adjusted_by_username
       FROM qty_adjustments b
       LEFT JOIN users a ON b.adjusted_by = a.id
       WHERE b.item_id = ?
       ORDER BY b.adjusted_at DESC`,
        [id]
      );
      const [itemResult, historyResult] = await Promise.all([
        itemPromise,
        historyPromise
      ]);
      const item = itemResult[0][0];
      const historyList = historyResult[0];

      if (!item) {
        flash(req, { type: "error", message: "Item not found." });
        return res.redirect("/inventory");
      }

      return res.render("dashboard/adjust-quantity", {
        title: "OH Qty History",
        item,
        historyList
      });
    } catch (error) {
      console.error("Failed to load quantity adjustment page:", error);
      flash(req, { type: "error", message: "Unable to load OH qty history." });
      return res.redirect("/inventory");
    }
  }
);

// Loads the min/max quantity adjustment history page for one item.
router.get(
  "/inventory/items/:id/min-max",
  requireAnyPermission(["history.view", "inventory.adjust"]),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!id) {
      return res.redirect("/inventory");
    }

    try {
      const itemPromise = pool.query(
        "SELECT * FROM items WHERE id = ? LIMIT 1",
        [id]
      );
      const historyPromise = pool.query(
        `SELECT a.*, b.username AS adjusted_by_username
       FROM min_max_adjustments a
       LEFT JOIN users b ON a.adjusted_by = b.id
       WHERE a.item_id = ?
       ORDER BY a.adjusted_at DESC`,
        [id]
      );
      const [itemResult, historyResult] = await Promise.all([
        itemPromise,
        historyPromise
      ]);
      const item = itemResult[0][0];
      const historyList = historyResult[0];

      if (!item) {
        flash(req, { type: "error", message: "Item not found." });
        return res.redirect("/inventory");
      }

      return res.render("dashboard/adjust-min-max", {
        title: "Min/Max Qty History",
        item,
        historyList
      });
    } catch (error) {
      console.error("Failed to load min/max adjustment page:", error);
      flash(req, {
        type: "error",
        message: "Unable to load min/max qty history."
      });
      return res.redirect("/inventory");
    }
  }
);

// Loads the category adjustment history page for one item.
router.get(
  "/inventory/items/:id/category",
  requireAnyPermission(["history.view", "inventory.adjust"]),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!id) {
      return res.redirect("/inventory");
    }

    try {
      const itemPromise = pool.query(
        `SELECT a.*, b.category_name
       FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       WHERE a.id = ? LIMIT 1`,
        [id]
      );
      const historyPromise = pool.query(
        `SELECT a.*,
              b.category_name AS old_category_name,
              c.category_name AS new_category_name,
              d.username AS adjusted_by_username
       FROM category_adjustments a
       LEFT JOIN categories AS b ON a.old_category_id = b.id
       LEFT JOIN categories AS c ON a.new_category_id = c.id
       LEFT JOIN users d ON a.adjusted_by = d.id
       WHERE a.item_id = ?
       ORDER BY a.adjusted_at DESC`,
        [id]
      );
      const [itemResult, historyResult] = await Promise.all([
        itemPromise,
        historyPromise
      ]);
      const item = itemResult[0][0];
      const historyList = historyResult[0];

      if (!item) {
        flash(req, { type: "error", message: "Item not found." });
        return res.redirect("/inventory");
      }

      return res.render("dashboard/adjust-category", {
        title: "Category History",
        item,
        historyList
      });
    } catch (error) {
      console.error("Failed to load category adjustment page:", error);
      flash(req, {
        type: "error",
        message: "Unable to load category history."
      });
      return res.redirect("/inventory");
    }
  }
);

// Saves a new item cost and records the cost change history.
router.post(
  "/inventory/items/:id/cost",
  requirePermission("inventory.adjust"),
  async (req, res) => {
    flash(req, {
      type: "error",
      message:
        "Cost history is read-only. Use the Adjustments page to update item cost."
    });
    return res.redirect(`/inventory/items/${Number(req.params.id) || ""}/cost`);
  }
);

// Loads the price adjustment page and historical price changes for one item.
router.get(
  "/inventory/items/:id/price",
  requireAnyPermission(["history.view", "inventory.adjust"]),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!id) {
      return res.redirect("/inventory");
    }

    try {
      const itemPromise = pool.query(
        "SELECT * FROM items WHERE id = ? LIMIT 1",
        [id]
      );
      const historyPromise = pool.query(
        `SELECT a.*, b.username AS adjusted_by_username
       FROM price_adjustments a
       LEFT JOIN users b ON a.adjusted_by = b.id
       WHERE a.item_id = ?
       ORDER BY a.adjusted_at DESC`,
        [id]
      );
      const [itemResult, historyResult] = await Promise.all([
        itemPromise,
        historyPromise
      ]);
      const item = itemResult[0][0];
      const historyList = historyResult[0];

      if (!item) {
        flash(req, { type: "error", message: "Item not found." });
        return res.redirect("/inventory");
      }

      return res.render("dashboard/adjust-price", {
        title: "Adjust Price",
        item,
        historyList
      });
    } catch (error) {
      console.error("Failed to load price adjustment page:", error);
      flash(req, { type: "error", message: "Unable to load price history." });
      return res.redirect("/inventory");
    }
  }
);

// Saves a new item price and records the price change history.
router.post(
  "/inventory/items/:id/price",
  requirePermission("inventory.adjust"),
  async (req, res) => {
    flash(req, {
      type: "error",
      message:
        "Price history is read-only. Use the Adjustments page to update item price."
    });
    return res.redirect(
      `/inventory/items/${Number(req.params.id) || ""}/price`
    );
  }
);

// Saves one type of adjustment for all checked items in a single transaction.
router.post(
  "/inventory/adjustments",
  requirePermission("inventory.adjust"),
  async (req, res) => {
    const jsonRequest = isJsonRequest(req);
    const jsonResponse = jsonRequest || wantsJsonResponse(req);
    const adjustedByUserId = Number(req.session.user?.id) || null;
    let adjustmentType = "";
    let payloadRows = [];
    let adjustmentNote = "";

    if (jsonRequest) {
      adjustmentType = String(req.body.adjustmentType || "").trim();
      adjustmentNote = normalizeText(req.body.adjustmentNote);
      payloadRows = Array.isArray(req.body.adjustments)
        ? req.body.adjustments
        : [];
    } else if (req.body.adjustments_json) {
      try {
        const parsed = JSON.parse(req.body.adjustments_json);
        adjustmentType = String(
          parsed?.adjustmentType || req.body.adjustment_type || ""
        ).trim();
        adjustmentNote = normalizeText(
          parsed?.adjustmentNote || req.body.adjustment_note
        );
        payloadRows = Array.isArray(parsed?.adjustments)
          ? parsed.adjustments
          : [];
      } catch (error) {
        return respondAdjustmentResult(
          req,
          res,
          "error",
          "Unable to read the submitted adjustment data."
        );
      }
    } else {
      adjustmentType = String(req.body.adjustment_type || "").trim();
      adjustmentNote = normalizeText(req.body.adjustment_note);
    }

    const selectedIds = Array.isArray(req.body.selected_item_ids)
      ? req.body.selected_item_ids
      : req.body.selected_item_ids
        ? [req.body.selected_item_ids]
        : [];
    const parsedIds = selectedIds
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    const payloadIds = payloadRows
      .map((row) => Number(row?.item_id))
      .filter((value) => Number.isInteger(value) && value > 0);
    const uniqueIds = [...new Set(payloadIds.length ? payloadIds : parsedIds)];
    const submittedItems = jsonResponse ? {} : extractSubmittedItems(req.body);
    const validTypes = new Set([
      "quantity",
      "min_max",
      "cost",
      "price",
      "category"
    ]);

    if (!validTypes.has(adjustmentType)) {
      return respondAdjustmentResult(
        req,
        res,
        "error",
        "Select a valid adjustment type."
      );
    }

    if (!uniqueIds.length) {
      return respondAdjustmentResult(
        req,
        res,
        "error",
        "Select at least one item to update."
      );
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [categoryRows] = await connection.query(
        "SELECT id FROM categories"
      );
      const validCategoryIds = new Set(
        categoryRows.map((category) => Number(category.id))
      );

      const [rows] = await connection.query(
        `SELECT id, quantity, min_quantity, max_quantity, cost, price, category_id
       FROM items
       WHERE archived_at IS NULL
         AND id IN (?)
      `,
        [uniqueIds]
      );
      const itemsById = new Map(rows.map((item) => [item.id, item]));

      if (itemsById.size !== uniqueIds.length) {
        throw new Error("One or more selected items could not be found.");
      }

      for (const itemId of uniqueIds) {
        const currentItem = itemsById.get(itemId);
        const payloadItem =
          payloadRows.find((row) => Number(row?.item_id) === itemId) || null;

        if (adjustmentType === "quantity") {
          const quantity = parseWholeNumber(
            getSubmittedField({
              body: req.body,
              submittedItems,
              payloadItem,
              itemId,
              fieldName: "quantity"
            })
          );

          if (quantity === null) {
            throw new Error(
              "All selected OH qty values must be whole numbers 0 or higher."
            );
          }

          if (Number(currentItem.quantity) !== quantity) {
            await connection.query(
              "UPDATE items SET quantity = ?, updated_by = ? WHERE id = ?",
              [quantity, adjustedByUserId, itemId]
            );

            await connection.query(
              "INSERT INTO qty_adjustments (item_id, old_quantity, new_quantity, adjustment_note, adjusted_by) VALUES (?, ?, ?, ?, ?)",
              [
                itemId,
                currentItem.quantity,
                quantity,
                adjustmentNote || null,
                adjustedByUserId
              ]
            );
          }
        }

        if (adjustmentType === "min_max") {
          const minQuantity = parseWholeNumber(
            getSubmittedField({
              body: req.body,
              submittedItems,
              payloadItem,
              itemId,
              fieldName: "min_quantity"
            })
          );
          const maxQuantity = parseWholeNumber(
            getSubmittedField({
              body: req.body,
              submittedItems,
              payloadItem,
              itemId,
              fieldName: "max_quantity"
            })
          );

          if (minQuantity === null || maxQuantity === null) {
            throw new Error(
              "All selected min and max qty values must be whole numbers 0 or higher."
            );
          }

          if (maxQuantity < minQuantity) {
            throw new Error(
              "Maximum quantity must be greater than or equal to minimum quantity."
            );
          }

          if (
            Number(currentItem.min_quantity) !== minQuantity ||
            Number(currentItem.max_quantity) !== maxQuantity
          ) {
            await connection.query(
              "UPDATE items SET min_quantity = ?, max_quantity = ?, updated_by = ? WHERE id = ?",
              [minQuantity, maxQuantity, adjustedByUserId, itemId]
            );

            await connection.query(
              `INSERT INTO min_max_adjustments (
              item_id,
              old_min_quantity,
              new_min_quantity,
              old_max_quantity,
              new_max_quantity,
              adjustment_note,
              adjusted_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                itemId,
                currentItem.min_quantity,
                minQuantity,
                currentItem.max_quantity,
                maxQuantity,
                adjustmentNote || null,
                adjustedByUserId
              ]
            );
          }
        }

        if (adjustmentType === "cost") {
          const newCost = parseNonNegativeDecimal(
            getSubmittedField({
              body: req.body,
              submittedItems,
              payloadItem,
              itemId,
              fieldName: "cost"
            })
          );

          if (newCost === null) {
            throw new Error(
              "All selected cost values must be valid numbers 0 or higher."
            );
          }

          if (Number(currentItem.cost) !== newCost) {
            await connection.query(
              "UPDATE items SET cost = ?, updated_by = ? WHERE id = ?",
              [newCost, adjustedByUserId, itemId]
            );

            await connection.query(
              "INSERT INTO cost_adjustments (item_id, old_cost, new_cost, adjustment_note, adjusted_by) VALUES (?, ?, ?, ?, ?)",
              [
                itemId,
                currentItem.cost,
                newCost,
                adjustmentNote || null,
                adjustedByUserId
              ]
            );
          }
        }

        if (adjustmentType === "price") {
          const newPrice = parseNonNegativeDecimal(
            getSubmittedField({
              body: req.body,
              submittedItems,
              payloadItem,
              itemId,
              fieldName: "price"
            })
          );

          if (newPrice === null) {
            throw new Error(
              "All selected price values must be valid numbers 0 or higher."
            );
          }

          if (Number(currentItem.price) !== newPrice) {
            await connection.query(
              "UPDATE items SET price = ?, updated_by = ? WHERE id = ?",
              [newPrice, adjustedByUserId, itemId]
            );

            await connection.query(
              "INSERT INTO price_adjustments (item_id, old_price, new_price, adjustment_note, adjusted_by) VALUES (?, ?, ?, ?, ?)",
              [
                itemId,
                currentItem.price,
                newPrice,
                adjustmentNote || null,
                adjustedByUserId
              ]
            );
          }
        }

        if (adjustmentType === "category") {
          const rawCategoryId = normalizeText(
            getSubmittedField({
              body: req.body,
              submittedItems,
              payloadItem,
              itemId,
              fieldName: "category_id"
            }) || ""
          ).trim();
          const categoryId = rawCategoryId ? Number(rawCategoryId) : null;

          if (
            rawCategoryId &&
            (!Number.isInteger(categoryId) || categoryId <= 0)
          ) {
            throw new Error("All selected category values must be valid.");
          }

          if (categoryId !== null && !validCategoryIds.has(categoryId)) {
            throw new Error(
              "One or more selected categories could not be found."
            );
          }

          if (
            Number(currentItem.category_id || 0) !== Number(categoryId || 0)
          ) {
            await connection.query(
              "UPDATE items SET category_id = ?, updated_by = ? WHERE id = ?",
              [categoryId, adjustedByUserId, itemId]
            );

            await connection.query(
              `INSERT INTO category_adjustments (
              item_id,
              old_category_id,
              new_category_id,
              adjustment_note,
              adjusted_by
            ) VALUES (?, ?, ?, ?, ?)`,
              [
                itemId,
                currentItem.category_id,
                categoryId,
                adjustmentNote || null,
                adjustedByUserId
              ]
            );
          }
        }
      }

      await connection.commit();

      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "inventory_adjusted",
        entityType: "adjustment",
        entityId: adjustmentType,
        description: `${req.session.user?.username || "Admin"} updated ${pluralize(uniqueIds.length, "item")} for ${getAdjustmentLabel(adjustmentType)}.`,
        metadata: {
          adjustment_type: adjustmentType,
          item_ids: uniqueIds,
          item_count: uniqueIds.length,
          note: adjustmentNote || null
        }
      });

      if (jsonResponse) {
        const [updatedRows] = await pool.query(
          `SELECT a.id, a.quantity, a.min_quantity, a.max_quantity, a.cost, a.price, a.category_id, b.category_name, c.username AS updated_by_username
         FROM items a
         LEFT JOIN categories b ON a.category_id = b.id
         LEFT JOIN users c ON a.updated_by = c.id
         WHERE a.id IN (?)
         ORDER BY a.id ASC`,
          [uniqueIds]
        );

        return res.status(200).json({
          ok: true,
          message: `${pluralize(updatedRows.length, "item")} updated for ${getAdjustmentLabel(adjustmentType)}.`,
          adjustmentType,
          items: updatedRows
        });
      }

      return respondAdjustmentResult(
        req,
        res,
        "success",
        `${pluralize(uniqueIds.length, "item")} updated for ${getAdjustmentLabel(adjustmentType)}.`
      );
    } catch (error) {
      await connection.rollback();
      console.error("Failed to save adjustments:", error);
      return respondAdjustmentResult(
        req,
        res,
        "error",
        error.message || "Unable to save adjustments right now."
      );
    } finally {
      connection.release();
    }
  }
);

module.exports = router;
