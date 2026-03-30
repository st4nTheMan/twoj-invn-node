const express = require("express");
const pool = require("../database/pool");
const { requireLogin } = require("../middleware/auth");
const { flash, formatInvoice } = require("../includes/helpers");

// Defines transaction pages and checkout actions.
const router = express.Router();

// Loads the checkout page with currently available inventory items.
router.get("/transaction", requireLogin, async (req, res) => {
  try {
    const [items] = await pool.query(
      `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       ORDER BY items.name ASC`
    );

    return res.render("dashboard/transaction", {
      title: "Transaction",
      items
    });
  } catch (error) {
    console.error("Failed to load transaction page:", error);
    flash(req, { type: "error", message: "Unable to load transactions." });
    return res.render("dashboard/transaction", {
      title: "Transaction",
      items: []
    });
  }
});

// Processes a checkout transaction and updates stock inside a database transaction.
router.post("/transaction", requireLogin, async (req, res) => {
  const itemIds = Array.isArray(req.body.item_id)
    ? req.body.item_id
    : req.body.item_id
      ? [req.body.item_id]
      : [];
  const prices = Array.isArray(req.body.price)
    ? req.body.price
    : req.body.price
      ? [req.body.price]
      : [];
  const quantities = Array.isArray(req.body.quantity)
    ? req.body.quantity
    : req.body.quantity
      ? [req.body.quantity]
      : [];

  if (!itemIds.length) {
    flash(req, { type: "error", message: "Select at least one item before checkout." });
    return res.redirect("/transaction");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let totalAmount = 0;

    for (let index = 0; index < itemIds.length; index += 1) {
      const itemId = Number(itemIds[index]);
      const price = Number(prices[index]);
      const qty = Number(quantities[index]);

      if (!itemId || qty <= 0) {
        throw new Error("Invalid transaction payload.");
      }

      const [rows] = await connection.query(
        "SELECT quantity FROM items WHERE id = ? LIMIT 1",
        [itemId]
      );
      const item = rows[0];

      if (!item) {
        throw new Error("Item not found.");
      }

      if (Number(item.quantity) < qty) {
        throw new Error("Not enough stock available.");
      }

      totalAmount += price * qty;
    }

    const [transactionResult] = await connection.query(
      "INSERT INTO transactions (total_amount) VALUES (?)",
      [totalAmount]
    );

    const transactionId = transactionResult.insertId;

    for (let index = 0; index < itemIds.length; index += 1) {
      const itemId = Number(itemIds[index]);
      const price = Number(prices[index]);
      const qty = Number(quantities[index]);
      const subtotal = price * qty;

      await connection.query(
        `INSERT INTO transaction_items (transaction_id, item_id, price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [transactionId, itemId, price, qty, subtotal]
      );

      await connection.query(
        "UPDATE items SET quantity = quantity - ? WHERE id = ?",
        [qty, itemId]
      );
    }

    await connection.commit();
    flash(req, { type: "success", message: `Transaction ${formatInvoice(transactionId)} completed.` });
    return res.redirect("/transaction");
  } catch (error) {
    await connection.rollback();
    console.error("Transaction failed:", error);
    flash(req, { type: "error", message: error.message || "Transaction failed." });
    return res.redirect("/transaction");
  } finally {
    connection.release();
  }
});

module.exports = router;
