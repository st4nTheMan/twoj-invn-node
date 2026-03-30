const express = require("express");
const pool = require("../database/pool");
const { requireLogin } = require("../middleware/auth");
const { flash } = require("../includes/helpers");

// Defines report pages that summarize completed sales activity.
const router = express.Router();

// Loads the reports page with completed transaction summaries.
router.get("/reports", requireLogin, async (req, res) => {
  try {
    const [transactions] = await pool.query(
      `SELECT *
       FROM transactions
       ORDER BY created_at DESC, id DESC`
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
