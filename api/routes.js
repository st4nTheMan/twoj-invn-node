const express = require("express");
const pool = require("../database/pool");
const { requirePermission } = require("../middleware/auth");

// Defines JSON endpoints used by the dashboard UI.
const router = express.Router();

// Returns the line items for a selected transaction report.
router.get(
  "/reports/:id/items",
  requirePermission("reports.view"),
  async (req, res) => {
    const transactionId = Number(req.params.id);

    if (!transactionId) {
      return res.json([]);
    }

    try {
      const [items] = await pool.query(
        `SELECT a.*, b.barcode, b.name
       FROM transaction_items a
       INNER JOIN items b ON a.item_id = b.id
       WHERE a.transaction_id = ?
       ORDER BY b.id ASC`,
        [transactionId]
      );

      return res.json(items);
    } catch (error) {
      console.error("Failed to load report details:", error);
      return res.status(500).json([]);
    }
  }
);

module.exports = router;
