const express = require("express");
const pool = require("../database/pool");
const { requireLogin } = require("../middleware/auth");
const {
  flash,
  normalizeText
} = require("../includes/helpers");

// Defines the credit-ledger pages and manual entry actions.
const router = express.Router();

// Loads the ledger page with recent credit balances and linked invoice details.
router.get("/credit-ledger", requireLogin, async (req, res) => {
  try {
    const [items] = await pool.query(
      `SELECT a.*, b.category_name
       FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       WHERE a.archived_at IS NULL
       ORDER BY a.name ASC`
    );
    const [entries] = await pool.query(
      `SELECT a.*,
              b.payment_method
       FROM credit_ledger a
       LEFT JOIN transactions b ON a.transaction_id = b.id
       ORDER BY a.created_at DESC, a.id DESC`
    );

    return res.render("dashboard/credit-ledger", {
      title: "Credit Ledger",
      entries,
      items
    });
  } catch (error) {
    console.error("Failed to load credit ledger:", error);
    flash(req, { type: "error", message: "Unable to load the credit ledger." });
    return res.render("dashboard/credit-ledger", {
      title: "Credit Ledger",
      entries: [],
      items: []
    });
  }
});

// Saves a manual credit-ledger entry without requiring a checkout transaction.
router.post("/credit-ledger", requireLogin, async (req, res) => {
  const customerName = normalizeText(req.body.customer_name);
  const customerPhone = normalizeText(req.body.customer_phone);
  const itemIds = Array.isArray(req.body.item_id)
    ? req.body.item_id
    : req.body.item_id
      ? [req.body.item_id]
      : [];
  const quantities = Array.isArray(req.body.quantity)
    ? req.body.quantity
    : req.body.quantity
      ? [req.body.quantity]
      : [];

  if (!customerName || !customerPhone || !itemIds.length) {
    flash(req, { type: "error", message: "Customer name, phone number, and selected items are required." });
    return res.redirect("/credit-ledger");
  }

  if (itemIds.length !== quantities.length) {
    flash(req, { type: "error", message: "Selected items could not be processed. Please try again." });
    return res.redirect("/credit-ledger");
  }

  try {
    const normalizedPairs = itemIds.map((itemId, index) => ({
      itemId: Number(itemId),
      quantity: Number(quantities[index])
    })).filter((entry) => entry.itemId && entry.quantity > 0);

    if (!normalizedPairs.length) {
      flash(req, { type: "error", message: "Select at least one valid inventory item." });
      return res.redirect("/credit-ledger");
    }

    const uniqueItemIds = [...new Set(normalizedPairs.map((entry) => entry.itemId))];
    const [items] = await pool.query(
      `SELECT id, barcode, name, price
       FROM items
       WHERE archived_at IS NULL
         AND id IN (?)`,
      [uniqueItemIds]
    );

    if (items.length !== uniqueItemIds.length) {
      flash(req, { type: "error", message: "One or more selected items are no longer available." });
      return res.redirect("/credit-ledger");
    }

    const itemsById = new Map(items.map((item) => [Number(item.id), item]));
    let totalAmount = 0;
    const itemSummaryParts = [];

    for (const entry of normalizedPairs) {
      const item = itemsById.get(entry.itemId);

      if (!item) {
        flash(req, { type: "error", message: "One or more selected items are no longer available." });
        return res.redirect("/credit-ledger");
      }

      totalAmount += Number(item.price || 0) * entry.quantity;
      itemSummaryParts.push(`${item.barcode} - ${item.name} x${entry.quantity}`);
    }

    if (totalAmount <= 0) {
      flash(req, { type: "error", message: "The selected items must produce a valid total amount." });
      return res.redirect("/credit-ledger");
    }

    await pool.query(
      `INSERT INTO credit_ledger (customer_name, customer_phone, item_summary, total_amount, balance_due)
       VALUES (?, ?, ?, ?, ?)`,
      [customerName, customerPhone, itemSummaryParts.join(", "), totalAmount, totalAmount]
    );

    flash(req, {
      type: "success",
      message: `Credit entry for ${customerName} added successfully.`
    });
    return res.redirect("/credit-ledger");
  } catch (error) {
    console.error("Failed to save credit ledger entry:", error);
    flash(req, { type: "error", message: "Unable to save the credit ledger entry right now." });
    return res.redirect("/credit-ledger");
  }
});

module.exports = router;
