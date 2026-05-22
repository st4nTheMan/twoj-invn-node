const express = require("express");
const pool = require("../database/pool");
const { logActivity } = require("../database/activity-log");
const {
  normalizePhilippinePhone,
  resolveCustomerRecord
} = require("../includes/customers");
const { requirePermission } = require("../middleware/auth");
const {
  flash,
  formatInvoice,
  normalizeDecimalInput,
  normalizeText
} = require("../includes/helpers");

// Defines transaction pages and checkout actions.
const router = express.Router();

// Detects whether the caller expects a JSON response instead of a redirect.
function wantsJsonResponse(req) {
  return (
    req.xhr || String(req.get("accept") || "").includes("application/json")
  );
}

// Loads the checkout page with currently available inventory items.
router.get(
  "/transaction",
  requirePermission("transaction.create"),
  async (req, res) => {
    try {
      const [items] = await pool.query(
        `SELECT items.*, categories.category_name
       FROM items
       LEFT JOIN categories ON items.category_id = categories.id
       WHERE items.archived_at IS NULL
       ORDER BY items.name ASC`
      );
      const [customers] = await pool.query(
        `SELECT id, name, phone
       FROM customers
       ORDER BY name ASC, id ASC`
      );

      return res.render("dashboard/transaction", {
        title: "Transaction",
        items,
        customers
      });
    } catch (error) {
      console.error("Failed to load transaction page:", error);
      flash(req, { type: "error", message: "Unable to load transactions." });
      return res.render("dashboard/transaction", {
        title: "Transaction",
        items: [],
        customers: []
      });
    }
  }
);

// Processes a checkout transaction and updates stock inside a database transaction.
router.post(
  "/transaction",
  requirePermission("transaction.create"),
  async (req, res) => {
    const createdByUserId = Number(req.session.user?.id) || null;
    const paymentMethod =
      normalizeText(req.body.payment_method).toLowerCase() || "cash";
    const customerId = Number(req.body.customer_id) || null;
    const customerName = normalizeText(req.body.customer_name);
    const customerPhone = normalizePhilippinePhone(req.body.customer_phone);
    const normalizedCashReceived = normalizeDecimalInput(
      req.body.cash_received
    );
    const jsonResponse = wantsJsonResponse(req);
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
      if (jsonResponse) {
        return res.status(400).json({
          ok: false,
          message: "Select at least one item before checkout."
        });
      }

      flash(req, {
        type: "error",
        message: "Select at least one item before checkout."
      });
      return res.redirect("/transaction");
    }

    if (!["cash", "credit"].includes(paymentMethod)) {
      if (jsonResponse) {
        return res.status(400).json({
          ok: false,
          message: "Choose either cash or credit as the payment method."
        });
      }

      flash(req, {
        type: "error",
        message: "Choose either cash or credit as the payment method."
      });
      return res.redirect("/transaction");
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let totalAmount = 0;
      const lineItems = [];

      for (let index = 0; index < itemIds.length; index += 1) {
        const itemId = Number(itemIds[index]);
        const price = Number(prices[index]);
        const qty = Number(quantities[index]);

        if (!itemId || qty <= 0) {
          throw new Error("Invalid transaction payload.");
        }

        const [rows] = await connection.query(
          "SELECT id, name, quantity FROM items WHERE id = ? AND archived_at IS NULL LIMIT 1",
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
        lineItems.push({
          id: item.id,
          name: item.name,
          price,
          quantity: qty
        });
      }

      if (paymentMethod === "cash") {
        const cashReceived = Number(normalizedCashReceived);

        if (
          normalizedCashReceived === "" ||
          !Number.isFinite(cashReceived) ||
          cashReceived < totalAmount
        ) {
          throw new Error(
            "Cash received must cover the full transaction total."
          );
        }
      } else if (!customerId && (!customerName || !customerPhone)) {
        throw new Error(
          "Choose a registered customer or enter a new customer name and phone number."
        );
      }

      const cashReceived =
        paymentMethod === "cash" ? Number(normalizedCashReceived) : 0;
      const changeAmount =
        paymentMethod === "cash" ? Math.max(cashReceived - totalAmount, 0) : 0;

      let selectedCustomer = null;
      let createdCustomer = false;

      if (paymentMethod === "credit") {
        const resolvedCustomer = await resolveCustomerRecord(connection, {
          customerId,
          customerName,
          customerPhone
        });

        selectedCustomer = resolvedCustomer.customer;
        createdCustomer = resolvedCustomer.created;

        if (!selectedCustomer) {
          throw new Error(
            "Choose a valid customer before saving a credit transaction."
          );
        }
      }

      const [transactionResult] = await connection.query(
        `INSERT INTO transactions (total_amount, payment_method, cash_received, change_amount, customer_name, customer_phone, customer_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          totalAmount,
          paymentMethod,
          cashReceived,
          changeAmount,
          selectedCustomer?.name || customerName || null,
          selectedCustomer?.phone || customerPhone || null,
          selectedCustomer?.id || null,
          createdByUserId
        ]
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

      if (paymentMethod === "credit") {
        const itemSummary = lineItems
          .map((item) => `${item.name} x${item.quantity}`)
          .join(", ");

        await connection.query(
          `INSERT INTO credit_ledger (transaction_id, customer_id, customer_name, customer_phone, item_summary, total_amount, balance_due, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transactionId,
            selectedCustomer.id,
            selectedCustomer.name,
            selectedCustomer.phone,
            itemSummary,
            totalAmount,
            totalAmount,
            createdByUserId
          ]
        );
      }

      await connection.commit();

      if (paymentMethod === "credit" && createdCustomer && selectedCustomer) {
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
        action: "transaction_completed",
        entityType: "transaction",
        entityId: transactionId,
        description: `${req.session.user?.username || "User"} completed ${paymentMethod} transaction ${formatInvoice(transactionId)}.`,
        metadata: {
          payment_method: paymentMethod,
          total_amount: totalAmount,
          item_count: lineItems.length,
          customer_name: selectedCustomer?.name || customerName || null,
          customer_id: selectedCustomer?.id || null
        }
      });

      const successMessage =
        paymentMethod === "credit"
          ? `Credit transaction ${formatInvoice(transactionId)} recorded for ${selectedCustomer?.name || customerName}.`
          : `Transaction ${formatInvoice(transactionId)} completed.`;

      if (jsonResponse) {
        const uniqueItemIds = [
          ...new Set(itemIds.map((value) => Number(value)).filter(Boolean))
        ];
        const [updatedItems] = await pool.query(
          "SELECT id, quantity FROM items WHERE id IN (?) ORDER BY id ASC",
          [uniqueItemIds]
        );

        return res.status(200).json({
          ok: true,
          message: successMessage,
          transactionId,
          invoice: formatInvoice(transactionId),
          items: updatedItems
        });
      }

      flash(req, { type: "success", message: successMessage });
      return res.redirect("/transaction");
    } catch (error) {
      await connection.rollback();
      console.error("Transaction failed:", error);

      if (jsonResponse) {
        return res.status(400).json({
          ok: false,
          message: error.message || "Transaction failed."
        });
      }

      flash(req, {
        type: "error",
        message: error.message || "Transaction failed."
      });
      return res.redirect("/transaction");
    } finally {
      connection.release();
    }
  }
);

module.exports = router;
