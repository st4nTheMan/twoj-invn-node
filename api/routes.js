const express = require("express");
const pool = require("../database/pool");
const { requireAdmin } = require("../middleware/auth");

// Defines JSON endpoints used by the dashboard UI.
const router = express.Router();

// Returns the line items for a selected transaction report.
router.get("/reports/:id/items", requireAdmin, async (req, res) => {
  const transactionId = Number(req.params.id);

  if (!transactionId) {
    return res.json([]);
  }

  try {
    const [items] = await pool.query(
      `SELECT transaction_items.*, items.barcode, items.name
       FROM transaction_items
       INNER JOIN items ON transaction_items.item_id = items.id
       WHERE transaction_items.transaction_id = ?
       ORDER BY transaction_items.id ASC`,
      [transactionId]
    );

    return res.json(items);
  } catch (error) {
    console.error("Failed to load report details:", error);
    return res.status(500).json([]);
  }
});

module.exports = router;
