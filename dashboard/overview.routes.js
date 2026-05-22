const express = require("express");
const pool = require("../database/pool");
const { requirePermission } = require("../middleware/auth");
const { flash } = require("../includes/helpers");

const router = express.Router();

function getTodayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

router.get("/dashboard", requirePermission("dashboard.view"), async (req, res) => {
  const todayDate = getTodayDate();

  try {
    const [
      [[todaySnapshot = {}]],
      [inventoryAlerts],
      [recentTransactions],
      [[creditSummary = {}]]
    ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) AS transaction_count,
           COALESCE(SUM(total_amount), 0) AS total_sales,
           COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) AS cash_sales,
           COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END), 0) AS credit_sales
         FROM transactions
         WHERE DATE(created_at) = ?`,
        [todayDate]
      ),
      pool.query(
        `SELECT a.id, a.barcode, a.name, a.quantity, a.min_quantity, b.category_name
         FROM items a
         LEFT JOIN categories b ON a.category_id = b.id
         WHERE a.archived_at IS NULL
           AND a.quantity <= a.min_quantity
         ORDER BY a.quantity ASC, a.name ASC
         LIMIT 8`
      ),
      pool.query(
        `SELECT a.*, b.username AS created_by_username
         FROM transactions a
         LEFT JOIN users b ON a.created_by = b.id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 6`
      ),
      pool.query(
        `SELECT
           COUNT(*) AS entry_count,
           COUNT(DISTINCT customer_id) AS customer_count,
           COALESCE(SUM(total_amount), 0) AS total_credit,
           COALESCE(SUM(balance_due), 0) AS total_balance_due,
           COALESCE(SUM(CASE WHEN balance_due > 0 THEN 1 ELSE 0 END), 0) AS unpaid_entry_count
         FROM credit_ledger`
      )
    ]);

    return res.render("dashboard/index", {
      title: "Dashboard",
      todayDate,
      todaySnapshot,
      inventoryAlerts,
      recentTransactions,
      creditSummary
    });
  } catch (error) {
    console.error("Failed to load dashboard:", error);
    flash(req, { type: "error", message: "Unable to load dashboard data." });

    return res.render("dashboard/index", {
      title: "Dashboard",
      todayDate,
      todaySnapshot: {
        transaction_count: 0,
        total_sales: 0,
        cash_sales: 0,
        credit_sales: 0
      },
      inventoryAlerts: [],
      recentTransactions: [],
      creditSummary: {
        entry_count: 0,
        customer_count: 0,
        total_credit: 0,
        total_balance_due: 0,
        unpaid_entry_count: 0
      }
    });
  }
});

module.exports = router;
