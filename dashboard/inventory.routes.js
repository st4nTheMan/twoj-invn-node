const express = require("express");
const pool = require("../database/pool");
const { requireLogin } = require("../middleware/auth");
const {
  flash,
  toUppercaseText
} = require("../includes/helpers");

// Defines inventory pages and form actions for items and categories.
const router = express.Router();

// Parses a non-negative whole number and returns null for invalid values.
function parseWholeNumber(value) {
  const normalized = String(value ?? "").trim();

  if (normalized === "") {
    return null;
  }

  const parsedValue = Number(normalized);

  if (!Number.isFinite(parsedValue) || parsedValue < 0 || !Number.isInteger(parsedValue)) {
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
function getSubmittedField({ body, submittedItems, payloadItem, itemId, fieldName }) {
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
  return req.xhr || String(req.get("accept") || "").includes("application/json");
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

// Loads the inventory dashboard with categories and the latest item list.
router.get("/inventory", requireLogin, async (req, res) => {
  try {
    const [categories] = await pool.query(
      "SELECT * FROM categories ORDER BY category_name ASC"
    );
    const [items] = await pool.query(
      `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       ORDER BY items.id DESC`
    );

    return res.render("dashboard/inventory", {
      title: "Inventory",
      categories,
      items
    });
  } catch (error) {
    console.error("Failed to load inventory:", error);
    flash(req, { type: "error", message: "Unable to load inventory." });
    return res.render("dashboard/inventory", {
      title: "Inventory",
      categories: [],
      items: []
    });
  }
});

// Loads a lightweight price lookup page with searchable item prices.
router.get("/price-lookup", requireLogin, async (req, res) => {
  try {
    const [items] = await pool.query(
      `SELECT id, barcode, name, price
       FROM items
       ORDER BY id DESC`
    );

    return res.render("dashboard/price-lookup", {
      title: "Price Lookup",
      items
    });
  } catch (error) {
    console.error("Failed to load price lookup page:", error);
    flash(req, { type: "error", message: "Unable to load price lookup." });
    return res.render("dashboard/price-lookup", {
      title: "Price Lookup",
      items: []
    });
  }
});

// Loads the bulk adjustments page where a single field can be updated for many items.
router.get("/inventory/adjustments", requireLogin, async (req, res) => {
  try {
    const [categories] = await pool.query(
      "SELECT * FROM categories ORDER BY category_name ASC"
    );
    const [items] = await pool.query(
      `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       ORDER BY items.id DESC`
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
});

// Loads the global history page with items that can open their history hub.
router.get("/history", requireLogin, async (req, res) => {
  try {
    const [items] = await pool.query(
      `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       ORDER BY items.id DESC`
    );

    return res.render("dashboard/history", {
      title: "History",
      items
    });
  } catch (error) {
    console.error("Failed to load history page:", error);
    flash(req, { type: "error", message: "Unable to load history." });
    return res.render("dashboard/history", {
      title: "History",
      items: []
    });
  }
});

// Creates a new inventory item and preserves form state on validation errors.
router.post("/inventory/items", requireLogin, async (req, res) => {
  const barcode = String(req.body.barcode || "").trim();
  const name = toUppercaseText(req.body.name);
  const cost = String(req.body.cost || "").trim();
  const price = String(req.body.price || "").trim();
  const quantity = Number(req.body.quantity || 0);
  const minQuantity = Number(req.body.min_quantity || 0);
  const maxQuantity = Number(req.body.max_quantity || 1);
  const categoryId = req.body.category_id ? Number(req.body.category_id) : null;
  const jsonResponse = wantsJsonResponse(req);

  if (!barcode || !name || !cost || !price) {
    if (jsonResponse) {
      return res.status(400).json({
        ok: false,
        message: "Item number, name, cost, and price are required."
      });
    }

    flash(req, { type: "error", message: "Item number, name, cost, and price are required." });
    return res.redirect("/inventory");
  }

  if (maxQuantity < minQuantity) {
    if (jsonResponse) {
      return res.status(400).json({
        ok: false,
        message: "Maximum quantity must be greater than or equal to minimum quantity."
      });
    }

    flash(req, { type: "error", message: "Maximum quantity must be greater than or equal to minimum quantity." });
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
      `INSERT INTO items (barcode, name, cost, price, quantity, min_quantity, max_quantity, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [barcode, name, cost, price, quantity, minQuantity, maxQuantity, categoryId]
    );

    if (jsonResponse) {
      const [rows] = await pool.query(
        `SELECT items.*, categories.category_name
         FROM items
         LEFT JOIN categories ON items.category_id = categories.id
         WHERE items.id = ?
         LIMIT 1`,
        [insertResult.insertId]
      );

      return res.status(201).json({
        ok: true,
        message: "Item added successfully.",
        item: rows[0] || null
      });
    }

    flash(req, { type: "success", message: "Item added successfully." });
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
});

// Updates an existing inventory item after validating the submitted values.
router.post("/inventory/items/:id", requireLogin, async (req, res) => {
  flash(req, {
    type: "error",
    message: "Item details are read-only here. Use the Adjustments page to update inventory fields."
  });
  return res.redirect(`/inventory/items/${Number(req.params.id) || ""}`);
});

// Creates a new category directly from the inventory page modal.
router.post("/inventory/categories", requireLogin, async (req, res) => {
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
      "INSERT INTO categories (category_name) VALUES (?)",
      [categoryName]
    );

    if (jsonResponse) {
      return res.status(201).json({
        ok: true,
        message: "Category saved successfully.",
        category: {
          id: insertResult.insertId,
          category_name: categoryName
        }
      });
    }

    flash(req, { type: "success", message: "Category saved successfully." });
    return res.redirect("/inventory");
  } catch (error) {
    console.error("Failed to save category:", error);

    if (jsonResponse) {
      return res.status(500).json({
        ok: false,
        message: "Unable to save category right now."
      });
    }

    flash(req, { type: "error", message: "Unable to save category right now." });
    return res.redirect("/inventory");
  }
});

// Loads the detailed edit view for a single inventory item.
router.get("/inventory/items/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    flash(req, { type: "error", message: "Item not found." });
    return res.redirect("/inventory");
  }

  try {
    const [rows] = await pool.query(
      `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       WHERE items.id = ?
       LIMIT 1`,
      [id]
    );
    const item = rows[0];

    if (!item) {
      flash(req, { type: "error", message: "Item not found." });
      return res.redirect("/inventory");
    }

    return res.render("dashboard/view-item", {
      title: "View Item",
      item
    });
  } catch (error) {
    console.error("Failed to load item details:", error);
    flash(req, { type: "error", message: "Unable to load item details." });
    return res.redirect("/inventory");
  }
});

// Loads the history hub page for a single inventory item.
router.get("/inventory/items/:id/history", requireLogin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    flash(req, { type: "error", message: "Item not found." });
    return res.redirect("/inventory");
  }

  try {
    const [rows] = await pool.query(
      `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       WHERE items.id = ?
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
});

// Loads the cost adjustment page and historical cost changes for one item.
router.get("/inventory/items/:id/cost", requireLogin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.redirect("/inventory");
  }

  try {
    const itemPromise = pool.query("SELECT * FROM items WHERE id = ? LIMIT 1", [id]);
    const historyPromise = pool.query(
      "SELECT * FROM cost_adjustments WHERE item_id = ? ORDER BY adjusted_at DESC",
      [id]
    );
    const [itemResult, historyResult] = await Promise.all([itemPromise, historyPromise]);
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
});

// Loads the quantity adjustment history page for one item.
router.get("/inventory/items/:id/quantity", requireLogin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.redirect("/inventory");
  }

  try {
    const itemPromise = pool.query("SELECT * FROM items WHERE id = ? LIMIT 1", [id]);
    const historyPromise = pool.query(
      "SELECT * FROM quantity_adjustments WHERE item_id = ? ORDER BY adjusted_at DESC",
      [id]
    );
    const [itemResult, historyResult] = await Promise.all([itemPromise, historyPromise]);
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
});

// Loads the min/max quantity adjustment history page for one item.
router.get("/inventory/items/:id/min-max", requireLogin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.redirect("/inventory");
  }

  try {
    const itemPromise = pool.query("SELECT * FROM items WHERE id = ? LIMIT 1", [id]);
    const historyPromise = pool.query(
      "SELECT * FROM min_max_adjustments WHERE item_id = ? ORDER BY adjusted_at DESC",
      [id]
    );
    const [itemResult, historyResult] = await Promise.all([itemPromise, historyPromise]);
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
    flash(req, { type: "error", message: "Unable to load min/max qty history." });
    return res.redirect("/inventory");
  }
});

// Saves a new item cost and records the cost change history.
router.post("/inventory/items/:id/cost", requireLogin, async (req, res) => {
  flash(req, {
    type: "error",
    message: "Cost history is read-only. Use the Adjustments page to update item cost."
  });
  return res.redirect(`/inventory/items/${Number(req.params.id) || ""}/cost`);
});

// Loads the price adjustment page and historical price changes for one item.
router.get("/inventory/items/:id/price", requireLogin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.redirect("/inventory");
  }

  try {
    const itemPromise = pool.query("SELECT * FROM items WHERE id = ? LIMIT 1", [id]);
    const historyPromise = pool.query(
      "SELECT * FROM price_adjustments WHERE item_id = ? ORDER BY adjusted_at DESC",
      [id]
    );
    const [itemResult, historyResult] = await Promise.all([itemPromise, historyPromise]);
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
});

// Saves a new item price and records the price change history.
router.post("/inventory/items/:id/price", requireLogin, async (req, res) => {
  flash(req, {
    type: "error",
    message: "Price history is read-only. Use the Adjustments page to update item price."
  });
  return res.redirect(`/inventory/items/${Number(req.params.id) || ""}/price`);
});

// Saves one type of adjustment for all checked items in a single transaction.
router.post("/inventory/adjustments", requireLogin, async (req, res) => {
  const jsonRequest = isJsonRequest(req);
  const jsonResponse = jsonRequest || wantsJsonResponse(req);
  let adjustmentType = "";
  let payloadRows = [];

  if (jsonRequest) {
    adjustmentType = String(req.body.adjustmentType || "").trim();
    payloadRows = Array.isArray(req.body.adjustments) ? req.body.adjustments : [];
  } else if (req.body.adjustments_json) {
    try {
      const parsed = JSON.parse(req.body.adjustments_json);
      adjustmentType = String(parsed?.adjustmentType || req.body.adjustment_type || "").trim();
      payloadRows = Array.isArray(parsed?.adjustments) ? parsed.adjustments : [];
    } catch (error) {
      return respondAdjustmentResult(req, res, "error", "Unable to read the submitted adjustment data.");
    }
  } else {
    adjustmentType = String(req.body.adjustment_type || "").trim();
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
  const validTypes = new Set(["quantity", "min_max", "cost", "price", "category"]);

  if (!validTypes.has(adjustmentType)) {
    return respondAdjustmentResult(req, res, "error", "Select a valid adjustment type.");
  }

  if (!uniqueIds.length) {
    return respondAdjustmentResult(req, res, "error", "Select at least one item to update.");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [categoryRows] = await connection.query(
      "SELECT id FROM categories"
    );
    const validCategoryIds = new Set(categoryRows.map((category) => Number(category.id)));

    const [rows] = await connection.query(
      `SELECT id, quantity, min_quantity, max_quantity, cost, price, category_id
       FROM items
       WHERE id IN (?)`,
      [uniqueIds]
    );
    const itemsById = new Map(rows.map((item) => [item.id, item]));

    if (itemsById.size !== uniqueIds.length) {
      throw new Error("One or more selected items could not be found.");
    }

    for (const itemId of uniqueIds) {
      const currentItem = itemsById.get(itemId);
      const payloadItem = payloadRows.find((row) => Number(row?.item_id) === itemId) || null;

      if (adjustmentType === "quantity") {
        const quantity = parseWholeNumber(getSubmittedField({
          body: req.body,
          submittedItems,
          payloadItem,
          itemId,
          fieldName: "quantity"
        }));

        if (quantity === null) {
          throw new Error("All selected OH qty values must be whole numbers 0 or higher.");
        }

        await connection.query(
          "UPDATE items SET quantity = ? WHERE id = ?",
          [quantity, itemId]
        );

        if (Number(currentItem.quantity) !== quantity) {
          await connection.query(
            "INSERT INTO quantity_adjustments (item_id, old_quantity, new_quantity) VALUES (?, ?, ?)",
            [itemId, currentItem.quantity, quantity]
          );
        }
      }

      if (adjustmentType === "min_max") {
        const minQuantity = parseWholeNumber(getSubmittedField({
          body: req.body,
          submittedItems,
          payloadItem,
          itemId,
          fieldName: "min_quantity"
        }));
        const maxQuantity = parseWholeNumber(getSubmittedField({
          body: req.body,
          submittedItems,
          payloadItem,
          itemId,
          fieldName: "max_quantity"
        }));

        if (minQuantity === null || maxQuantity === null) {
          throw new Error("All selected min and max qty values must be whole numbers 0 or higher.");
        }

        if (maxQuantity < minQuantity) {
          throw new Error("Maximum quantity must be greater than or equal to minimum quantity.");
        }

        await connection.query(
          "UPDATE items SET min_quantity = ?, max_quantity = ? WHERE id = ?",
          [minQuantity, maxQuantity, itemId]
        );

        if (Number(currentItem.min_quantity) !== minQuantity || Number(currentItem.max_quantity) !== maxQuantity) {
          await connection.query(
            `INSERT INTO min_max_adjustments (
              item_id,
              old_min_quantity,
              new_min_quantity,
              old_max_quantity,
              new_max_quantity
            ) VALUES (?, ?, ?, ?, ?)`,
            [itemId, currentItem.min_quantity, minQuantity, currentItem.max_quantity, maxQuantity]
          );
        }
      }

      if (adjustmentType === "cost") {
        const newCost = Number(getSubmittedField({
          body: req.body,
          submittedItems,
          payloadItem,
          itemId,
          fieldName: "cost"
        }));

        if (Number.isNaN(newCost) || newCost < 0) {
          throw new Error("All selected cost values must be valid numbers 0 or higher.");
        }

        await connection.query(
          "UPDATE items SET cost = ? WHERE id = ?",
          [newCost, itemId]
        );

        if (Number(currentItem.cost) !== newCost) {
          await connection.query(
            "INSERT INTO cost_adjustments (item_id, old_cost, new_cost) VALUES (?, ?, ?)",
            [itemId, currentItem.cost, newCost]
          );
        }
      }

      if (adjustmentType === "price") {
        const newPrice = Number(getSubmittedField({
          body: req.body,
          submittedItems,
          payloadItem,
          itemId,
          fieldName: "price"
        }));

        if (Number.isNaN(newPrice) || newPrice < 0) {
          throw new Error("All selected price values must be valid numbers 0 or higher.");
        }

        await connection.query(
          "UPDATE items SET price = ? WHERE id = ?",
          [newPrice, itemId]
        );

        if (Number(currentItem.price) !== newPrice) {
          await connection.query(
            "INSERT INTO price_adjustments (item_id, old_price, new_price) VALUES (?, ?, ?)",
            [itemId, currentItem.price, newPrice]
          );
        }
      }

      if (adjustmentType === "category") {
        const rawCategoryId = String(getSubmittedField({
          body: req.body,
          submittedItems,
          payloadItem,
          itemId,
          fieldName: "category_id"
        }) || "").trim();
        const categoryId = rawCategoryId ? Number(rawCategoryId) : null;

        if (rawCategoryId && (!Number.isInteger(categoryId) || categoryId <= 0)) {
          throw new Error("All selected category values must be valid.");
        }

        if (categoryId !== null && !validCategoryIds.has(categoryId)) {
          throw new Error("One or more selected categories could not be found.");
        }

        await connection.query(
          "UPDATE items SET category_id = ? WHERE id = ?",
          [categoryId, itemId]
        );
      }
    }

    await connection.commit();

    if (jsonResponse) {
      const [updatedRows] = await pool.query(
        `SELECT items.id, items.quantity, items.min_quantity, items.max_quantity, items.cost, items.price, items.category_id, categories.category_name
         FROM items
         LEFT JOIN categories ON items.category_id = categories.id
         WHERE items.id IN (?)
         ORDER BY items.id ASC`,
        [uniqueIds]
      );

      return res.status(200).json({
        ok: true,
        message: "Selected items updated successfully.",
        adjustmentType,
        items: updatedRows
      });
    }

    return respondAdjustmentResult(req, res, "success", "Selected items updated successfully.");
  } catch (error) {
    await connection.rollback();
    console.error("Failed to save adjustments:", error);
    return respondAdjustmentResult(req, res, "error", error.message || "Unable to save adjustments right now.");
  } finally {
    connection.release();
  }
});

module.exports = router;