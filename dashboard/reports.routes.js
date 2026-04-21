const express = require("express");
const pool = require("../database/pool");
const { requirePermission } = require("../middleware/auth");
const { 
  flash,
  buildPagination,
  buildPaginationHtml,
  buildSortClause
} = require("../includes/helpers");

const router = express.Router();

router.get("/reports", requirePermission("reports.view"), async (req, res) => {
  const search = String(req.query.search || "").trim();
  const searchWildcard = search ? `%${search}%` : null;
  const paymentFilter = ["cash", "credit"].includes(req.query.payment) ? req.query.payment : "";
  const sort = String(req.query.sort || "newest");
  const isAjax = req.xhr || String(req.get("accept") || "").includes("application/json");

  const validSorts = {
    newest:      "a.id DESC",
    oldest:      "a.id ASC",
    total_asc:   "a.total_amount ASC",
    total_desc:  "a.total_amount DESC"
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

    if (isAjax) {
      return res.json({
        ok: true,
        items: transactions,
        pagination,
        paginationHtml: buildPaginationHtml(pagination, "/reports", search, { payment: paymentFilter, sort })
      });
    }

    return res.render("dashboard/reports", {
      title: "Reports",
      transactions,
      pagination,
      search,
      selectedPayment: paymentFilter,
      selectedSort: sort
    });
  } catch (error) {
    console.error("Failed to load reports:", error);
    flash(req, { type: "error", message: "Unable to load reports." });

    if (isAjax) {
      return res.status(500).json({ ok: false, message: "Unable to load reports." });
    }

    return res.render("dashboard/reports", {
      title: "Reports",
      transactions: [],
      pagination: buildPagination({}, 0),
      search: "",
      selectedPayment: "",
      selectedSort: "newest"
    });
  }
});

module.exports = router;