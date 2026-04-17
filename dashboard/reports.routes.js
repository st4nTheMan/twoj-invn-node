const express = require("express");
const pool = require("../database/pool");
const { requireAdmin } = require("../middleware/auth");
const { flash } = require("../includes/helpers");

// Defines report pages that summarize completed sales activity.
const router = express.Router();

// Loads the reports page with completed transaction summaries.
router.get("/reports", requireAdmin, async (req, res) => {
  try {
    const [transactions] = await pool.query(
      `SELECT a.*, b.username AS created_by_username
       FROM transactions a
       LEFT JOIN users b ON a.created_by = b.id
       ORDER BY a.created_at DESC, a.id DESC`
    );

    return res.render("dashboard/reports", {
      title: "Reports",
      transactions
    });
  } catch (error) {
    console.error("Failed to load reports:", error);
    flash(req, { type: "error", message: "Unable to load reports." });
    return res.render("dashboard/reports", {
      title: "Reports",
      transactions: []
    });
  }
});

module.exports = router;
