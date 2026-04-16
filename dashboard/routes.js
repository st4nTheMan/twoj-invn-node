const express = require("express");
const inventoryRoutes = require("./inventory.routes");
const transactionRoutes = require("./transaction.routes");
const creditLedgerRoutes = require("./credit-ledger.routes");
const reportsRoutes = require("./reports.routes");

// Combines feature-specific dashboard route modules behind one import.
const router = express.Router();

router.use(inventoryRoutes);
router.use(transactionRoutes);
router.use(creditLedgerRoutes);
router.use(reportsRoutes);

module.exports = router;
