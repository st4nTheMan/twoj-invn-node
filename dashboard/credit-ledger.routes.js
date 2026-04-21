const express = require("express");
const pool = require("../database/pool");
const { logActivity } = require("../database/activity-log");
const { normalizePhilippinePhone, resolveCustomerRecord } = require("../includes/customers");
const { requirePermission } = require("../middleware/auth");
const {
  flash,
  normalizeText,
  buildPagination,
  buildPaginationHtml
} = require("../includes/helpers");

// Defines the credit-ledger pages and manual entry actions.
const router = express.Router();

// Loads the ledger page with recent credit balances and linked invoice details.
router.get("/credit-ledger", requirePermission("credit_ledger.view"), async (req, res) => {
  const search = String(req.query.search || "").trim();
  const searchWildcard = search ? `%${search}%` : null;
  const isAjax = req.xhr || String(req.get("accept") || "").includes("application/json");

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM credit_ledger a
       LEFT JOIN users c ON a.created_by = c.id
       LEFT JOIN customers d ON a.customer_id = d.id
       WHERE 1=1
       ${searchWildcard ? "AND (COALESCE(d.name, a.customer_name) LIKE ? OR COALESCE(d.phone, a.customer_phone) LIKE ? OR a.item_summary LIKE ?)" : ""}`,
      searchWildcard ? [searchWildcard, searchWildcard, searchWildcard] : []
    );

    const pagination = buildPagination(req.query, total);

    const [entries] = await pool.query(
      `SELECT a.*,
              b.payment_method,
              c.username AS created_by_username,
              COALESCE(d.name, a.customer_name) AS customer_name,
              COALESCE(d.phone, a.customer_phone) AS customer_phone
       FROM credit_ledger a
       LEFT JOIN transactions b ON a.transaction_id = b.id
       LEFT JOIN users c ON a.created_by = c.id
       LEFT JOIN customers d ON a.customer_id = d.id
       WHERE 1=1
       ${searchWildcard ? "AND (COALESCE(d.name, a.customer_name) LIKE ? OR COALESCE(d.phone, a.customer_phone) LIKE ? OR a.item_summary LIKE ?)" : ""}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      searchWildcard
        ? [searchWildcard, searchWildcard, searchWildcard, pagination.perPage, pagination.offset]
        : [pagination.perPage, pagination.offset]
    );

    if (isAjax) {
      return res.json({
        ok: true,
        items: entries,
        pagination,
        paginationHtml: buildPaginationHtml(pagination, "/credit-ledger", search)
      });
    }

    const [items] = await pool.query(
      `SELECT a.*, b.category_name FROM items a
       LEFT JOIN categories b ON a.category_id = b.id
       WHERE a.archived_at IS NULL ORDER BY a.name ASC`
    );
    const [customers] = await pool.query(
      `SELECT id, name, phone, created_at, updated_at FROM customers ORDER BY name ASC, id ASC`
    );
    const [customerSummaries] = await pool.query(
      `SELECT b.id AS customer_id,
              b.name, b.phone,
              COUNT(a.id) AS entry_count,
              COALESCE(SUM(a.total_amount), 0) AS total_credit_amount,
              COALESCE(SUM(a.balance_due), 0) AS total_balance_due,
              MAX(a.created_at) AS last_credit_at
       FROM customers b
       LEFT JOIN credit_ledger a ON a.customer_id = b.id
       GROUP BY b.id, b.name, b.phone
       ORDER BY total_balance_due DESC, b.name ASC`
    );

    return res.render("dashboard/credit-ledger", {
      title: "Credit Ledger",
      entries,
      items,
      customers,
      customerSummaries,
      pagination,
      search
    });
  } catch (error) {
    console.error("Failed to load credit ledger:", error);
    flash(req, { type: "error", message: "Unable to load the credit ledger." });

    if (isAjax) {
      return res.status(500).json({ ok: false, message: "Unable to load the credit ledger." });
    }

    return res.render("dashboard/credit-ledger", {
      title: "Credit Ledger",
      entries: [],
      items: [],
      customers: [],
      customerSummaries: [],
      pagination: buildPagination({}, 0),
      search: ""
    });
  }
});

// Saves a manual credit-ledger entry without requiring a checkout transaction.
router.post("/credit-ledger", requirePermission("credit_ledger.create"), async (req, res) => {
  const createdByUserId = Number(req.session.user?.id) || null;
  const customerId = Number(req.body.customer_id) || null;
  const customerName = normalizeText(req.body.customer_name);
  const customerPhone = normalizePhilippinePhone(req.body.customer_phone);
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

  if ((!customerId && (!customerName || !customerPhone)) || !itemIds.length) {
    flash(req, { type: "error", message: "Choose a registered customer or enter a new customer name and phone number." });
    return res.redirect("/credit-ledger");
  }

  if (itemIds.length !== quantities.length) {
    flash(req, { type: "error", message: "Selected items could not be processed. Please try again." });
    return res.redirect("/credit-ledger");
  }

  try {
    const resolvedCustomer = await resolveCustomerRecord(pool, {
      customerId,
      customerName,
      customerPhone
    });
    const selectedCustomer = resolvedCustomer.customer;

    if (!selectedCustomer) {
      flash(req, { type: "error", message: "Choose a valid customer before saving the credit entry." });
      return res.redirect("/credit-ledger");
    }

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

    const [insertResult] = await pool.query(
      `INSERT INTO credit_ledger (customer_id, customer_name, customer_phone, item_summary, total_amount, balance_due, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [selectedCustomer.id, selectedCustomer.name, selectedCustomer.phone, itemSummaryParts.join(", "), totalAmount, totalAmount, createdByUserId]
    );

    if (resolvedCustomer.created) {
      await logActivity({
        actorId: req.session.user?.id,
        username: req.session.user?.username,
        role: req.session.user?.role,
        action: "customer_created",
        entityType: "customer",
        entityId: selectedCustomer.id,
        description: `${req.session.user?.username || "User"} added customer ${selectedCustomer.name}.`,
        metadata: {
          customer_name: selectedCustomer.name,
          customer_phone: selectedCustomer.phone
        }
      });
    }

    await logActivity({
      actorId: req.session.user?.id,
      username: req.session.user?.username,
      role: req.session.user?.role,
      action: "credit_entry_created",
      entityType: "credit_ledger",
      entityId: insertResult.insertId,
      description: `${req.session.user?.username || "User"} added a credit entry for ${selectedCustomer.name}.`,
      metadata: {
        customer_name: selectedCustomer.name,
        customer_id: selectedCustomer.id,
        total_amount: totalAmount,
        item_count: normalizedPairs.length
      }
    });

    flash(req, {
      type: "success",
      message: `Credit entry for ${selectedCustomer.name} added successfully.`
    });
    return res.redirect("/credit-ledger");
  } catch (error) {
    console.error("Failed to save credit ledger entry:", error);
    flash(req, { type: "error", message: "Unable to save the credit ledger entry right now." });
    return res.redirect("/credit-ledger");
  }
});

// Marks all unpaid balances for a customer as settled while preserving ledger history.
router.post("/credit-ledger/:customerId/settle", requirePermission("credit_ledger.create"), async (req, res) => {
  const customerId = Number(req.params.customerId) || 0;
  const updatedByUserId = Number(req.session.user?.id) || null;

  if (!customerId) {
    flash(req, { type: "error", message: "Choose a valid customer before marking balances as paid." });
    return res.redirect("/credit-ledger");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [customerRows] = await connection.query(
      `SELECT b.id AS customer_id,
              b.name,
              b.phone,
              COUNT(a.id) AS unpaid_entry_count,
              COALESCE(SUM(a.balance_due), 0) AS total_balance_due
       FROM customers b
       LEFT JOIN credit_ledger a
         ON a.customer_id = b.id
        AND a.balance_due > 0
       WHERE b.id = ?
       GROUP BY b.id, b.name, b.phone
       LIMIT 1`,
      [customerId]
    );

    const customer = customerRows[0] || null;
    const unpaidEntryCount = Number(customer?.unpaid_entry_count || 0);
    const totalBalanceDue = Number(customer?.total_balance_due || 0);

    if (!customer) {
      await connection.rollback();
      flash(req, { type: "error", message: "Customer record not found." });
      return res.redirect("/credit-ledger");
    }

    if (unpaidEntryCount <= 0 || totalBalanceDue <= 0) {
      await connection.rollback();
      flash(req, { type: "error", message: `${customer.name} has no unpaid balance to clear.` });
      return res.redirect("/credit-ledger");
    }

    await connection.query(
      `UPDATE credit_ledger
       SET balance_due = 0.00,
           updated_by = ?
       WHERE customer_id = ?
         AND balance_due > 0`,
      [updatedByUserId, customerId]
    );

    await logActivity({
      actorId: req.session.user?.id,
      username: req.session.user?.username,
      role: req.session.user?.role,
      action: "credit_balance_settled",
      entityType: "customer",
      entityId: customerId,
      description: `${req.session.user?.username || "User"} marked ${customer.name}'s credit balance as paid.`,
      metadata: {
        customer_id: customerId,
        customer_name: customer.name,
        customer_phone: customer.phone,
        cleared_balance_total: totalBalanceDue,
        affected_entry_count: unpaidEntryCount
      }
    }, connection);

    await connection.commit();
    flash(req, {
      type: "success",
      message: `${customer.name}'s balance was marked as paid and reset to zero.`
    });
    return res.redirect("/credit-ledger");
  } catch (error) {
    await connection.rollback();
    console.error("Failed to settle customer credit balance:", error);
    flash(req, { type: "error", message: "Unable to mark the credit balance as paid right now." });
    return res.redirect("/credit-ledger");
  } finally {
    connection.release();
  }
});

module.exports = router;
