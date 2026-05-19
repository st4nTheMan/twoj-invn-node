const express = require("express");
const pool = require("../database/pool");
const { requirePermission } = require("../middleware/auth");
const {
  flash,
  buildPagination,
  buildPaginationHtml,
  buildSortClause,
  normalizeDecimalInput
} = require("../includes/helpers");

const router = express.Router();

async function getDailySales(whereClause, params) {
  const [dailySales] = await pool.query(
    `SELECT
       DATE_FORMAT(a.created_at, '%Y-%m-%d') AS sales_date,
       DATE_FORMAT(a.created_at, '%b %d, %Y') AS sales_date_label,
       COUNT(*) AS transaction_count,
       COALESCE(SUM(a.total_amount), 0) AS total_sales
     FROM transactions a
     LEFT JOIN users b ON a.created_by = b.id
     ${whereClause}
     GROUP BY
       DATE_FORMAT(a.created_at, '%Y-%m-%d'),
       DATE_FORMAT(a.created_at, '%b %d, %Y')
     ORDER BY sales_date DESC`,
    params
  );

  return dailySales;
}

function getDefaultReadingDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function normalizeReadingDate(value) {
  const candidate = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate)
    ? candidate
    : getDefaultReadingDate();
}

async function getCashDrawerReading(readingDate) {
  const [[reading = {}]] = await pool.query(
    `SELECT a.*, b.username AS updated_by_username
     FROM cash_drawer_readings a
     LEFT JOIN users b ON a.updated_by = b.id
     WHERE a.reading_date = ?
     LIMIT 1`,
    [readingDate]
  );

  const [[totals = {}]] = await pool.query(
    `SELECT
       COUNT(*) AS cash_transaction_count,
       COALESCE(SUM(total_amount), 0) AS cash_sales,
       COALESCE(SUM(COALESCE(cash_received, total_amount)), 0) AS cash_received,
       COALESCE(SUM(COALESCE(change_amount, 0)), 0) AS change_given
     FROM transactions
     WHERE payment_method = 'cash'
       AND DATE(created_at) = ?`,
    [readingDate]
  );

  const openingCash = Number(reading.opening_cash || 0);
  const cashReceived = Number(totals.cash_received || 0);
  const changeGiven = Number(totals.change_given || 0);
  const cashSales = Number(totals.cash_sales || 0);

  return {
    readingDate,
    openingCash,
    cashSales,
    cashReceived,
    changeGiven,
    expectedDrawerCash: openingCash + cashReceived - changeGiven,
    cashTransactionCount: Number(totals.cash_transaction_count || 0),
    updatedByUsername: reading.updated_by_username || "",
    updatedAt: reading.updated_at || null
  };
}

router.post("/reports/cash-drawer", requirePermission("reports.view"), async (req, res) => {
  const readingDate = normalizeReadingDate(req.body.reading_date);
  const openingCash = Number(normalizeDecimalInput(req.body.opening_cash));
  const updatedByUserId = Number(req.session.user?.id) || null;

  if (!Number.isFinite(openingCash) || openingCash < 0) {
    flash(req, {
      type: "error",
      message: "Enter a valid opening cash drawer amount."
    });
    return res.redirect(`/reports?reading_date=${encodeURIComponent(readingDate)}`);
  }

  try {
    await pool.query(
      `INSERT INTO cash_drawer_readings (reading_date, opening_cash, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         opening_cash = VALUES(opening_cash),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [readingDate, openingCash, updatedByUserId]
    );

    flash(req, {
      type: "success",
      message: "Cash drawer opening amount saved."
    });
  } catch (error) {
    console.error("Failed to save cash drawer reading:", error);
    flash(req, {
      type: "error",
      message: "Unable to save cash drawer reading."
    });
  }

  return res.redirect(`/reports?reading_date=${encodeURIComponent(readingDate)}`);
});

router.get("/reports", requirePermission("reports.view"), async (req, res) => {
  const search = String(req.query.search || "").trim();
  const readingDate = normalizeReadingDate(req.query.reading_date);
  const searchWildcard = search ? `%${search}%` : null;
  const paymentFilter = ["cash", "credit"].includes(req.query.payment)
    ? req.query.payment
    : "";
  const sort = String(req.query.sort || "newest");
  const isAjax =
    req.xhr || String(req.get("accept") || "").includes("application/json");

  const validSorts = {
    newest: "a.id DESC",
    oldest: "a.id ASC",
    total_asc: "a.total_amount ASC",
    total_desc: "a.total_amount DESC"
  };
  const orderBy = buildSortClause(sort, validSorts, "a.id DESC");

  const conditions = ["1=1"];
  const params = [];

  if (searchWildcard) {
    conditions.push("(LPAD(a.id, 6, '0') LIKE ? OR b.username LIKE ?)");
    params.push(searchWildcard, searchWildcard);
  }
  if (paymentFilter) {
    conditions.push("a.payment_method = ?");
    params.push(paymentFilter);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM transactions a
       LEFT JOIN users b ON a.created_by = b.id
       ${whereClause}`,
      params
    );

    const pagination = buildPagination(req.query, total);

    const [transactions] = await pool.query(
      `SELECT a.*, b.username AS created_by_username
       FROM transactions a
       LEFT JOIN users b ON a.created_by = b.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, pagination.perPage, pagination.offset]
    );
    const dailySales = await getDailySales(whereClause, params);
    const cashDrawerReading = await getCashDrawerReading(readingDate);

    if (isAjax) {
      return res.json({
        ok: true,
        items: transactions,
        dailySales,
        cashDrawerReading,
        pagination,
        paginationHtml: buildPaginationHtml(pagination, "/reports", search, {
          payment: paymentFilter,
          sort,
          reading_date: readingDate
        })
      });
    }

    return res.render("dashboard/reports", {
      title: "Reports",
      transactions,
      dailySales,
      cashDrawerReading,
      readingDate,
      pagination,
      search,
      selectedPayment: paymentFilter,
      selectedSort: sort
    });
  } catch (error) {
    console.error("Failed to load reports:", error);
    flash(req, { type: "error", message: "Unable to load reports." });

    if (isAjax) {
      return res
        .status(500)
        .json({ ok: false, message: "Unable to load reports." });
    }

    return res.render("dashboard/reports", {
      title: "Reports",
      transactions: [],
      dailySales: [],
      cashDrawerReading: {
        readingDate,
        openingCash: 0,
        cashSales: 0,
        cashReceived: 0,
        changeGiven: 0,
        expectedDrawerCash: 0,
        cashTransactionCount: 0,
        updatedByUsername: "",
        updatedAt: null
      },
      readingDate,
      pagination: buildPagination({}, 0),
      search: "",
      selectedPayment: "",
      selectedSort: "newest"
    });
  }
});

module.exports = router;
