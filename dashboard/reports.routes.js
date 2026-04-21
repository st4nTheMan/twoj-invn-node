const express = require("express");
const pool = require("../database/pool");
const { requirePermission } = require("../middleware/auth");
const { flash, buildPagination, buildPaginationHtml } = require("../includes/helpers");

const router = express.Router();

router.get("/reports", requirePermission("reports.view"), async (req, res) => {
  const search = String(req.query.search || "").trim();
  const searchWildcard = search ? `%${search}%` : null;
  const isAjax = req.xhr || String(req.get("accept") || "").includes("application/json");

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM transactions a
       LEFT JOIN users b ON a.created_by = b.id
       WHERE 1=1
       ${searchWildcard ? "AND (LPAD(a.id, 6, '0') LIKE ? OR b.username LIKE ?)" : ""}`,
      searchWildcard ? [searchWildcard, searchWildcard] : []
    );

    const pagination = buildPagination(req.query, total);

    const [transactions] = await pool.query(
      `SELECT a.*, b.username AS created_by_username
       FROM transactions a
       LEFT JOIN users b ON a.created_by = b.id
       WHERE 1=1
       ${searchWildcard ? "AND (LPAD(a.id, 6, '0') LIKE ? OR b.username LIKE ?)" : ""}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      searchWildcard
        ? [searchWildcard, searchWildcard, pagination.perPage, pagination.offset]
        : [pagination.perPage, pagination.offset]
    );

    if (isAjax) {
      return res.json({
        ok: true,
        items: transactions,
        pagination,
        paginationHtml: buildPaginationHtml(pagination, "/reports", search)
      });
    }

    return res.render("dashboard/reports", {
      title: "Reports",
      transactions,
      pagination,
      search
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
      search: ""
    });
  }
});

module.exports = router;