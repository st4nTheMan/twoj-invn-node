const express = require("express");
const pool = require("../database/pool");
const { requireLogin } = require("../middleware/auth");
const {
  flash,
  setAddItemState,
  toUppercaseText
} = require("../includes/helpers");

// Defines inventory pages and form actions for items and categories.
const router = express.Router();

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

  setAddItemState(req, {
    openModal: "add-item-modal",
    error: "",
    old: {
      barcode,
      name,
      cost,
      price,
      quantity,
      min_quantity: minQuantity,
      max_quantity: maxQuantity,
      category_id: categoryId || ""
    }
  });

  if (!barcode || !name || !cost || !price) {
    req.session.addItemState.error = "Item number, name, cost, and price are required.";
    return res.redirect("/inventory");
  }

  if (maxQuantity < minQuantity) {
    req.session.addItemState.error = "Maximum quantity must be greater than or equal to minimum quantity.";
    return res.redirect("/inventory");
  }

  try {
    const [existing] = await pool.query(
      "SELECT COUNT(*) AS count FROM items WHERE barcode = ?",
      [barcode]
    );

    if (existing[0].count > 0) {
      req.session.addItemState.error = "Item number already exists.";
      return res.redirect("/inventory");
    }

    await pool.query(
      `INSERT INTO items (barcode, name, cost, price, quantity, min_quantity, max_quantity, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [barcode, name, cost, price, quantity, minQuantity, maxQuantity, categoryId]
    );

    delete req.session.addItemState;
    flash(req, { type: "success", message: "Item added successfully." });
    return res.redirect("/inventory");
  } catch (error) {
    console.error("Failed to save item:", error);
    req.session.addItemState.error = "Unable to save item right now.";
    return res.redirect("/inventory");
  }
});

// Updates an existing inventory item after validating the submitted values.
router.post("/inventory/items/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const barcode = String(req.body.barcode || "").trim();
  const name = toUppercaseText(req.body.name);
  const cost = String(req.body.cost || "").trim();
  const price = String(req.body.price || "").trim();
  const quantity = Number(req.body.quantity || 0);
  const minQuantity = Number(req.body.min_quantity || 0);
  const maxQuantity = Number(req.body.max_quantity || 1);
  const categoryId = req.body.category_id ? Number(req.body.category_id) : null;

  if (!id || !barcode || !name || !cost || !price) {
    flash(req, { type: "error", message: "Missing required item fields." });
    return res.redirect("/inventory");
  }

  if (maxQuantity < minQuantity) {
    flash(req, { type: "error", message: "Maximum quantity must be greater than or equal to minimum quantity." });
    return res.redirect("/inventory");
  }

  try {
    const [existing] = await pool.query(
      "SELECT COUNT(*) AS count FROM items WHERE barcode = ? AND id != ?",
      [barcode, id]
    );

    if (existing[0].count > 0) {
      flash(req, { type: "error", message: "Item number already exists." });
      return res.redirect("/inventory");
    }

    await pool.query(
      `UPDATE items
       SET barcode = ?, name = ?, cost = ?, price = ?, quantity = ?, min_quantity = ?, max_quantity = ?, category_id = ?
       WHERE id = ?`,
      [barcode, name, cost, price, quantity, minQuantity, maxQuantity, categoryId, id]
    );

    flash(req, { type: "success", message: "Item updated successfully." });
    return res.redirect("/inventory");
  } catch (error) {
    console.error("Failed to update item:", error);
    flash(req, { type: "error", message: "Unable to update item right now." });
    return res.redirect("/inventory");
  }
});

// Creates a new category directly from the inventory page modal.
router.post("/inventory/categories", requireLogin, async (req, res) => {
  const categoryName = toUppercaseText(req.body.category_name);

  if (!categoryName) {
    flash(req, { type: "error", message: "Category name is required." });
    return res.redirect("/inventory");
  }

  try {
    await pool.query(
      "INSERT IGNORE INTO categories (category_name) VALUES (?)",
      [categoryName]
    );

    flash(req, { type: "success", message: "Category saved successfully." });
    return res.redirect("/inventory");
  } catch (error) {
    console.error("Failed to save category:", error);
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
    const [categories] = await pool.query(
      "SELECT * FROM categories ORDER BY category_name ASC"
    );
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
      item,
      categories
    });
  } catch (error) {
    console.error("Failed to load item details:", error);
    flash(req, { type: "error", message: "Unable to load item details." });
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

// Saves a new item cost and records the cost change history.
router.post("/inventory/items/:id/cost", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const newCost = Number(req.body.new_cost);

  if (!id || Number.isNaN(newCost) || newCost < 0) {
    flash(req, { type: "error", message: "Please enter a valid cost." });
    return res.redirect(`/inventory/items/${id}/cost`);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      "SELECT * FROM items WHERE id = ? LIMIT 1",
      [id]
    );
    const item = rows[0];

    if (!item) {
      throw new Error("Item not found.");
    }

    await connection.query(
      "UPDATE items SET cost = ? WHERE id = ?",
      [newCost, id]
    );
    await connection.query(
      "INSERT INTO cost_adjustments (item_id, old_cost, new_cost) VALUES (?, ?, ?)",
      [id, item.cost, newCost]
    );

    await connection.commit();
    flash(req, { type: "success", message: "Cost updated successfully." });
    return res.redirect(`/inventory/items/${id}/cost`);
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update cost:", error);
    flash(req, { type: "error", message: error.message || "Unable to update cost." });
    return res.redirect(`/inventory/items/${id}/cost`);
  } finally {
    connection.release();
  }
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
  const id = Number(req.params.id);
  const newPrice = Number(req.body.new_price);

  if (!id || Number.isNaN(newPrice) || newPrice < 0) {
    flash(req, { type: "error", message: "Please enter a valid price." });
    return res.redirect(`/inventory/items/${id}/price`);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      "SELECT * FROM items WHERE id = ? LIMIT 1",
      [id]
    );
    const item = rows[0];

    if (!item) {
      throw new Error("Item not found.");
    }

    await connection.query(
      "UPDATE items SET price = ? WHERE id = ?",
      [newPrice, id]
    );
    await connection.query(
      "INSERT INTO price_adjustments (item_id, old_price, new_price) VALUES (?, ?, ?)",
      [id, item.price, newPrice]
    );

    await connection.commit();
    flash(req, { type: "success", message: "Price updated successfully." });
    return res.redirect(`/inventory/items/${id}/price`);
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update price:", error);
    flash(req, { type: "error", message: error.message || "Unable to update price." });
    return res.redirect(`/inventory/items/${id}/price`);
  } finally {
    connection.release();
  }
});

module.exports = router;
